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

## Principles

Privacy on-device. Latency-first. Cross-platform parity. Tutorial
discoverability. Configurable everything. See
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md).

## License

[MIT](./LICENSE). Baloo 2 typeface is OFL — see
`apps/desktop/src/renderer/shared-ui/fonts/LICENSE-Baloo2.txt`.
