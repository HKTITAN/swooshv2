/**
 * Gesture state machine — pure reducer.
 *
 * Input: a per-frame snapshot of HandLandmarks plus the user's
 * configured thresholds. Output: zero or more Gesture events and the
 * smoothed pointer position in normalized camera coords [0..1].
 *
 * No side effects. No DOM. No Electron. This is unit-tested in
 * isolation against synthetic landmark sequences.
 *
 * Scope at this stage (T025): tracking/idle/pinch states with
 * hysteresis for left + right click. Drag-distance heuristic for
 * synthesizing a click only when pinch-down → pinch-up moved less
 * than the configured threshold. Open-palm scroll/swipe and
 * two-hand resize are added in later phases (T400+, T600+).
 */

import type { FsmStepResult, Gesture, HandLandmarks } from '../types';
import { LANDMARK } from '../types';
import { pinchAnchor, pinchDistance } from './landmarks';
import { OneEuroFilter2D } from './filters';

export type PinchButton = 'left' | 'right';

export interface FsmThresholds {
  /** Distance below which a pinch is considered "closed". */
  pinchEnterThreshold: number;
  /** Distance above which a pinch is considered "opened". Must exceed enter. */
  pinchExitThreshold: number;
  /**
   * Movement (in normalized units) between pinch-down and pinch-up
   * above which the gesture is treated as a drag rather than a click.
   * Default ~0.01 of frame width ≈ ~13 px at 1280px wide.
   */
  clickDragThreshold?: number;
  /**
   * Safety: if a pinch is held longer than this many ms with cursor
   * movement under `dragLockMaxTravel`, force-release. Prevents the
   * user from getting stuck in a drag-lock when their hand goes still.
   * Default 5000 ms.
   */
  dragLockTimeoutMs?: number;
  /** See dragLockTimeoutMs. Default 0.006 (≈ 8 px at 1280px wide). */
  dragLockMaxTravel?: number;
  smoothing: { minCutoff: number; beta: number };
}

export type FsmKind = 'IDLE' | 'TRACKING' | 'PINCH_LEFT' | 'PINCH_RIGHT';

interface PinchSubstate {
  button: PinchButton;
  /** Pointer position when the pinch fired down (normalized). */
  downAt: { x: number; y: number };
  /** Furthest distance traveled since pinch-down (normalized). */
  maxTravel: number;
  /** Frame timestamp of pinch-down. */
  downTs: number;
}

export interface FsmState {
  kind: FsmKind;
  /** Smoothing filter for the pointer anchor. */
  pointerFilter: OneEuroFilter2D;
  /** Active pinch info, when kind === PINCH_*. */
  pinch?: PinchSubstate;
  /** Last smoothed pointer position. */
  lastPointer: { x: number; y: number };
}

export function createFsmState(thresholds: FsmThresholds): FsmState {
  return {
    kind: 'IDLE',
    pointerFilter: new OneEuroFilter2D({
      minCutoff: thresholds.smoothing.minCutoff,
      beta: thresholds.smoothing.beta,
    }),
    lastPointer: { x: 0.5, y: 0.5 },
  };
}

/** Whether a thumb+finger pair is currently closed (post-hysteresis aware). */
function isClosed(
  d: number,
  alreadyClosed: boolean,
  enter: number,
  exit: number,
): boolean {
  if (alreadyClosed) {
    // Stay closed until distance exceeds the (larger) exit threshold.
    return d <= exit;
  }
  return d <= enter;
}

/**
 * Single FSM tick.
 *
 * @param prev   prior state (mutated in-place for pointer filter, returned)
 * @param hands  zero or more detected hands for this frame
 * @param thr    current thresholds
 * @returns      { state, events, pointer } — pointer is the smoothed anchor
 */
