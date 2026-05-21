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
import { HAND_LANDMARKER_MODEL_URL, MEDIAPIPE_WASM_URL } from '../shared/mediapipeAssets';
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

/**
 * Two-hand resize indicator (T603): a dashed line between the two
 * pinch points + an "↔ Resize ×N.NN" badge near the midpoint. Only
 * renders while the FSM is in TWO_HAND_RESIZE.
 */
interface ResizeIndicatorProps {
  active: boolean;
  scale: number;
  pinchPoints: Array<{ x: number; y: number }>;
  mirror?: boolean;
}
function ResizeIndicator({ active, scale, pinchPoints, mirror = true }: ResizeIndicatorProps) {
  if (!active || pinchPoints.length < 2) return null;
  // Use the two MOST-separated points so it always traces the resize axis.
  const p1 = pinchPoints[0]!;
  const p2 = pinchPoints[1]!;
  const x1 = mirror ? 1 - p1.x : p1.x;
  const x2 = mirror ? 1 - p2.x : p2.x;
  const y1 = p1.y;
  const y2 = p2.y;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return (
    <>
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="pointer-events-none fixed inset-0 z-30 h-full w-full"
      >
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(255, 213, 107, 0.9)"
          strokeWidth={0.004}
          strokeDasharray="0.012 0.008"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-sun-500 px-3 py-1 text-xs font-extrabold text-ink-950 shadow-glow"
        style={{
          left: `${cx * 100}%`,
          top: `${cy * 100}%`,
          fontFamily: '"Baloo 2", system-ui',
        }}
      >
        ↔ Resize ×{scale.toFixed(2)}
      </div>
    </>
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
  // Two-hand resize indicator state (T603). The FSM is the source of truth
  // for whether we're in TWO_HAND_RESIZE — we just mirror it for the UI.
  const [resizing, setResizing] = useState(false);
  const [resizeScale, setResizeScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial = await window.swoosh.settings.get();
      if (cancelled) return;
      setSettings(initial);

      const video = videoRef.current;
      if (!video) return;
      const pipeline = createPipeline({
        wasmBaseUrl: MEDIAPIPE_WASM_URL,
        modelAssetUrl: HAND_LANDMARKER_MODEL_URL,
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
          // Drive the resize indicator UI from the same event stream
          // (T603). The FSM is the source of truth for whether we're
          // in the two-hand state.
          const g = payload.gesture;
          if (g.kind === 'twoHandResizeStart') {
            setResizing(true);
            setResizeScale(1);
          } else if (g.kind === 'twoHandResizeDelta') {
            setResizeScale(g.scale);
          } else if (g.kind === 'twoHandResizeEnd' || g.kind === 'idle') {
            setResizing(false);
          }
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
      <ResizeIndicator
        active={resizing}
        scale={resizeScale}
        pinchPoints={hands.slice(0, 2).map((h) => {
          const t = h.points[LANDMARK.THUMB_TIP];
          const i = h.points[LANDMARK.INDEX_TIP];
          if (!t || !i) return { x: 0.5, y: 0.5 };
          return { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 };
        })}
        mirror
      />
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
