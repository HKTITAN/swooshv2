import { describe, expect, it } from 'vitest';
import { createFsmState, step, type FsmThresholds } from './fsm';
import type { HandLandmarks, Landmark } from '../types';
import { LANDMARK } from '../types';

const DEFAULT_THR: FsmThresholds = {
  pinchEnterThreshold: 0.06,
  pinchExitThreshold: 0.085,
  // High cutoff + zero beta = near-passthrough filter, so the FSM's
  // pointer anchor closely tracks the raw landmark midpoint and we
  // can reason about click-vs-drag in unit tests deterministically.
  smoothing: { minCutoff: 10000, beta: 0 },
  clickDragThreshold: 0.01,
};

/**
 * Build a synthetic hand where every point is at (0, 0) except the
 * ones we override. We mostly care about thumb-tip vs index-tip /
 * middle-tip distance, plus the wrist+MCP knuckles for isHandOpen
 * (not exercised here).
 */
function makeHand(
  overrides: Partial<Record<number, { x: number; y: number }>>,
  opts: { ts?: number; score?: number } = {},
): HandLandmarks {
  const points: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [idx, p] of Object.entries(overrides)) {
    const i = Number(idx);
    points[i] = { x: p!.x, y: p!.y, z: 0 };
  }
  return {
    points,
    handedness: 'Right',
    score: opts.score ?? 0.95,
    ts: opts.ts ?? 0,
  };
}

/**
 * Build a hand for FSM tests where the pinch midpoint (= FSM pointer
 * anchor, thumb+index midpoint) stays at `pointer` regardless of `dist`
 * and regardless of which finger is the active pinching tip.
 *
 * Left pinch: thumb and index are placed symmetrically around `pointer`.
 *   Middle is parked far away so right-pinch never fires.
 * Right pinch: thumb and middle are placed symmetrically around `pointer`.
 *   Index is placed at the SAME location as the thumb, so the thumb+index
 *   midpoint sits AT the thumb (which itself sits half of `dist` away
 *   from `pointer`). That introduces a tiny anchor drift bounded by
 *   `dist/2`, which is below the click drag threshold for the small
 *   `dist` values we use in pinch tests.
 */
function handWithPinchDistance(
  dist: number,
  opts: { which?: 'index' | 'middle'; ts?: number; pointer?: { x: number; y: number } } = {},
): HandLandmarks {
  const which = opts.which ?? 'index';
  const pointer = opts.pointer ?? { x: 0.5, y: 0.5 };
  const half = dist / 2;
  const overrides: Record<number, { x: number; y: number }> = {};
  if (which === 'index') {
    overrides[LANDMARK.THUMB_TIP] = { x: pointer.x - half, y: pointer.y };
    overrides[LANDMARK.INDEX_TIP] = { x: pointer.x + half, y: pointer.y };
    overrides[LANDMARK.MIDDLE_TIP] = { x: pointer.x + 0.5, y: pointer.y };
  } else {
    // Right pinch: keep thumb pinned at `pointer` so the thumb+index
    // midpoint stays stable across frames. Vary `dist` by moving the
    // middle finger. Index is parked at a fixed offset just past the
    // exit threshold so left-pinch stays open and the anchor stays at
    // (pointer.x + 0.06, pointer.y) regardless of `dist`.
    overrides[LANDMARK.THUMB_TIP] = { x: pointer.x, y: pointer.y };
    overrides[LANDMARK.MIDDLE_TIP] = { x: pointer.x, y: pointer.y + dist };
    overrides[LANDMARK.INDEX_TIP] = { x: pointer.x + 0.12, y: pointer.y };
  }
  return makeHand(overrides, { ts: opts.ts });
}

function kinds(events: { kind: string }[]) {
  return events.map((e) => e.kind);
}

describe('FSM — basic transitions', () => {
  it('empty hand list goes idle and resets', () => {
    const s = createFsmState(DEFAULT_THR);
    const out = step(s, [], DEFAULT_THR);
    expect(kinds(out.events)).toEqual(['idle']);
    expect(out.state.kind).toBe('IDLE');
  });

  it('hand visible with fingers open → tracking', () => {
    const s = createFsmState(DEFAULT_THR);
    const hand = handWithPinchDistance(0.2); // wide open
    const out = step(s, [hand], DEFAULT_THR);
    expect(kinds(out.events)).toContain('tracking');
    expect(out.state.kind).toBe('TRACKING');
  });
});

