/**
 * HandFraming — run the pipeline against the chosen camera and show
 * the live hand overlay full-window. Once a hand has been seen with
 * score ≥ 0.7 for 30 consecutive frames, we set
 * `handDetectedFrames = 30` so the shell's Next button enables and
 * show a "Nice — I can see your hand!" success banner.
 *
 * The pipeline started here is local to this step; we stop it on
 * unmount so the overlay's pipeline can take ownership of the camera
 * after the tutorial completes.
 */

import { useEffect, useRef, useState } from 'react';
import type { TutorialContext } from '../TutorialShell';
import { HandOverlay } from '../../shared/HandOverlay';
import type { HandLandmarks } from '@swoosh/shared/types';
import type { UserSettings } from '@swoosh/shared/ipc';
import { createPipeline } from '../../shared/pipeline';
import { Card } from '../../shared-ui/components/Card';

const SUCCESS_FRAMES = 30;
const SCORE_THRESHOLD = 0.7;

export function HandFraming({ ctx }: { ctx: TutorialContext }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hands, setHands] = useState<HandLandmarks[]>([]);
  const [streak, setStreak] = useState(0);
  const [status, setStatus] = useState<'starting' | 'ready' | 'success' | 'error'>(
    'starting',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    // Asset URLs — in dev/build, electron-vite serves these from
    // node_modules. The pipeline lazy-loads them on init().
    const pipeline = createPipeline({
      wasmBaseUrl:
        new URL('@mediapipe/tasks-vision/wasm', import.meta.url).href,
      modelAssetUrl:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    });
    pipeline.attachVideo(video);

    (async () => {
      try {
        const settings = await window.swoosh.settings.get();
        // Force the chosen camera even if settings haven't refreshed yet.
        const startSettings: UserSettings = {
          ...settings,
          cameraId: ctx.cameraId ?? settings.cameraId,
        };
        const res = await pipeline.start(startSettings, {
          onLandmarks: (h) => {
            if (cancelled) return;
            setHands(h);
            const best = h.reduce(
              (acc, hand) => (hand.score > acc ? hand.score : acc),
              0,
            );
            if (best >= SCORE_THRESHOLD) {
              setStreak((prev) => {
                const next = prev + 1;
                if (next >= SUCCESS_FRAMES && status !== 'success') {
                  setStatus('success');
                  ctx.setHandDetectedFrames(next);
                }
                return next;
              });
            } else {
              setStreak(0);
            }
          },
          onCameraError: (err) => {
            setStatus('error');
            setErrorMsg(`Couldn't open camera: ${err.reason}`);
          },
          // No FSM event handling in this step; we only need the
          // overlay. Suppress the default IPC emit so the main process
          // doesn't act on tutorial gestures.
          onEmit: () => undefined,
        });
        if (!res.ok && !cancelled) {
          setStatus('error');
          setErrorMsg(`Couldn't open camera: ${res.reason}`);
        } else if (!cancelled) {
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      pipeline.stop();
    };
    // We intentionally only start the pipeline once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card heading="Show me your hand">
      <p className="mb-4 text-base font-semibold text-fg-mute">
        Hold your hand in front of the camera with fingers spread. I&apos;ll
        outline your hand once I see it.
      </p>

      <div className="relative aspect-video w-full overflow-hidden rounded-card bg-ink-950">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-90"
        />
        <div className="absolute inset-0">
          <HandOverlay landmarks={hands} mirror={false} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        {status === 'starting' && <p className="text-fg-mute">Warming up the camera…</p>}
        {status === 'ready' && streak < SUCCESS_FRAMES && (
          <p className="text-fg-mute">
            Looking for a hand… ({Math.min(streak, SUCCESS_FRAMES)}/{SUCCESS_FRAMES})
          </p>
        )}
        {status === 'success' && (
          <p className="font-extrabold text-swoosh-300">
            Nice — I can see your hand!
          </p>
        )}
        {status === 'error' && (
          <p className="text-flare-400">{errorMsg ?? 'Camera unavailable.'}</p>
        )}
      </div>
    </Card>
  );
}
