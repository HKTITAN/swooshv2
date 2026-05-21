# Data Model: Swoosh MVP

All entities live in-process. No databases. No external storage.
Persistence is JSON via `electron-store` for `UserSettings` only.

## UserSettings

Persisted across launches. Validated on load with a Zod schema.
Defaults to `DEFAULT_USER_SETTINGS` from
`packages/shared/src/ipc.ts` if file is missing or fails validation.

See [contracts/ipc.ts](./contracts/ipc.ts) for the full TypeScript
shape. Notable fields:

- `pinchEnterThreshold` / `pinchExitThreshold`: hysteresis pair.
  Enter < Exit. Pinch is *closed* when normalized fingertip
  distance < enter; *open* once it exceeds exit.
- `performanceProfile`: `adaptive` runs benchmark; other values
  pin to a preset:
  - `high`: 1280×720 @ 60 FPS
  - `balanced`: 1280×720 @ 30 FPS
  - `battery`: 640×480 @ 30 FPS

## HandLandmarks

Transient. Produced per frame by MediaPipe HandLandmarker.
21 normalized landmarks plus handedness and detection score.

Defined in [contracts/types.ts](./contracts/types.ts).

Not persisted. Not sent over IPC by default (only when
`settings.shareLandmarks === true` for development).

## Gesture

Transient. Produced by the gesture FSM each frame; emitted to the
main process as `gesture:emit`. See [contracts/types.ts](./contracts/types.ts).

Lifecycle of a pinch-click:
```
frame N:   pointer over target, hand open  → emit `tracking`
frame N+1: fingers close past enter thresh → emit `pinchDown { left }`
frame N+2..N+k: pointer moves (drag)       → emit `tracking`
frame N+k+1: fingers open past exit thresh → emit `pinchUp { left }`
                                          → emit `click { left }` (if no drag-distance threshold exceeded)
```

The `click` event is *synthesized* from a tight pinch-down/pinch-up
pair where pointer movement between them is < 4px in screen-space.
Otherwise the pinch is treated as a drag and no `click` is emitted.

## CameraSource

Transient. Enumerated via
`navigator.mediaDevices.enumerateDevices()` filtered to
`kind === "videoinput"`. See [contracts/ipc.ts](./contracts/ipc.ts).

## TrackingState

Single source of truth lives in main; broadcast to renderers via
`tracking:state`. Used by tray, overlay, and tutorial to react to
pause/resume and error states.

## TutorialProgress

Embedded inside `UserSettings.tutorialSeen` (boolean) plus an
in-memory `currentStep` while the tutorial is active. No per-step
persistence — the tutorial is small enough to restart from the
beginning on relaunch if interrupted.

## Logs

Rotating files at:
- Windows: `%APPDATA%/Swoosh/logs/`
- macOS: `~/Library/Logs/Swoosh/`
- Linux: `~/.config/Swoosh/logs/`

Max 5 files × 1 MB. Cleared from Settings → Diagnostics → "Clear logs".
Never contains camera frames or landmarks; only state transitions,
errors, and benchmark output.
