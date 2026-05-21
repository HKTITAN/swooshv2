import { describe, expect, it } from 'vitest';
import { OneEuroFilter, OneEuroFilter2D } from './filters';

describe('OneEuroFilter', () => {
  it('returns the first sample unchanged on bootstrap', () => {
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0.05 });
    expect(f.filter(0.5, 0)).toBeCloseTo(0.5, 6);
  });

  it('converges towards a step input over many frames', () => {
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0.05 });
    let last = f.filter(0, 0);
    // Step to 1.0 at 60 Hz; after ~30 frames the smoothed value should be
    // well above 0.5 and approaching 1.0.
    for (let i = 1; i <= 60; i++) {
      last = f.filter(1, i * (1000 / 60));
    }
    expect(last).toBeGreaterThan(0.9);
    expect(last).toBeLessThanOrEqual(1);
  });

  it('damps stationary zero-mean noise around a constant signal', () => {
    const f = new OneEuroFilter({ minCutoff: 0.5, beta: 0.01 });
    const samples: number[] = [];
    // Stationary noise (no random walk): raw = 0.5 + epsilon
    // Use a deterministic sequence so the test isn't flaky.
    for (let i = 0; i < 200; i++) {
      const eps = ((i * 9301 + 49297) % 233280) / 233280 - 0.5; // PRNG, [-0.5..0.5]
      const raw = 0.5 + eps * 0.04; // amplitude ±0.02
      samples.push(f.filter(raw, i * (1000 / 60)));
    }
    const tail = samples.slice(-60);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.02);

    // And the smoothed variance is well below the raw variance.
    const tailVar =
      tail.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / tail.length;
    expect(tailVar).toBeLessThan(0.0005);
  });

  it('reset() clears history so the next sample is returned as-is', () => {
    const f = new OneEuroFilter();
    for (let i = 0; i < 10; i++) f.filter(0, i * 16);
    f.reset();
    expect(f.filter(1, 1000)).toBeCloseTo(1, 6);
  });

  it('configure() updates parameters live', () => {
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0.05 });
    f.filter(0, 0);
    f.configure({ minCutoff: 10, beta: 0.5 });
    // After bumping cutoff way up, the filter should track input quickly.
    const out = f.filter(1, 1000 / 60);
    expect(out).toBeGreaterThan(0.5);
  });
});

describe('OneEuroFilter2D', () => {
  it('smooths x and y independently', () => {
    const f = new OneEuroFilter2D({ minCutoff: 1.0, beta: 0.05 });
    let p = f.filter(0, 0, 0);
    for (let i = 1; i <= 60; i++) {
      p = f.filter(1, 0.5, i * (1000 / 60));
    }
    expect(p.x).toBeGreaterThan(0.9);
    expect(p.y).toBeGreaterThan(0.45);
    expect(p.y).toBeLessThan(0.55);
  });
});
