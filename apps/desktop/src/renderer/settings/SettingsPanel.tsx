/**
 * SettingsPanel (T504, T506).
 *
 * The bottom half of the settings window: a sectioned grid of
 * controls grouped by concern. Each control wires to
 * `window.swoosh.settings.set` on change. Defaults match
 * DEFAULT_USER_SETTINGS in @swoosh/shared/ipc.
 *
 * Notes:
 *  - The pinch enter/exit pair are clamped so exit ≥ enter, preventing
 *    an impossible hysteresis configuration.
 *  - "Advanced" smoothing controls (β + mincutoff) hide under a
 *    disclosure to keep the surface uncluttered.
 *  - Diagnostics buttons fire IPC where the channel exists today;
 *    "Re-run benchmark" and "Clear logs" are stubbed against
 *    window.swoosh.benchmark.run / no-op respectively (T800 / future).
 */

import { useEffect, useState } from 'react';
import type { CameraSource, UserSettings } from '@swoosh/shared/ipc';
import { Card } from '../shared-ui/components/Card';
import { Slider } from '../shared-ui/components/Slider';
import { Toggle } from '../shared-ui/components/Toggle';
import { Button } from '../shared-ui/components/Button';

interface Props {
  settings: UserSettings;
  onPatch: (delta: Partial<UserSettings>) => void;
  onAdjustingThreshold: (active: boolean) => void;
}

