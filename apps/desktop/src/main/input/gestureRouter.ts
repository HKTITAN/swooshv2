/**
 * Gesture router — turns FSM events from the overlay renderer into
 * concrete OS-level input.
 *
 * Hard rule (from user feedback): hand input MUST NOT move the OS
 * mouse cursor under any circumstance. The hand is its own input
 * device, parallel to the mouse, exactly like Vision Pro / Quest.
 *
 * Therefore there is NO mouse fallback for hand-driven clicks. If
 * Windows touch injection succeeds, the click fires at the hand
 * point via a real touch event (mouse cursor untouched). If touch
 * injection fails or is unavailable (non-Windows, restricted env,
 * elevated target window), the gesture is simply dropped and a
 * one-time log line tells the user why. The user can still:
 *   • use their physical mouse normally — Swoosh never claims it
 *   • use the keyboard
 *   • use the hand for swipes (Alt+Tab via keystroke — no cursor)
 *
 * Per-gesture mapping:
 *
 *   pinchDown {left}  → touch pressDown   (or drop if touch unavail)
 *   tracking + drag   → touch pressMove   (idem)
 *   pinchUp   {left}  → touch pressUp     (idem)
 *   pinchDown {right} → drop (touch right-click via long-press is
 *                       awkward with an instant pinch; user uses
 *                       their mouse for right-click)
 *   scroll            → touch press → move → debounced release,
 *                       which the OS interprets as a pan/scroll
 *   swipe             → keystroke (Alt+Tab — global, no cursor)
 *   twoHandResize*    → main/windows/resize.ts (stub for now)
 *
 * Note: nut.js stays loaded for keystroke (swipe → Alt+Tab) and
 * resize integration. We never call moveCursor / mouseDown / mouseUp
 * from this router anymore.
 */

import type { GestureEmitPayload } from '@swoosh/shared/ipc';
import type { InputDispatcher } from './dispatcher';
import { mapToScreen } from './coords';
import { createResizeDispatcher } from '../windows/resize';
import { getTouchInjector } from './touch';
import { logger } from '../logger';

export interface GestureRouter {
  handle(payload: GestureEmitPayload): void;
  /** Pause routing while tracking is suspended. */
  setEnabled(enabled: boolean): void;
}

const DRAG_MOVE_THROTTLE_MS = 1000 / 120;
const SCROLL_IDLE_RELEASE_MS = 250;

export function createGestureRouter(input: InputDispatcher): GestureRouter {
  let enabled = true;
  let lastDragMoveAt = 0;
  const resize = createResizeDispatcher();
  const touch = getTouchInjector();

  if (touch.available) {
    logger.info('gestureRouter: touch injection active — hand input is independent of the mouse');
  } else {
    logger.warn(
      'gestureRouter: touch injection unavailable — hand clicks/drags will be silently dropped; user can still use mouse + keyboard',
    );
  }

  let dragActive = false;
  let dragLastPt: { x: number; y: number } | null = null;
  let scrollActive = false;
  let scrollLastPt: { x: number; y: number } | null = null;
  let scrollReleaseTimer: ReturnType<typeof setTimeout> | null = null;

  function clearScrollTimer(): void {
    if (scrollReleaseTimer) {
      clearTimeout(scrollReleaseTimer);
      scrollReleaseTimer = null;
    }
  }

  function endScroll(): void {
    if (!scrollActive || !scrollLastPt) {
      scrollActive = false;
      scrollLastPt = null;
      return;
    }
    touch.pressUp(scrollLastPt.x, scrollLastPt.y);
    scrollActive = false;
    scrollLastPt = null;
  }

  return {
    setEnabled(next) {
      enabled = next;
      if (!enabled) {
        // Release any in-flight touch contact so we don't leak a
        // held button into the OS when the user pauses tracking.
        if (dragActive && dragLastPt) {
          touch.pressUp(dragLastPt.x, dragLastPt.y);
          dragActive = false;
          dragLastPt = null;
        }
        clearScrollTimer();
        endScroll();
      }
    },
    handle(payload) {
      if (!enabled) return;
      const g = payload.gesture;

      switch (g.kind) {
        case 'pinchDown': {
          if (g.button !== 'left' || !touch.available) {
            // Right-click and touch-unavailable left-click both drop.
            // The mouse cursor must stay where the user left it.
            break;
          }
          const pt = mapToScreen(payload.cursor);
          if (touch.pressDown(pt.x, pt.y)) {
            dragActive = true;
            dragLastPt = pt;
          }
          break;
        }

        case 'pinchUp': {
          if (!dragActive || !dragLastPt) break;
          touch.pressUp(dragLastPt.x, dragLastPt.y);
          dragActive = false;
          dragLastPt = null;
          break;
        }

        case 'click':
          // Down/up pair already handles it; click is informational.
          break;

        case 'scroll': {
          if (!touch.available) break; // user can scroll with mouse wheel
          const pt = mapToScreen(payload.cursor);
          if (!scrollActive) {
            if (touch.pressDown(pt.x, pt.y)) {
              scrollActive = true;
              scrollLastPt = pt;
            }
          } else {
            // Update the contact position to wherever the hand is now.
            // The OS interprets the continued contact movement as a
            // pan/scroll gesture on the element under the touch point.
            if (touch.pressMove(pt.x, pt.y)) {
              scrollLastPt = pt;
            }
          }
          // Reset the idle-release timer — as long as scroll events
          // keep coming we keep the contact alive.
          clearScrollTimer();
          scrollReleaseTimer = setTimeout(() => {
            scrollReleaseTimer = null;
            endScroll();
          }, SCROLL_IDLE_RELEASE_MS);
          break;
        }

        case 'swipe': {
          // Alt+Tab is global — no cursor or touch involvement at all.
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
          // Drag mode: while a pinch is held, continue the touch
          // contact at the hand's new position so drag tracks the hand.
          if (!dragActive || !dragLastPt) break;
          const now = Date.now();
          if (now - lastDragMoveAt < DRAG_MOVE_THROTTLE_MS) break;
          lastDragMoveAt = now;
          const pt = mapToScreen(payload.cursor);
          if (touch.pressMove(pt.x, pt.y)) {
            dragLastPt = pt;
          }
          break;
        }

        case 'idle':
          // Defensive cleanup.
          if (dragActive && dragLastPt) {
            touch.pressUp(dragLastPt.x, dragLastPt.y);
            dragActive = false;
            dragLastPt = null;
          }
          clearScrollTimer();
          endScroll();
          break;
      }
    },
  };
}
