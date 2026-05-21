/**
 * Swoosh main entry point.
 *
 * Responsibilities (this file):
 *  - Acquire a single-instance lock (prevent multiple Swoosh processes
 *    racing for the camera or registering duplicate global shortcuts).
 *  - Wait for app.whenReady() then bootstrap:
 *      - logger / settings store / IPC handlers / OS hooks
 *      - input dispatcher (nut.js)
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
import { registerIpcHandlers } from './ipc';
import { closeTutorialWindow, createTutorialWindow } from './windows/tutorial';

// Acquire the single-instance lock immediately. If we don't get it,
// another Swoosh is already running — focus its window and quit.
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

  // Hide-on-close: Swoosh is tray-resident. Closing the last window
  // does NOT quit the app.
  app.on('window-all-closed', () => {
    // No-op on all platforms.
  });
}

interface AppContext {
  settings: ReturnType<typeof createSettingsStore>;
  input: ReturnType<typeof createInputDispatcher>;
  osHooks: ReturnType<typeof createOsHooks>;
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

  const disposeIpc = registerIpcHandlers({
    settings,
    onQuit: () => app.quit(),
    onTutorialComplete: () => {
      closeTutorialWindow();
      openOverlay();
    },
    onTutorialReplay: () => {
      createTutorialWindow();
    },
  });

  context = { settings, input, osHooks, disposeIpc };

  // Decide initial UI: tutorial on first run, otherwise overlay.
  const current = settings.get();
  if (!current.tutorialSeen) {
    createTutorialWindow();
  } else {
    openOverlay();
  }
}

function teardown(): void {
  if (!context) return;
  try {
    context.osHooks.stop();
    context.disposeIpc();
  } catch (err) {
    logger.error('teardown failed', { err: String(err) });
  }
  context = null;
}

/**
 * Overlay window — placeholder. Replaced by T200 (proper transparent
 * always-on-top click-through overlay). Until then we open a small
 * status window so the tutorial-completion flow has somewhere to go.
 */
function openOverlay(): void {
  const win = new BrowserWindow({
    width: 480,
    height: 240,
    show: true,
    backgroundColor: '#0E1230',
    title: 'Swoosh',
    autoHideMenuBar: true,
    resizable: false,
  });
  win.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        '<!doctype html><meta charset="utf-8"><title>Swoosh</title>' +
          '<body style="background:#0E1230;color:white;font-family:\'Segoe UI\',system-ui;display:grid;place-items:center;height:100vh;margin:0">' +
          '<div style="text-align:center"><h2 style="margin:0 0 8px">Swoosh is running</h2>' +
          '<p style="margin:0;color:#A2A9CF">The transparent overlay lands in T200+.</p></div>',
      ),
  );
}
