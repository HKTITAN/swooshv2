/**
 * Gesture router — turns FSM events from the overlay renderer into
 * OS-level input via UI Automation (primary) and touch injection
 * (drag fallback).
 *
 * Architectural rule: hand input never moves the OS mouse cursor.
 * The cursor is the user's mouse pointer; the hand has its own
 * SwooshCursor that the user sees in the overlay.
 *
 * Per-gesture mapping:
 *
 *   pinchDown {left}  → UIA Invoke() on the element under the hand.
 *                       Activates buttons, links, menu items,
 *                       checkboxes, list items, combo-box toggles —
 *                       i.e. the things you actually click. No cursor
 *                       movement. Works on most modern apps
 *                       (browsers, Office, Electron, .NET).
 *   pinchDown {right} → dropped. Right-click via UIA doesn't have a
 *                       standard pattern; user uses physical mouse.
 *   pinchUp           → dropped. UIA Invoke is instantaneous; there's
 *                       no "press and release" semantic in UIA.
 *   tracking + drag   → touch.pressMove (only if touch was working).
 *                       On hosts where touch injection is blocked,
 *                       drag isn't possible from the hand.
 *   scroll            → UIA ScrollPattern on the element under the
 *                       hand. Maps palm-up → scrollUp, palm-down →
 *                       scrollDown.
 *   swipe             → keystroke (Alt+Tab — global, no cursor).
 *   twoHandResize*    → main/windows/resize.ts (stub for now).
 */

import type { GestureEmitPayload } from '@swoosh/shared/ipc';
import type { InputDispatcher } from './dispatcher';
import { mapToScreen } from './coords';
import { createResizeDispatcher } from '../windows/resize';
import { getTouchInjector } from './touch';
import { logger } from '../logger';

export interface GestureRouter {
  handle(payload: GestureEmitPayload): void;
  setEnabled(enabled: boolean): void;
}

const DRAG_MOVE_THROTTLE_MS = 1000 / 120;
// Cap UIA scroll dispatch rate. UIA scrolling is discrete (one
// SmallIncrement per call), so we don't want to fire 60 of them
// per second on a fast palm motion — too jittery.
const SCROLL_THROTTLE_MS = 80;

export function createGestureRouter(input: InputDispatcher): GestureRouter {
  let enabled = true;
  let lastDragMoveAt = 0;
  let lastScrollAt = 0;
  const resize = createResizeDispatcher();
  const helper = getTouchInjector();

  if (helper.available) {
    logger.info(
      'gestureRouter: UI Automation click + scroll; touch attempted for drag. ' +
        'OS mouse cursor remains untouched by hand input.',
    );
  } else {
    logger.warn(
      'gestureRouter: input helper unavailable — hand visual only, swipe via keystroke',
    );
  }

  // Drag state — only relevant when touch injection works on this host.
  let dragActive = false;
  let dragLastPt: { x: number; y: number } | null = null;

  return {
    setEnabled(next) {
      enabled = next;
      if (!enabled && dragActive && dragLastPt) {
        helper.pressUp(dragLastPt.x, dragLastPt.y);
        dragActive = false;
        dragLastPt = null;
      }
    },
    handle(payload) {
      if (!enabled) return;
      const g = payload.gesture;

      switch (g.kind) {
        case 'pinchDown': {
          if (g.button !== 'left') break; // right-click dropped
          const pt = mapToScreen(payload.cursor);
          // UIA click is the primary path — fires immediately.
          helper.click(pt.x, pt.y);
          // ALSO start a touch contact for potential drag. If touch
          // injection works on this host, subsequent tracking events
          // will continue the contact; if not, the touch attempt fails
          // silently. Either way the UIA click already happened.
          if (helper.pressDown(pt.x, pt.y)) {
            dragActive = true;
            dragLastPt = pt;
          }
          break;
        }

        case 'pinchUp': {
          if (!dragActive || !dragLastPt) break;
          helper.pressUp(dragLastPt.x, dragLastPt.y);
          dragActive = false;
          dragLastPt = null;
          break;
        }

        case 'click':
          // Down/up pair already covers it.
          break;

        case 'scroll': {
          const now = Date.now();
          if (now - lastScrollAt < SCROLL_THROTTLE_MS) break;
          lastScrollAt = now;
          const pt = mapToScreen(payload.cursor);
          if (g.dy > 0) {
            // Palm moved DOWN in selfie view → scroll content down.
            helper.scrollDown(pt.x, pt.y);
          } else if (g.dy < 0) {
            helper.scrollUp(pt.x, pt.y);
          }
          break;
        }

        case 'swipe': {
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
          // Drag mode: continue the touch contact at the hand's new
          // position (no-op if touch injection isn't supported on
          // this host).
          if (!dragActive || !dragLastPt) break;
          const now = Date.now();
          if (now - lastDragMoveAt < DRAG_MOVE_THROTTLE_MS) break;
          lastDragMoveAt = now;
          const pt = mapToScreen(payload.cursor);
          if (helper.pressMove(pt.x, pt.y)) {
            dragLastPt = pt;
          }
          break;
        }

        case 'idle':
          if (dragActive && dragLastPt) {
            helper.pressUp(dragLastPt.x, dragLastPt.y);
            dragActive = false;
            dragLastPt = null;
          }
          break;
      }
    },
  };
}
