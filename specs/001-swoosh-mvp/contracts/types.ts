/**
 * Core types shared between main and renderer.
 * Implementation lives at packages/shared/src/types.ts.
 */

export type Handedness = "Left" | "Right";

/** A single MediaPipe landmark, normalized to camera frame [0..1]. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** Optional per-landmark visibility/confidence, 0..1. */
  visibility?: number;
}

/** Indices into HandLandmarks.points per MediaPipe hand model. */
export const LANDMARK = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  INDEX_MCP: 5,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
} as const;

export interface HandLandmarks {
  /** 21 landmarks per MediaPipe hand model. */
  points: Landmark[];
  handedness: Handedness;
  /** Detection confidence 0..1. */
  score: number;
  /** Frame timestamp in ms (performance.now()). */
  ts: number;
}

/** A classified gesture emitted by the FSM. */
export type Gesture =
  | { kind: "idle" }
  | { kind: "tracking" }
  | { kind: "pinchDown"; button: "left" | "right" }
  | { kind: "pinchUp"; button: "left" | "right" }
  | { kind: "click"; button: "left" | "right" }
  | { kind: "scroll"; dx: number; dy: number }
  | { kind: "swipe"; direction: "left" | "right" | "up" | "down" }
  | { kind: "twoHandResizeStart" }
  | { kind: "twoHandResizeDelta"; scale: number }
  | { kind: "twoHandResizeEnd" };

/**
 * Output of the gesture FSM step function.
 * Multiple events may be emitted per frame (e.g., pinchUp + click).
 */
export interface FsmStepResult {
  events: Gesture[];
  /** Pointer position in normalized coords [0..1] within the camera frame. */
  pointer: { x: number; y: number };
}
