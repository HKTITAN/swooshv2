/**
 * OS lifecycle hooks — subscribes to power and screen events via
 * Electron's powerMonitor and emits a single typed signal the rest of
 * the app can react to.
 *
 * Used by:
 *  - Tracking pipeline: auto-pause on lock/sleep/display-off, resume
 *    on unlock/wake.
 *  - Tray: update the icon state when the OS sleeps.
 */

import { powerMonitor } from 'electron';
import { EventEmitter } from 'node:events';
import type { PauseReason } from '@swoosh/shared/ipc';
import { logger } from '../logger';

export interface OsHooks {
  on(event: 'pauseRequested', listener: (reason: PauseReason) => void): void;
  on(event: 'resumeRequested', listener: () => void): void;
  off(event: 'pauseRequested', listener: (reason: PauseReason) => void): void;
  off(event: 'resumeRequested', listener: () => void): void;
  start(): void;
  stop(): void;
}

export function createOsHooks(): OsHooks {
  const emitter = new EventEmitter();
  let started = false;

  function emitPause(reason: PauseReason): void {
    logger.info('OS pause requested', { reason });
    emitter.emit('pauseRequested', reason);
  }

  function emitResume(): void {
    logger.info('OS resume requested');
    emitter.emit('resumeRequested');
  }

  const onLock = () => emitPause('osLock');
  const onUnlock = () => emitResume();
  const onSuspend = () => emitPause('osSleep');
  const onResume = () => emitResume();
  // Electron exposes lock-screen events on Windows/macOS only; the
  // listener is safe to attach everywhere (no-op on Linux).
  const onScreenLocked = onLock;
  const onScreenUnlocked = onUnlock;

  return {
    on(event, listener) {
      emitter.on(event, listener as (...args: unknown[]) => void);
    },
    off(event, listener) {
      emitter.off(event, listener as (...args: unknown[]) => void);
    },
    start(): void {
      if (started) return;
      started = true;
      powerMonitor.on('lock-screen', onScreenLocked);
      powerMonitor.on('unlock-screen', onScreenUnlocked);
      powerMonitor.on('suspend', onSuspend);
      powerMonitor.on('resume', onResume);
      // Some platforms emit `shutdown` instead of `suspend`; treat it as pause.
      powerMonitor.on('shutdown', () => emitPause('osSleep'));
    },
    stop(): void {
      if (!started) return;
      started = false;
      powerMonitor.removeListener('lock-screen', onScreenLocked);
      powerMonitor.removeListener('unlock-screen', onScreenUnlocked);
      powerMonitor.removeListener('suspend', onSuspend);
      powerMonitor.removeListener('resume', onResume);
    },
  };
}