describe('FSM — left pinch click', () => {
  it('emits pinchDown when fingers close past enter threshold', () => {
    const s = createFsmState(DEFAULT_THR);
    step(s, [handWithPinchDistance(0.2, { ts: 0 })], DEFAULT_THR);
    const out = step(s, [handWithPinchDistance(0.03, { ts: 16 })], DEFAULT_THR);
    expect(kinds(out.events)).toContain('pinchDown');
    const pd = out.events.find((e) => e.kind === 'pinchDown');
    expect(pd && 'button' in pd ? pd.button : null).toBe('left');
    expect(out.state.kind).toBe('PINCH_LEFT');
  });

  it('emits pinchUp + click on quick close→open with no movement', () => {
    const s = createFsmState(DEFAULT_THR);
    step(s, [handWithPinchDistance(0.2, { ts: 0 })], DEFAULT_THR);
    step(s, [handWithPinchDistance(0.03, { ts: 16 })], DEFAULT_THR);
    const out = step(s, [handWithPinchDistance(0.2, { ts: 32 })], DEFAULT_THR);
    expect(kinds(out.events)).toContain('pinchUp');
    expect(kinds(out.events)).toContain('click');
    expect(out.state.kind).toBe('TRACKING');
  });

  it('suppresses click when pointer moved during pinch (drag)', () => {
    const s = createFsmState(DEFAULT_THR);
    step(s, [handWithPinchDistance(0.2, { ts: 0, pointer: { x: 0.5, y: 0.5 } })], DEFAULT_THR);
    step(s, [handWithPinchDistance(0.03, { ts: 16, pointer: { x: 0.5, y: 0.5 } })], DEFAULT_THR);
    // Move pointer well beyond the click-drag threshold.
    step(s, [handWithPinchDistance(0.03, { ts: 32, pointer: { x: 0.7, y: 0.5 } })], DEFAULT_THR);
    const out = step(
      s,
      [handWithPinchDistance(0.2, { ts: 48, pointer: { x: 0.7, y: 0.5 } })],
      DEFAULT_THR,
    );
    expect(kinds(out.events)).toContain('pinchUp');
    expect(kinds(out.events)).not.toContain('click');
  });
});

describe('FSM — hysteresis prevents flicker', () => {
  it('value between enter and exit thresholds keeps the pinch closed', () => {
    const s = createFsmState(DEFAULT_THR);
    // Open
    step(s, [handWithPinchDistance(0.2, { ts: 0 })], DEFAULT_THR);
    // Close
    step(s, [handWithPinchDistance(0.03, { ts: 16 })], DEFAULT_THR);
    expect(s.kind).toBe('PINCH_LEFT');
    // Distance jitters back up but stays below exit (0.085)
    const out = step(s, [handWithPinchDistance(0.07, { ts: 32 })], DEFAULT_THR);
    expect(s.kind).toBe('PINCH_LEFT');
    expect(kinds(out.events)).not.toContain('pinchUp');
  });

  it('value above exit threshold releases the pinch', () => {
    const s = createFsmState(DEFAULT_THR);
    step(s, [handWithPinchDistance(0.2, { ts: 0 })], DEFAULT_THR);
    step(s, [handWithPinchDistance(0.03, { ts: 16 })], DEFAULT_THR);
    const out = step(s, [handWithPinchDistance(0.1, { ts: 32 })], DEFAULT_THR);
    expect(kinds(out.events)).toContain('pinchUp');
    expect(s.kind).toBe('TRACKING');
  });
});

