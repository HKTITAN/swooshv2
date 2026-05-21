# Research: Swoosh MVP

Decisions documented for traceability. Each entry lists the
alternatives considered and why they were rejected.

## Hand tracking library

**Chosen**: `@mediapipe/tasks-vision` `HandLandmarker`.

Alternatives considered:

- **MediaPipe legacy `Hands` package**: deprecated, drops support
  for newer Chromium/Electron versions. Skip.
- **OpenCV + custom CNN**: months of training data work for parity
  with a pre-trained 21-landmark model. Out of scope.
- **TensorFlow.js HandPose**: less accurate than MediaPipe in our
  tests, slower on WebGL.
- **Mediapipe via Python sidecar**: avoids browser, but introduces
  a second process and IPC bottleneck. Worse latency.

`@mediapipe/tasks-vision` runs in the renderer using WebGL or
WebAssembly, exposes a clean async API, ships a 5 MB WASM blob, and
is the same model used by Meta's reference demos.

## OS-level input simulation

**Chosen**: `@nut-tree-fork/nut-js`.

Alternatives:

- **robotjs**: unmaintained since 2022, breaks on Electron 25+.
- **`Iohook`**: input *capture*, not synthesis. Wrong direction.
- **Platform-native bindings** (PowerShell, AppleScript,
  xdotool/ydotool spawned per event): viable but high latency and
  brittle across distros.
- **`nut.js` (official)**: deprecated in favor of the fork.

The fork is actively maintained, supports Win/Mac/Linux X11 via
prebuilt binaries, and exposes mouse, keyboard, and scroll wheel
APIs synchronously. For Wayland we fall back to `ydotool` (separate
binary the user must install) — documented in the setup guide.

## App framework

**Chosen**: Electron + React + Vite (via `electron-vite`).

Alternatives:

- **Tauri**: smaller bundle, faster startup. Rejected because the
  renderer must run MediaPipe and nut.js — both Node-native — so
  Tauri would force us to split into a Rust+Node hybrid. Electron
  gives us one runtime everywhere.
- **Native (Swift/C#/C++)**: best perf but triples the work for
  the MVP.
- **PyQt + MediaPipe Python**: fast prototype, painful
  distribution (PyInstaller bundles flagged by AV).

## State management

**Chosen**: Zustand 4.

Alternatives:

- **Redux Toolkit**: overkill for this surface area.
- **React Context + reducers**: cheaper, but Zustand's external
  store is easier to share across multiple renderer entry points
  (overlay, settings, tutorial, tray-popover) via the IPC bridge.

## Styling

**Chosen**: Tailwind CSS 3.4 with a small custom token layer.

Custom tokens declared in `theme.css` so the playful palette
(saturated accents over a deep base) lives in one place rather
than scattering arbitrary hex values across components.

## Audio cues

**Chosen**: Web Audio API, synthesized tones.

Alternatives:

- **Bundled WAV / MP3**: adds asset weight and licensing concerns.
- **HTML5 `<audio>`**: not low-latency enough for click-on-pinch
  feel.

Tones are 50–150 ms sine + envelope, generated on-the-fly. Three
distinct cues: `pinch` (440 Hz), `right-pinch` (330 Hz), `release`
(550 Hz, shorter).

## Gesture filtering

**Chosen**: 1-Euro filter (Casiez et al., CHI 2012).

Alternatives:

- **EMA**: cheap but visible lag.
- **Kalman**: more parameters, marginal gain over 1-Euro at our
  signal characteristics.

Default β = 0.05, mincutoff = 1.0. Tunable in settings under
"Advanced".

## Packaging

**Chosen**: `electron-builder` + `electron-updater` against GitHub
Releases.

Alternatives:

- **Electron Forge**: similar but the auto-update story is less
  smooth.
- **Squirrel.Mac/Squirrel.Windows direct**: too low-level.

## Testing

**Chosen**:

- **Vitest** for pure-TS units (FSM, filter, settings schema).
- **Playwright** for the renderer end-to-end (tutorial flow,
  settings UI). Playwright drives Electron via `_electron.launch()`.
- **Manual** for gesture acceptance on real hardware — no test
  can substitute for "does it feel right".

## Open research items

- macOS Mission Control / Spaces integration for tab/window
  switching: needs AppleScript or accessibility API; deferred to
  US4 implementation spike.
- Hardware-accelerated MediaPipe on Apple Silicon: WebGL path is
  fine; revisit if perf falls short.
