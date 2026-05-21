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
> blocked: needs @playwright/experimental-ct-react dependency and a playwright-ct.config.ts not yet present; deferred to the polish phase.

**Checkpoint**: Foundation complete. All user stories can now begin.

---

## Phase 3 — User Story 1: First-Run Tutorial 🎯 MVP (P1)

**Goal**: A fresh user reaches their first real pinch-click within 60 seconds.

**Independent test**: Fresh install → tutorial walks through permission → camera pick → hand framing → pinch-click on tutorial target → tutorial closes leaving Swoosh tray-resident.

- [ ] T100 [US1] Implement `apps/desktop/src/main/windows/tutorial.ts` — creates a 1024×720 centered window with the playful theme, loads the tutorial renderer entry
- [ ] T101 [US1] Implement `apps/desktop/src/renderer/tutorial/main.tsx` mounting `<TutorialShell />` with route per step
- [ ] T102 [US1] Implement `<TutorialShell />` — step indicator (5 dots), back/next buttons disabled until step requirements met, framer-motion transitions
- [ ] T103 [P] [US1] Implement step `Welcome.tsx` — title "Hi, I'm Swoosh.", subtitle, "Let's go" button, Baloo extrabold heading, animated hand illustration
- [ ] T104 [US1] Implement step `Permission.tsx` — requests `navigator.permissions.query({ name: "camera" })`, shows OS-specific guidance if denied, "Grant access" button triggers `getUserMedia` to surface OS prompt
- [ ] T105 [US1] Implement step `CameraPick.tsx` — calls `window.swoosh.camera.list()`, renders a card per camera with live thumbnail (each card spins up a short-lived MediaStream), selecting persists to settings
- [ ] T106 [US1] Implement step `HandFraming.tsx` — runs the pipeline against the chosen camera, shows the hand overlay full-window, displays a "Nice — I can see your hand!" success banner once a hand is detected with score ≥ 0.7 for ≥ 30 frames
- [ ] T107 [US1] Implement step `FirstClick.tsx` — displays a pulsing target on screen; succeeds when the FSM emits a `click { left }` whose pointer lands within the target's bounds; shows celebratory animation on success
- [ ] T108 [US1] Wire tutorial completion: on `FirstClick` success, set `settings.tutorialSeen = true`, close tutorial window, open overlay window, register tray icon
- [ ] T109 [P] [US1] e2e test `tutorial.spec.ts` — uses Playwright to drive the tutorial end-to-end with a stubbed camera feeding pre-recorded landmark sequences

**Checkpoint**: US1 demoable. Stop here for MVP demo if needed.

---

## Phase 4 — User Story 2: Pinch-to-Click Background Service (P1)

**Goal**: After tutorial, the user can pinch to click anywhere in the OS.

- [ ] T200 [US2] Implement `apps/desktop/src/main/windows/overlay.ts` — frameless, transparent, always-on-top, click-through (`setIgnoreMouseEvents(true, { forward: true })`), sized to the primary display, repositions on display change
- [ ] T201 [US2] Implement `apps/desktop/src/renderer/overlay/main.tsx` — mounts `<HandOverlay />` at full window size; starts the pipeline with settings from `window.swoosh.settings.get()`
- [ ] T202 [US2] Wire `pipeline → window.swoosh.gesture.emit` so every FSM event is forwarded to the main process at frame cadence
- [ ] T203 [US2] In main, implement gesture → input mapping in `apps/desktop/src/main/input/gestureRouter.ts`:
      - `tracking` → `dispatcher.moveCursor(payload.cursor)`
      - `pinchDown {left}` → `dispatcher.mouseDown('left')` + audio cue
      - `pinchUp {left}` → `dispatcher.mouseUp('left')` + release cue
      - `click {left}` → no-op (mouseDown/Up already fired)
