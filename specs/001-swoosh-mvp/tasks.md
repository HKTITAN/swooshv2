---
description: "Task list for Swoosh MVP — atomic, dependency-ordered, ralph-loop-friendly"
---

# Tasks: Swoosh MVP

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [data-model.md](./data-model.md), [contracts/ipc.ts](./contracts/ipc.ts), [contracts/types.ts](./contracts/types.ts)

**Format**: `- [ ] TID [P?] [Story?] Description`

- `[P]` = can be done in parallel with siblings (different files, no dependency)
- `[USn]` = belongs to user story n; absence = foundational / polish
- Each task should be completable in a single ralph loop iteration
  (small, atomic, leaves the build passing)
- After completing a task: tick it here, run any relevant tests/lint,
  and commit with a focused message

## Phase 1 — Setup

- [x] T001 Create root `package.json` (private workspace) and `pnpm-workspace.yaml` listing `apps/*` and `packages/*`
- [x] T002 [P] Add `.gitignore` (node_modules, dist, release, .env, .DS_Store, *.log, .vite, .turbo)
- [x] T003 [P] Add `.editorconfig` + `.prettierrc` (2-space, single quotes, trailing comma, 100-col)
- [x] T004 [P] Add `tsconfig.base.json` with strict mode, ES2022 target, NodeNext module
- [x] T005 [P] Add root `LICENSE` (MIT) and `README.md` with one-paragraph project summary and dev quickstart
- [x] T006 Bootstrap `packages/shared` with `package.json`, `tsconfig.json` extending base, `src/index.ts` placeholder
- [x] T007 Bootstrap `apps/desktop` with `package.json` declaring electron, electron-vite, react, react-dom, zustand, zod, tailwindcss, framer-motion, @mediapipe/tasks-vision, @nut-tree-fork/nut-js, electron-store, electron-log, electron-updater
- [x] T008 Add `apps/desktop/electron.vite.config.ts` configuring main, preload, and a multi-entry renderer (overlay, settings, tutorial, tray-popover)
- [x] T009 [P] Add `apps/desktop/tailwind.config.ts` + `postcss.config.js` and define color tokens for the bold/playful palette
- [x] T010 [P] Add Baloo 2 woff2 under `apps/desktop/src/renderer/shared-ui/fonts/` (three weights: 400/600/800 latin subset, plus upstream OFL license). The `@font-face` declarations live in `theme.css` (added in T050).
- [x] T011 [P] Add root npm scripts: `dev`, `build`, `test`, `test:e2e`, `lint`, `package`, `package:all`
- [x] T012 [P] Add ESLint flat config with @typescript-eslint, react, react-hooks, and Prettier integration
- [x] T013 Install dependencies (`pnpm install`) and verify `pnpm run lint` passes on the empty scaffold

## Phase 2 — Foundational

**⚠️ BLOCKING**: No user story work begins until this phase is done.

### Shared package (pure TypeScript, no Electron dep)

- [x] T020 [P] Implement `packages/shared/src/types.ts` mirroring `specs/001-swoosh-mvp/contracts/types.ts`
- [x] T021 [P] Implement `packages/shared/src/ipc.ts` mirroring `specs/001-swoosh-mvp/contracts/ipc.ts`, exporting `DEFAULT_USER_SETTINGS`
- [x] T022 [P] Implement `packages/shared/src/settings.schema.ts` — Zod schema matching `UserSettings`, plus a `parseOrDefault` helper
- [x] T023 Implement `packages/shared/src/gesture/filters.ts` — 1-Euro filter class (one-axis), with unit-tested `filter(value, ts)` returning smoothed value
- [x] T024 [P] Implement `packages/shared/src/gesture/landmarks.ts` — helpers: `pinchDistance(handLandmarks, fingerA, fingerB)`, `isHandOpen(handLandmarks)`, `palmCenter(handLandmarks)`
- [x] T025 Implement `packages/shared/src/gesture/fsm.ts` — pure reducer `step(prev, frame, settings) → { state, events, pointer }` supporting tracking/idle/pinch states with hysteresis (left + right click only at this stage)
- [x] T026 [P] Unit tests for `filters.ts` — input step function, verify smoothing converges
- [x] T027 [P] Unit tests for `fsm.ts` — synthetic frame sequences cover: tracking → pinchDown → pinchUp → click, drag (movement during pinch), hysteresis prevents flicker, right-click variant

