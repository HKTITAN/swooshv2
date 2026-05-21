/**
 * Two-hand resize dispatcher (T602).
 *
 * The FSM emits `twoHandResizeStart` / `twoHandResizeDelta { scale }` /
 * `twoHandResizeEnd`. This module turns the scale stream into a window
 * resize on the *currently focused* OS window (i.e., not one of our own
 * BrowserWindows — the user's foreground app).
 *
 * Current status: STUB. Actually resizing an arbitrary foreground
 * window requires platform-native APIs (Win32 SetWindowPos, NSWindow
 * setFrame, X11 XMoveResizeWindow) that aren't in nut.js's surface.
 * Wiring those up cleanly is a separate workstream — see
 * `tasks.md` T602 follow-up note.
 *
 * For now this module:
 *   - Records the baseline frame on `twoHandResizeStart` (placeholder).
 *   - Logs deltas at 4Hz so we can see them in the dev log.
 *   - Clamps scale to a sensible range [0.25, 4.0] to prevent absurd
 *     values from accidental finger jitter.
 *
 * The visual feedback (the dashed line + "↔ Resize" badge on the
 * overlay) is rendered renderer-side in T603 — that part DOES land
 * end-to-end, so the user gets immediate UI confirmation that the
 * gesture is being recognized.
 */

import { logger } from '../logger';

const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;
const LOG_THROTTLE_MS = 250;

export interface ResizeDispatcher {
  begin(): void;
  applyScale(scale: number): void;
  end(): void;
}

export function createResizeDispatcher(): ResizeDispatcher {
  let active = false;
  let lastLog = 0;

  return {
    begin() {
      active = true;
      lastLog = 0;
      logger.info('two-hand resize gesture started (T602 stub — visual feedback only)');
    },
    applyScale(scale) {
      if (!active) return;
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
      const now = Date.now();
      if (now - lastLog >= LOG_THROTTLE_MS) {
        logger.info('two-hand resize delta', { scale: clamped });
        lastLog = now;
      }
      // TODO(T602-followup): actual OS-level focused-window resize.
      // Likely path: spawn `nut.js` extension or a small Win32/AppKit/X11
      // bridge; resize the focused window from its current frame by
      // `clamped / lastApplied` so successive frames compose correctly.
    },
    end() {
      if (!active) return;
      active = false;
      logger.info('two-hand resize gesture ended');
    },
  };
}