export function SettingsPanel({ settings, onPatch, onAdjustingThreshold }: Props) {
  const [cameras, setCameras] = useState<CameraSource[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [diagStatus, setDiagStatus] = useState<string | null>(null);
  const [update, setUpdate] = useState<{ version: string } | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

  // Enumerate cameras on mount + when settings.cameraId changes (label
  // resolution may have changed after permission).
  useEffect(() => {
    window.swoosh.camera
      .list()
      .then((list) => setCameras(list))
      .catch(() => setCameras([]));
  }, [settings.cameraId]);

  // Subscribe to auto-update events so the Diagnostics banner can react.
  useEffect(() => {
    const unsubAvail = window.swoosh.update.onAvailable((info) =>
      setUpdate({ version: info.version }),
    );
    const unsubProg = window.swoosh.update.onProgress((p) => setUpdateProgress(p));
    return () => {
      unsubAvail();
      unsubProg();
    };
  }, []);

  // Helper to ensure exit ≥ enter when either slider moves.
  const setPinchEnter = (next: number) => {
    const exit = Math.max(settings.pinchExitThreshold, next + 0.005);
    onPatch({ pinchEnterThreshold: next, pinchExitThreshold: exit });
  };
  const setPinchExit = (next: number) => {
    const safe = Math.max(next, settings.pinchEnterThreshold + 0.005);
    onPatch({ pinchExitThreshold: safe });
  };

  // Diagnostics actions.
  const replayTutorial = async () => {
    await window.swoosh.tutorial.replay();
  };
  const runBenchmark = async () => {
    setDiagStatus('Running benchmark…');
    try {
      const result = await window.swoosh.benchmark.run();
      setDiagStatus(
        `Benchmark: ${Math.round(result.fps)} FPS @ ${result.resolution.width}×${result.resolution.height} → "${result.selectedProfile}"`,
      );
    } catch (err) {
      setDiagStatus(`Benchmark failed: ${String(err)}`);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Camera */}
      <Card heading="Camera" compact>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-fg-mute">Device</span>
            <select
              aria-label="Camera device"
              value={settings.cameraId ?? ''}
              onChange={(e) => onPatch({ cameraId: e.target.value || null })}
              className="rounded-input bg-ink-900 px-3 py-2 text-base text-fg outline-none ring-ink-700 focus:ring-2"
            >
              <option value="">Default ({cameras[0]?.label ?? 'auto'})</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || `Camera ${c.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-fg-mute">Profile</span>
            <select
              aria-label="Performance profile"
              value={settings.performanceProfile}
              onChange={(e) =>
                onPatch({
                  performanceProfile: e.target.value as UserSettings['performanceProfile'],
                })
              }
              className="rounded-input bg-ink-900 px-3 py-2 text-base text-fg outline-none ring-ink-700 focus:ring-2"
            >
              <option value="adaptive">Adaptive</option>
              <option value="high">High (720p · 60)</option>
              <option value="balanced">Balanced (720p · 30)</option>
              <option value="battery">Battery (480p · 30)</option>
            </select>
          </label>
        </div>
      </Card>

      {/* Gestures */}
      <Card heading="Gestures" compact>
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider
            label="Pinch threshold"
            min={0.02}
            max={0.15}
            step={0.005}
            value={settings.pinchEnterThreshold}
            onChange={setPinchEnter}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            // While the user is touching this slider, light up the threshold ring on the preview.
            // We approximate "interacting" via mouseenter/mouseleave on the wrapper below.
          />
          <Slider
            label="Pinch release (hysteresis)"
            min={0.025}
            max={0.18}
            step={0.005}
            value={settings.pinchExitThreshold}
            onChange={setPinchExit}
            format={(v) => `${(v * 100).toFixed(1)}%`}
          />
          <Slider
            label="Scroll sensitivity"
            min={0.1}
            max={3.0}
            step={0.05}
            value={settings.scrollSensitivity}
            onChange={(v) => onPatch({ scrollSensitivity: v })}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </div>

        <div
          className="mt-5"
          onMouseEnter={() => onAdjustingThreshold(true)}
          onMouseLeave={() => onAdjustingThreshold(false)}
          onFocus={() => onAdjustingThreshold(true)}
          onBlur={() => onAdjustingThreshold(false)}
        >
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="text-sm font-extrabold text-swoosh-300 hover:text-swoosh-200"
          >
            {advancedOpen ? '▾ Hide advanced smoothing' : '▸ Show advanced smoothing'}
          </button>
          {advancedOpen ? (
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              <Slider
                label="1-Euro β (motion responsiveness)"
                min={0.001}
                max={0.5}
                step={0.001}
                value={settings.smoothing.beta}
                onChange={(v) =>
                  onPatch({ smoothing: { ...settings.smoothing, beta: v } })
                }
                format={(v) => v.toFixed(3)}
              />
              <Slider
                label="1-Euro min cutoff (idle smoothing)"
                min={0.1}
                max={5.0}
                step={0.05}
                value={settings.smoothing.minCutoff}
                onChange={(v) =>
                  onPatch({ smoothing: { ...settings.smoothing, minCutoff: v } })
                }
                format={(v) => v.toFixed(2)}
              />
            </div>
          ) : null}
        </div>
      </Card>

      {/* Sound */}
      <Card heading="Sound" compact>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
          <Toggle
            label="Audio cues on pinches and scrolls"
            checked={settings.audioEnabled}
            onChange={(v) => onPatch({ audioEnabled: v })}
          />
          <div className="grow">
            <Slider
              label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={settings.audioVolume}
              disabled={!settings.audioEnabled}
              onChange={(v) => onPatch({ audioVolume: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        </div>
      </Card>

      {/* Appearance */}
      <Card heading="Appearance" compact>
        <div className="flex flex-col gap-4">
          <div>
            <div id="outline-style-label" className="mb-2 text-sm font-bold text-fg-mute">
              Hand outline
            </div>
            <div
              role="radiogroup"
              aria-labelledby="outline-style-label"
              className="flex flex-wrap gap-2"
            >
              {(['default', 'highContrast', 'minimal'] as const).map((style) => {
                const selected = settings.outlineStyle === style;
                const label =
                  style === 'default'
                    ? 'Default'
                    : style === 'highContrast'
                      ? 'High contrast'
                      : 'Minimal';
                return (
                  <button
                    key={style}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onPatch({ outlineStyle: style })}
                    className={[
                      'rounded-pill px-4 py-2 text-sm font-extrabold transition-colors',
                      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-swoosh-400/50',
                      selected
                        ? 'bg-swoosh-400 text-ink-950'
                        : 'bg-ink-700 text-fg hover:bg-ink-600',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <Toggle
            label="Reduced motion"
            checked={settings.reducedMotion}
            onChange={(v) => onPatch({ reducedMotion: v })}
          />
        </div>
      </Card>

      {/* System */}
      <Card heading="System" compact>
        <div className="flex flex-col gap-4">
          <Toggle
            label="Start Swoosh at login"
            checked={settings.autostart}
            onChange={(v) => onPatch({ autostart: v })}
          />
          <Toggle
            label="Check for updates on launch"
            checked={settings.updateChecksEnabled}
            onChange={(v) => onPatch({ updateChecksEnabled: v })}
          />
          <div className="flex items-center gap-3">
            <span className="text-base text-fg">Pause/Resume hotkey</span>
            <code className="rounded-input bg-ink-900 px-3 py-1 font-bold text-swoosh-300">
              {settings.hotkeys.pauseResume}
            </code>
            <span className="text-xs text-fg-dim">(edit coming soon)</span>
          </div>
        </div>
      </Card>

      {/* Diagnostics */}
      <Card heading="Diagnostics" compact>
        {update ? (
          <div className="mb-3 flex items-center justify-between rounded-card bg-sun-500 px-3 py-2 text-sm font-extrabold text-ink-950">
            <span>
              Update available: v{update.version}
              {updateProgress != null && updateProgress < 100
                ? ` — downloading ${Math.round(updateProgress)}%`
                : ''}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.swoosh.update.install()}
            >
              Install &amp; restart
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={replayTutorial}>
            Replay tutorial
          </Button>
          <Button variant="ghost" size="sm" onClick={runBenchmark}>
            Re-run benchmark
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setDiagStatus('Checking for updates…');
              try {
                const res = await window.swoosh.update.check();
                if (res.hasUpdate) setDiagStatus(`Update v${res.latest} available.`);
                else setDiagStatus(`Up to date (v${res.current}).`);
              } catch (err) {
                setDiagStatus(`Update check failed: ${String(err)}`);
              }
            }}
          >
            Check for updates
          </Button>
        </div>
        {diagStatus ? (
          <div className="mt-3 text-sm text-fg-mute">{diagStatus}</div>
        ) : (
          <div className="mt-3 text-xs text-fg-dim">
            All processing is local. Logs live in your OS app-data folder and never leave the device.
          </div>
        )}
      </Card>
    </div>
  );
}