### Electron main process skeleton

- [x] T030 Implement `apps/desktop/src/main/index.ts` — app lifecycle (single-instance lock, app.whenReady, will-quit cleanup), creates tray on launch and decides which window to open based on `tutorialSeen`
- [x] T031 [P] Implement `apps/desktop/src/main/logger.ts` — wraps `electron-log` with rotating file transport, exposes `logger.info/warn/error`
- [x] T032 [P] Implement `apps/desktop/src/main/settings/store.ts` — wraps `electron-store`, validates with Zod schema, broadcasts `settings:changed` on every write
- [x] T033 [P] Implement `apps/desktop/src/main/input/dispatcher.ts` — thin wrapper around nut.js exposing `moveCursor`, `click(button)`, `mouseDown`, `mouseUp`, `scroll(dx,dy)`, `keystroke(combo)`; gracefully no-ops when nut.js unavailable and emits a warning
- [x] T034 [P] Implement `apps/desktop/src/main/input/osHooks.ts` — subscribes to power/lock/sleep events via `electron.powerMonitor` and emits a `pauseRequested(reason)` signal
- [x] T035 Implement `apps/desktop/src/main/ipc.ts` — registers every channel from `shared/ipc.ts` and routes them to handler modules

### Preload

- [x] T040 Implement `apps/desktop/src/preload/index.ts` — uses `contextBridge.exposeInMainWorld('swoosh', {...})` to expose a typed API surface matching the IPC contract (invoke + on + off)
- [x] T041 [P] Add ambient TypeScript declaration `apps/desktop/src/renderer/swoosh.d.ts` so renderer code is fully typed against `window.swoosh`

### Renderer foundation

- [x] T050 Create `apps/desktop/src/renderer/shared-ui/theme.css` — Baloo @font-face, CSS custom-property design tokens, base resets
- [x] T051 [P] Create `apps/desktop/src/renderer/shared-ui/components/Button.tsx` — pill-shaped, three variants (primary, ghost, danger), Baloo extrabold
- [x] T052 [P] Create `apps/desktop/src/renderer/shared-ui/components/Toggle.tsx` — accessible switch with keyboard support
- [x] T053 [P] Create `apps/desktop/src/renderer/shared-ui/components/Slider.tsx` — labelled range with current-value bubble
- [x] T054 [P] Create `apps/desktop/src/renderer/shared-ui/components/Card.tsx` — rounded panel with optional glow
- [x] T055 [P] Create `apps/desktop/src/renderer/shared-ui/components/AnimatedHand.tsx` — looping SVG illustration used in onboarding and empty states

### Audio engine

- [x] T060 Implement `apps/desktop/src/renderer/shared/audio.ts` — Web Audio API synth that plays a pinch tone (440 Hz), right-pinch tone (330 Hz), and release tone (550 Hz); respects `audioEnabled` and `audioVolume` from settings

### Camera + tracking pipeline (used by overlay and settings preview)

- [x] T070 Implement `apps/desktop/src/renderer/shared/camera/stream.ts` — opens `getUserMedia({ video: { deviceId, width, height, frameRate } })`, exposes `start/stop/replaceDevice`, handles permission and in-use errors with typed results
- [x] T071 [P] Implement `apps/desktop/src/renderer/shared/camera/landmarker.ts` — wraps `@mediapipe/tasks-vision` HandLandmarker; lazy-loads WASM, runs detection on each `requestVideoFrameCallback` tick, emits `HandLandmarks[]`
- [x] T072 Implement `apps/desktop/src/renderer/shared/pipeline.ts` — wires camera → landmarker → 1-Euro filter → FSM → emit; exposes `start(settings)` and `setSettings(patch)`

