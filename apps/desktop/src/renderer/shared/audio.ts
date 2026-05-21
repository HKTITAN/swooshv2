/**
 * Audio engine — short, in-renderer synthesized tones for gesture
 * feedback. No external asset files; we use the Web Audio API to
 * build oscillator + gain envelopes on demand.
 *
 * Constitution requires:
 *  - Pinch click tone (440 Hz, the "left click")
 *  - Right pinch tone (330 Hz, slightly lower)
 *  - Release tone (550 Hz, slightly higher, shorter)
 *
 *  All cues < 150 ms, respect settings.audioEnabled and audioVolume.
 *
 *  The engine lazily constructs the AudioContext on first use to avoid
 *  the Chromium auto-play policy warning before any user interaction.
 */

let context: AudioContext | null = null;
let masterGain: GainNode | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  context = new Ctx();
  masterGain = context.createGain();
  masterGain.gain.value = 1.0;
  masterGain.connect(context.destination);
  return context;
}

interface AudioConfig {
  enabled: boolean;
  volume: number; // 0..1
}

let config: AudioConfig = { enabled: true, volume: 0.5 };

/** Live-update audio config (e.g., from settings change). */
export function setAudioConfig(next: Partial<AudioConfig>): void {
  config = { ...config, ...next };
  if (masterGain) {
    masterGain.gain.value = config.enabled ? Math.max(0, Math.min(1, config.volume)) : 0;
  }
}

interface ToneOptions {
  freq: number;
  /** Duration of the entire envelope, in ms. */
  durationMs: number;
  /** Attack ramp time, in ms. */
  attackMs?: number;
  /** Wave shape; "sine" is the softest, default. */
  type?: OscillatorType;
  /** Peak gain (0..1), multiplied by the master config volume. */
  peak?: number;
}

function playTone(opts: ToneOptions): void {
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  if (!config.enabled) return;
  // Some browsers suspend the context until a user gesture; resume on demand.
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const now = ctx.currentTime;
  const attack = (opts.attackMs ?? 10) / 1000;
  const total = opts.durationMs / 1000;
  const decay = Math.max(0.01, total - attack);
  const peak = (opts.peak ?? 0.6) * Math.max(0, Math.min(1, config.volume));

  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, now);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

  osc.connect(env);
  env.connect(masterGain);
  osc.start(now);
  osc.stop(now + total + 0.02);
}

export const audio = {
  /** Left-click "snap" — bright, short. */
  pinchClick(): void {
    playTone({ freq: 440, durationMs: 100, attackMs: 5, peak: 0.7 });
  },
  /** Right-click — lower pitch so it's distinguishable by ear. */
  rightPinchClick(): void {
    playTone({ freq: 330, durationMs: 110, attackMs: 5, peak: 0.7 });
  },
  /** Release / pinch-up — soft tail up an octave. */
  release(): void {
    playTone({ freq: 550, durationMs: 80, attackMs: 3, peak: 0.5 });
  },
  /** Scroll tick — quiet, scaled by motion magnitude (0..1). */
  scrollTick(magnitude: number = 1): void {
    const m = Math.max(0, Math.min(1, magnitude));
    playTone({ freq: 660, durationMs: 60, attackMs: 2, peak: 0.25 * m });
  },
} as const;
