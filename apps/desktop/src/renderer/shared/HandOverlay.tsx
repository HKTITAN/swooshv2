/**
 * HandOverlay — Canvas-backed renderer for one or two MediaPipe hands.
 *
 * Draws 21 landmarks + the bone-graph between them with the chosen
 * outline style. Mirrors the Quest / Vision Pro treatment: 2.5 px
 * pure-white stroke, joints as small filled circles, an optional
 * glow at the active pinch point.
 *
 * Styles:
 *   default       — translucent fill behind white outline + soft glow
 *   highContrast  — solid black-and-white, no glow (accessibility)
 *   minimal       — landmarks only, no bones (debug / clean look)
 *
 * Performance note: the canvas is sized once on mount and on container
 * resize; we redraw on every prop change, not on rAF. The pipeline
 * already calls us at frame cadence via the `landmarks` prop.
 */

import { useEffect, useRef } from 'react';
import type { HandLandmarks } from '@swoosh/shared/types';
import { LANDMARK } from '@swoosh/shared/types';

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

// MediaPipe hand connection list — pairs of landmark indices that form
// the skeleton's bones.
const HAND_CONNECTIONS: Array<[number, number]> = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm
  [0, 17],
];

interface StyleSet {
  bone: string;
  joint: string;
  jointStroke?: string;
  fillBehind: string | null;
  glow: string | null;
  width: number;
}

function styleFor(style: HandOverlayStyle): StyleSet {
  switch (style) {
    case 'highContrast':
      return {
        bone: '#FFFFFF',
        joint: '#000000',
        jointStroke: '#FFFFFF',
        fillBehind: null,
        glow: null,
        width: 3,
      };
    case 'minimal':
      return {
        bone: 'rgba(255,255,255,0.0)',
        joint: '#3FE0C5',
        fillBehind: null,
        glow: null,
        width: 0,
      };
    case 'default':
    default:
      return {
        bone: '#FFFFFF',
        joint: '#FFFFFF',
        fillBehind: 'rgba(7,10,27,0.15)',
        glow: 'rgba(63,224,197,0.55)',
        width: 2.5,
      };
  }
}

function pinchDistance2D(hand: HandLandmarks): number {
  const a = hand.points[LANDMARK.THUMB_TIP];
  const b = hand.points[LANDMARK.INDEX_TIP];
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.x - b.x, a.y - b.y);
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
    const set = styleFor(style);

    for (const hand of landmarks) {
      const pts = hand.points;
      if (!pts || pts.length === 0) continue;

      // Optional filled palm shape for the default style.
      if (set.fillBehind) {
        ctx.beginPath();
        const palmIndices = [LANDMARK.WRIST, 5, 9, 13, 17];
        for (let i = 0; i < palmIndices.length; i++) {
          const p = pts[palmIndices[i]!];
          if (!p) continue;
          const x = p.x * cssW;
          const y = p.y * cssH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = set.fillBehind;
        ctx.fill();
      }

      // Bones
      if (set.width > 0) {
        ctx.strokeStyle = set.bone;
        ctx.lineWidth = set.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = pts[a];
          const pb = pts[b];
          if (!pa || !pb) continue;
          ctx.moveTo(pa.x * cssW, pa.y * cssH);
          ctx.lineTo(pb.x * cssW, pb.y * cssH);
        }
        ctx.stroke();
      }

      // Joints
      ctx.fillStyle = set.joint;
      ctx.strokeStyle = set.jointStroke ?? set.joint;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        ctx.beginPath();
        // Slightly larger circle at fingertips for visual emphasis.
        const isTip =
          i === LANDMARK.THUMB_TIP ||
          i === LANDMARK.INDEX_TIP ||
          i === LANDMARK.MIDDLE_TIP ||
          i === LANDMARK.RING_TIP ||
          i === LANDMARK.PINKY_TIP;
        const r = isTip ? 5 : 3;
        ctx.arc(p.x * cssW, p.y * cssH, r, 0, Math.PI * 2);
        ctx.fill();
        if (set.jointStroke) ctx.stroke();
      }

      // Pinch glow
      if (pinchGlow && set.glow) {
        const thumb = pts[LANDMARK.THUMB_TIP];
        const index = pts[LANDMARK.INDEX_TIP];
        if (thumb && index) {
          const d = pinchDistance2D(hand);
          // Only glow when fingertips are close (heuristic — settings.threshold
          // owns the precise pinch threshold; this is purely visual feedback).
          if (d < 0.12) {
            const cx = ((thumb.x + index.x) / 2) * cssW;
            const cy = ((thumb.y + index.y) / 2) * cssH;
            const intensity = Math.max(0, 1 - d / 0.12);
            const r = 6 + intensity * 16;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, set.glow);
            grad.addColorStop(1, 'rgba(63,224,197,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
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