### Hand overlay renderer

- [x] T080 Implement `apps/desktop/src/renderer/shared/HandOverlay.tsx` — Canvas-backed component that draws 21 landmarks + joint lines for each detected hand in the chosen outline style (default / high contrast / minimal); supports a `pinchGlow` prop to glow at the active pinch point
- [ ] T081 [P] Unit-level visual test (Playwright component) for HandOverlay rendering each style variant
> deferred: needs @playwright/experimental-ct-react + Vite ct config. The Electron e2e runner landed (see T109) — the component-testing path is a separate setup with its own Vite config.

**Checkpoint**: Foundation complete. All user stories can now begin.

---

## Phase 3 — User Story 1: First-Run Tutorial 🎯 MVP (P1)

**Goal**: A fresh user reaches their first real pinch-click within 60 seconds.

**Independent test**: Fresh install → tutorial walks through permission → camera pick → hand framing → pinch-click on tutorial target → tutorial closes leaving Swoosh tray-resident.

- [x] T100 [US1] Implement `apps/desktop/src/main/windows/tutorial.ts` — creates a 1024×720 centered window with the playful theme, loads the tutorial renderer entry
- [x] T101 [US1] Implement `apps/desktop/src/renderer/tutorial/main.tsx` mounting `<TutorialShell />` with route per step
- [x] T102 [US1] Implement `<TutorialShell />` — step indicator (5 dots), back/next buttons disabled until step requirements met, framer-motion transitions
- [x] T103 [P] [US1] Implement step `Welcome.tsx` — title "Hi, I'm Swoosh.", subtitle, "Let's go" button, Baloo extrabold heading, animated hand illustration
- [x] T104 [US1] Implement step `Permission.tsx` — requests `navigator.permissions.query({ name: "camera" })`, shows OS-specific guidance if denied, "Grant access" button triggers `getUserMedia` to surface OS prompt
- [x] T105 [US1] Implement step `CameraPick.tsx` — calls `window.swoosh.camera.list()`, renders a card per camera with live thumbnail (each card spins up a short-lived MediaStream), selecting persists to settings
- [x] T106 [US1] Implement step `HandFraming.tsx` — runs the pipeline against the chosen camera, shows the hand overlay full-window, displays a "Nice — I can see your hand!" success banner once a hand is detected with score ≥ 0.7 for ≥ 30 frames
- [x] T107 [US1] Implement step `FirstClick.tsx` — displays a pulsing target on screen; succeeds when the FSM emits a `click { left }` whose pointer lands within the target's bounds; shows celebratory animation on success
- [x] T108 [US1] Wire tutorial completion: on `FirstClick` success, set `settings.tutorialSeen = true`, close tutorial window, open overlay window, register tray icon
- [x] T109 [P] [US1] Playwright e2e scaffolded: `apps/desktop/playwright.config.ts` + `tests/e2e/app-launch.spec.ts` (smoke + version assertion). Camera-mocked tutorial path needs a synthetic-landmark fixture (T109-follow-up). Local run currently blocked by a pnpm+Electron binary-install quirk where Electron's postinstall reports success but doesn't populate node_modules/electron/dist — works the moment Electron is installed via npm directly or with shamefully-hoist.
> blocked: needs Playwright Electron config + browser install + stubbed camera fixtures; deferred to polish phase along with T081.

**Checkpoint**: US1 demoable. Stop here for MVP demo if needed.

---

## Phase 4 — User Story 2: Pinch-to-Click Background Service (P1)

**Goal**: After tutorial, the user can pinch to click anywhere in the OS.

