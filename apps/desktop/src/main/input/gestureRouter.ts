/**
 * Gesture router — turns FSM events from the overlay renderer into
 * concrete OS-level input.
 *
 * Two backends:
 *
 *   1. **Touch injection** (Windows, when available). Uses
 *      `InjectTouchInput` to fire taps and drags as touch events that
 *      the OS treats as a separate input channel. The mouse cursor is
 *      never touched. This is the Quest / Vision Pro behavior — hand
 *      and mouse coexist as independent input modalities.
 *
 *   2. **Mouse with save/restore** (fallback for non-Windows, or when
 *      touch injection initialization fails). Saves the user's
 *      physical mouse position, jumps the cursor to the hand point to
 *      fire the synthesized event, then snaps the cursor back. End
 *      state: mouse where the user left it. There's a brief visible
 *      flicker for the duration of each event.
 *
 * Per-gesture mapping (touch backend; mouse fallback in parens):
 *
 *   pinchDown {left}  → touch pressDown          (save + jump + mouseDown)
 *   tracking + drag   → touch pressMove          (jump cursor)
 *   pinchUp   {left}  → touch pressUp            (mouseUp + restore)
 *   pinchDown {right} → mouse save+jump+mouseDown(no touch right-click; same)
 *   pinchUp   {right} → mouse mouseUp + restore  (same)
 *   click             → no-op (down/up pair handles it)
 *   scroll            → mouse save+jump+scroll, debounced restore
 *   swipe             → keystroke (no cursor jump regardless of backend)
 *   twoHandResize*    → main/windows/resize.ts
 *
 * Right-click via touch on Windows is a long-press (≥ ~600 ms), which
 * doesn't match our thumb+middle pinch model. Right-click stays on
 * the mouse path for both backends.
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
const SCROLL_IDLE_RESTORE_MS = 250;

export function createGestureRouter(input: InputDispatcher): GestureRouter {
  let enabled = true;
  let lastDragMoveAt = 0;
  const resize = createResizeDispatcher();
  const touch = getTouchInjector();

  if (touch.available) {
    logger.info('gestureRouter: using touch injection (mouse cursor untouched)');
  } else {
    logger.info('gestureRouter: using mouse with save/restore fallback');
  }

  // Mouse-fallback state (right-click + scroll always use this path,
  // and the whole router uses it on non-Windows).
  let savedCursorPos: { x: number; y: number } | null = null;
  let scrollRestoreTimer: ReturnType<typeof setTimeout> | null = null;

  // Active drag state. With touch backend, this is the touch contact
  // we'll dispatch pressMove / pressUp against. With mouse backend
  // it's a flag indicating the cursor should follow the hand.
  let drag:
    | { kind: 'touch'; lastPt: { x: number; y: number } }
    | { kind: 'mouseLeft'; lastPt: { x: number; y: number } }
    | { kind: 'mouseRight' }
    | null = null;

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

  function clearScrollTimer(): void {
    if (scrollRestoreTimer) {
      clearTimeout(scrollRestoreTimer);
      scrollRestoreTimer = null;
    }
  }

  function toScreen(norm: { x: number; y: number }): { x: number; y: number } {
    return mapToScreen(norm);
  }

  return {
    setEnabled(next) {
      enabled = next;
      if (!enabled) {
        // Pause: release any held drag / contact and restore cursor.
        if (drag) {
          if (drag.kind === 'touch') {
            touch.pressUp(drag.lastPt.x, drag.lastPt.y);
          } else if (drag.kind === 'mouseLeft') {
            void input.mouseUp('left');
          } else {
            void input.mouseUp('right');
          }
          drag = null;
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
          const pt = toScreen(payload.cursor);

          if (g.button === 'left' && touch.available) {
            // Touch backend: fire a sustained touch contact. The OS
            // cursor never moves.
            const ok = touch.pressDown(pt.x, pt.y);
            if (ok) {
              drag = { kind: 'touch', lastPt: pt };
              break;
            }
            logger.warn('touch.pressDown failed; falling back to mouse for this gesture');
            // fallthrough to mouse path
          }

          // Mouse path: save physical cursor, jump, mouseDown.
          saveCursorOnce();
          void input.moveCursor(pt.x, pt.y);
          void input.mouseDown(g.button);
          drag =
            g.button === 'left'
              ? { kind: 'mouseLeft', lastPt: pt }
              : { kind: 'mouseRight' };
          break;
        }

        case 'pinchUp': {
          if (!drag) {
            // Defensive — out-of-order events. Just release the named button.
            void input.mouseUp(g.button);
            break;
          }
          if (drag.kind === 'touch') {
            const pt = drag.lastPt;
            touch.pressUp(pt.x, pt.y);
            // Touch backend doesn't touch the mouse, so nothing to
            // restore — there was never a saved cursor.
            drag = null;
            break;
          }
          // Mouse path.
          const button = drag.kind === 'mouseLeft' ? 'left' : 'right';
          void input.mouseUp(button);
          drag = null;
          restoreCursor();
          break;
        }

        case 'click':
          // The down/up pair already covers it.
          break;

        case 'scroll': {
          // Scroll wheel events fire at the cursor. We use the mouse
          // path for scroll regardless of backend because synthetic
          // touch scroll requires sustained drag motion to be
          // interpreted as scrolling, which doesn't map well to our
          // continuous palm-motion event stream.
          saveCursorOnce();
          clearScrollTimer();
          const pt = toScreen(payload.cursor);
          void input.moveCursor(pt.x, pt.y);
          const dxPx = Math.round(g.dx * 200);
          const dyPx = Math.round(g.dy * 200);
          void input.scroll(dxPx, dyPx);
          scrollRestoreTimer = setTimeout(() => {
            scrollRestoreTimer = null;
            if (!drag) restoreCursor();
          }, SCROLL_IDLE_RESTORE_MS);
          break;
        }

        case 'swipe': {
          // Alt+Tab is global — no cursor jump on either backend.
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
          // Drag mode: while a pinch is held, update the contact (or
          // cursor on the mouse fallback) at the hand's new position
          // so drag-and-drop / touch pan tracks the hand.
          if (!drag) break;
          const now = Date.now();
          if (now - lastDragMoveAt < DRAG_MOVE_THROTTLE_MS) break;
          lastDragMoveAt = now;
          const pt = toScreen(payload.cursor);
          if (drag.kind === 'touch') {
            touch.pressMove(pt.x, pt.y);
            drag.lastPt = pt;
          } else if (drag.kind === 'mouseLeft') {
            void input.moveCursor(pt.x, pt.y);
            drag.lastPt = pt;
          }
          // mouseRight drag doesn't move the cursor — right-click+drag
          // is a niche interaction we don't support today.
          break;
        }

        case 'idle':
          // Defensive cleanup.
          if (drag) {
            if (drag.kind === 'touch') {
              touch.pressUp(drag.lastPt.x, drag.lastPt.y);
            } else if (drag.kind === 'mouseLeft') {
              void input.mouseUp('left');
            } else {
              void input.mouseUp('right');
            }
            drag = null;
          }
          clearScrollTimer();
          restoreCursor();
          break;
      }
    },
  };
}
