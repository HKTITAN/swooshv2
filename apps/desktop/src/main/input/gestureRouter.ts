/**
 * Gesture router — turns FSM events from the overlay renderer into
 * concrete OS-level input via the nut.js dispatcher.
 *
 * Design principle (post-v0.1): Swoosh's hand input is its OWN input
 * channel — it does NOT shadow the OS mouse cursor. Moving your hand
 * does not move the system cursor; you can keep using your physical
 * mouse alongside Swoosh. The OS cursor only moves when an action
 * needs to happen at a specific screen point:
 *
 *   tracking            → no-op (the renderer draws Swoosh's own cursor)
 *   pinchDown {button}  → jump OS cursor to hand point, then mouseDown
 *   pinchUp   {button}  → mouseUp at current cursor (matches mouseDown)
 *   click               → informational; the down/up pair already fired
 *   tracking (drag)     → while a pinch is held, the cursor follows the
 *                         hand so drag works. Released on pinchUp.
 *   scroll              → jump OS cursor to hand point, then scroll
 *   swipe               → keystroke (no cursor jump — Alt+Tab is global)
 *   resize gestures     → handled by main/windows/resize.ts
 *
 * Throttling: cursor jumps during drag respect a ~120 Hz cap so we
 * don't hammer the OS layer on 60+ FPS cameras.
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

export function createGestureRouter(input: InputDispatcher): GestureRouter {
  let enabled = true;
  let lastDragMoveAt = 0;
  const MOVE_THROTTLE_MS = 1000 / 120;
  const resize = createResizeDispatcher();

  // True while a pinch is held. We move the cursor with the hand only
  // during this window so drag-and-drop works naturally.
  let dragActive = false;

  function jumpCursor(norm: { x: number; y: number }): void {
    const screenPt = mapToScreen(norm);
    void input.moveCursor(screenPt.x, screenPt.y);
  }

  return {
    setEnabled(next) {
      enabled = next;
      // Releasing the gate while a drag was active would leave a
      // half-held mouse button; clear the flag defensively.
      if (!enabled) dragActive = false;
    },
    handle(payload) {
      if (!enabled) return;
      const g = payload.gesture;

      switch (g.kind) {
        case 'pinchDown':
          jumpCursor(payload.cursor);
          void input.mouseDown(g.button);
          dragActive = true;
          break;
        case 'pinchUp':
          void input.mouseUp(g.button);
          dragActive = false;
          break;
        case 'click':
          // mouseDown+mouseUp already covers it; click is informational.
          break;
        case 'scroll': {
          // Scroll wheel events fire at the OS cursor position. Jump the
          // cursor to where the user is pointing so scroll happens
          // there, not under a stale mouse position.
          jumpCursor(payload.cursor);
          const dxPx = Math.round(g.dx * 200);
          const dyPx = Math.round(g.dy * 200);
          void input.scroll(dxPx, dyPx);
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
          // Drag mode: while a pinch is held, the cursor follows the
          // hand at frame cadence (throttled) so drag-and-drop feels
          // natural. Idle tracking does nothing — Swoosh's own cursor
          // in the overlay shows where the hand is.
          if (dragActive) {
            const now = Date.now();
            if (now - lastDragMoveAt >= MOVE_THROTTLE_MS) {
              jumpCursor(payload.cursor);
              lastDragMoveAt = now;
            }
          }
          break;
        }
        case 'idle':
          // Hand left the frame — release any in-flight drag so the
          // user doesn't get stuck with a held button.
          if (dragActive) {
            void input.mouseUp('left');
            void input.mouseUp('right');
            dragActive = false;
          }
          break;
      }
    },
  };
}
