/**
 * Pure helpers over HandLandmarks. Used by the gesture FSM and overlay
 * renderer. No side effects, no Electron, no DOM.
 */

import { LANDMARK, type HandLandmarks, type Landmark } from '../types';

/** Euclidean distance between two landmarks in the xy-plane. */
export function distance2D(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** 3D Euclidean distance — used when z is meaningful (rare for pinch). */
export function distance3D(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Normalized fingertip pinch distance.
 * Uses 2D distance — fast and stable enough for thresholding. The
 * x/y inputs are already normalized to the camera frame by MediaPipe,
 * so the resulting value is roughly invariant to camera resolution.
 */
export function pinchDistance(
  hand: HandLandmarks,
  fingerA: number = LANDMARK.THUMB_TIP,
  fingerB: number = LANDMARK.INDEX_TIP,
): number {
  const a = hand.points[fingerA];
  const b = hand.points[fingerB];
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return distance2D(a, b);
}

/**
 * True if a finger is extended.
 * Heuristic: the fingertip is farther from the wrist than its MCP joint
 * (knuckle). This works well for the four non-thumb fingers regardless
 * of hand orientation.
 */
export function isFingerExtended(hand: HandLandmarks, tipIdx: number, mcpIdx: number): boolean {
  const wrist = hand.points[LANDMARK.WRIST];
  const tip = hand.points[tipIdx];
  const mcp = hand.points[mcpIdx];
  if (!wrist || !tip || !mcp) return false;
  return distance2D(tip, wrist) > distance2D(mcp, wrist);
}

/** True if all four non-thumb fingers are extended. */
export function isHandOpen(hand: HandLandmarks): boolean {
  return (
    isFingerExtended(hand, LANDMARK.INDEX_TIP, LANDMARK.INDEX_MCP) &&
    isFingerExtended(hand, LANDMARK.MIDDLE_TIP, LANDMARK.MIDDLE_MCP) &&
    isFingerExtended(hand, LANDMARK.RING_TIP, LANDMARK.RING_MCP) &&
    isFingerExtended(hand, LANDMARK.PINKY_TIP, LANDMARK.PINKY_MCP)
  );
}

/**
 * Approximate center of the palm. Average of the four MCP joints plus
 * the wrist — a cheap-but-stable proxy that doesn't jump when fingers move.
 */
export function palmCenter(hand: HandLandmarks): { x: number; y: number } {
  const indices = [
    LANDMARK.WRIST,
    LANDMARK.INDEX_MCP,
    LANDMARK.MIDDLE_MCP,
    LANDMARK.RING_MCP,
    LANDMARK.PINKY_MCP,
  ];
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const i of indices) {
    const p = hand.points[i];
    if (!p) continue;
    sx += p.x;
    sy += p.y;
    n++;
  }
  if (n === 0) return { x: 0, y: 0 };
  return { x: sx / n, y: sy / n };
}

/**
 * Midpoint between two landmarks. Used to anchor the cursor near the
 * pinch point so the user's intent (where the fingers meet) drives the
 * pointer, not the wrist.
 */
export function midpoint(a: Landmark, b: Landmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Pointer anchor for the FSM. Defaults to the midpoint of the thumb
 * and index fingertips so the cursor sits naturally inside the pinch.
 */
export function pinchAnchor(hand: HandLandmarks): { x: number; y: number } {
  const thumb = hand.points[LANDMARK.THUMB_TIP];
  const index = hand.points[LANDMARK.INDEX_TIP];
  if (!thumb || !index) return palmCenter(hand);
  return midpoint(thumb, index);
}

/**
 * Largest dimension of the hand's axis-aligned bounding box in
 * normalized [0..1] space. A close hand spans a large fraction of
 * the frame; a far hand spans a small one — so this is a stable
 * proxy for "how close is this hand to the camera". Robust to hand
 * pose (works whether the fingers are spread or curled) because
 * we use the whole landmark set.
 */
export function handSize(hand: HandLandmarks): number {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of hand.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

/**
 * Map hand size onto a 0..1 "presence" value used for distance-aware
 * fading of the on-screen overlay.
 *
 * - A hand that occupies < 10% of the frame's longest axis fades
 *   toward a 0.3 floor (still visible, but subtle).
 * - A hand that fills > 40% of the frame is fully opaque.
 * - Linear in between with a smooth ease so the fade reads as
 *   gradual rather than stepped.
 *
 * The 0.3 floor matters: when the user's hand drifts to the edge of
 * the frame the overlay shouldn't disappear (that would feel like a
 * bug), it should just feel less assertive.
 */
export function handPresence(hand: HandLandmarks): number {
  const NEAR = 0.4;
  const FAR = 0.1;
  const FLOOR = 0.3;
  const t = (handSize(hand) - FAR) / (NEAR - FAR);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  // Smoothstep for a gentler curve than pure linear.
  const eased = clamped * clamped * (3 - 2 * clamped);
  return FLOOR + (1 - FLOOR) * eased;
}
