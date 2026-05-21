/**
 * Swoosh main entry point.
 *
 * Responsibilities (this file):
 *  - Acquire a single-instance lock (prevent multiple Swoosh processes
 *    racing for the camera or registering duplicate global shortcuts).
 *  - Wait for app.whenReady() then bootstrap:
 *      - logger / settings store / IPC handlers / OS hooks
 *      - input dispatcher (nut.js) + gesture router
 *      - tracking controller (state + hotkey + auto-pause)
 *      - tray + initial window (tutorial if first-run, otherwise overlay)
 *  - Clean up on will-quit: stop OS hooks, unregister shortcuts,
 *    release any cached handles.
 *
 * Each subsystem (tray, overlay window, tutorial window, settings
 * window, benchmark, updater) is wired here through a small bootstrap
 * function — they live in their own modules so this file stays a
 * readable orchestration map.
 */

import { app, BrowserWindow } from 'electron';
import { logger } from './logger';
import { createSettingsStore } from './settings/store';
import { createInputDispatcher } from './input/dispatcher';
import { createOsHooks } from './input/osHooks';
import { createGestureRouter } from './input/gestureRouter';
import { registerIpcHandlers } from './ipc';
import { closeTutorialWindow, createTutorialWindow } from './windows/tutorial';
import { createOverlayWindow, closeOverlayWindow } from './windows/overlay';
import { destroySettingsWindow, openSettingsWindow } from './windows/settings';
import { createTrackingController } from './tracking';
import { createTray, trayStateFor } from './tray';

// Acquire the single-instance lock immediately.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    const target = wins.find((w) => w.isVisible()) ?? wins[0];
    if (target) {
      if (target.isMinimized()) target.restore();
      target.focus();
    }
  });

  app.whenReady().then(() => {
    bootstrap();
  });

  app.on('will-quit', () => {
    teardown();
  });

  app.on('window-all-closed', () => {
    // No-op: Swoosh is tray-resident.
  });
}

interface AppContext {
  settings: ReturnType<typeof createSettingsStore>;
  input: ReturnType<typeof createInputDispatcher>;
  osHooks: ReturnType<typeof createOsHooks>;
  router: ReturnType<typeof createGestureRouter>;
  tracking: ReturnType<typeof createTrackingController>;
  tray: ReturnType<typeof createTray>;
  disposeIpc: () => void;
}

let context: AppContext | null = null;

function bootstrap(): void {
  logger.info('Swoosh booting', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  });

  const settings = createSettingsStore();
  const input = createInputDispatcher();
  const osHooks = createOsHooks();
  osHooks.start();
  const router = createGestureRouter(input);
  const tracking = createTrackingController({
    osHooks,
    router,
    getSettings: () => settings.get(),
  });
  const tray = createTray();

  // Hotkey from settings.
  tracking.setHotkey(settings.get().hotkeys.pauseResume);
  settings.on('changed', (s) => {
    tracking.setHotkey(s.hotkeys.pauseResume);
  });

  // Tray handlers.
  tray.setOnPauseResume(() => {
    if (tracking.getState().kind === 'paused') tracking.resume();
    else tracking.pause('trayToggle');
  });
  tray.setOnOpenSettings(() => {
    openSettingsWindow();
  });
  tray.setOnReplayTutorial(() => {
    createTutorialWindow();
  });
  tray.setOnQuit(() => {
    app.quit();
  });
  tray.setOnOpenAbout(() => {
    logger.info('about requested (no-op)');
  });

  const disposeIpc = registerIpcHandlers({
    settings,
    onGestureEmit: (payload) => router.handle(payload),
    onTrackingPause: () => tracking.pause('user'),
    onTrackingResume: () => tracking.resume(),
    getTrackingState: () => tracking.getState(),
    onTutorialComplete: () => {
      closeTutorialWindow();
      createOverlayWindow();
    },
    onTutorialReplay: () => {
      createTutorialWindow();
    },
    onQuit: () => app.quit(),
  });

  context = { settings, input, osHooks, router, tracking, tray, disposeIpc };

  // Mirror tracking state to the tray icon.
  setInterval(() => {
    if (!context) return;
    context.tray.setState(trayStateFor(context.tracking.getState()));
  }, 1000);

  // Decide initial UI: tutorial on first run, otherwise overlay.
  const current = settings.get();
  if (!current.tutorialSeen) {
    createTutorialWindow();
  } else {
    createOverlayWindow();
  }
}

function teardown(): void {
  if (!context) return;
  try {
    context.tracking.dispose();
    context.osHooks.stop();
    context.disposeIpc();
    context.tray.destroy();
    closeOverlayWindow();
    destroySettingsWindow();
  } catch (err) {
    logger.error('teardown failed', { err: String(err) });
  }
  context = null;
}
