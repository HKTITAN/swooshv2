/**
 * HandOverlay — Quest / Vision Pro style outlined-hand renderer.
 *
 * Draws each finger and the palm as a layered "tube" stroke so the
 * shape looks like a continuous bright outline around a translucent
 * fill, not a wireframe skeleton:
 *
 *   - shadow layer (thick dark stroke)   — gives the outline depth
 *   - outline layer (thick bright stroke) — the white edge
 *   - fill layer (thin translucent stroke + filled palm polygon)
 *
 * Styles:
 *   default       — bright white outline, translucent dark palm fill, mint pinch glow
 *   highContrast  — solid black-on-white, no glow (accessibility)
 *   minimal       — single-line skeleton, no fill (clean / debug look)
 *
 * Performance: redraws once per `landmarks` prop change, not on rAF.
 * The pipeline calls us at frame cadence already.
 */

import { useEffect, useRef } from 'react';
import type { HandLandmarks, Landmark } from '@swoosh/shared/types';
import { LANDMARK } from '@swoosh/shared/types';
import { handPresence } from '@swoosh/shared/gesture/landmarks';

export type HandOverlayStyle = 'default' | 'highContrast' | 'minimal';

interface HandOverlayProps {
  landmarks: HandLandmarks[];
  /** Width in CSS pixels. Defaults to filling the parent. */
  width?: number;
  /** Height in CSS pixels. Defaults to filling the parent. */
  height?: number;
  /** Outline style. */
  style?: HandOverlayStyle;
  /** When true, draw a glow at the index-thumb pinch point. */
  pinchGlow?: boolean;
  /** If true, mirror the X axis (selfie view). Defaults true. */
  mirror?: boolean;
  className?: string;
}

/** Finger chains — each is one continuous tube from base to tip. */
const FINGERS: number[][] = [
  [LANDMARK.WRIST, 1, 2, 3, LANDMARK.THUMB_TIP],
  [LANDMARK.INDEX_MCP, 6, 7, LANDMARK.INDEX_TIP],
  [LANDMARK.MIDDLE_MCP, 10, 11, LANDMARK.MIDDLE_TIP],
  [LANDMARK.RING_MCP, 14, 15, LANDMARK.RING_TIP],
  [LANDMARK.PINKY_MCP, 18, 19, LANDMARK.PINKY_TIP],
];

/** Palm polygon vertices, in order — closed loop. */
const PALM_LOOP: number[] = [
  LANDMARK.WRIST,
  LANDMARK.INDEX_MCP,
  LANDMARK.MIDDLE_MCP,
  LANDMARK.RING_MCP,
  LANDMARK.PINKY_MCP,
];

interface DrawTokens {
  shadow: string;
  outline: string;
  inner: string;
  palmFill: string | null;
  glow: string | null;
  shadowWidth: number;
  outlineWidth: number;
  innerWidth: number;
  tipDot: number;
}

function tokensFor(style: HandOverlayStyle, baseSize: number): DrawTokens {
  // baseSize is min(cssW, cssH) so strokes scale with the rendered area.
  // For a typical 640×480 preview this gives ~14 px outline; for a
  // fullscreen overlay it scales up to ~25 px which is the Meta Quest feel.
  const k = baseSize / 480;
  switch (style) {
    case 'highContrast':
      return {
        shadow: 'rgba(0,0,0,0.95)',
        outline: '#FFFFFF',
        inner: 'rgba(0,0,0,0.85)',
        palmFill: 'rgba(0,0,0,0.85)',
        glow: null,
        shadowWidth: 22 * k,
        outlineWidth: 14 * k,
        innerWidth: 6 * k,
        tipDot: 10 * k,
      };
    case 'minimal':
      return {
        shadow: 'rgba(63,224,197,0)',
        outline: '#3FE0C5',
        inner: 'rgba(63,224,197,0)',
        palmFill: null,
        glow: null,
        shadowWidth: 0,
        outlineWidth: 3 * k,
        innerWidth: 0,
        tipDot: 4 * k,
      };
    case 'default':
    default:
      return {
        // Soft drop shadow gives the outline depth without looking inked-on.
        shadow: 'rgba(7,10,27,0.55)',
        // Bright white outline — the Quest signature stroke.
        outline: 'rgba(255,255,255,0.96)',
        // Slightly translucent inner stroke to give a "tube" highlight look.
        inner: 'rgba(255,255,255,0.30)',
        // Dark translucent palm fill so the user's hand shows through but
        // the outline reads cleanly against any background.
        palmFill: 'rgba(7,10,27,0.32)',
        glow: 'rgba(63,224,197,0.55)',
        shadowWidth: 20 * k,
        outlineWidth: 13 * k,
        innerWidth: 5 * k,
        tipDot: 8 * k,
      };
  }
}

