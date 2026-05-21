/**
 * Card — rounded panel with optional glow accent. Used to group
 * settings sections, tutorial step content, etc.
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  /** Tighter padding for inline grids. */
  compact?: boolean;
  /** Heading rendered above the card body. Renamed from `title` to avoid the
   *  native HTMLAttributes `title: string` clash. */
  heading?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { glow = false, compact = false, heading, className, children, ...rest },
  ref,
) {
  const classes = [
    'bg-ink-800 rounded-panel text-fg',
    'border border-ink-700/60',
    'shadow-panel',
    compact ? 'p-4' : 'p-6',
    glow ? 'shadow-glow' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} className={classes} {...rest}>
      {heading ? (
        <div className="mb-4 text-lg font-extrabold tracking-wide text-fg">{heading}</div>
      ) : null}
      {children}
    </div>
  );
});
