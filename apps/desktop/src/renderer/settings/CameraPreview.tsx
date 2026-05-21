/**
 * CameraPreview (T502).
 *
 * Runs a second instance of the gesture pipeline tied to this settings
 * window. Bounded by the `active` prop — when the window goes hidden,
 * the pipeline stops and the camera handle is released. When it comes
 * back, the pipeline restarts.
 *
 * Renders <HandOverlay /> on top of a <video> element. Optionally
 * draws a threshold ring at the index + thumb fingertips when the user
 * is adjusting pinch thresholds (T505).
 *
 * No landmarks leave this component — they're rendered locally only.
 */

import { useEffect, useRef, useState } from 'react';
import type { HandLandmarks } from '@swoosh/shared/types';
import { LANDMARK } from '@swoosh/shared/types';
import type { UserSettings } from '@swoosh/shared/ipc';
import { createPipeline, type Pipeline } from '../shared/pipeline';
import { HAND_LANDMARKER_MODEL_URL, MEDIAPIPE_WASM_URL } from '../shared/mediapipeAssets';
import { HandOverlay } from '../shared/HandOverlay';

interface Props {
  settings: UserSettings;
  active: boolean;
  showThresholdRing: boolean;
}

export function CameraPreview({ settings, active, showThresholdRing }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const [hands, setHands] = useState<HandLandmarks[]>([]);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Lifecycle — start when active flips on, stop when off.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    const pipeline = createPipeline({
      wasmBaseUrl: MEDIAPIPE_WASM_URL,
      modelAssetUrl: HAND_LANDMARKER_MODEL_URL,
    });
    pipeline.attachVideo(video);
    pipelineRef.current = pipeline;
    setError(null);

    (async () => {
      // The preview NEVER forwards gestures to the main process — it's
      // strictly for visualization. We pass an empty onEmit so the
      // pipeline's default (which would call window.swoosh.gesture.emit)
      // is suppressed.
      const res = await pipeline.start(settings, {
        onEmit: () => {
          /* no-op: preview only */
        },
        onLandmarks: (h) => {
          if (cancelled) return;
          setHands(h);
        },
        onFps: (f) => {
          if (cancelled) return;
          setFps(f);
        },
        onCameraError: (e) => {
          if (cancelled) return;
          setError(reasonOf(e));
        },
      });
      if (!res.ok && !cancelled) {
        setError(reasonOf(res));
      }
    })();

    return () => {
      cancelled = true;
      pipeline.stop();
      pipelineRef.current = null;
    };
    // Pipeline restart only depends on the identity of the camera / its
    // capture profile. Other settings (thresholds, smoothing, audio) are
    // applied to the running pipeline via the second useEffect below;
    // including the whole `settings` object here would cause unnecessary
    // tear-down + warmup cycles on each tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings.cameraId, settings.resolution.width, settings.resolution.height, settings.fps]);

  // Live-apply non-restart settings to the running pipeline.
  // Note: the pipeline only acts on audio config inside setSettings; the
  // rest are tracked in currentSettings so future ticks see them. We
  // pass them through anyway for completeness.
  useEffect(() => {
    pipelineRef.current?.setSettings({
      pinchEnterThreshold: settings.pinchEnterThreshold,
      pinchExitThreshold: settings.pinchExitThreshold,
      smoothing: settings.smoothing,
      audioEnabled: false, // preview never plays sounds
      audioVolume: 0,
      scrollSensitivity: settings.scrollSensitivity,
    });
  }, [
    settings.pinchEnterThreshold,
    settings.pinchExitThreshold,
    settings.smoothing,
    settings.scrollSensitivity,
  ]);

  return (
    <div className="absolute inset-0">
      {/*
       * Selfie POV: the <video> is CSS-mirrored, and HandOverlay mirrors
       * the canvas so the outline aligns with the user's hand. The
       * ThresholdRings overlay mirrors the same way for a consistent
       * look across the preview.
       */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
        playsInline
        muted
      />
      <HandOverlay
        landmarks={hands}
        style={settings.outlineStyle}
        pinchGlow
        mirror
        className="absolute inset-0"
      />
      {showThresholdRing ? (
        <ThresholdRings hands={hands} radius={settings.pinchEnterThreshold} mirror />
      ) : null}

      {/* FPS readout */}
      <div className="pointer-events-none absolute right-3 top-3 rounded-pill bg-ink-950/70 px-3 py-1 text-xs font-extrabold text-swoosh-300 backdrop-blur">
        {fps > 0 ? `${Math.round(fps)} FPS` : 'starting…'}
      </div>

      {/* Error state */}
      {error ? (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-ink-950/85">
          <div className="max-w-md rounded-panel bg-ink-800 p-6 text-center shadow-panel">
            <div className="mb-2 text-2xl">📷</div>
            <div className="mb-2 text-lg font-extrabold">Camera trouble</div>
            <div className="text-sm text-fg-mute">{describeError(error)}</div>
          </div>
        </div>
      ) : null}

      {/* Suspended overlay when active is false */}
      {!active ? (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-950/80">
          <div className="text-sm font-bold text-fg-mute">Preview paused (window hidden)</div>
        </div>
      ) : null}
    </div>
  );
}

function reasonOf(res: { ok: false; reason: string }): string {
  return res.reason;
}

function describeError(reason: string): string {
  switch (reason) {
    case 'permissionDenied':
      return 'Camera permission was denied. Grant access in your OS settings and reopen this window.';
    case 'cameraInUse':
      return 'Your camera is being used by another app. Close Zoom, Teams, or your browser and try again.';
    case 'noCamera':
      return 'No camera detected. Plug one in and reopen this window.';
    default:
      return reason;
  }
}

interface ThresholdRingsProps {
  hands: HandLandmarks[];
  radius: number; // normalized 0..1
  /** Whether the underlying video is mirrored (selfie view). */
  mirror?: boolean;
}

function ThresholdRings({ hands, radius, mirror = true }: ThresholdRingsProps) {
  // Renders a circle at index + thumb fingertips. Radius is the
  // pinch threshold expressed as a fraction of the smaller frame
  // dimension. When the video is mirrored we mirror cx too.
  const tx = (x: number) => (mirror ? 1 - x : x);
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {hands.flatMap((h, hi) => {
        const tipIdx = h.points[LANDMARK.INDEX_TIP];
        const thumbIdx = h.points[LANDMARK.THUMB_TIP];
        if (!tipIdx || !thumbIdx) return [];
        return [
          <circle
            key={`i-${hi}`}
            cx={tx(tipIdx.x)}
            cy={tipIdx.y}
            r={radius / 2}
            fill="none"
            stroke="rgba(255, 213, 107, 0.95)"
            strokeWidth={0.003}
            vectorEffect="non-scaling-stroke"
          />,
          <circle
            key={`t-${hi}`}
            cx={tx(thumbIdx.x)}
            cy={thumbIdx.y}
            r={radius / 2}
            fill="none"
            stroke="rgba(255, 213, 107, 0.95)"
            strokeWidth={0.003}
            vectorEffect="non-scaling-stroke"
          />,
        ];
      })}
    </svg>
  );
}
