/**
 * CameraPick — show every available video input as a card with a live
 * thumbnail. Tapping a card persists the selection to settings and
 * marks `cameraId` so the shell's Next button enables.
 *
 * Each card opens a short-lived MediaStream for its preview. We close
 * them all on unmount; the overlay's main pipeline opens its own
 * stream later.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TutorialContext } from '../TutorialShell';
import { Card } from '../../shared-ui/components/Card';
import { Button } from '../../shared-ui/components/Button';

interface DeviceInfo {
  deviceId: string;
  label: string;
}

function CameraThumbnail({ deviceId }: { deviceId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let active: MediaStream | null = null;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: 320, height: 180 },
          audio: false,
        });
        if (cancelled) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        active = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        // No preview available — leave the card slot empty (the device
        // is probably in use by another app).
      }
    })();
    return () => {
      cancelled = true;
      if (active) for (const t of active.getTracks()) t.stop();
    };
  }, [deviceId]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="h-full w-full rounded-card bg-ink-950 object-cover"
    />
  );
}

export function CameraPick({ ctx }: { ctx: TutorialContext }) {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));
      setDevices(cams);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choose = useCallback(
    async (deviceId: string) => {
      ctx.setCameraId(deviceId);
      try {
        await window.swoosh.settings.set({ cameraId: deviceId });
      } catch (err) {
        console.warn('settings.set(cameraId) failed', err);
      }
    },
    [ctx],
  );

  const items = useMemo(() => devices ?? [], [devices]);

  return (
    <Card heading="Pick a camera">
      <p className="mb-4 text-base font-semibold text-fg-mute">
        Tap a camera to use it. You can change this anytime from Settings.
      </p>

      {error ? <p className="mb-4 text-sm text-flare-400">{error}</p> : null}

      {devices === null ? (
        <p className="text-fg-mute">Looking for cameras…</p>
      ) : items.length === 0 ? (
        <div className="rounded-card bg-flare-500/10 px-4 py-3 text-flare-400">
          <strong className="block">No cameras found.</strong>
          <span className="text-sm font-semibold">
            Connect a webcam and click Refresh.
          </span>
          <div className="mt-3">
            <Button onClick={refresh} variant="ghost" size="sm">
              Refresh
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((cam) => {
            const selected = ctx.cameraId === cam.deviceId;
            return (
              <button
                key={cam.deviceId}
                type="button"
                onClick={() => choose(cam.deviceId)}
                className={[
                  'group flex flex-col gap-3 rounded-card p-3 text-left transition-all',
                  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-swoosh-400/50',
                  selected
                    ? 'bg-swoosh-400/15 ring-2 ring-swoosh-400'
                    : 'bg-ink-700/40 hover:bg-ink-700/60',
                ].join(' ')}
                aria-pressed={selected}
              >
                <div className="aspect-video w-full overflow-hidden rounded-card">
                  <CameraThumbnail deviceId={cam.deviceId} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="truncate text-base font-bold text-fg">
                    {cam.label}
                  </span>
                  {selected ? (
                    <span aria-hidden className="text-swoosh-300">
                      ✓
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
