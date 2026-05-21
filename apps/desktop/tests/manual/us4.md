# Manual smoke test — User Story 4: Open-Palm Scroll & Swipe

## Setup

1. Complete US1 + US2.
2. Launch Swoosh; verify the overlay window is active.

## Checklist

### Scroll

- [ ] Open a long webpage (e.g., Wikipedia).
- [ ] Hold an open palm (all fingers extended) in front of the camera.
- [ ] Move your hand DOWN slowly → the page scrolls DOWN.
- [ ] Move your hand UP slowly → the page scrolls UP.
- [ ] Scroll magnitude scales with hand speed (fast = bigger jumps).
- [ ] Closing the hand or pinching IMMEDIATELY ends scroll mode
      (no overshoot scroll after a pinch fires).

### Swipe

- [ ] With an open palm, FLICK the hand right within ~200 ms → the OS
      switches to the next window (Alt+Tab on Win/Linux,
      Cmd+Tab on macOS).
- [ ] Flick LEFT → switches to the previous window.
- [ ] A SLOW horizontal palm movement does NOT trigger a swipe.
- [ ] Two flicks in quick succession trigger two switches (the
      streak resets after each emit).

### Mixed gestures

- [ ] Open palm + small vertical motion = scroll only (no swipe).
- [ ] Open palm + large horizontal motion = swipe only (no scroll).
- [ ] After a swipe, returning to a still open palm does NOT
      retrigger another swipe.

## Known limitations

- Browser-specific tab switching (Ctrl+Tab in Chrome/Firefox) is
  deferred until the FSM ships with app-aware active-window detection.
  All swipes currently dispatch Alt+Tab variants.
- On Wayland without uinput permission, scroll and swipe will be
  silent (no errors, just no OS effect). Run under X11 to verify the
  full pipeline.
