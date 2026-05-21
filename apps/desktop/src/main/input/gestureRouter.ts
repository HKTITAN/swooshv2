/**
 * Gesture router — turns FSM events from the overlay renderer into
 * concrete OS-level input via the nut.js dispatcher.
 *
 * Single source of truth for the gesture → input mapping. Every
 * channel between the camera pipeline and the OS goes through this
 * module.
 *
 * Behavior at this stage (T203):
 *   tracking            → moveCursor(payload.cursor) on the active display
 *   pinchDown {left}    → mouseDown('left')  (audio cue is renderer-side)
 *   pinchUp   {left}    → mouseUp('left')
 *   click     {left}    → no-op (down/up already fired)
 *   pinchDown {right}   → mouseDown('right')
 *   pinchUp   {right}   → mouseUp('right')
 *   scroll              → dispatcher.scroll
 *   swipe               → keystroke (filled in by T403)
 *   resize gestures     → handled by T602 elsewhere
 */

import type { GestureEmitPayload } from '@swoosh/shared/ipc';
import type { InputDispatcher } from './dispatcher';
import { mapToScreen } from './coords';

export interface GestureRouter {
  handle(payload: GestureEmitPayload): void;
  /** Pause routing while tracking is suspended. */
  setEnabled(enabled: boolean): void;
}

export function createGestureRouter(input: InputDispatcher): GestureRouter {
  let enabled = true;
  let lastMoveAt = 0;
  // Throttle moveCursor at ~120 Hz to avoid hammering the OS layer on
  // very high-FPS cameras. The OS will smooth its own pointer between
  // events anyway.
  const MOVE_THROTTLE_MS = 1000 / 120;

  return {
    setEnabled(next) {
      enabled = next;
    },
    handle(payload) {
      if (!enabled) return;
      const g = payload.gesture;

      // Cursor follows every payload's `cursor` field, not just the
      // "tracking" event — that way the cursor still moves during a
      // pinch/drag too.
      const now = Date.now();
      if (now - lastMoveAt >= MOVE_THROTTLE_MS) {
        const screenPt = mapToScreen(payload.cursor);
        void input.moveCursor(screenPt.x, screenPt.y);
        lastMoveAt = now;
      }

      switch (g.kind) {
        case 'pinchDown':
          void input.mouseDown(g.button);
          break;
        case 'pinchUp':
          void input.mouseUp(g.button);
          break;
        case 'click':
          // mouseDown+mouseUp already covers it; click is informational.
          break;
        case 'scroll': {
          // Map normalized scroll to OS pixels. The FSM already scales
          // by sensitivity; we apply a per-frame magnification so a
          // small palm movement translates to a comfortable scroll.
          const dxPx = Math.round(g.dx * 200);
          const dyPx = Math.round(g.dy * 200);
          void input.scroll(dxPx, dyPx);
          break;
        }
        case 'swipe': {
          // Map directional swipes to window/tab switching keystrokes.
          // On Win/Linux: alt+tab / alt+shift+tab cycles windows.
          // (Browser ctrl+tab variants are handled by app-aware logic
          // in a later task; for now we ship the universal mapping.)
          const combo =
            g.direction === 'right' ? 'alt+tab' : 'alt+shift+tab';
          void input.keystroke(combo);
          break;
        }
        case 'idle':
        case 'tracking':
        case 'twoHandResizeStart':
        case 'twoHandResizeDelta':
        case 'twoHandResizeEnd':
          break;
      }
    },
  };
}