- [ ] T204 [US2] Cursor coordinate mapping helper `apps/desktop/src/main/input/coords.ts` — converts normalized landmark coordinates to OS pixels using `screen.getCursorScreenPoint()` reference monitor, handling multi-monitor and fractional DPI
- [ ] T205 [US2] Implement drag-distance heuristic in FSM: if pointer moves > 4 px (logical) between pinchDown and pinchUp, do not emit synthesized `click` (drag-only); covered by existing FSM tests
- [ ] T206 [P] [US2] Implement `apps/desktop/src/main/tray.ts` — creates `Tray` with state-aware icon (active / paused / no-camera), menu items Pause/Resume, Settings, Replay Tutorial, About, Quit
- [ ] T207 [US2] Wire global hotkey via `globalShortcut.register` to toggle pause/resume; rebind on settings change
- [ ] T208 [US2] Recording indicator — small floating red dot in the corner whenever the camera is active, hides on pause
- [ ] T209 [US2] On lock/sleep/displayOff from `osHooks`, automatically pause; on unlock, resume if was previously active
- [ ] T210 [US2] Drag-lock safety: if a pinch has been held > 5 s with cursor movement < 8 px total, auto-release and show a transient hint in the overlay
- [ ] T211 [P] [US2] Manual smoke test checklist file `apps/desktop/tests/manual/us2.md` (open notepad, click menu, drag a file, etc.)

**Checkpoint**: US1 + US2 = MVP. Tag a release candidate.

---

## Phase 5 — User Story 3: Right Click (P2)

- [ ] T300 [US3] Extend FSM in `packages/shared/src/gesture/fsm.ts` to detect thumb+middle pinch with the same hysteresis pattern, emitting `pinchDown/pinchUp/click { right }`
- [ ] T301 [US3] FSM tie-breaking: when both index and middle are within pinch range, prefer the more-recently-extended finger (track per-finger extension state); add unit tests
- [ ] T302 [US3] Add `right` button handling to `gestureRouter` in main (mirrors left mapping)
- [ ] T303 [P] [US3] Visual hint in overlay: when ambiguous gesture detected (both finger pairs near threshold), briefly show a finger label

---

## Phase 6 — User Story 4: Open-Palm Scroll & Swipe (P2)

- [ ] T400 [US4] Extend FSM with `OPEN_PALM` state — entered when all five fingertips are extended (per `isHandOpen`)
- [ ] T401 [US4] Scroll: while in OPEN_PALM, accumulate palm vertical displacement, emit `scroll { dy }` when above per-frame minimum; respects `scrollSensitivity`
- [ ] T402 [US4] Swipe: detect quick horizontal palm motion (> N px/frame for ≥ 3 consecutive frames followed by deceleration); emit `swipe { left | right }`
- [ ] T403 [US4] In `gestureRouter`, map `scroll` → `dispatcher.scroll(0, dy)` and `swipe` → keystroke (alt+tab / alt+shift+tab on Win/Linux; ctrl+tab variants for browsers via active-app detection if available)
- [ ] T404 [P] [US4] FSM unit tests for open-palm sequences (steady up, steady down, flick left, flick right)
- [ ] T405 [P] [US4] Manual smoke test file `apps/desktop/tests/manual/us4.md`

---

## Phase 7 — User Story 5: Settings Panel with Live Camera Preview (P2)

- [ ] T500 [US5] Implement `apps/desktop/src/main/windows/settings.ts` — 960×720 centered window, themed
- [ ] T501 [US5] Implement `apps/desktop/src/renderer/settings/main.tsx` — top-half live preview + bottom-half configuration panel
- [ ] T502 [US5] Implement `CameraPreview.tsx` — runs a *second* pipeline (only while window visible) and renders `<HandOverlay />` over the camera feed at preview resolution
- [ ] T503 [US5] Stop the preview pipeline on window blur/hide; restart on focus to honor "tracking can be paused but preview should still work" UX
- [ ] T504 [US5] Build the configuration controls grouped into sections: Camera, Gestures (sensitivity, pinch enter/exit, smoothing β + mincutoff), Sound, Appearance, System, Diagnostics — using shared-ui components
- [ ] T505 [US5] Implement threshold-ring overlay on the preview — when adjusting pinch sliders, draw a ring at index/thumb fingertip with the configured threshold so the user can see "how close is close enough"
- [ ] T506 [US5] Diagnostics section: show current FPS, latest benchmark result, "Re-run benchmark" button, "Clear logs" button
- [ ] T507 [P] [US5] Settings persistence test: every control wires to `window.swoosh.settings.set` and the effect is observable on the preview within 1 frame
- [ ] T508 [P] [US5] e2e test `settings.spec.ts` — toggle high-contrast, adjust threshold, switch camera, confirm preview updates

