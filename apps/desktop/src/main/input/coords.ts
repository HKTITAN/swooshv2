/**
 * Coordinate mapping: normalized camera coords (0..1) → OS logical
 * pixels on the user's screen.
 *
 * MediaPipe returns landmark positions in the camera frame's
 * normalized space. The user wants the cursor to land on the place
 * where their fingers POINT relative to their screen, so we map
 * normalized x/y onto the active display's bounds.
 *
 * Mirroring: webcams mirror by convention (you point right with your
 * hand, the on-screen mirror shows it on the left), but humans
 * intuitively expect the cursor to follow their hand in real space.
 * We flip x to compensate. y is not flipped — top-of-frame already
 * corresponds to top-of-screen.
 */

import { screen, type Display, type Point, type Rectangle } from 'electron';

export interface MapOptions {
  /** Mirror x to match the user's real-world hand position. */
  mirrorX?: boolean;
  /** Override the target display; defaults to the one containing the cursor. */
  display?: Display;
}

function activeDisplay(): Display {
  const cursor = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursor);
}

/**
 * Map a normalized [0..1] coordinate to a logical pixel point on the
 * target display. Returns the absolute screen point, which is what
 * nut.js expects for `mouse.setPosition`.
 */
export function mapToScreen(
  norm: { x: number; y: number },
  opts: MapOptions = {},
): Point {
  const display = opts.display ?? activeDisplay();
  const mirror = opts.mirrorX ?? true;
  const xNorm = mirror ? 1 - norm.x : norm.x;
  const wa: Rectangle = display.workArea;
  return {
    x: Math.round(wa.x + xNorm * wa.width),
    y: Math.round(wa.y + norm.y * wa.height),
  };
}

/**
 * Convert a *delta* in normalized space (e.g., scroll dy from a palm
 * motion gesture) to a logical pixel delta on the active display.
 */
export function deltaToScreen(
  delta: { x: number; y: number },
  opts: MapOptions = {},
): Point {
  const display = opts.display ?? activeDisplay();
  const mirror = opts.mirrorX ?? true;
  const sx = mirror ? -1 : 1;
  return {
    x: Math.round(sx * delta.x * display.workArea.width),
    y: Math.round(delta.y * display.workArea.height),
  };
}