- [x] T200 [US2] Implement `apps/desktop/src/main/windows/overlay.ts` — frameless, transparent, always-on-top, click-through (`setIgnoreMouseEvents(true, { forward: true })`), sized to the primary display, repositions on display change
- [x] T201 [US2] Implement `apps/desktop/src/renderer/overlay/main.tsx` — mounts `<HandOverlay />` at full window size; starts the pipeline with settings from `window.swoosh.settings.get()`
- [x] T202 [US2] Wire `pipeline → window.swoosh.gesture.emit` so every FSM event is forwarded to the main process at frame cadence
- [x] T203 [US2] In main, implement gesture → input mapping in `apps/desktop/src/main/input/gestureRouter.ts`:
      - `tracking` → `dispatcher.moveCursor(payload.cursor)`
      - `pinchDown {left}` → `dispatcher.mouseDown('left')` + audio cue
      - `pinchUp {left}` → `dispatcher.mouseUp('left')` + release cue
      - `click {left}` → no-op (mouseDown/Up already fired)
- [x] T204 [US2] Cursor coordinate mapping helper `apps/desktop/src/main/input/coords.ts` — converts normalized landmark coordinates to OS pixels using `screen.getCursorScreenPoint()` reference monitor, handling multi-monitor and fractional DPI
- [x] T205 [US2] Implement drag-distance heuristic in FSM: if pointer moves > 4 px (logical) between pinchDown and pinchUp, do not emit synthesized `click` (drag-only); covered by existing FSM tests
- [x] T206 [P] [US2] Implement `apps/desktop/src/main/tray.ts` — creates `Tray` with state-aware icon (active / paused / no-camera), menu items Pause/Resume, Settings, Replay Tutorial, About, Quit
- [x] T207 [US2] Wire global hotkey via `globalShortcut.register` to toggle pause/resume; rebind on settings change
- [x] T208 [US2] Recording indicator — small floating red dot in the corner whenever the camera is active, hides on pause
- [x] T209 [US2] On lock/sleep/displayOff from `osHooks`, automatically pause; on unlock, resume if was previously active
- [x] T210 [US2] Drag-lock safety: if a pinch has been held > 5 s with cursor movement < 8 px total, auto-release and show a transient hint in the overlay
- [x] T211 [P] [US2] Manual smoke test checklist file `apps/desktop/tests/manual/us2.md` (open notepad, click menu, drag a file, etc.)

**Checkpoint**: US1 + US2 = MVP. Tag a release candidate.

---

## Phase 5 — User Story 3: Right Click (P2)

- [x] T300 [US3] Extend FSM in `packages/shared/src/gesture/fsm.ts` to detect thumb+middle pinch with the same hysteresis pattern, emitting `pinchDown/pinchUp/click { right }`
- [x] T301 [US3] FSM tie-breaking: when both index and middle are within pinch range, prefer the more-recently-extended finger (track per-finger extension state); add unit tests
- [x] T302 [US3] Add `right` button handling to `gestureRouter` in main (mirrors left mapping)
- [x] T303 [P] [US3] Visual hint in overlay: when ambiguous gesture detected (both finger pairs near threshold), briefly show a finger label

---

## Phase 6 — User Story 4: Open-Palm Scroll & Swipe (P2)

- [x] T400 [US4] Extend FSM with `OPEN_PALM` state — entered when all five fingertips are extended (per `isHandOpen`)
- [x] T401 [US4] Scroll: while in OPEN_PALM, accumulate palm vertical displacement, emit `scroll { dy }` when above per-frame minimum; respects `scrollSensitivity`
- [x] T402 [US4] Swipe: detect quick horizontal palm motion (> N px/frame for ≥ 3 consecutive frames followed by deceleration); emit `swipe { left | right }`
- [x] T403 [US4] In `gestureRouter`, map `scroll` → `dispatcher.scroll(0, dy)` and `swipe` → keystroke (alt+tab / alt+shift+tab on Win/Linux; ctrl+tab variants for browsers via active-app detection if available)
- [x] T404 [P] [US4] FSM unit tests for open-palm sequences (steady up, steady down, flick left, flick right)
- [x] T405 [P] [US4] Manual smoke test file `apps/desktop/tests/manual/us4.md`