function pinchDistance2D(hand: HandLandmarks): number {
  const a = hand.points[LANDMARK.THUMB_TIP];
  const b = hand.points[LANDMARK.INDEX_TIP];
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Stroke a path through a list of landmarks using a quadratic curve
 * fit so the resulting tube reads as smooth instead of dog-legged.
 * Falls back to straight segments when there are fewer than 3 points.
 */
function strokeChain(
  ctx: CanvasRenderingContext2D,
  pts: Landmark[],
  width: number,
  color: string,
  cssW: number,
  cssH: number,
): void {
  if (pts.length < 2 || width <= 0) return;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  const first = pts[0]!;
  ctx.moveTo(first.x * cssW, first.y * cssH);
  if (pts.length === 2) {
    const p = pts[1]!;
    ctx.lineTo(p.x * cssW, p.y * cssH);
  } else {
    // For each interior segment, place a quadratic control at the
    // current point and end the curve at the midpoint between current
    // and next. Final point closes with a lineTo.
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const next = pts[i + 1]!;
      const mx = ((p.x + next.x) / 2) * cssW;
      const my = ((p.y + next.y) / 2) * cssH;
      ctx.quadraticCurveTo(p.x * cssW, p.y * cssH, mx, my);
    }
    const last = pts[pts.length - 1]!;
    ctx.lineTo(last.x * cssW, last.y * cssH);
  }
  ctx.stroke();
}

function drawPalmFill(
  ctx: CanvasRenderingContext2D,
  hand: HandLandmarks,
  fill: string,
  cssW: number,
  cssH: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < PALM_LOOP.length; i++) {
    const p = hand.points[PALM_LOOP[i]!];
    if (!p) continue;
    const x = p.x * cssW;
    const y = p.y * cssH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function HandOverlay({
  landmarks,
  width,
  height,
  style = 'default',
  pinchGlow = true,
  mirror = true,
  className,
}: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio ?? 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.scale(dpr, dpr);

    const cssW = w / dpr;
    const cssH = h / dpr;
    const tokens = tokensFor(style, Math.min(cssW, cssH));

    for (const hand of landmarks) {
      const pts = hand.points;
      if (!pts || pts.length < 21) continue;

      // Distance-aware presence: scale the whole hand's drawing alpha
      // by how big the hand looks in the frame. A close hand reads
      // vivid; a far hand reads as a faint silhouette. Saved + restored
      // around each hand so other passes (pinch glow) can opt out.
      const presence = handPresence(hand);
      ctx.globalAlpha = presence;

      // 1. Palm fill — drawn first so finger tubes overlap it cleanly.
      if (tokens.palmFill) {
        drawPalmFill(ctx, hand, tokens.palmFill, cssW, cssH);
      }

      // 2. Three stroke passes per finger: shadow → outline → inner.
      for (const pass of ['shadow', 'outline', 'inner'] as const) {
        const color =
          pass === 'shadow'
            ? tokens.shadow
            : pass === 'outline'
              ? tokens.outline
              : tokens.inner;
        const lineWidth =
          pass === 'shadow'
            ? tokens.shadowWidth
            : pass === 'outline'
              ? tokens.outlineWidth
              : tokens.innerWidth;
        if (lineWidth <= 0) continue;

        // Also stroke the palm loop so the wrist edge reads continuously.
        const palmPts = PALM_LOOP.map((i) => pts[i]).filter(
          (p): p is Landmark => !!p,
        );
        if (palmPts.length >= 2) {
          // Close the palm loop by appending the first point.
          strokeChain(ctx, [...palmPts, palmPts[0]!], lineWidth, color, cssW, cssH);
        }

        for (const finger of FINGERS) {
          const fingerPts = finger.map((i) => pts[i]).filter(
            (p): p is Landmark => !!p,
          );
          strokeChain(ctx, fingerPts, lineWidth, color, cssW, cssH);
        }
      }

      // 3. Fingertip caps — small filled circles at each tip for emphasis.
      if (tokens.tipDot > 0) {
        ctx.fillStyle = tokens.outline;
        const tips = [
          LANDMARK.THUMB_TIP,
          LANDMARK.INDEX_TIP,
          LANDMARK.MIDDLE_TIP,
          LANDMARK.RING_TIP,
          LANDMARK.PINKY_TIP,
        ];
        for (const t of tips) {
          const p = pts[t];
          if (!p) continue;
          ctx.beginPath();
          ctx.arc(p.x * cssW, p.y * cssH, tokens.tipDot / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Pinch glow between thumb and index — soft radial gradient.
      // Glow is gestural feedback; keep it at full alpha even when the
      // hand fades, so the user always sees the pinch land.
      ctx.globalAlpha = 1;
      if (pinchGlow && tokens.glow) {
        const thumb = pts[LANDMARK.THUMB_TIP];
        const index = pts[LANDMARK.INDEX_TIP];
        if (thumb && index) {
          const d = pinchDistance2D(hand);
          if (d < 0.12) {
            const cx = ((thumb.x + index.x) / 2) * cssW;
            const cy = ((thumb.y + index.y) / 2) * cssH;
            const intensity = Math.max(0, 1 - d / 0.12);
            const r = 10 + intensity * 28;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, tokens.glow);
            grad.addColorStop(1, 'rgba(63,224,197,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Reset for the next render pass.
    ctx.globalAlpha = 1;
  }, [landmarks, style, pinchGlow, mirror]);

  // Resize the canvas backing store on container size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const apply = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    apply();
    const obs = new ResizeObserver(apply);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: width != null ? `${width}px` : '100%',
        height: height != null ? `${height}px` : '100%',
        pointerEvents: 'none',
      }}
      className={className}
    />
  );
}
