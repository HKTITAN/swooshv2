# Implementation Plan: Swoosh MVP

**Branch**: `001-swoosh-mvp` | **Date**: 2026-05-21 | **Spec**: [spec.md](./spec.md)

**Input**: [specs/001-swoosh-mvp/spec.md](./spec.md)

## Summary

Swoosh is a cross-platform Electron desktop app that turns a webcam
into a hand-tracking system controller. Hand landmarks are extracted
in the renderer process by MediaPipe Hands, classified into gestures
by a pure-TypeScript state machine, and dispatched as OS-level mouse
and keyboard events by `@nut-tree-fork/nut-js` running in the main
process. The first-run experience is a tutorial that guarantees a
successful pinch-click within 60 seconds; ongoing use is from the
system tray with a settings panel that includes a live camera
preview.

## Technical Context

**Language/Version**: TypeScript 5.5+ (strict mode), Node.js 22 LTS

**Primary Dependencies**:

- **Shell**: Electron 33+ (Chromium 130, V8 13)
- **Build**: Vite 5 with `electron-vite` for main + renderer + preload
- **UI**: React 18 + Zustand 4 (state) + Tailwind CSS 3.4 (styling) +
  Framer Motion 11 (animations)
- **Hand tracking**: `@mediapipe/tasks-vision` 0.10.x (HandLandmarker)
- **Input simulation**: `@nut-tree-fork/nut-js` (Win/Mac/Linux mouse +
  keyboard)
- **Tray**: `electron` built-in Tray API
- **Settings storage**: `electron-store` (JSON in user-data dir)
- **Auto-update**: `electron-updater` against GitHub Releases
- **Packaging**: `electron-builder` (NSIS for Win, DMG for Mac,
  AppImage + deb for Linux)
- **Audio**: Web Audio API with pre-generated short tones (no asset
  files — synthesized in-renderer)
- **Typography**: Baloo 2 (Variable, woff2) self-hosted

**Storage**: User settings in JSON via `electron-store`. Logs in
rotating files via `electron-log`. No databases. No remote storage.

**Testing**: Vitest for pure-function units (gesture state machine,
filters, math), Playwright for renderer end-to-end (tutorial flow,
settings interactions). Manual gesture acceptance on each OS.

**Target Platform**: Windows 10/11 (x64, arm64), macOS 13+ (Intel,
Apple Silicon), Linux X11 and Wayland (Ubuntu 22.04+, Fedora 39+).

**Project Type**: Desktop application — Electron with separate main,
preload, and renderer processes plus a small shared package.

**Performance Goals**: Detection ≥30 FPS (target 60), overlay render
60 FPS, gesture-to-OS-event p95 < 100 ms, idle CPU < 3%, active CPU
< 25% on reference hardware.

**Constraints**:

- No network IO except update checks (debounced, user-toggleable).
- All hand tracking on-device. Frames never leave the process.
- Memory < 500 MB. Installer < 200 MB.
- Cold start to tracking-ready < 5 s.

**Scale/Scope**: Single-user desktop app. No multi-tenancy. Spec
has 9 user stories totaling roughly 50–60 atomic tasks for v1.

## Constitution Check

Re-evaluated against `.specify/memory/constitution.md` v1.0.0:

| Principle | Compliant? | Notes |
|---|---|---|
| I. Privacy is the Product | ✅ | All processing local; only network call is opt-in update check. |
| II. Latency is a Feature | ✅ | Pipeline budget breakdown in §Architecture; adaptive FPS. |
| III. Cross-Platform Parity | ✅ | Electron + nut.js cover all targets from one codebase. |
| IV. Discoverability over Docs | ✅ | Tutorial-first (US1) is the MVP. |
| V. The Hand is the Cursor | ✅ | Overlay window + audio cues are core to every gesture. |
| VI. Accessible by Default | ✅ | Configurable thresholds, reduced motion, high contrast, single-hand fallbacks. |
| VII. Boring Stack, Sharp Edges | ✅ | Electron/React/Vite for shell; custom gesture FSM as the sharp edge. |

**Result**: Constitution passes without exceptions. No items in
Complexity Tracking.

## Architecture

### Process layout

```
┌─────────────────────────────────────────────────────────────┐
│                       Main Process                          │
│  - App lifecycle, tray, hotkeys, window mgmt                │
│  - InputDispatcher (nut.js) -> OS mouse/keyboard events     │
│  - SettingsStore (electron-store)                           │
│  - UpdateChecker (electron-updater)                         │
│  - OS event listener (lock/sleep/unlock/display-off)        │
└────────────────────────┬────────────────────────────────────┘
                         │  IPC (typed contract)
        ┌────────────────┼────────────────┬──────────────┐
        ▼                ▼                ▼              ▼
   ┌──────────┐    ┌───────────┐   ┌──────────────┐   ┌──────────┐
   │ Tutorial │    │  Overlay  │   │   Settings   │   │   Tray   │
   │ Window   │    │  Window   │   │   Window     │   │  Popover │
   │ (HTML)   │    │ (transp.) │   │              │   │ (HTML)   │
   └──────────┘    └───────────┘   └──────────────┘   └──────────┘
                         ▲
                         │  (only Overlay runs the camera)
                         │
        ┌────────────────┴────────────────────────────────┐
        │   Overlay renderer:                              │
        │   - getUserMedia(camera)                         │
        │   - MediaPipe HandLandmarker (WebGL/WASM)        │
        │   - 1-Euro filter                                │
        │   - Gesture state machine (FSM)                  │
        │   - Hand outline renderer (Canvas)               │
        │   - emits Gesture / cursor-pos over IPC          │
        └──────────────────────────────────────────────────┘
```