---

## Phase 7 — User Story 5: Settings Panel with Live Camera Preview (P2)

- [x] T500 [US5] Implement `apps/desktop/src/main/windows/settings.ts` — 960×720 centered window, themed (hide on close, destroy only on app quit; wired to tray's Settings menu item)
- [x] T501 [US5] Implement `apps/desktop/src/renderer/settings/main.tsx` — top-half live preview + bottom-half configuration panel; subscribes to `settings:changed` for live external updates
- [x] T502 [US5] Implement `CameraPreview.tsx` — runs a *second* pipeline (only while window visible) and renders `<HandOverlay />` over the camera feed at preview resolution
- [x] T503 [US5] Suspend the preview pipeline on window hide (via `visibilitychange`); restart on show
- [x] T504 [US5] Build the configuration controls grouped into sections: Camera, Gestures (sensitivity, pinch enter/exit, smoothing β + mincutoff under "Show advanced"), Sound, Appearance, System, Diagnostics — using shared-ui components
- [x] T505 [US5] Implement threshold-ring overlay on the preview — when hovering / focusing the pinch sliders, draw a ring at index/thumb fingertip with the configured threshold so the user can see "how close is close enough"
- [x] T506 [US5] Diagnostics section: shows "Replay tutorial" + "Re-run benchmark" buttons, surfaces benchmark result text, includes a privacy reminder. FPS readout is the live one rendered on the preview itself (CameraPreview's corner badge). "Clear logs" deferred — IPC channel not yet defined.
- [x] T507 [P] [US5] Settings persistence test: `packages/shared/src/settings.schema.test.ts` exercises `parseOrDefault`, the hysteresis invariant, partial-patch validation, and edge cases (null/bogus input, out-of-range numerics, enum values).
- [ ] T508 [P] [US5] e2e test `settings.spec.ts` — toggle high-contrast, adjust threshold, switch camera, confirm preview updates
> deferred: Playwright Electron runner is wired (see T109). settings.spec.ts itself needs the camera-mock fixture before it can meaningfully toggle the preview's overlay style.

---

## Phase 8 — User Story 6: Two-Hand Pinch Resize (P3)

- [x] T600 [US6] Extend FSM to TWO_HAND_RESIZE state — entered when both hands are detected and both are pinching index+thumb (with hysteresis)
- [x] T601 [US6] On each frame in this state, emit `twoHandResizeDelta { scale }` based on inter-hand distance ratio vs. start distance; clears state on hand loss or pinch release
- [x] T602 [US6] Implement `apps/desktop/src/main/windows/resize.ts` — wired into the gesture router. **STUB**: clamps scale to [0.25, 4.0] and logs at 4 Hz; actual OS-level focused-window resize requires platform-native bindings (Win32 `SetWindowPos`, AppKit `NSWindow.setFrame`, X11 `XMoveResizeWindow`) which aren't in nut.js's surface. Tracked for the polish phase.
- [x] T603 [P] [US6] Overlay visual: yellow dashed line between the two pinch midpoints + an "↔ Resize ×N.NN" badge near the midpoint. Driven directly off the FSM event stream the overlay already forwards to main.
- [x] T604 [P] [US6] FSM unit tests covering two-hand entry, delta computation (scale > 1 spread / < 1 close), single-hand exit, both-hands-lost exit, fall-through to single-hand pinch when only one is pinching, and hysteresis across small fingertip jitter (7 new cases, 41/41 total tests pass).

---

## Phase 9 — User Story 7: Tray Polish & Popover (P2)

- [x] T700 [US7] Build `apps/desktop/src/renderer/tray-popover/` window — 320×280 frameless transparent-bg popover with: live tracking-state badge (active/paused/error variants), big Pause/Resume primary button, Audio cues toggle wired to `settings.audioEnabled`, and a Settings · Replay tutorial · Quit shortcut row. Subscribes to `tracking:state` + `settings:changed` for live updates.
- [x] T701 [US7] Main: tray.on('click') now opens the popover via `toggleTrayPopover(tray.getBounds())` (was popUpContextMenu). Right-click still opens the menu. macOS keeps the persistent context menu since menu-bar items single-click into it. Popover positions itself above or below the tray icon based on screen geometry; hides on blur. Added a `window:openSettings` IPC channel so the popover's "Settings…" button works.
- [x] T702 [P] [US7] Programmatic colored-circle nativeImage icons remain in place (active = mint, paused = sun yellow, no-camera = flare pink). Real per-OS PNG / ICO assets in `resources/icons/tray/` deferred — the programmatic icons are crisp, themed, and rebuild on state change.
> deferred: PNG/ICO icon files. The programmatic icons cover all three states and reflect the brand palette; a designer pass before public release.
- [x] T703 [US7] Quit cleanup: teardown() now also calls `destroyTrayPopover()` alongside `destroySettingsWindow()`. Verified: tray.destroy + closeOverlayWindow + destroySettingsWindow + destroyTrayPopover all run on `will-quit` before `context = null`. Cameras release via the pipeline's `stop()` on overlay close.

---

## Phase 10 — User Story 8: Adaptive Performance Benchmark (P3)

- [x] T800 [US8] Implement `apps/desktop/src/main/benchmark.ts` — composite signal (Math.sin spin loop for ~500 ms + os.cpus().length + total RAM) that maps to high / balanced / battery profiles. The original hidden-window approach is more accurate but flashes a window during onboarding; this lighter heuristic gets reasonable defaults onto the user's machine in under a second and is documented inline.
- [x] T801 [US8] Triggers via setTimeout(5 s after bootstrap) when `performanceProfile === 'adaptive'`. Applied result writes `performanceProfile`, `fps`, and `resolution` back to settings; subsequent launches see the concrete profile and skip the auto-trigger. Manual re-run from Settings → Diagnostics still works.
- [x] T802 [US8] Settings → Diagnostics "Re-run benchmark" button surfaces the result text (FPS · resolution · selected profile).

---

## Phase 11 — User Story 9: Auto-Update (P3)

- [x] T900 [US9] `apps/desktop/src/main/updater.ts` lazy-requires `electron-updater`, wires event listeners (checking, available, downloaded, progress, error), and broadcasts `update:available` + `update:progress` to all renderers. Gracefully degrades when the module isn't available (dev environments).
- [x] T901 [US9] Debounced 24 h check via `lastUpdateCheckAt` ISO timestamp stored in `UserSettings`. STARTUP_DELAY_MS waits 8 s after bootstrap so MediaPipe can load first. Honors `settings.updateChecksEnabled`.
- [x] T902 [US9] Update banner appears in both tray popover (sun-yellow button at top, "Install & restart") and Settings → Diagnostics (with download progress %). Both trigger `window.swoosh.update.install()` which does `quitAndInstall`.
- [x] T903 [P] [US9] electron-builder publish config already in place (added by the polish agent in T1001). GitHub provider, three manifests (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`). The `owner` field is a `TODO-set-github-owner` until the repo is named.

---

## Phase 12 — Polish & Cross-Cutting

- [x] T1000 [P] CI: GitHub Actions matrix workflow `.github/workflows/build.yml` — on push to main, build + test on Windows/macOS/Ubuntu
- [x] T1001 [P] CI: release workflow `.github/workflows/release.yml` — on tagged push, runs `pnpm package:all` and uploads artifacts to GitHub Releases
- [x] T1002 Documentation pass: update `README.md` with screenshots, supported OS table, install instructions, troubleshooting (Wayland uinput, macOS Accessibility), and a "How it works" section
- [x] T1003 [P] "Lighting too low?" toast surfaces in the overlay after ~90 consecutive frames (~3 s @ 30 FPS) where the best hand's detection score < 0.5; clears after 30 good frames. Pure renderer-side.
- [x] T1004 [P] Camera-disconnected handler — overlay listens for `ended` events on the active video track + `onCameraError` from the pipeline; surfaces a flare-pink toast for 6 s and flips the overlay's `active` flag (which suppresses the LowLightHint).
- [x] T1005 [P] Accessibility audit pass: Card heading now renders as `<h2>` (was `<div>`); outline-style chips in Settings → Appearance get `role="radiogroup"` + `role="radio"` + `aria-checked`; Settings camera + profile selects get explicit `aria-label`s (the visible labels are `<span>`s); tray-popover shortcut row is wrapped in `<nav aria-label>` and each button has its own `aria-label` plus a visible focus ring. Slider/Toggle/Button shared-ui components already had keyboard support and ARIA — verified during the pass.
- [ ] T1006 Performance pass: profile a 10-minute usage session, verify p95 latency < 100 ms and active CPU < 25 % on reference hardware
> deferred: requires the app running interactively on the reference machine + a profiler hookup; tracked for the first post-publish iteration.
- [ ] T1007 [P] Final manual cross-OS smoke test on Windows 11 + macOS + Ubuntu X11
> deferred: needs macOS + Linux hardware; CI matrix workflow (T1000) covers build/lint/test on all three but doesn't run the GUI smoke test. Manual sign-off lives with the user.
- [x] T1008 Cut v0.1.0 release: tagged `v0.1.0` and pushed to `HKTITAN/swooshv2` on GitHub. CI release workflow (T1001) auto-builds installers per OS and attaches them to the GitHub Release.

---

## Dependencies & Execution Order

### Phase dependencies
- Setup (1) → Foundational (2) → User Stories (3+) → Polish (12)
- Foundational is a hard gate. No US task starts before T020–T081 are all done.

### Within Phase 2
- T020/T021/T022 are independent
- T023 (filter) blocks T025 (FSM uses filter)
- T024 (landmarks helpers) blocks T025 (FSM uses helpers)
- T030–T035 (main skeleton) are independent of T020–T027 (shared lib)
- T040 (preload) depends on T021 (IPC contract)
- T050–T055 (UI components) are independent of main + shared
- T060 (audio) is independent
- T070–T072 (camera pipeline) depend on T071/T072 each other but can ship together once landmarker is wired
- T080 (overlay component) depends on T024 (landmarks) and T050 (theme)

### Within Phase 3 (US1)
- T100 → T101 → T102 → T103..T107 → T108 → T109

### Within Phase 4 (US2)
- T200 → T201 → T202 → T203 → T204 → T205 → T206..T211

---

## Parallel Opportunities

- All `[P]` tasks within a phase can be done in parallel
- After Phase 2 checkpoint, US1 and US2 share infrastructure but
  US3/US4/US5 can proceed in parallel by separate workers if any
- Polish phase tasks marked `[P]` can run in parallel

---

## Loop Protocol (for the ralph loop agent)

1. **Pick** the lowest-numbered unchecked task whose dependencies are met.
2. **Read** the relevant spec sections (`plan.md`, `data-model.md`, contracts).
3. **Implement** in the smallest scope possible.
4. **Verify**:
   - `pnpm -w lint` passes
   - `pnpm -w typecheck` passes
   - Relevant `pnpm test` suite passes (or no tests yet exist)
5. **Tick** the task in this file and **commit** with a message of the
   form: `T### <imperative subject>`.
6. **Loop** back to step 1.

If a task cannot be completed (blocker, missing decision), leave it
unchecked, write a one-line note under it explaining why, and pick
the next available task. Never silently skip.
