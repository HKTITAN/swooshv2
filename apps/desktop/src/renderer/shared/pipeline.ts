/**
 * The gesture pipeline.
 *
 * camera → MediaPipe HandLandmarker → 1-Euro filter (inside FSM) →
 * gesture FSM → emits Gesture events via `window.swoosh.gesture.emit`.
 *
 * Owned by whichever renderer holds the camera handle (the overlay,
 * and a second instance in the settings preview). The FSM state and
 * the landmarker are persistent across frames; the camera stream is
 * lifecycle-managed.
 *
 * Hand landmarks are NEVER sent over IPC unless settings.shareLandmarks
 * is true (a dev-only debug flag). The constitution forbids emitting
 * camera-derived data off the local process by default.
 */

import type { Gesture, HandLandmarks } from '@swoosh/shared/types';
import type { GestureEmitPayload, UserSettings } from '@swoosh/shared/ipc';
import { createFsmState, step, type FsmState, type FsmThresholds } from '@swoosh/shared/gesture/fsm';
import { createCameraStream, type CameraStartResult, type CameraStream } from './camera/stream';
import { createLandmarker, type Landmarker } from './camera/landmarker';
import { audio, setAudioConfig } from './audio';

export interface PipelineOptions {
  wasmBaseUrl: string;
  modelAssetUrl: string;
}

export interface PipelineCallbacks {
  /** Emit handler — defaults to window.swoosh.gesture.emit when present. */
  onEmit?: (payload: GestureEmitPayload) => void;
  /** Notified when the camera fails to start. */
  onCameraError?: (err: Extract<CameraStartResult, { ok: false }>) => void;
  /** Notified with the latest detected landmarks (for the overlay renderer). */
  onLandmarks?: (hands: HandLandmarks[]) => void;
  /** Notified each frame with the current FPS. */
  onFps?: (fps: number) => void;
}

export interface Pipeline {
  start(settings: UserSettings, callbacks?: PipelineCallbacks): Promise<CameraStartResult>;
  stop(): void;
  setSettings(patch: Partial<UserSettings>): void;
  /** Provide a <video> element to render frames into; required before start(). */
  attachVideo(video: HTMLVideoElement): void;
}

function thresholdsFromSettings(s: UserSettings): FsmThresholds {
  return {
    pinchEnterThreshold: s.pinchEnterThreshold,
    pinchExitThreshold: s.pinchExitThreshold,
    smoothing: s.smoothing,
  };
}

function defaultEmit(payload: GestureEmitPayload): void {
  if (typeof window !== 'undefined' && window.swoosh?.gesture?.emit) {
    window.swoosh.gesture.emit(payload);
  }
}

function playAudioForGesture(g: Gesture): void {
  switch (g.kind) {
    case 'pinchDown':
      if (g.button === 'left') audio.pinchClick();
      else audio.rightPinchClick();
      break;
    case 'pinchUp':
      audio.release();
      break;
    case 'scroll':
      audio.scrollTick(Math.min(1, Math.hypot(g.dx, g.dy)));
      break;
    default:
      break;
  }
}

