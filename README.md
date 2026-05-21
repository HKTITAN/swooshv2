# Swoosh

> Hand-tracked system control for Windows, macOS, and Linux.
> Pinch to click, swipe to switch, spread to resize. No mouse. No
> headset. Just your webcam.

![status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)
![platforms: win | mac | linux](https://img.shields.io/badge/platforms-win%20%7C%20mac%20%7C%20linux-blueviolet)
![license: MIT](https://img.shields.io/badge/license-MIT-green)

Swoosh turns any laptop with a webcam into a hand-tracked computer.
It runs in your system tray, watches your hand through the camera,
and translates pinches, swipes, and palm movements into mouse and
keyboard events at the OS level — across every app you already use.

## Why?

Touch-free interfaces are everywhere on phones and headsets but
absent on the laptops most of us actually live in. Swoosh closes
that gap with the same gestural language as Meta Quest and Vision
Pro, on the hardware you already own.

## How it works

A standard webcam feeds frames to the renderer at 30–60 FPS via
`getUserMedia`. Every frame is handed to MediaPipe's
**HandLandmarker** (running on WASM/GPU), which returns 21 3D
landmarks per hand with a detection score.

Landmarks flow through a **1-Euro filter** to smooth jitter, then
into a small **gesture FSM** that watches fingertip distances and
palm motion. The FSM decides between *tracking*, *pinch*,
*open-palm*, and *two-hand* states with hysteresis to prevent
flicker, and emits high-level events (`pinchDown`, `click`,
`scroll`, `swipe`).

The main process translates those events into **OS input via
nut.js** — `mouseDown`, `mouseUp`, `moveCursor`, `scroll`,
`keystroke` — and plays a short audio cue on each pinch. The whole
camera → cursor loop targets a **p95 latency under 100 ms** on
reference hardware.

## Status

Pre-alpha. Built spec-first using
[GitHub Spec Kit](https://github.com/github/spec-kit). See:

- [`specs/001-swoosh-mvp/spec.md`](./specs/001-swoosh-mvp/spec.md)
- [`specs/001-swoosh-mvp/plan.md`](./specs/001-swoosh-mvp/plan.md)
- [`specs/001-swoosh-mvp/tasks.md`](./specs/001-swoosh-mvp/tasks.md) — live progress

## Dev quickstart

```bash
pnpm install
pnpm dev
```

For more, see [`specs/001-swoosh-mvp/quickstart.md`](./specs/001-swoosh-mvp/quickstart.md).

## Supported platforms

| OS      | Version           | Notes                                                 |
| ------- | ----------------- | ----------------------------------------------------- |
| Windows | 10 / 11 (x64)     | Tested; NSIS installer.                               |
| macOS   | 12+ (universal)   | Requires Accessibility and Camera permission grants.  |
| Linux   | Ubuntu 22.04+ X11 | AppImage and `.deb`. Wayland needs `uinput` access.   |

## Troubleshooting

**Camera permission denied.** Swoosh needs raw webcam access. On
Windows, open *Settings → Privacy & security → Camera* and allow
desktop apps. On macOS, *System Settings → Privacy & Security →
Camera* and tick Swoosh; you may also need to grant **Accessibility**
so nut.js can synthesize input. On Linux, ensure your user is in the
`video` group.

**Camera is in use by another app.** Only one process can hold the
webcam at a time. Quit Zoom, Teams, OBS, or your browser tab and
relaunch Swoosh. The tutorial will let you pick a different camera
if you have more than one.

**Linux Wayland: cursor doesn't move.** nut.js writes to
`/dev/uinput`, which is root-only by default. Add a udev rule so
your user can write to it:

```bash
echo 'KERNEL=="uinput", GROUP="input", MODE="0660"' \
  | sudo tee /etc/udev/rules.d/99-uinput.rules
sudo usermod -aG input "$USER"
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Log out and back in. If Swoosh still can't move the cursor, switch
to an X11 session — full Wayland support depends on the compositor.

**macOS: clicks register but cursor never moves.** You probably
granted Camera but not Accessibility. Open *System Settings →
Privacy & Security → Accessibility*, click `+`, and add Swoosh.
Restart the app.

**`pnpm dev` fails with "Error: Electron uninstall" on Windows.**
pnpm's Electron postinstall step occasionally fails silently and
leaves `node_modules/electron/dist` empty. The zip is downloaded
fine — just not extracted. Run the helper:

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/fix-electron-install.ps1
```

or, equivalently, see the script for the manual `Expand-Archive`
incantation.

## Principles

Privacy on-device. Latency-first. Cross-platform parity. Tutorial
discoverability. Configurable everything. **Hand is a separate
input modality from the mouse.** See
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md).

## Roadmap — hand-as-separate-input

Today the hand pinch is dispatched as a synthesized OS mouse event.
The router snapshots the physical mouse position, jumps the cursor
to the hand point for the click/scroll, and snaps it back — so the
*end state* is your mouse where you left it, but there's a visible
flicker for the duration of the synthesized event.

The Quest / Vision Pro behavior — hand input that the OS cursor
literally never notices — requires platform-native touch / pen
injection:

- **Windows**: `InitializeTouchInjection` + `InjectSyntheticPointerInput`
  with `PT_TOUCH` or `PT_PEN`.
- **macOS**: `CGEventCreate` with a custom event source bound to
  the trackpad subsystem.
- **Linux**: `uinput` device exposing absolute touch input.

These will live in `apps/desktop/src/main/input/touch/<platform>.ts`
behind a feature flag, and gestureRouter will prefer them over the
mouse-with-restore path when available. Tracked as a v0.2 milestone.

## License

[MIT](./LICENSE). Baloo 2 typeface is OFL — see
`apps/desktop/src/renderer/shared-ui/fonts/LICENSE-Baloo2.txt`.