The **overlay window** is a frameless, transparent, always-on-top,
click-through window covering the active monitor. It is the only
window that holds the camera handle. It runs the MediaPipe pipeline,
renders the hand outline, and emits typed gestures via `ipcRenderer`
to the main process, which translates them into OS events.

The settings window opens a separate `MediaStream` only when visible
(stops it on hide) to give the user a live preview without keeping a
second camera open during normal use.

### Latency budget (target p95 < 100 ms)

| Stage                                  | Budget (ms) |
|----------------------------------------|------------:|
| Camera capture (one frame at 60 FPS)   |          17 |
| MediaPipe inference (WebGL)            |          20 |
| 1-Euro filter + landmark normalization |           1 |
| Gesture FSM tick                       |           1 |
| IPC main ↔ renderer                    |           2 |
| nut.js OS event dispatch               |           3 |
| OS event processing                    |          10 |
| **Total**                              |      **54** |

Headroom for overlay render (16 ms) is parallel to gesture
dispatch, so it does not enter the dispatch path.

### Gesture state machine

Pure TypeScript reducer. Input: per-frame landmark snapshot + prior
state. Output: zero or more `Gesture` events. Lives in
`packages/shared/src/gesture/fsm.ts` and is the *only* gesture
authority. No third-party gesture library.

States: `IDLE`, `TRACKING`, `PINCH_LEFT`, `PINCH_RIGHT`,
`OPEN_PALM`, `TWO_HAND_RESIZE`.

Transitions use *hysteresis* — a pinch is "entered" when fingertip
distance drops below `enterThreshold`, but only "exited" once the
distance rises above `exitThreshold` (default ratio 1.4×). This
prevents flicker.

### IPC contract

Typed two-way channels, defined once in `packages/shared/src/ipc.ts`:

- `gesture:emit` (overlay → main): { gesture: Gesture, cursor: {x,y}, ts }
- `tracking:pause` / `tracking:resume` (any → main, broadcast to overlay)
- `settings:get` / `settings:set` / `settings:subscribe`
- `camera:list` / `camera:test`
- `tutorial:step` / `tutorial:complete`
- `update:check` / `update:install`

The preload exposes a strongly-typed `window.swoosh` API to all
renderers via `contextBridge`. No remote module. `nodeIntegration:
false`.

## Project Structure

### Documentation (this feature)

```text
specs/001-swoosh-mvp/
├── plan.md          # This file
├── spec.md          # Functional spec
├── research.md      # Tech choices + alternatives considered
├── data-model.md    # UserSettings, Gesture, HandLandmarks schemas
├── quickstart.md    # Local dev guide
├── contracts/
│   └── ipc.ts       # The single source of truth for IPC channels
└── tasks.md         # Generated by /speckit-tasks
```

### Source layout (repository root)

