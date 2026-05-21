/**
 * FirstClick — the climax of the tutorial. A pulsing on-screen target
 * waits for the user to pinch with their cursor over it. The pipeline
 * is running locally (same as in HandFraming) but we read its
 * `pinchDown {left}` events directly from the onEmit callback rather
 * than forwarding them to the main process — the OS shouldn't get a
 * real click here.
 *
 * Success criteria: a pinchDown whose normalized cursor coords land
 * inside the target's normalized bounds. On success, the celebratory
 * animation plays and onSuccess() is called.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { TutorialContext } from '../TutorialShell';
import type { HandLandmarks } from '@swoosh/shared/types';
import type { GestureEmitPayload, UserSettings } from '@swoosh/shared/ipc';
import { createPipeline } from '../../shared/pipeline';
import { HandOverlay } from '../../shared/HandOverlay';
import { Card } from '../../shared-ui/components/Card';

interface Props {
  ctx: TutorialContext;
  onSuccess: () => Promise<void> | void;
}

interface TargetBounds {
  // Normalized [0..1] over the preview rect, NOT the screen.
  cx: number;
  cy: number;
  /** Radius in normalized units of the preview's shorter side. */
  r: number;
}

const TARGET: TargetBounds = { cx: 0.7, cy: 0.5, r: 0.12 };

export function FirstClick({ ctx, onSuccess }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hands, setHands] = useState<HandLandmarks[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [hit, setHit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    const pipeline = createPipeline({
      wasmBaseUrl:
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
      modelAssetUrl:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    });
    pipeline.attachVideo(video);

    (async () => {
      const settings = await window.swoosh.settings.get();
      const startSettings: UserSettings = {
        ...settings,
        cameraId: ctx.cameraId ?? settings.cameraId,
      };
      await pipeline.start(startSettings, {
        onLandmarks: (h) => {
          if (!cancelled) setHands(h);
        },
        onEmit: (payload: GestureEmitPayload) => {
          if (cancelled) return;
          setCursor(payload.cursor);
          if (payload.gesture.kind === 'pinchDown' && payload.gesture.button === 'left') {
            const dx = payload.cursor.x - TARGET.cx;
            const dy = payload.cursor.y - TARGET.cy;
            if (Math.hypot(dx, dy) <= TARGET.r && !hit) {
              setHit(true);
              setTimeout(() => {
                void onSuccess();
              }, 600);
            }
          }
        },
      });
    })().catch((err) => {
      if (!cancelled) console.error('FirstClick pipeline error', err);
    });

    return () => {
      cancelled = true;
      pipeline.stop();
    };
    // Only one mount; effect intentionally independent of state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card heading="Time to click">
      <p className="mb-4 text-base font-semibold text-fg-mute">
        Move your hand to put the pointer over the target, then pinch your
        thumb and index finger together.
      </p>

      <div className="relative aspect-video w-full overflow-hidden rounded-card bg-ink-950">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-80"
        />
        <div className="absolute inset-0">
          <HandOverlay landmarks={hands} mirror={false} />
        </div>

        {/* Target */}
        <motion.div
          animate={hit ? { scale: [1, 1.4, 0], opacity: [1, 1, 0] } : { scale: 1 }}
          transition={{ duration: hit ? 0.6 : 0 }}
          style={{ left: `${TARGET.cx * 100}%`, top: `${TARGET.cy * 100}%` }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        >
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-swoosh-400/30 animate-pulseRing" />
            <div className="absolute inset-2 rounded-full bg-swoosh-400 shadow-glow" />
          </div>
        </motion.div>

        {/* Cursor dot — visualizes where Swoosh thinks the pointer is */}
        <div
          aria-hidden
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-flare-500"
          style={{
            // Mirror the cursor x since the video is mirrored.
            left: `${(1 - cursor.x) * 100}%`,
            top: `${cursor.y * 100}%`,
          }}
        />
      </div>

      <div className="mt-4 text-sm">
        {hit ? (
          <p className="font-extrabold text-swoosh-300">Got it! Wrapping up…</p>
        ) : (
          <p className="text-fg-mute">Pinch over the green target to finish.</p>
        )}
      </div>
    </Card>
  );
}
