/**
 * Tracking controller — single source of truth for "is tracking
 * active or paused, and why?". Owns:
 *  - Current TrackingState (active / paused / noCamera / etc).
 *  - Broadcast of state changes to renderers via `tracking:state`.
 *  - Global hotkey registration (default Ctrl+Alt+Space).
 *  - OS lock / sleep auto-pause via osHooks.
 *
 * Pause/resume are idempotent. The controller deduplicates broadcasts
 * so renderers only see real transitions.
 */

import { BrowserWindow, globalShortcut } from 'electron';
import {
  IPC,
  type PauseReason,
  type TrackingState,
  type UserSettings,
} from '@swoosh/shared/ipc';
import { logger } from './logger';
import type { OsHooks } from './input/osHooks';
import type { GestureRouter } from './input/gestureRouter';

export interface TrackingControllerDeps {
  osHooks: OsHooks;
  router: GestureRouter;
  getSettings: () => UserSettings;
}

export interface TrackingController {
  getState(): TrackingState;
  pause(reason: PauseReason): void;
  resume(): void;
  setHotkey(combo: string): void;
  dispose(): void;
}

function broadcast(state: TrackingState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.trackingState, state);
  }
}

export function createTrackingController(
  deps: TrackingControllerDeps,
): TrackingController {
  let state: TrackingState = { kind: 'active', fps: 30 };
  let wasActiveBeforeAutoPause = true;
  let currentHotkey: string | null = null;

  function setState(next: TrackingState): void {
    // Deduplicate identical states.
    if (
      state.kind === next.kind &&
      JSON.stringify(state) === JSON.stringify(next)
    )
      return;
    state = next;
    deps.router.setEnabled(next.kind === 'active');
    broadcast(state);
    logger.info('tracking state changed', state);
  }

  function pause(reason: PauseReason): void {
    if (state.kind === 'active') {
      wasActiveBeforeAutoPause = true;
    }
    setState({ kind: 'paused', reason });
  }

  function resume(): void {
    setState({ kind: 'active', fps: deps.getSettings().fps });
  }

  function togglePause(reason: PauseReason): void {
    if (state.kind === 'paused') resume();
    else pause(reason);
  }

  // OS hooks: auto-pause on lock/sleep; resume if we were active before.
  const onOsPause = (reason: PauseReason) => {
    if (state.kind === 'active') {
      pause(reason);
    }
  };
  const onOsResume = () => {
    if (state.kind === 'paused' && wasActiveBeforeAutoPause) {
      resume();
    }
  };
  deps.osHooks.on('pauseRequested', onOsPause);
  deps.osHooks.on('resumeRequested', onOsResume);

  function setHotkey(combo: string): void {
    if (currentHotkey) globalShortcut.unregister(currentHotkey);
    currentHotkey = combo;
    try {
      const ok = globalShortcut.register(combo, () => togglePause('hotkey'));
      if (!ok) logger.warn('global hotkey registration failed', { combo });
    } catch (err) {
      logger.warn('global hotkey threw', { combo, err: String(err) });
    }
  }

  return {
    getState() {
      return state;
    },
    pause,
    resume,
    setHotkey,
    dispose() {
      if (currentHotkey) globalShortcut.unregister(currentHotkey);
      currentHotkey = null;
      deps.osHooks.off('pauseRequested', onOsPause);
      deps.osHooks.off('resumeRequested', onOsResume);
    },
  };
}
