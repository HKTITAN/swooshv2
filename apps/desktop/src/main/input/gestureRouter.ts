/**
 * Gesture router — turns FSM events from the overlay renderer into
 * concrete OS-level input via the nut.js dispatcher.
 *
 * Goal (post-v0.2): hand input acts on the screen like the Meta Quest
 * or Apple Vision Pro pinch — the user's physical mouse cursor stays
 * exactly where they left it. Pinching, scrolling, and dragging via
 * hand do not "steal" the OS mouse cursor.
 *
 * Implementation: because there's no cross-platform desktop API that
 * fires a mouse click at an arbitrary screen position without first
 * moving the cursor, we save → jump → act → restore around every
 * hand action. The cursor flickers to the hand point for the
 * duration of the synthesized event, then snaps back to the
 * physical-mouse position so it appears undisturbed.
 *
 *   pinchDown   → save cursor, jump to hand, mouseDown
 *   tracking    → idle: do nothing; drag: cursor follows hand
 *   pinchUp     → mouseUp, restore cursor
 *   scroll      → save cursor (once per scroll burst), jump to hand,
 *                 scroll, restore after a debounced 250 ms idle
 *   swipe       → keystroke only (Alt+Tab is global)
 *   resize      → handled by main/windows/resize.ts
 *   idle / lost → defensive: release any held button, restore cursor
 *
 * A native touch-injection helper (Windows
 * `InjectSyntheticPointerInput`, macOS `CGEventCreateMouseEvent`,
 * Linux uinput) would eliminate the flicker entirely; that's the
 * next step but out of scope for v0.1. See README → Roadmap.
 */

import type { GestureEmitPayload } from '@swoosh/shared/ipc';
import type { InputDispatcher } from './dispatcher';
import { mapToScreen } from './coords';
import { createResizeDispatcher } from '../windows/resize';

export interface GestureRouter {
  handle(payload: GestureEmitPayload): void;
  /** Pause routing while tracking is suspended. */
  setEnabled(enabled: boolean): void;
}

const DRAG_MOVE_THROTTLE_MS = 1000 / 120;
const SCROLL_IDLE_RESTORE_MS = 250;

export function createGestureRouter(input: InputDispatcher): GestureRouter {
  let enabled = true;
  let lastDragMoveAt = 0;
  const resize = createResizeDispatcher();

  // Cursor preservation state. When Swoosh "claims" the cursor for a
  // hand action it stashes the physical-mouse position here; once the
  // action ends we move the cursor back so the user perceives their
  // mouse as untouched.
  let savedCursorPos: { x: number; y: number } | null = null;
  let dragActive = false;
  let dragButton: 'left' | 'right' | null = null;
  let scrollRestoreTimer: ReturnType<typeof setTimeout> | null = null;

  function saveCursorOnce(): void {
    if (savedCursorPos) return;
    savedCursorPos = input.getCursorPosition();
  }

  function restoreCursor(): void {
    if (!savedCursorPos) return;
    const target = savedCursorPos;
    savedCursorPos = null;
    void input.moveCursor(target.x, target.y);
  }

  function jumpCursor(norm: { x: number; y: number }): void {
    const screenPt = mapToScreen(norm);
    void input.moveCursor(screenPt.x, screenPt.y);
  }

  function clearScrollTimer(): void {
    if (scrollRestoreTimer) {
      clearTimeout(scrollRestoreTimer);
      scrollRestoreTimer = null;
    }
  }

  return {
    setEnabled(next) {
      enabled = next;
      if (!enabled) {
        // Pause: release any held button and restore the cursor so the
        // user isn't left with a stuck drag or a hijacked cursor.
        if (dragActive) {
          if (dragButton) void input.mouseUp(dragButton);
          dragActive = false;
          dragButton = null;
        }
        clearScrollTimer();
        restoreCursor();
      }
    },
    handle(payload) {
      if (!enabled) return;
      const g = payload.gesture;

      switch (g.kind) {
        case 'pinchDown': {
          // Snapshot the physical-mouse position before we move the
          // cursor for the click. On pinchUp we'll snap back.
          saveCursorOnce();
          jumpCursor(payload.cursor);
          void input.mouseDown(g.button);
          dragActive = true;
          dragButton = g.button;
          break;
        }

        case 'pinchUp': {
          if (dragButton) void input.mouseUp(dragButton);
          dragActive = false;
          dragButton = null;
          // Restore the cursor to where the physical mouse was *before*
          // this whole interaction started — across drags too, so a
          // hand-driven drag-and-drop ends with the mouse cursor back
          // where the user left it.
          restoreCursor();
          break;
        }

        case 'click':
          // Synthesized click event from the FSM — the down/up pair
          // already fired, so we have nothing to do here.
          break;

        case 'scroll': {
          // Wheel events fire at the cursor's current position, so
          // we have to move the cursor to the hand point for the
          // scroll to land in the right place. We save the physical
          // mouse position the first time we do this in a scroll
          // burst, then debounce a restore once the user stops
          // scrolling for 250 ms.
          saveCursorOnce();
          clearScrollTimer();
          jumpCursor(payload.cursor);
          const dxPx = Math.round(g.dx * 200);
          const dyPx = Math.round(g.dy * 200);
          void input.scroll(dxPx, dyPx);
          scrollRestoreTimer = setTimeout(() => {
            scrollRestoreTimer = null;
            // Don't pull the cursor away in the middle of a drag.
            if (!dragActive) restoreCursor();
          }, SCROLL_IDLE_RESTORE_MS);
          break;
        }

        case 'swipe': {
          // Alt+Tab is global — no cursor jump needed.
          const combo = g.direction === 'right' ? 'alt+tab' : 'alt+shift+tab';
          void input.keystroke(combo);
          break;
        }

        case 'twoHandResizeStart':
          resize.begin();
          break;
        case 'twoHandResizeDelta':
          resize.applyScale(g.scale);
          break;
        case 'twoHandResizeEnd':
          resize.end();
          break;

        case 'tracking': {
          // Drag mode: while the pinch is held, the cursor follows the
          // hand at frame cadence (throttled) so drag-and-drop feels
          // natural. Idle tracking does nothing — the SwooshCursor in
          // the overlay shows the hand position.
          if (dragActive) {
            const now = Date.now();
            if (now - lastDragMoveAt >= DRAG_MOVE_THROTTLE_MS) {
              jumpCursor(payload.cursor);
              lastDragMoveAt = now;
            }
          }
          break;
        }

        case 'idle':
          // Hand left the frame. Defensive cleanup so the user isn't
          // left with a half-held button or a hijacked cursor.
          if (dragActive) {
            if (dragButton) void input.mouseUp(dragButton);
            dragActive = false;
            dragButton = null;
          }
          clearScrollTimer();
          restoreCursor();
          break;
      }
    },
  };
}
