/**
 * Overlay renderer entry.
 *
 * Mounts <OverlayApp /> which:
 *  1. Starts the gesture pipeline against the user-selected camera.
 *  2. Renders the hand outline full-window via <HandOverlay />.
 *  3. Forwards every FSM event to the main process via
 *     `window.swoosh.gesture.emit` (T202).
 *  4. Shows the recording indicator while the camera is active (T208).
 */

import { createRoot } from 'react-dom/client';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { HandOverlay } from '../shared/HandOverlay';
import { createPipeline, type Pipeline } from '../shared/pipeline';
import type { HandLandmarks } from '@swoosh/shared/types';
import { LANDMARK } from '@swoosh/shared/types';
import type { GestureEmitPayload, UserSettings } from '@swoosh/shared/ipc';
import './styles.css';

function RecordingIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-50 flex items-center gap-2 rounded-pill bg-black/40 px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur"
      style={{ fontFamily: '"Baloo 2", system-ui' }}
    >
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-flare-500" aria-hidden />
      Tracking
    </div>
  );
}

/**
 * Ambiguity hint (T303): when both index and middle are near the pinch
 * threshold simultaneously, flash a short finger label so the user
 * knows the FSM had to disambiguate.
 */
function AmbiguityHint({ which }: { which: 'index' | 'middle' | null }) {
  if (!which) return null;
  return (
    <div
      key={which}
      className="pointer-events-none fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-pill bg-ink-900/80 px-4 py-2 text-sm font-extrabold text-fg backdrop-blur"
      style={{ fontFamily: '"Baloo 2", system-ui' }}
    >
      {which === 'index' ? 'Index pinch' : 'Middle pinch'}
    </div>
  );
}

function OverlayApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const [hands, setHands] = useState<HandLandmarks[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [active, setActive] = useState(false);
  const [ambiguous, setAmbiguous] = useState<'index' | 'middle' | null>(null);
  const ambiguousTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial = await window.swoosh.settings.get();
      if (cancelled) return;
      setSettings(initial);

      const video = videoRef.current;
      if (!video) return;
      const pipeline = createPipeline({
        wasmBaseUrl: new URL('@mediapipe/tasks-vision/wasm', import.meta.url).href,
        modelAssetUrl:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      });
      pipeline.attachVideo(video);
      pipelineRef.current = pipeline;

      const res = await pipeline.start(initial, {
        onLandmarks: (h) => {
          if (cancelled) return;
          setHands(h);
          // Detect ambiguous pinch: both finger pairs near threshold
          // simultaneously. Flash the active label so the user knows
          // the FSM had to pick.
          if (h.length > 0) {
            const hand = h[0]!;
            const thumb = hand.points[LANDMARK.THUMB_TIP];
            const indexT = hand.points[LANDMARK.INDEX_TIP];
            const middleT = hand.points[LANDMARK.MIDDLE_TIP];
            if (thumb && indexT && middleT) {
              const di = Math.hypot(thumb.x - indexT.x, thumb.y - indexT.y);
              const dm = Math.hypot(thumb.x - middleT.x, thumb.y - middleT.y);
              const enter = initial.pinchEnterThreshold;
              const ambiguityBand = enter * 1.4;
              if (di < ambiguityBand && dm < ambiguityBand) {
                const which: 'index' | 'middle' = di <= dm ? 'index' : 'middle';
                setAmbiguous(which);
                if (ambiguousTimerRef.current) clearTimeout(ambiguousTimerRef.current);
                ambiguousTimerRef.current = setTimeout(() => setAmbiguous(null), 800);
              }
            }
          }
        },
        onEmit: (payload: GestureEmitPayload) => {
          // Forward every FSM event to main (T202).
          window.swoosh.gesture.emit(payload);
        },
      });
      if (!cancelled) setActive(res.ok);
    })();

    return () => {
      cancelled = true;
      pipelineRef.current?.stop();
      pipelineRef.current = null;
      if (ambiguousTimerRef.current) clearTimeout(ambiguousTimerRef.current);
    };
  }, []);

  // React to live settings changes (e.g., user adjusts thresholds).
  useEffect(() => {
    return window.swoosh.settings.onChanged((next) => {
      setSettings(next);
      pipelineRef.current?.setSettings(next);
    });
  }, []);

  // Pause / resume on tracking state broadcast.
  useEffect(() => {
    return window.swoosh.tracking.onState((state) => {
      if (state.kind === 'active') {
        setActive(true);
        if (settings) pipelineRef.current?.start(settings);
      } else {
        setActive(false);
        pipelineRef.current?.stop();
      }
    });
  }, [settings]);

  return (
    <>
      {/* Hidden video — never rendered. Frames stay in this process. */}
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
      <HandOverlay
        landmarks={hands}
        style={settings?.outlineStyle ?? 'default'}
        pinchGlow
        mirror
      />
      <RecordingIndicator visible={active} />
      <AmbiguityHint which={ambiguous} />
    </>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OverlayApp />
    </StrictMode>,
  );
}
