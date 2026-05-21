/**
 * Permission step — requests camera access from the OS.
 *
 * Flow:
 *  1. Probe the permission via `navigator.permissions.query`. If
 *     "granted", advance immediately. If "denied", show OS-specific
 *     guidance and a "Try again" button. If "prompt", show the
 *     "Grant access" CTA which triggers a short-lived getUserMedia
 *     call to surface the OS prompt.
 *  2. Once permission is granted, mark canAdvance = true via the
 *     `permissionGranted` flag in the tutorial context.
 *
 * We intentionally release the test stream immediately — we don't want
 * to hold the camera handle across tutorial steps.
 */

import { useCallback, useEffect, useState } from 'react';
import type { TutorialContext } from '../TutorialShell';
import { Button } from '../../shared-ui/components/Button';
import { Card } from '../../shared-ui/components/Card';

type PermState = 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported';

function osHint(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) {
    return 'Open Windows Settings → Privacy & security → Camera, and allow Swoosh to use your camera.';
  }
  if (/Mac/i.test(ua)) {
    return 'Open System Settings → Privacy & Security → Camera, and enable Swoosh.';
  }
  return 'Allow camera access in your system settings for Swoosh, then try again.';
}

export function Permission({ ctx }: { ctx: TutorialContext }) {
  const [state, setState] = useState<PermState>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      setState('unsupported');
      return;
    }
    try {
      const result = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      setState(result.state as PermState);
      if (result.state === 'granted') ctx.setPermissionGranted(true);
    } catch {
      // Some browsers don't list "camera" — fall back to "unknown"
      // and let the user proceed with the explicit Grant flow.
      setState('unknown');
    }
  }, [ctx]);

  useEffect(() => {
    void probe();
  }, [probe]);

  const grant = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      // Release immediately; we don't need a held handle here.
      for (const track of stream.getTracks()) track.stop();
      ctx.setPermissionGranted(true);
      setState('granted');
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NotAllowedError') setState('denied');
      else setError(`Couldn't access the camera: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [ctx]);

  return (
    <Card heading="Camera access">
      <p className="mb-6 text-base font-semibold text-fg-mute">
        Swoosh needs your camera to see your hand. Frames stay on this
        machine — they&apos;re never uploaded.
      </p>

      {state === 'granted' ? (
        <div className="flex items-center gap-3 rounded-card bg-swoosh-400/10 px-4 py-3 text-swoosh-300">
          <span aria-hidden>✓</span>
          <span className="font-bold">Camera access granted. Tap Next to continue.</span>
        </div>
      ) : null}

      {state === 'denied' ? (
        <div className="space-y-4">
          <div className="rounded-card bg-flare-500/10 px-4 py-3 text-flare-400">
            <strong className="block">Permission denied.</strong>
            <span className="text-sm font-semibold">{osHint()}</span>
          </div>
          <Button onClick={probe} variant="ghost">
            Try again
          </Button>
        </div>
      ) : null}

      {(state === 'prompt' || state === 'unknown' || state === 'unsupported') && (
        <div className="flex flex-col gap-4">
          <Button onClick={grant} disabled={busy} variant="primary">
            {busy ? 'Asking…' : 'Grant access'}
          </Button>
          {error ? <p className="text-sm text-flare-400">{error}</p> : null}
        </div>
      )}
    </Card>
  );
}