export function createPipeline(opts: PipelineOptions): Pipeline {
  const stream: CameraStream = createCameraStream();
  const landmarker: Landmarker = createLandmarker({
    wasmBaseUrl: opts.wasmBaseUrl,
    modelAssetUrl: opts.modelAssetUrl,
  });

  let video: HTMLVideoElement | null = null;
  let fsm: FsmState | null = null;
  let currentSettings: UserSettings | null = null;
  let callbacks: PipelineCallbacks = {};
  let running = false;
  let frameHandle: number | null = null;
  let fallbackHandle: number | null = null;
  let lastFpsT = 0;
  let frameCount = 0;

  function emitFps(now: number): void {
    frameCount++;
    if (now - lastFpsT >= 1000) {
      const fps = (frameCount * 1000) / (now - lastFpsT);
      callbacks.onFps?.(fps);
      frameCount = 0;
      lastFpsT = now;
    }
  }

  function tick(_now: DOMHighResTimeStamp, metadata?: VideoFrameCallbackMetadata): void {
    if (!running || !video || !currentSettings) return;
    const ts = performance.now();
    let hands: HandLandmarks[] = [];
    if (landmarker.isReady()) {
      try {
        hands = landmarker.detect(video, metadata?.mediaTime ? metadata.mediaTime * 1000 : ts);
      } catch (err) {
        hands = [];
        // Swallow — the next frame will retry.
        console.warn('landmarker.detect failed', err);
      }
    }
    callbacks.onLandmarks?.(hands);
    if (!fsm) fsm = createFsmState(thresholdsFromSettings(currentSettings));
    const result = step(fsm, hands, thresholdsFromSettings(currentSettings));
    for (const g of result.events) {
      playAudioForGesture(g);
      const emit = callbacks.onEmit ?? defaultEmit;
      const payload: GestureEmitPayload = {
        gesture: g,
        cursor: { x: result.pointer.x, y: result.pointer.y },
        ts,
        ...(currentSettings.shareLandmarks ? { landmarks: hands } : {}),
      };
      emit(payload);
    }
    emitFps(ts);
    scheduleNext();
  }

  function scheduleNext(): void {
    if (!running || !video) return;
    // Prefer requestVideoFrameCallback when available — it fires once
    // per decoded frame and provides authoritative timestamps.
    if (typeof video.requestVideoFrameCallback === 'function') {
      frameHandle = video.requestVideoFrameCallback(tick);
    } else {
      // Fallback: requestAnimationFrame at ~60Hz.
      fallbackHandle = window.requestAnimationFrame((now) => tick(now));
    }
  }

  function cancelNext(): void {
    if (frameHandle !== null && video && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(frameHandle);
    }
    if (fallbackHandle !== null) window.cancelAnimationFrame(fallbackHandle);
    frameHandle = null;
    fallbackHandle = null;
  }

  return {
    attachVideo(el) {
      video = el;
    },
    async start(settings, cbs = {}) {
      if (running) return { ok: true, stream: stream.getStream() ?? new MediaStream() };
      if (!video) throw new Error('attachVideo() must be called before start()');
      callbacks = cbs;
      currentSettings = settings;
      setAudioConfig({ enabled: settings.audioEnabled, volume: settings.audioVolume });

      await landmarker.init();
      const startResult = await stream.start({
        deviceId: settings.cameraId ?? undefined,
        width: settings.resolution.width,
        height: settings.resolution.height,
        frameRate: settings.fps,
      });
      if (!startResult.ok) {
        callbacks.onCameraError?.(startResult);
        return startResult;
      }
      video.srcObject = startResult.stream;
      await video.play().catch(() => {
        /* play() can reject if the user navigates fast; the frame loop will retry. */
      });
      fsm = createFsmState(thresholdsFromSettings(settings));
      running = true;
      lastFpsT = performance.now();
      frameCount = 0;
      scheduleNext();
      return startResult;
    },
    stop() {
      running = false;
      cancelNext();
      stream.stop();
      if (video) video.srcObject = null;
      landmarker.dispose();
      fsm = null;
    },
    setSettings(patch) {
      if (!currentSettings) return;
      currentSettings = { ...currentSettings, ...patch };
      if (patch.audioEnabled !== undefined || patch.audioVolume !== undefined) {
        setAudioConfig({
          enabled: currentSettings.audioEnabled,
          volume: currentSettings.audioVolume,
        });
      }
    },
  };
}

// `requestVideoFrameCallback` is declared in lib.dom by recent TS releases.
// We reference its metadata type for the local `tick()` parameter through
// the inferred call signature; no augmentation needed.
interface VideoFrameCallbackMetadata {
  mediaTime: number;
  presentationTime: number;
  expectedDisplayTime: number;
  width: number;
  height: number;
  presentedFrames: number;
  processingDuration?: number;
}
