# Swoosh — Local Development Quickstart

## Prerequisites

- Node.js 22 LTS (`node --version` ≥ 22)
- pnpm 9+ (`npm i -g pnpm` if needed)
- A webcam
- (Linux) `xdotool` for X11, or `uinput` access for Wayland

## First-time setup

```bash
pnpm install
```

This installs Electron, MediaPipe, nut.js, and all renderer deps
across the workspace.

> On macOS, `nut.js` may prompt for Accessibility permission on first
> launch — grant it under System Settings → Privacy & Security →
> Accessibility. Same for Screen Recording if/when we add screen
> capture.

## Run in development

```bash
pnpm dev
```

This:
1. Starts Vite dev servers for `main`, `preload`, and each renderer.
2. Launches Electron with HMR.
3. Opens the tutorial window if `tutorialSeen === false` in the
   settings store; otherwise opens the overlay + tray.

## Run tests

```bash
pnpm test           # vitest unit (FSM, filters, settings)
pnpm test:e2e       # playwright (tutorial flow, settings panel)
```

## Build packaged installers

```bash
pnpm build
pnpm package        # produces installer for the current OS
pnpm package:all    # all three (needs CI; locally only host OS)
```

Outputs in `apps/desktop/release/`:
- Windows: `Swoosh-Setup-{version}.exe`
- macOS: `Swoosh-{version}.dmg`
- Linux: `Swoosh-{version}.AppImage`, `Swoosh-{version}.deb`

## Common dev tasks

- **Reset settings** (force tutorial replay): delete the settings
  file at the OS-specific location listed in `data-model.md`.
- **Toggle dev overlay debug**: in dev mode, the overlay window
  shows an FPS counter and the active gesture state in the
  bottom-right corner.
- **Inspect IPC traffic**: set `SWOOSH_DEBUG_IPC=1` before
  `pnpm dev`. Logs every IPC message to stderr.
- **Force a benchmark**: Settings → Performance → "Re-run benchmark"
  or run `pnpm dev -- --bench` to print results to stderr at startup.
