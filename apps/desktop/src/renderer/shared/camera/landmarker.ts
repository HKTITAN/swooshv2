/**
 * HandLandmarker wrapper around @mediapipe/tasks-vision.
 *
 * Lazy-loads the WASM/WebGL backend on first use (~3-5 MB), then runs
 * detection on each frame via the renderer's `requestVideoFrameCallback`.
 * Emits a tagged HandLandmarks[] for each successful frame.
 *
 * The model file (hand_landmarker.task) is loaded from a path passed
 * in by the caller; in dev we bundle it next to the renderer entry,
 * in prod electron-vite copies it into out/renderer/assets/.
 */

import {
  FilesetResolver,
  HandLandmarker as MpHandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import type { HandLandmarks, Handedness, Landmark } from '@swoosh/shared/types';

export interface LandmarkerOptions {
  /** URL to the WASM bundle directory shipped by @mediapipe/tasks-vision. */
  wasmBaseUrl: string;
  /** URL to the hand_landmarker.task model file. */
  modelAssetUrl: string;
  /** Max simultaneously tracked hands. Defaults to 2 for resize gestures. */
  numHands?: number;
  /** Minimum detection score [0..1]. Defaults to 0.5. */
  minDetectionConfidence?: number;
  /** Minimum presence score [0..1]. Defaults to 0.5. */
  minPresenceConfidence?: number;
  /** Minimum tracking score [0..1]. Defaults to 0.5. */
  minTrackingConfidence?: number;
}

export interface Landmarker {
  /** Ensure WASM + model are loaded. Safe to call repeatedly. */
  init(): Promise<void>;
  /** Run detection on the current video frame. Returns 0..numHands HandLandmarks. */
  detect(video: HTMLVideoElement, tsMs: number): HandLandmarks[];
  /** Free the underlying model. Safe to call when stopping the pipeline. */
  dispose(): void;
  /** True once init() has resolved. */
  isReady(): boolean;
}

function toLandmark(p: NormalizedLandmark): Landmark {
  return { x: p.x, y: p.y, z: p.z };
}

function normalizeHandedness(label: string): Handedness {
  // MediaPipe's handedness label is given from the camera's perspective,
  // which can be inverted by a mirrored preview. We just pass it through
  // here and let the caller decide whether to flip. Default to "Right"
  // if MediaPipe returns something unexpected.
  return label === 'Left' || label === 'Right' ? (label as Handedness) : 'Right';
}

export function createLandmarker(opts: LandmarkerOptions): Landmarker {
  let mp: MpHandLandmarker | null = null;
  let initializing: Promise<void> | null = null;
  let lastTsMs = -1;

  async function init(): Promise<void> {
    if (mp) return;
    if (initializing) return initializing;
    initializing = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(opts.wasmBaseUrl);
      mp = await MpHandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: opts.modelAssetUrl },
        runningMode: 'VIDEO',
        numHands: opts.numHands ?? 2,
        minHandDetectionConfidence: opts.minDetectionConfidence ?? 0.5,
        minHandPresenceConfidence: opts.minPresenceConfidence ?? 0.5,
        minTrackingConfidence: opts.minTrackingConfidence ?? 0.5,
      });
    })();
    return initializing;
  }

  function adapt(result: HandLandmarkerResult, tsMs: number): HandLandmarks[] {
    const out: HandLandmarks[] = [];
    const handsCount = result.landmarks?.length ?? 0;
    for (let i = 0; i < handsCount; i++) {
      const points = result.landmarks[i]?.map(toLandmark) ?? [];
      const handedness = result.handednesses[i]?.[0];
      const score = handedness?.score ?? 0;
      out.push({
        points,
        handedness: normalizeHandedness(handedness?.categoryName ?? 'Right'),
        score,
        ts: tsMs,
      });
    }
    return out;
  }

  return {
    init,
    isReady() {
      return mp !== null;
    },
    detect(video, tsMs) {
      if (!mp) return [];
      // MediaPipe requires strictly monotonic timestamps in VIDEO mode.
      const ts = Math.max(tsMs, lastTsMs + 1);
      lastTsMs = ts;
      const result = mp.detectForVideo(video, ts);
      return adapt(result, ts);
    },
    dispose() {
      mp?.close();
      mp = null;
      initializing = null;
      lastTsMs = -1;
    },
  };
}
