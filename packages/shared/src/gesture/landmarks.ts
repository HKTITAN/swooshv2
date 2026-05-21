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
