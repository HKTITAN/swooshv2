# Manual smoke test — User Story 2: Pinch-to-Click background service

Goal: confirm that after the tutorial, Swoosh sits in the tray and the
user can pinch to click anywhere in the OS.

Reference hardware target: Intel UHD 620 / Apple M1 / Ryzen integrated,
8 GB RAM, integrated 720p webcam.

## Setup

1. Build the app: `pnpm build`.
2. Launch in dev mode: `pnpm dev` (or run the packaged installer).
3. If this is a fresh profile, complete the tutorial (US1).

## Checklist

- [ ] Tray icon appears at app launch (Windows: system tray;
      macOS: menu bar; Linux: notification area).
- [ ] Overlay window covers the primary display, is transparent, and
      does not steal focus when clicked.
- [ ] Moving your hand in front of the camera moves the OS cursor at
      30+ FPS with smoothed motion (no visible stutter).
- [ ] Cursor follows the *midpoint* of thumb and index — pointing at
      a target with these fingers lands the cursor on the target.
- [ ] Pinching thumb + index fires a left click. Verify in:
      - Notepad / TextEdit / gedit: click into the text area, then
        type via keyboard to confirm focus moved.
      - Browser: click a link.
      - File manager: double-tap (two pinches < 400 ms apart) opens a folder.
- [ ] Pinch-and-hold drags. Verify by:
      - Dragging a window title bar to move the window.
      - Selecting text by pinching at the start, dragging across, releasing.
- [ ] Releasing the pinch fires `mouseUp` cleanly (no stuck cursor).
- [ ] Tray menu shows: Pause tracking, Settings…, Replay tutorial,
      About Swoosh, Quit Swoosh.
- [ ] Tray → Pause tracking suspends tracking within ~200 ms:
      camera LED turns off, overlay disappears, cursor stops following.
- [ ] Tray → Resume tracking re-engages within 500 ms.
- [ ] Global hotkey (default `Ctrl+Alt+Space` on Win/Linux,
      `Cmd+Alt+Space` on macOS) toggles pause/resume.
- [ ] Lock the OS (Win+L / Ctrl+Cmd+Q) — Swoosh auto-pauses; unlocking
      auto-resumes.
- [ ] Recording indicator dot is visible in the overlay's top-right
      while tracking is active; hidden while paused.
- [ ] Holding a pinch for > 5 s with no movement auto-releases
      (drag-lock safety) — verify the cursor button comes up.
- [ ] Quitting from the tray cleanly releases the camera handle
      (next `getUserMedia` call from any app succeeds immediately)
      and the tray icon disappears within 1 s.

## Known limitations at this stage

- Settings window is not yet wired (T500+). Adjusting gesture
  parameters requires editing the JSON file directly:
  - Windows: `%APPDATA%/Swoosh/swoosh-settings.json`
  - macOS: `~/Library/Application Support/Swoosh/swoosh-settings.json`
  - Linux: `~/.config/Swoosh/swoosh-settings.json`
- nut.js may fail to load on bare Wayland; tracking will be silent
  (no errors), but no OS cursor will move. Switch to X11 to verify
  the full pipeline.
