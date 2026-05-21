/**
 * Camera stream — wraps navigator.mediaDevices.getUserMedia.
 *
 * Exposes a small, typed lifecycle (start / stop / replaceDevice) and
 * normalizes the various OS-specific errors getUserMedia can throw
 * into a tagged result. Errors are NEVER logged with frame data —
 * camera frames stay in this module.
 *
 * The overlay window holds exactly one CameraStream at a time. The
 * settings window opens a SECOND one when visible (to render the
 * live preview) and disposes it on hide.
 */

export type CameraStartResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: 'permissionDenied' }
  | { ok: false; reason: 'noCamera' }
  | { ok: false; reason: 'cameraInUse'; byApp?: string }
  | { ok: false; reason: 'unknown'; error: string };

export interface CameraConstraints {
  deviceId?: string;
  width: number;
  height: number;
  frameRate: number;
}

export interface CameraStream {
  start(constraints: CameraConstraints): Promise<CameraStartResult>;
  stop(): void;
  /** Convenience: stop the current stream and start with a new device id. */
  replaceDevice(deviceId: string): Promise<CameraStartResult>;
  /** The active stream, or null if not running. */
  getStream(): MediaStream | null;
  /** The constraints the active stream was started with, or null. */
  getConstraints(): CameraConstraints | null;
}

function classifyError(err: unknown): CameraStartResult {
  if (typeof err === 'object' && err && 'name' in err) {
    const name = (err as { name?: string }).name;
    const message = (err as { message?: string }).message ?? '';
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return { ok: false, reason: 'permissionDenied' };
      case 'NotFoundError':
      case 'OverconstrainedError':
        return { ok: false, reason: 'noCamera' };
      case 'NotReadableError':
      case 'TrackStartError':
      case 'AbortError':
        return { ok: false, reason: 'cameraInUse' };
      default:
        return { ok: false, reason: 'unknown', error: `${name}: ${message}` };
    }
  }
  return { ok: false, reason: 'unknown', error: String(err) };
}

export function createCameraStream(): CameraStream {
  let active: MediaStream | null = null;
  let activeConstraints: CameraConstraints | null = null;

  function stop(): void {
    if (active) {
      for (const track of active.getTracks()) track.stop();
      active = null;
      activeConstraints = null;
    }
  }

  async function start(constraints: CameraConstraints): Promise<CameraStartResult> {
    stop();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return { ok: false, reason: 'noCamera' };
    }
    const video: MediaTrackConstraints = {
      width: { ideal: constraints.width },
      height: { ideal: constraints.height },
      frameRate: { ideal: constraints.frameRate },
    };
    if (constraints.deviceId) video.deviceId = { exact: constraints.deviceId };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      active = stream;
      activeConstraints = constraints;
      return { ok: true, stream };
    } catch (err) {
      return classifyError(err);
    }
  }

  return {
    start,
    stop,
    replaceDevice(deviceId) {
      if (!activeConstraints) {
        return start({ deviceId, width: 1280, height: 720, frameRate: 30 });
      }
      return start({ ...activeConstraints, deviceId });
    },
    getStream() {
      return active;
    },
    getConstraints() {
      return activeConstraints;
    },
  };
}