describe('FSM — right click variant', () => {
  it('thumb+middle close fires right-button pinch', () => {
    const s = createFsmState(DEFAULT_THR);
    step(s, [handWithPinchDistance(0.2, { ts: 0, which: 'middle' })], DEFAULT_THR);
    const out = step(
      s,
      [handWithPinchDistance(0.03, { ts: 16, which: 'middle' })],
      DEFAULT_THR,
    );
    const pd = out.events.find((e) => e.kind === 'pinchDown');
    expect(pd && 'button' in pd ? pd.button : null).toBe('right');
    expect(s.kind).toBe('PINCH_RIGHT');
  });

  it('emits right click when thumb+middle releases without drag', () => {
    const s = createFsmState(DEFAULT_THR);
    step(s, [handWithPinchDistance(0.2, { ts: 0, which: 'middle' })], DEFAULT_THR);
    step(s, [handWithPinchDistance(0.03, { ts: 16, which: 'middle' })], DEFAULT_THR);
    const out = step(
      s,
      [handWithPinchDistance(0.2, { ts: 32, which: 'middle' })],
      DEFAULT_THR,
    );
    const click = out.events.find((e) => e.kind === 'click');
    expect(click && 'button' in click ? click.button : null).toBe('right');
  });
});

function handForTieBreak(
  ts: number,
  opts: { indexOpen: boolean; middleOpen: boolean },
): HandLandmarks {
  const points: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[LANDMARK.THUMB_TIP] = { x: 0.5, y: 0.5, z: 0 };
  // Open ⇒ distance 0.2 (well above exit). Closed ⇒ distance 0.02 (well below enter).
  points[LANDMARK.INDEX_TIP] = opts.indexOpen
    ? { x: 0.5, y: 0.7, z: 0 }
    : { x: 0.51, y: 0.5, z: 0 };
  points[LANDMARK.MIDDLE_TIP] = opts.middleOpen
    ? { x: 0.7, y: 0.5, z: 0 }
    : { x: 0.5, y: 0.51, z: 0 };
  return { points, handedness: 'Right', score: 0.95, ts };
}

describe('FSM — tie-breaking (both fingers in range)', () => {
  it('prefers index (left) when index opened more recently than middle', () => {
    const s = createFsmState(DEFAULT_THR);
    // t=0: both open
    step(s, [handForTieBreak(0, { indexOpen: true, middleOpen: true })], DEFAULT_THR);
    // t=10: middle closes (now in PINCH_RIGHT), index still open → lastIndexOpenTs = 10
    // (We don't actually want to enter PINCH_RIGHT here; just record open ts.)
    // Simpler: keep both open through t=50, then on t=60 close both at once.
    step(s, [handForTieBreak(50, { indexOpen: true, middleOpen: true })], DEFAULT_THR);
    // At this point both lastIndexOpenTs and lastMiddleOpenTs == 50.
    // Now manually skew: make middle "closed" for one frame so its
    // lastMiddleOpenTs stops updating; index still open.
    // But this would cause PINCH_RIGHT to fire. To avoid that, set state
    // directly:
    s.lastIndexOpenTs = 100;
    s.lastMiddleOpenTs = 50;
    // Now close both fingers on the same frame.
    const out = step(
      s,
      [handForTieBreak(200, { indexOpen: false, middleOpen: false })],
      DEFAULT_THR,
    );
    const pd = out.events.find((e) => e.kind === 'pinchDown');
    expect(pd && 'button' in pd ? pd.button : null).toBe('left');
  });

  it('prefers middle (right) when middle opened more recently than index', () => {
    const s = createFsmState(DEFAULT_THR);
    s.lastIndexOpenTs = 50;
    s.lastMiddleOpenTs = 100;
    const out = step(
      s,
      [handForTieBreak(200, { indexOpen: false, middleOpen: false })],
      DEFAULT_THR,
    );
    const pd = out.events.find((e) => e.kind === 'pinchDown');
    expect(pd && 'button' in pd ? pd.button : null).toBe('right');
  });
});

describe('FSM — losing the hand', () => {
  it('emits pinchUp + idle when hand disappears mid-pinch', () => {
    const s = createFsmState(DEFAULT_THR);
    step(s, [handWithPinchDistance(0.2, { ts: 0 })], DEFAULT_THR);
    step(s, [handWithPinchDistance(0.03, { ts: 16 })], DEFAULT_THR);
    const out = step(s, [], DEFAULT_THR);
    expect(kinds(out.events)).toContain('pinchUp');
    expect(kinds(out.events)).toContain('idle');
    expect(out.events.some((e) => e.kind === 'click')).toBe(false);
    expect(s.kind).toBe('IDLE');
  });
});
