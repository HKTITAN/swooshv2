/**
 * Tray popover renderer (T700).
 *
 * A small frameless surface that opens from the system tray. Shows:
 *  - current tracking state (Active / Paused / No camera)
 *  - Pause / Resume button (big, primary)
 *  - Quick audio toggle
 *  - Shortcut row: Settings · Replay tutorial · Quit
 *
 * Reflects live state from window.swoosh.{tracking,settings}.
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { TrackingState, UserSettings } from '@swoosh/shared/ipc';
import { DEFAULT_USER_SETTINGS } from '@swoosh/shared/ipc';
import { Button } from '../shared-ui/components/Button';
import { Toggle } from '../shared-ui/components/Toggle';
import './styles.css';

function statusFor(state: TrackingState): { label: string; tone: 'active' | 'paused' | 'error' } {
  switch (state.kind) {
    case 'active':
      return { label: 'Tracking', tone: 'active' };
    case 'paused':
      return { label: 'Paused', tone: 'paused' };
    case 'noCamera':
      return { label: 'No camera', tone: 'error' };
    case 'permissionDenied':
      return { label: 'Camera blocked', tone: 'error' };
    case 'cameraInUse':
      return { label: 'Camera in use', tone: 'error' };
  }
}

function StatusBadge({ state }: { state: TrackingState }) {
  const { label, tone } = statusFor(state);
  const dotColor =
    tone === 'active'
      ? 'bg-swoosh-400'
      : tone === 'paused'
        ? 'bg-sun-500'
        : 'bg-flare-500';
  return (
    <div className="inline-flex items-center gap-2 rounded-pill bg-ink-800 px-3 py-1 text-xs font-extrabold text-fg">
      <span className={`h-2 w-2 rounded-full ${dotColor} ${tone === 'active' ? 'animate-pulse' : ''}`} aria-hidden />
      {label}
    </div>
  );
}

function TrayPopoverApp() {
  const [tracking, setTracking] = useState<TrackingState>({ kind: 'active', fps: 0 });
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [update, setUpdate] = useState<{ version: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    window.swoosh.tracking.getState().then((s) => {
      if (mounted) setTracking(s);
    });
    window.swoosh.settings.get().then((s) => {
      if (mounted) setSettings(s);
    });

    const unsubTracking = window.swoosh.tracking.onState((s) => {
      if (mounted) setTracking(s);
    });
    const unsubSettings = window.swoosh.settings.onChanged((s) => {
      if (mounted) setSettings(s);
    });
    const unsubUpdate = window.swoosh.update.onAvailable((info) => {
      if (mounted) setUpdate({ version: info.version });
    });

    return () => {
      mounted = false;
      unsubTracking();
      unsubSettings();
      unsubUpdate();
    };
  }, []);

  const togglePause = () => {
    if (tracking.kind === 'paused') {
      window.swoosh.tracking.resume();
    } else {
      window.swoosh.tracking.pause();
    }
  };

  const isPaused = tracking.kind === 'paused';
  const isError =
    tracking.kind === 'noCamera' ||
    tracking.kind === 'permissionDenied' ||
    tracking.kind === 'cameraInUse';

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      {/* Header — title + status */}
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-extrabold tracking-wide text-fg">Swoosh</span>
        </div>
        <StatusBadge state={tracking} />
      </header>

      {/* Update banner — appears when electron-updater finds a newer release */}
      {update ? (
        <button
          type="button"
          onClick={() => window.swoosh.update.install()}
          className="flex items-center justify-between rounded-card bg-sun-500 px-3 py-2 text-xs font-extrabold text-ink-950 transition hover:bg-sun-400"
        >
          <span>Update v{update.version} ready</span>
          <span>Install &amp; restart →</span>
        </button>
      ) : null}

      {/* Primary action */}
      <Button
        variant={isError ? 'ghost' : 'primary'}
        size="lg"
        disabled={isError}
        onClick={togglePause}
      >
        {isPaused ? 'Resume tracking' : isError ? 'Tracking unavailable' : 'Pause tracking'}
      </Button>

      {/* Audio quick toggle */}
      <div className="flex items-center justify-between rounded-card bg-ink-800 px-4 py-2">
        <span className="text-sm font-bold text-fg">Audio cues</span>
        <Toggle
          checked={settings.audioEnabled}
          onChange={(v) => window.swoosh.settings.set({ audioEnabled: v })}
        />
      </div>

      {/* Shortcuts */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          type="button"
          className="rounded-card bg-ink-800 px-3 py-2 text-xs font-extrabold text-fg-mute hover:bg-ink-700 hover:text-fg"
          onClick={() => window.swoosh.tutorial.replay()}
        >
          Replay tutorial
        </button>
        <button
          type="button"
          className="rounded-card bg-ink-800 px-3 py-2 text-xs font-extrabold text-fg-mute hover:bg-ink-700 hover:text-fg"
          onClick={() => window.swoosh.window.openSettings()}
        >
          Settings…
        </button>
        <button
          type="button"
          className="rounded-card bg-ink-800 px-3 py-2 text-xs font-extrabold text-flare-400 hover:bg-flare-500/15"
          onClick={() => window.swoosh.app.quit()}
        >
          Quit
        </button>
      </div>

      <footer className="mt-auto text-center text-[10px] font-bold text-fg-dim">
        Hand tracking runs entirely on this device.
      </footer>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <TrayPopoverApp />
    </StrictMode>,
  );
}