```text
swoosh/
├── package.json                  # root workspace (pnpm)
├── pnpm-workspace.yaml
├── electron.vite.config.ts       # Vite config for main+preload+renderer
├── electron-builder.yml          # Packaging targets
├── tsconfig.base.json
├── .specify/                     # Spec-kit infrastructure
├── specs/001-swoosh-mvp/         # This feature's spec
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── gesture/fsm.ts    # Gesture state machine (pure TS)
│       │   ├── gesture/filters.ts# 1-Euro filter, smoothing
│       │   ├── ipc.ts            # IPC channel contract
│       │   ├── settings.schema.ts# Zod schema for UserSettings
│       │   └── types.ts          # HandLandmarks, Gesture, etc.
│       ├── package.json
│       └── tsconfig.json
└── apps/
    └── desktop/
        ├── src/
        │   ├── main/             # Electron main process
        │   │   ├── index.ts
        │   │   ├── tray.ts
        │   │   ├── windows/
        │   │   │   ├── overlay.ts
        │   │   │   ├── settings.ts
        │   │   │   ├── tutorial.ts
        │   │   │   └── trayPopover.ts
        │   │   ├── input/
        │   │   │   ├── dispatcher.ts   # nut.js wrapper
        │   │   │   └── osHooks.ts      # lock/sleep/unlock listeners
        │   │   ├── settings/store.ts
        │   │   ├── benchmark.ts
        │   │   ├── updater.ts
        │   │   └── logger.ts
        │   ├── preload/
        │   │   └── index.ts            # contextBridge -> window.swoosh
        │   └── renderer/
        │       ├── overlay/
        │       │   ├── index.html
        │       │   ├── main.tsx
        │       │   ├── camera/
        │       │   │   ├── stream.ts
        │       │   │   └── landmarker.ts
        │       │   ├── render/
        │       │   │   ├── HandOverlay.tsx
        │       │   │   └── audio.ts
        │       │   └── pipeline.ts     # Wires camera → MediaPipe → FSM → IPC
        │       ├── settings/
        │       │   ├── index.html
        │       │   ├── main.tsx
        │       │   ├── CameraPreview.tsx
        │       │   ├── SettingsPanel.tsx
        │       │   └── components/
        │       ├── tutorial/
        │       │   ├── index.html
        │       │   ├── main.tsx
        │       │   ├── steps/
        │       │   │   ├── Welcome.tsx
        │       │   │   ├── Permission.tsx
        │       │   │   ├── CameraPick.tsx
        │       │   │   ├── HandFraming.tsx
        │       │   │   └── FirstClick.tsx
        │       │   └── TutorialShell.tsx
        │       ├── tray-popover/
        │       │   ├── index.html
        │       │   └── main.tsx
        │       └── shared-ui/
        │           ├── theme.css
        │           ├── fonts/Baloo2.woff2
        │           └── components/
        │               ├── Button.tsx
        │               ├── Slider.tsx
        │               ├── Toggle.tsx
        │               └── Card.tsx
        ├── resources/
        │   ├── icons/                  # tray + app icons (per OS)
        │   └── audio/                  # (empty — tones are synthesized)
        └── tests/
            ├── unit/
            │   ├── fsm.test.ts
            │   ├── filters.test.ts
            │   └── settings.test.ts
            └── e2e/
                ├── tutorial.spec.ts
                └── settings.spec.ts
```

**Structure Decision**: A pnpm workspace with one app (`apps/desktop`)
and one shared package (`packages/shared`). The shared package
isolates pure logic (FSM, filters, schemas, IPC contract) so it can
be unit-tested without Electron and reused by both main and renderer
without duplication.

## Build & Distribution

- `pnpm dev` — starts Vite dev servers for main + renderer with
  HMR, launches Electron in dev mode.
- `pnpm build` — builds main, preload, renderer with `electron-vite`.
- `pnpm package` — runs `electron-builder` to produce installers
  for the current OS.
- `pnpm package:all` — packages for all three OSes (requires a
  matrix CI run; locally only the host OS is built).
- CI: GitHub Actions matrix across Windows / macOS / Ubuntu.
  Releases publish to GitHub Releases with `electron-updater` JSON
  manifests (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`).

## Risks and Mitigations

1. **nut.js install failures on Linux Wayland** — nut.js shells out
   to platform APIs that may not be available on bare Wayland.
   *Mitigation*: detect at startup, fall back to xdotool on X11,
   show a setup-guide modal on unsupported Wayland configs.

2. **MediaPipe WebGL/WASM loading delays** — 3–5 MB of WASM has to
   load on first launch.
   *Mitigation*: prefetch in main before showing the tutorial
   "Hand framing" step; show a determinate progress bar.

3. **Camera contention with other apps (Zoom, Teams)** — only one
   process can hold a camera on most OSes.
   *Mitigation*: detect "in use" errors and offer to release/retry;
   document workflow ("pause Swoosh before screen sharing").

4. **Overlay window stealing focus** — must be click-through and
   ignore mouse, but visible above all.
   *Mitigation*: use `setIgnoreMouseEvents(true, {forward: true})`
   on Windows/Linux; use `NSWindow` style mask on macOS via
   built-in Electron config. Verified in dev mode early (T-foundation).

5. **High-DPI / multi-monitor cursor math** — easy to get wrong.
   *Mitigation*: a small `coords.ts` module with explicit tests
   for fractional DPI, negative monitor offsets, and Y-flip on macOS.

6. **Code signing / notarization not in MVP** — Windows SmartScreen
   and macOS Gatekeeper will warn users on first install.
   *Mitigation*: documented as known limitation; signing is a
   stretch goal before public 1.0 release.

7. **Baloo font licensing** — Baloo 2 is OFL, no issue, but the
   bundled woff2 must include the SIL OFL license file.
   *Mitigation*: ship `LICENSE-Baloo2.txt` next to the font.

## Complexity Tracking

*None.* No constitution violations; no exceptions requested.

## Open Questions Deferred to Implementation

- Exact dB level for audio cues (will be set by ear during US2).
- Window-resize gesture mapping on macOS (no programmatic resize
  for some apps — may need AppleScript fallback).
- Whether to ship a `.dmg` or just `.zip` for macOS until signing
  is in place. Default to `.dmg`; revisit if Gatekeeper warnings
  prove disruptive for early testers.
