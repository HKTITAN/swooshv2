/**
 * AnimatedHand — looping SVG illustration of a hand performing a
 * pinch. Used in onboarding ("here's what we're going to do") and as
 * an empty-state when no hand is detected in the camera frame.
 *
 * Honors prefers-reduced-motion at the OS level and the renderer's
 * settings.reducedMotion flag (passed in as `motion="static"`).
 */

import { useEffect, useRef } from 'react';

interface AnimatedHandProps {
  /** "auto" follows the OS reduced-motion preference; "static" forces a still pose. */
  motion?: 'auto' | 'static';
  /** Pixel size of the bounding square. */
  size?: number;
  className?: string;
  /** Accent stroke color, defaults to the mint token. */
  color?: string;
}

export function AnimatedHand({
  motion = 'auto',
  size = 128,
  className,
  color = 'var(--swoosh-mint)',
}: AnimatedHandProps) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (motion === 'static') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const svg = ref.current;
    if (!svg) return;
    // No-op: animation lives in CSS keyframes attached via the
    // `swoosh-pinch` class. This effect exists so consumers passing
    // `motion="static"` can skip the animation deterministically.
  }, [motion]);

  const animate = motion !== 'static';

  return (
    <svg
      ref={ref}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden
      className={className}
    >
      <defs>
        <filter id="ah-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Palm */}
      <path
        d="M40 70 q-4 -22 4 -36 q4 -8 12 -8 q6 0 6 8 v22 q0 4 4 4 q4 0 4 -4 v-28 q0 -8 7 -8 q7 0 7 8 v28 q0 4 4 4 q4 0 4 -4 v-22 q0 -8 7 -8 q7 0 7 8 v36 q0 18 -14 26 q-12 6 -22 6 q-22 0 -30 -22 z"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#ah-glow)"
      />
      {/* Thumb (animated to meet the index for a pinch) */}
      <g className={animate ? 'swoosh-thumb' : ''} style={{ transformOrigin: '40px 70px' }}>
        <path
          d="M40 70 q-12 -4 -18 2 q-6 6 -2 14 q4 8 14 8 q6 0 10 -6"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* Pinch glow dot — appears when thumb+index touch */}
      <circle
        className={animate ? 'swoosh-pinch-glow' : ''}
        cx="50"
        cy="42"
        r="3"
        fill={color}
        opacity={animate ? 0 : 1}
      />
      <style>
        {animate
          ? `
@keyframes swoosh-thumb-pinch {
  0%, 30% { transform: rotate(0deg); }
  45%, 65% { transform: rotate(20deg); }
  80%, 100% { transform: rotate(0deg); }
}
@keyframes swoosh-pinch-glow {
  0%, 30% { opacity: 0; }
  45%, 65% { opacity: 1; }
  80%, 100% { opacity: 0; }
}
.swoosh-thumb { animation: swoosh-thumb-pinch 2.4s ease-in-out infinite; }
.swoosh-pinch-glow { animation: swoosh-pinch-glow 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .swoosh-thumb, .swoosh-pinch-glow { animation: none !important; }
}
`
          : ''}
      </style>
    </svg>
  );
}