export function step(
  prev: FsmState,
  hands: HandLandmarks[],
  thr: FsmThresholds,
): { state: FsmState; events: Gesture[]; pointer: { x: number; y: number } } {
  // No hands: go idle (release any active pinch).
  if (hands.length === 0) {
    const events: Gesture[] = [];
    if (prev.kind === 'PINCH_LEFT' || prev.kind === 'PINCH_RIGHT') {
      const button: PinchButton = prev.kind === 'PINCH_LEFT' ? 'left' : 'right';
      events.push({ kind: 'pinchUp', button });
      // No click synthesized — losing the hand is not a click.
    }
    events.push({ kind: 'idle' });
    prev.kind = 'IDLE';
    prev.pinch = undefined;
    prev.pointerFilter.reset();
    return { state: prev, events, pointer: prev.lastPointer };
  }

  // Pick the most-confident hand for single-hand gestures.
  const hand = hands.reduce((best, h) => (h.score > best.score ? h : best), hands[0]!);

  // Smooth the pointer anchor.
  const rawAnchor = pinchAnchor(hand);
  const pointer = prev.pointerFilter.filter(rawAnchor.x, rawAnchor.y, hand.ts);
  prev.lastPointer = pointer;

  const dIndex = pinchDistance(hand, LANDMARK.THUMB_TIP, LANDMARK.INDEX_TIP);
  const dMiddle = pinchDistance(hand, LANDMARK.THUMB_TIP, LANDMARK.MIDDLE_TIP);

  const wasLeftClosed = prev.kind === 'PINCH_LEFT';
  const wasRightClosed = prev.kind === 'PINCH_RIGHT';
  const leftClosed = isClosed(
    dIndex,
    wasLeftClosed,
    thr.pinchEnterThreshold,
    thr.pinchExitThreshold,
  );
  const rightClosed = isClosed(
    dMiddle,
    wasRightClosed,
    thr.pinchEnterThreshold,
    thr.pinchExitThreshold,
  );

  const events: Gesture[] = [];
  const dragThreshold = thr.clickDragThreshold ?? 0.01;

  // State transitions.
  // Priority: keep currently-active pinch sticky until it physically opens.
  const dragLockTimeout = thr.dragLockTimeoutMs ?? 5000;
  const dragLockMaxTravel = thr.dragLockMaxTravel ?? 0.006;

  if (prev.kind === 'PINCH_LEFT') {
    // Track travel.
    if (prev.pinch) {
      const dx = pointer.x - prev.pinch.downAt.x;
      const dy = pointer.y - prev.pinch.downAt.y;
      const travel = Math.hypot(dx, dy);
      if (travel > prev.pinch.maxTravel) prev.pinch.maxTravel = travel;
    }

    // Drag-lock safety: if pinch held too long with too little movement,
    // force-release as if the user opened their fingers.
    if (
      prev.pinch &&
      hand.ts - prev.pinch.downTs > dragLockTimeout &&
      prev.pinch.maxTravel < dragLockMaxTravel
    ) {
      events.push({ kind: 'pinchUp', button: 'left' });
      prev.kind = 'TRACKING';
      prev.pinch = undefined;
      events.push({ kind: 'tracking' });
      return { state: prev, events, pointer };
    }

    if (!leftClosed) {
      events.push({ kind: 'pinchUp', button: 'left' });
      const wasDrag = (prev.pinch?.maxTravel ?? 0) > dragThreshold;
      if (!wasDrag) {
        events.push({ kind: 'click', button: 'left' });
      }
      prev.kind = 'TRACKING';
      prev.pinch = undefined;
      events.push({ kind: 'tracking' });
    } else {
      events.push({ kind: 'tracking' });
    }
  } else if (prev.kind === 'PINCH_RIGHT') {
    if (prev.pinch) {
      const dx = pointer.x - prev.pinch.downAt.x;
      const dy = pointer.y - prev.pinch.downAt.y;
      const travel = Math.hypot(dx, dy);
      if (travel > prev.pinch.maxTravel) prev.pinch.maxTravel = travel;
    }

    if (
      prev.pinch &&
      hand.ts - prev.pinch.downTs > dragLockTimeout &&
      prev.pinch.maxTravel < dragLockMaxTravel
    ) {
      events.push({ kind: 'pinchUp', button: 'right' });
      prev.kind = 'TRACKING';
      prev.pinch = undefined;
      events.push({ kind: 'tracking' });
      return { state: prev, events, pointer };
    }

    if (!rightClosed) {
      events.push({ kind: 'pinchUp', button: 'right' });
      const wasDrag = (prev.pinch?.maxTravel ?? 0) > dragThreshold;
      if (!wasDrag) {
        events.push({ kind: 'click', button: 'right' });
      }
      prev.kind = 'TRACKING';
      prev.pinch = undefined;
      events.push({ kind: 'tracking' });
    } else {
      events.push({ kind: 'tracking' });
    }
  } else {
    // IDLE or TRACKING: see if a new pinch starts. Left wins ties.
    if (leftClosed) {
      events.push({ kind: 'pinchDown', button: 'left' });
      prev.kind = 'PINCH_LEFT';
      prev.pinch = {
        button: 'left',
        downAt: { x: pointer.x, y: pointer.y },
        maxTravel: 0,
        downTs: hand.ts,
      };
    } else if (rightClosed) {
      events.push({ kind: 'pinchDown', button: 'right' });
      prev.kind = 'PINCH_RIGHT';
      prev.pinch = {
        button: 'right',
        downAt: { x: pointer.x, y: pointer.y },
        maxTravel: 0,
        downTs: hand.ts,
      };
    } else {
      if (prev.kind !== 'TRACKING') {
        prev.kind = 'TRACKING';
      }
      events.push({ kind: 'tracking' });
    }
  }

  return { state: prev, events, pointer };
}

/** Build a FsmStepResult from the reducer output (used by callers). */
export function toStepResult(
  out: { events: Gesture[]; pointer: { x: number; y: number } },
): FsmStepResult {
  return { events: out.events, pointer: out.pointer };
}