---

## Phase 8 — User Story 6: Two-Hand Pinch Resize (P3)

- [ ] T600 [US6] Extend FSM to TWO_HAND_RESIZE state — entered when both hands are detected and both are pinching index+thumb
- [ ] T601 [US6] On each frame in this state, emit `twoHandResizeDelta { scale }` based on inter-hand distance ratio vs. start distance
- [ ] T602 [US6] Implement `apps/desktop/src/main/windows/resize.ts` — uses platform window APIs to resize the focused window; on macOS, falls back to AppleScript bounds adjustment where possible
- [ ] T603 [P] [US6] Overlay visual: draw a translucent line between the two pinch points + a "↔ Resize" badge near the active window edge
- [ ] T604 [P] [US6] FSM unit tests covering two-hand entry, delta computation, and single-hand exit

---

## Phase 9 — User Story 7: Tray Polish & Popover (P2)

- [ ] T700 [US7] Build `apps/desktop/src/renderer/tray-popover/` window — small (320×200) frameless popover anchored to the tray icon, with toggles for Pause/Resume, Audio on/off, and shortcuts to Settings/Tutorial/Quit
- [ ] T701 [US7] Main: open the popover on left-click of the tray icon; left of icon for Win, top for macOS, etc.
- [ ] T702 [P] [US7] Per-OS tray icon set in `apps/desktop/resources/icons/tray/` (active / paused / noCamera variants, multiple sizes)
- [ ] T703 [US7] Quit cleanup: on Quit, ensure camera handles release, hotkeys unregister, tray removed within 1 s; verify with smoke test

---

## Phase 10 — User Story 8: Adaptive Performance Benchmark (P3)

- [ ] T800 [US8] Implement `apps/desktop/src/main/benchmark.ts` — spawns a hidden offscreen renderer that runs the landmarker for ~5 s at 1280×720, measures sustained tracking FPS, picks `high | balanced | battery`, writes to settings
- [ ] T801 [US8] Trigger benchmark on first launch (after tutorial) when `performanceProfile === "adaptive"` and no recorded value
- [ ] T802 [US8] Surface results in Settings → Diagnostics with a "Re-run" button

---

## Phase 11 — User Story 9: Auto-Update (P3)

- [ ] T900 [US9] Configure `electron-updater` with GitHub Releases provider in `apps/desktop/src/main/updater.ts`
- [ ] T901 [US9] On launch (debounced 24h via timestamp in settings), check for updates if `updateChecksEnabled`
- [ ] T902 [US9] Show a non-modal "Update available" banner inside the tray popover and in Settings; one-click "Restart and install"
- [ ] T903 [P] [US9] electron-builder publish config — GitHub provider with `latest.yml`, `latest-mac.yml`, `latest-linux.yml`

---

## Phase 12 — Polish & Cross-Cutting

- [x] T1000 [P] CI: GitHub Actions matrix workflow `.github/workflows/build.yml` — on push to main, build + test on Windows/macOS/Ubuntu
- [ ] T1001 [P] CI: release workflow `.github/workflows/release.yml` — on tagged push, runs `pnpm package:all` and uploads artifacts to GitHub Releases
- [ ] T1002 Documentation pass: update `README.md` with screenshots, supported OS table, install instructions, troubleshooting (Wayland uinput, macOS Accessibility), and a "How it works" section
- [ ] T1003 [P] Edge-case coverage: implement "Lighting too low?" hint when MediaPipe score < 0.5 for 3 s
- [ ] T1004 [P] Edge-case coverage: "Camera disconnected" handler — pause, update tray, surface toast
- [ ] T1005 [P] Accessibility audit: keyboard nav through Settings + Tutorial, screen-reader labels on every interactive element
- [ ] T1006 Performance pass: profile a 10-minute usage session, verify p95 latency < 100 ms and active CPU < 25 % on reference hardware
- [ ] T1007 [P] Final manual cross-OS smoke test on Windows 11 + macOS + Ubuntu X11
- [ ] T1008 Cut v0.1.0 release

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
