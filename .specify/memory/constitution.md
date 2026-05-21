# Swoosh Constitution

> Swoosh turns any laptop with a webcam into a hand-tracked computer. The
> goal: make pointer-free system control feel as natural as touching a
> phone — no calibration, no learning curve, no friction.

## Core Principles

### I. Privacy is the Product (NON-NEGOTIABLE)

Hand tracking happens **entirely on-device**. The camera feed never
leaves the machine. No telemetry, no analytics, no remote logging in the
MVP. The only network calls Swoosh makes are auto-update checks against
the GitHub Releases endpoint, and those are user-toggleable.

- Camera frames must never be persisted to disk by default.
- A visible recording-indicator (system tray badge + on-screen dot) is
  shown whenever the camera is active.
- A global "freeze" hotkey instantly suspends tracking and releases the
  camera handle.

### II. Latency is a Feature

Gesture-to-system-action latency must feel instant. Concretely:

- **End-to-end p95 < 100ms** from gesture frame capture → OS event.
- **30 FPS minimum, 60 FPS target** on mid-range hardware
  (Intel UHD / Apple M1 / Ryzen integrated).
- Adaptive quality: on first launch, run a 5-second benchmark and pick
  the resolution/FPS combo that hits the latency target. Downgrade
  silently if sustained drops occur.

If a feature can't meet the latency budget, it ships behind an
"Experimental" toggle — never on by default.

### III. Cross-Platform Parity

Windows, macOS, and Linux (X11 and Wayland) ship from the same codebase
and the same release. A gesture that works on Windows must work on the
other three within the same MAJOR version. Platform-specific affordances
(e.g., Windows Snap, macOS Mission Control) are reached through a single
abstraction — never branched in user-facing UI.

### IV. Discoverability over Documentation

A first-time user must reach their first successful gesture **within
60 seconds of launch**, without reading anything outside the app. The
interactive tutorial is mandatory on first run and replayable from
settings. Gesture hints (small ghosted hand outlines + text) appear
the first three times each gesture is used, then auto-hide.

### V. The Hand is the Cursor

Visual feedback is non-optional. Whenever tracking is active, an
outlined hand overlay renders at 60 FPS on top of the desktop — the
same crisp white-outline-on-translucent treatment as Meta Quest / Vision
Pro. Pinches snap with a soft audible click. Resize/scroll gestures
produce graded haptic-style audio cues (volume scaled to motion
magnitude) so the user feels the system respond even without touch
hardware.

### VI. Accessible by Default

- All gesture timings, sensitivity, and pinch thresholds are
  user-configurable.
- A "Reduced Motion" toggle disables hand-overlay animations.
- A "High Contrast" hand-outline mode replaces translucent fills with
  hard black/white strokes.
- One-handed mode: every two-hand gesture has a documented one-hand
  fallback.
- Keyboard navigation works fully inside the settings/tutorial UI —
  the app never assumes the user has a working mouse.

### VII. Boring Stack, Sharp Edges

Pick boring, mature technologies for the boring parts. Spend
innovation budget on the things users actually feel:
hand-tracking quality, gesture recognition, and visual polish.

- Electron + React + TypeScript for the shell (boring).
- MediaPipe Hands via `@mediapipe/tasks-vision` (boring, best-in-class).
- nut.js / @nut-tree-fork/nut-js for cross-platform input (boring).
- Custom gesture state machine in pure TypeScript (sharp edge — this
  is where the magic lives, no third-party gesture libs).

## Design Constraints

- **Typography**: Baloo 2 is the primary typeface for all UI text.
  Weights 400 (regular), 600 (semibold), 800 (extrabold). Baloo is
  loaded locally as a self-hosted woff2; no Google Fonts CDN.
- **Visual identity**: bold, rounded, playful. Pill-shaped buttons,
  16-24px corner radii on panels, saturated accent colors over a deep
  navy or jet-black base. The look should feel closer to Duolingo than
  to a settings panel.
- **Hand overlay**: 2.5px stroke, pure white at full opacity, soft
  drop-shadow. Joints rendered as small filled circles. Pinch points
  glow when within threshold.
- **Sound design**: every active gesture produces an audio cue.
  Cues are short (<150ms), pitched, and adjustable in settings (volume
  + on/off). No notification-style "ding"s.

## Performance Standards

| Metric                              | Target  | Hard ceiling |
|-------------------------------------|---------|--------------|
| Gesture-to-action p95 latency       | < 80ms  | < 100ms      |
| Hand overlay frame time             | < 16ms  | < 33ms       |
| Idle CPU (tracking paused)          | < 1%    | < 3%         |
| Active CPU (tracking on, 30 FPS)    | < 15%   | < 25%        |
| Memory footprint                    | < 350MB | < 500MB      |
| Cold start to tracking-ready        | < 3s    | < 5s         |
| Installer size                      | < 150MB | < 200MB      |

If any metric exceeds the hard ceiling on the reference hardware
(Intel UHD 620, 8GB RAM, Windows 11), the build does not ship.

## Development Workflow

- Every functional change is gated by the **Constitution Check** in
  `plan.md`. Adding telemetry, blocking the UI thread, or shipping a
  gesture that can't be reached from a single hand all require explicit
  amendment of this document.
- Commits are small and atomic. Every commit message answers "why",
  not just "what".
- The default branch always builds and runs. Broken main = stop the
  loop and fix.
- Each user story in `spec.md` must be **independently demoable**
  before the next is started. MVP = US1 working end-to-end.

## Governance

This constitution supersedes ad-hoc decisions made during
implementation. When the ralph loop or any developer encounters a
choice that contradicts a principle, the principle wins by default;
overriding it requires an explicit amendment commit to this file with
rationale in the commit body.

Amendments bump the version per semver:

- **MAJOR**: A principle is removed or reversed (e.g., enabling cloud
  upload).
- **MINOR**: A new principle is added, or a principle is materially
  extended.
- **PATCH**: Wording clarification, typo, non-semantic edit.

**Version**: 1.0.0 | **Ratified**: 2026-05-21 | **Last Amended**: 2026-05-21
