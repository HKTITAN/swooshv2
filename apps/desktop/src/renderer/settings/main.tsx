/**
 * Settings renderer entry (US5).
 *
 * Mounts <SettingsApp /> with two stacked panes:
 *  - top: live camera preview with hand overlay
 *  - bottom: scrollable configuration panel
 *
 * The preview pipeline is started on mount and stopped on unmount.
 * It runs independently of the main overlay's pipeline — the user
 * can have tracking paused globally and still see the preview here.
 * Hand landmarks NEVER leave the renderer (constitution I).
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { UserSettings } from '@swoosh/shared/ipc';
import { DEFAULT_USER_SETTINGS } from '@swoosh/shared/ipc';
import { CameraPreview } from './CameraPreview';
import { SettingsPanel } from './SettingsPanel';
import './styles.css';

function SettingsApp() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [windowVisible, setWindowVisible] = useState(true);
  // While the user is actively dragging the pinch sliders, draw a
  // threshold ring on the preview so they can see "this close = pinch".
  const [showThresholdRing, setShowThresholdRing] = useState(false);

  // Initial load + live subscription.
  useEffect(() => {
    let mounted = true;
    window.swoosh.settings.get().then((s) => {
      if (!mounted) return;
      setSettings(s);
      setLoaded(true);
    });
    const unsub = window.swoosh.settings.onChanged((s) => {
      if (!mounted) return;
      setSettings(s);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Track window visibility so the preview pipeline can suspend when hidden.
  useEffect(() => {
    const handleVisibility = () => setWindowVisible(!document.hidden);
    const handleFocus = () => setWindowVisible(true);
    const handleBlur = () => {
      // Don't suspend on blur alone — the user may click into another app
      // window and back. Suspend only when the OS hides the window
      // (visibilitychange covers that on Electron).
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Save patch helper — fires & forgets.
  const patch = (delta: Partial<UserSettings>) => {
    window.swoosh.settings.set(delta).catch((err) => {
      console.error('settings.set failed', err);
    });
  };

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-950 text-fg-mute">
        <div className="font-extrabold tracking-wide">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-ink-950 text-fg">
      {/* Header — sticky title bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-ink-700/40 px-6 py-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-fg-dim">Swoosh</div>
          <h1 className="text-2xl font-extrabold leading-tight">Settings</h1>
        </div>
        <div className="text-xs font-bold text-fg-mute">v0.0.1</div>
      </header>

      {/* Top — live preview */}
      <section className="relative h-[42%] shrink-0 overflow-hidden border-b border-ink-700/40 bg-ink-900">
        <CameraPreview
          settings={settings}
          active={windowVisible}
          showThresholdRing={showThresholdRing}
        />
      </section>

      {/* Bottom — controls */}
      <section className="min-h-0 grow overflow-y-auto bg-ink-950 px-6 py-6">
        <SettingsPanel
          settings={settings}
          onPatch={patch}
          onAdjustingThreshold={setShowThresholdRing}
        />
      </section>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <SettingsApp />
    </StrictMode>,
  );
}
