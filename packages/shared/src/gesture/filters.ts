/**
 * 1-Euro low-pass filter for noisy continuous signals.
 *
 * Reference: "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy
 * Input in Interactive Systems", Casiez et al., CHI 2012.
 *
 * The filter applies a low-pass with an adaptive cutoff frequency that
 * scales with the signal's derivative. Small movements get heavy
 * smoothing (low cutoff) and fast movements get light smoothing (high
 * cutoff), which is exactly what you want for finger tracking: still
 * pointer = no jitter, fast pointer = no lag.
 *
 * Single-axis. For 2D / 3D landmarks, instantiate one filter per axis.
 */

export interface OneEuroOptions {
  /** Frequency in Hz. Defaults to 60. Updated dynamically on each filter() call. */
  freq?: number;
  /** Minimum cutoff frequency (Hz). Lower = more smoothing on slow signals. */
  minCutoff?: number;
  /** Speed coefficient. Higher = less smoothing on fast signals. */
  beta?: number;
  /** Cutoff frequency for the derivative low-pass. Defaults to 1.0. */
  dCutoff?: number;
}

const DEFAULTS = {
  freq: 60,
  minCutoff: 1.0,
  beta: 0.05,
  dCutoff: 1.0,
} as const;

/**
 * Smoothing factor for a discrete-time first-order low-pass filter,
 * derived from the cutoff frequency and current sample rate.
 */
function alpha(cutoff: number, freq: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  const te = 1 / freq;
  return 1 / (1 + tau / te);
}

class LowPass {
  private y: number | null = null;
  private s: number | null = null;

  filter(value: number, alphaVal: number): number {
    if (this.s === null) {
      this.s = value;
    } else {
      this.s = alphaVal * value + (1 - alphaVal) * this.s;
    }
    this.y = value;
    return this.s;
  }

  lastRaw(): number | null {
    return this.y;
  }

  reset(): void {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private x = new LowPass();
  private dx = new LowPass();
  private lastTs: number | null = null;

  constructor(opts: OneEuroOptions = {}) {
    this.freq = opts.freq ?? DEFAULTS.freq;
    this.minCutoff = opts.minCutoff ?? DEFAULTS.minCutoff;
    this.beta = opts.beta ?? DEFAULTS.beta;
    this.dCutoff = opts.dCutoff ?? DEFAULTS.dCutoff;
  }

  /**
   * Apply the filter to one new sample.
   * @param value raw signal value
   * @param ts    timestamp in milliseconds (use performance.now())
   * @returns the smoothed value
   */
  filter(value: number, ts: number): number {
    if (this.lastTs !== null && ts > this.lastTs) {
      this.freq = 1000 / (ts - this.lastTs);
    }
    this.lastTs = ts;

    const prevRaw = this.x.lastRaw();
    const dxValue = prevRaw === null ? 0 : (value - prevRaw) * this.freq;
    const edx = this.dx.filter(dxValue, alpha(this.dCutoff, this.freq));

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, this.freq));
  }

  /** Live-update the smoothing parameters (e.g., from settings change). */
  configure(opts: Partial<Pick<OneEuroOptions, 'minCutoff' | 'beta' | 'dCutoff'>>): void {
    if (opts.minCutoff !== undefined) this.minCutoff = opts.minCutoff;
    if (opts.beta !== undefined) this.beta = opts.beta;
    if (opts.dCutoff !== undefined) this.dCutoff = opts.dCutoff;
  }

  /** Reset the internal state (e.g., on hand re-acquisition). */
  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.lastTs = null;
  }
}

/**
 * Convenience filter for 2D points (used for cursor position smoothing).
 * Holds one OneEuroFilter per axis.
 */
export class OneEuroFilter2D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(opts: OneEuroOptions = {}) {
    this.fx = new OneEuroFilter(opts);
    this.fy = new OneEuroFilter(opts);
  }

  filter(x: number, y: number, ts: number): { x: number; y: number } {
    return { x: this.fx.filter(x, ts), y: this.fy.filter(y, ts) };
  }

  configure(opts: Partial<Pick<OneEuroOptions, 'minCutoff' | 'beta' | 'dCutoff'>>): void {
    this.fx.configure(opts);
    this.fy.configure(opts);
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
