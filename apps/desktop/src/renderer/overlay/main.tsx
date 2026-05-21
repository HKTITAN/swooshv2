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

function OverlayApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const [hands, setHands] = useState<HandLandmarks[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [active, setActive] = useState(false);

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
          if (!cancelled) setHands(h);
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
