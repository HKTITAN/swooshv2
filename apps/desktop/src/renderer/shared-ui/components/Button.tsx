/**
 * Pill-shaped button — Baloo extrabold, three variants.
 *
 * Primary: mint fill, ink text, glow on hover.
 * Ghost: transparent with mint border + mint text; hover fills.
 * Danger: flare-pink fill, ink text.
 *
 * Accessibility: forwards every standard <button> prop (including
 * `disabled`, `aria-*`, `onKeyDown`). Keyboard focus shows a thick
 * outer ring in the mint hue.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-swoosh-400 text-ink-950 hover:bg-swoosh-300 active:bg-swoosh-500 shadow-glow disabled:bg-ink-700 disabled:text-ink-600 disabled:shadow-none',
  ghost:
    'bg-transparent text-swoosh-300 border-2 border-swoosh-400 hover:bg-swoosh-400/10 active:bg-swoosh-400/20 disabled:border-ink-700 disabled:text-ink-600',
  danger:
    'bg-flare-500 text-ink-950 hover:bg-flare-400 active:bg-flare-600 disabled:bg-ink-700 disabled:text-ink-600',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leadingIcon, trailingIcon, className, children, ...rest },
  ref,
) {
  const classes = [
    'inline-flex items-center justify-center gap-2 rounded-pill font-extrabold tracking-wide',
    'transition-[transform,background-color,box-shadow,border-color] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-swoosh-400/50',
    'disabled:cursor-not-allowed disabled:opacity-70',
    'active:scale-[0.98]',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} className={classes} {...rest}>
      {leadingIcon ? <span className="inline-flex items-center">{leadingIcon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? <span className="inline-flex items-center">{trailingIcon}</span> : null}
    </button>
  );
});
