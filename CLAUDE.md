# Swoosh — Project Guide for AI Agents

Swoosh is a cross-platform desktop app that turns a webcam into a
hand-tracked system controller (pinch to click, palm to scroll, etc.).

## Where things live

- **Spec docs**: `specs/001-swoosh-mvp/`
  - `spec.md` — user stories, requirements, success criteria
  - `plan.md` — architecture, latency budget, project structure
  - `tasks.md` — the live task list (the work queue for the ralph loop)
  - `data-model.md` — entity definitions
  - `contracts/ipc.ts` and `contracts/types.ts` — IPC + core types contract
  - `research.md` — alternatives considered + rationale
  - `quickstart.md` — local dev guide
- **Constitution**: `.specify/memory/constitution.md` — non-negotiable principles
- **Spec-kit infrastructure**: `.specify/` (templates, scripts, workflows)

## Tech stack

- Electron 33 + React 18 + TypeScript 5.5 (strict)
- Build: `electron-vite` (Vite under the hood) + `electron-builder`
- Hand tracking: `@mediapipe/tasks-vision` HandLandmarker
- OS input: `@nut-tree-fork/nut-js`
- State: Zustand 4
- Styling: Tailwind CSS 3.4 with custom design tokens
- Typeface: Baloo 2 (self-hosted woff2, OFL license)
- Persistence: `electron-store` (settings) + `electron-log` (rotating logs)
- Validation: Zod
- Tests: Vitest (unit) + Playwright (renderer e2e)
- Package manager: pnpm 9 workspace

## Loop protocol (for the ralph loop)

1. Open `specs/001-swoosh-mvp/tasks.md` and find the lowest-numbered
   unchecked task whose dependencies are satisfied.
2. Read referenced sections of `plan.md`, `data-model.md`, and
   the contracts before writing code.
3. Implement the task in the smallest scope possible. Do not pre-build
   features for future tasks.
4. Verify locally:
   - `pnpm -w lint`
   - `pnpm -w typecheck` (alias: `pnpm -r exec tsc --noEmit`)
   - Relevant `pnpm test` if tests exist for the area
5. Tick the task in `tasks.md` (`- [ ]` → `- [x]`).
6. Commit with `git add` + `git commit -m "T### <imperative subject>"`.
   Keep commits atomic — one task per commit unless tasks are
   trivially related.
7. Loop.

If blocked:
- Leave the box unchecked.
- Append a one-line note **directly under the task** explaining the
  blocker (e.g., `> blocked: needs nut.js Wayland fallback decision`).
- Pick the next available task. Never silently skip.

## House rules

- TypeScript strict mode always. No `any` without an inline justification.
- All IPC channels must be typed via the `shared` package; no string
  literals scattered through code.
- The renderer never imports Node modules directly. Use the preload
  `contextBridge` API exposed as `window.swoosh`.
- Privacy: no telemetry, no remote calls except the user-opt-in
  update check.
- Latency: any added work in the gesture pipeline must measure under
  10 ms per frame on reference hardware.
- Style: Baloo 2 for all UI text. Bold, rounded, playful — closer to
  Duolingo than to a settings panel.
- Comments: only when the *why* is non-obvious. The code already tells
  the *what*.

## Git

- Default branch: `main`
- One commit per task. Subject = `T### <imperative summary>` (e.g.,
  `T023 Add 1-Euro filter implementation`).
- Body (optional) explains the *why* if subject doesn't make it obvious.

## Reference hardware (performance baseline)

- Intel UHD 620 / Apple M1 baseline / Ryzen integrated
- 8 GB RAM minimum
- Integrated 720p webcam
- Targets: < 100 ms p95 gesture-to-OS-event latency, < 25 % active CPU
