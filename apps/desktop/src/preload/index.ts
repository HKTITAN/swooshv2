/**
 * Preload — the only place that bridges main and renderer.
 *
 * Exposes `window.swoosh` to every renderer (overlay, settings,
 * tutorial, tray-popover). The shape mirrors @swoosh/shared/ipc so
 * renderer code is fully typed against the contract.
 *
 * Privacy / security:
 *  - No `nodeIntegration`.
 *  - No remote module.
 *  - `contextBridge.exposeInMainWorld` is the only escape hatch, and
 *    it exposes ONLY the channels in @swoosh/shared/ipc.
 *
 * Subscriptions return an unsubscribe function so renderers can clean
 * up on component unmount without leaking listeners.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type CameraSource,
  type GestureEmitPayload,
  type TrackingState,
  type UserSettings,
  type UpdateCheckResult,
  type BenchmarkResult,
  type ScreenBounds,
} from '@swoosh/shared/ipc';

type Unsubscribe = () => void;

function subscribe<T>(
  channel: string,
  handler: (payload: T) => void,
): Unsubscribe {
  const wrapped = (_event: IpcRendererEvent, payload: T) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.off(channel, wrapped);
}

const swoosh = {
  // ----- gesture (fire-and-forget) ----------------------------------
  gesture: {
    emit(payload: GestureEmitPayload): void {
      ipcRenderer.send(IPC.gestureEmit, payload);
    },
  },

  // ----- tracking ----------------------------------------------------
  tracking: {
    pause(): void {
      ipcRenderer.send(IPC.trackingPause);
    },
    resume(): void {
      ipcRenderer.send(IPC.trackingResume);
    },
    getState(): Promise<TrackingState> {
      return ipcRenderer.invoke(IPC.trackingGetState);
    },
    onState(handler: (state: TrackingState) => void): Unsubscribe {
      return subscribe(IPC.trackingState, handler);
    },
  },

  // ----- settings ----------------------------------------------------
  settings: {
    get(): Promise<UserSettings> {
      return ipcRenderer.invoke(IPC.settingsGet);
    },
    set(patch: Partial<UserSettings>): Promise<UserSettings> {
      return ipcRenderer.invoke(IPC.settingsSet, patch);
    },
    onChanged(handler: (settings: UserSettings) => void): Unsubscribe {
      return subscribe(IPC.settingsChanged, handler);
    },
  },

  // ----- camera (enumeration only — frames live in renderer) --------
  camera: {
    list(): Promise<CameraSource[]> {
      return ipcRenderer.invoke(IPC.cameraList);
    },
  },

  // ----- tutorial ----------------------------------------------------
  tutorial: {
    complete(): Promise<void> {
      return ipcRenderer.invoke(IPC.tutorialComplete);
    },
    replay(): Promise<void> {
      return ipcRenderer.invoke(IPC.tutorialReplay);
    },
    onShow(handler: () => void): Unsubscribe {
      return subscribe<void>(IPC.tutorialShow, handler as (p: void) => void);
    },
  },

  // ----- overlay -----------------------------------------------------
  overlay: {
    onResize(handler: (bounds: ScreenBounds) => void): Unsubscribe {
      return subscribe(IPC.overlayResize, handler);
    },
  },

  // ----- app ---------------------------------------------------------
  app: {
    quit(): void {
      ipcRenderer.send(IPC.appQuit);
    },
  },

  // ----- updates -----------------------------------------------------
  update: {
    check(): Promise<UpdateCheckResult> {
      return ipcRenderer.invoke(IPC.updateCheck);
    },
    install(): Promise<void> {
      return ipcRenderer.invoke(IPC.updateInstall);
    },
    onAvailable(
      handler: (info: { version: string; notes?: string }) => void,
    ): Unsubscribe {
      return subscribe(IPC.updateAvailable, handler);
    },
    onProgress(handler: (percent: number) => void): Unsubscribe {
      return subscribe(IPC.updateProgress, handler);
    },
  },

  // ----- benchmark ---------------------------------------------------
  benchmark: {
    run(): Promise<BenchmarkResult> {
      return ipcRenderer.invoke(IPC.benchmarkRun);
    },
  },
} as const;

export type SwooshApi = typeof swoosh;

contextBridge.exposeInMainWorld('swoosh', swoosh);
