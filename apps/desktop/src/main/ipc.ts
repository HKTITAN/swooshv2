/**
 * IPC registration — wires every channel from @swoosh/shared/ipc to a
 * handler in the main process. There is exactly one call site for each
 * channel; the renderer accesses them through the preload-exposed
 * `window.swoosh` typed surface.
 *
 * Channels are grouped by feature so future tasks (tutorial, updates,
 * benchmark, etc.) can add their handlers without touching unrelated
 * code.
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IPC,
  type CameraSource,
  type GestureEmitPayload,
  type TrackingState,
  type UpdateCheckResult,
  type BenchmarkResult,
  type UserSettings,
} from '@swoosh/shared/ipc';
import type { SettingsStore } from './settings/store';
import { logger } from './logger';

export interface IpcDeps {
  settings: SettingsStore;
  onGestureEmit?: (payload: GestureEmitPayload) => void;
  onTrackingPause?: (reason?: TrackingState extends { reason: infer R } ? R : never) => void;
  onTrackingResume?: () => void;
  getTrackingState?: () => TrackingState;
  listCameras?: () => Promise<CameraSource[]>;
  onTutorialComplete?: () => Promise<void> | void;
  onTutorialReplay?: () => Promise<void> | void;
  onOpenSettings?: () => void;
  onQuit?: () => void;
  checkForUpdate?: () => Promise<UpdateCheckResult>;
  installUpdate?: () => Promise<void>;
  runBenchmark?: () => Promise<BenchmarkResult>;
}

/**
 * Register every IPC channel from the shared contract.
 * Returns a dispose() function that removes all handlers.
 */
export function registerIpcHandlers(deps: IpcDeps): () => void {
  // --- Gesture emit (fire-and-forget, renderer → main) ---------------
  ipcMain.on(IPC.gestureEmit, (_event, payload: GestureEmitPayload) => {
    deps.onGestureEmit?.(payload);
  });

  // --- Tracking control ----------------------------------------------
  ipcMain.on(IPC.trackingPause, () => {
    deps.onTrackingPause?.();
  });
  ipcMain.on(IPC.trackingResume, () => {
    deps.onTrackingResume?.();
  });
  ipcMain.handle(IPC.trackingGetState, async (): Promise<TrackingState> => {
    return deps.getTrackingState?.() ?? { kind: 'paused', reason: 'user' };
  });

  // --- Settings -------------------------------------------------------
  ipcMain.handle(IPC.settingsGet, async (): Promise<UserSettings> => {
    return deps.settings.get();
  });
  ipcMain.handle(
    IPC.settingsSet,
    async (_event: IpcMainInvokeEvent, patch: Partial<UserSettings>): Promise<UserSettings> => {
      return deps.settings.set(patch);
    },
  );

  // --- Cameras --------------------------------------------------------
  ipcMain.handle(IPC.cameraList, async (): Promise<CameraSource[]> => {
    if (deps.listCameras) return deps.listCameras();
    // The default implementation lives in the renderer (it calls
    // navigator.mediaDevices.enumerateDevices). Until that's wired, we
    // return an empty list so the tutorial can still render.
    return [];
  });

  // --- Tutorial -------------------------------------------------------
  ipcMain.handle(IPC.tutorialComplete, async () => {
    await deps.onTutorialComplete?.();
    deps.settings.set({ tutorialSeen: true });
  });
  ipcMain.handle(IPC.tutorialReplay, async () => {
    await deps.onTutorialReplay?.();
  });

  // --- Window controls ------------------------------------------------
  ipcMain.on(IPC.windowOpenSettings, () => {
    deps.onOpenSettings?.();
  });

  // --- App quit -------------------------------------------------------
  ipcMain.on(IPC.appQuit, () => {
    deps.onQuit?.();
  });

  // --- Updates --------------------------------------------------------
  ipcMain.handle(IPC.updateCheck, async (): Promise<UpdateCheckResult> => {
    if (deps.checkForUpdate) return deps.checkForUpdate();
    return { current: '0.0.0', hasUpdate: false };
  });
  ipcMain.handle(IPC.updateInstall, async () => {
    await deps.installUpdate?.();
  });

  // --- Benchmark ------------------------------------------------------
  ipcMain.handle(IPC.benchmarkRun, async (): Promise<BenchmarkResult> => {
    if (deps.runBenchmark) return deps.runBenchmark();
    // Placeholder until T800 lands.
    return {
      fps: 30,
      resolution: { width: 1280, height: 720 },
      durationMs: 0,
      sampleCount: 0,
      selectedProfile: 'balanced',
    };
  });

  logger.info('IPC handlers registered');

  return function dispose(): void {
    ipcMain.removeHandler(IPC.trackingGetState);
    ipcMain.removeHandler(IPC.settingsGet);
    ipcMain.removeHandler(IPC.settingsSet);
    ipcMain.removeHandler(IPC.cameraList);
    ipcMain.removeHandler(IPC.tutorialComplete);
    ipcMain.removeHandler(IPC.tutorialReplay);
    ipcMain.removeHandler(IPC.updateCheck);
    ipcMain.removeHandler(IPC.updateInstall);
    ipcMain.removeHandler(IPC.benchmarkRun);
    ipcMain.removeAllListeners(IPC.gestureEmit);
    ipcMain.removeAllListeners(IPC.trackingPause);
    ipcMain.removeAllListeners(IPC.trackingResume);
    ipcMain.removeAllListeners(IPC.appQuit);
    ipcMain.removeAllListeners(IPC.windowOpenSettings);
    logger.info('IPC handlers disposed');
  };
}
