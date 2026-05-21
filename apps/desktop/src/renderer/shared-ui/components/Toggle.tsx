/**
 * Toggle — accessible on/off switch, keyboard operable (Space/Enter).
 *
 * Renders as a <button role="switch"> with aria-checked, so screen
 * readers announce state changes correctly.
 */

import { forwardRef, type KeyboardEvent } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { checked, onChange, label, disabled = false, id, className },
  ref,
) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const trackClasses = [
    'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-pill transition-colors duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-swoosh-400/50',
    checked ? 'bg-swoosh-400' : 'bg-ink-700',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const thumbClasses = [
    'inline-block h-5 w-5 rounded-full bg-white shadow-md',
    'transform transition-transform duration-200 ease-out',
    'absolute top-1',
    checked ? 'translate-x-6' : 'translate-x-1',
  ].join(' ');

  return (
    <span className={['inline-flex items-center gap-3', className ?? ''].join(' ')}>
      <button
        ref={ref}
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={handleKeyDown}
        className={trackClasses}
      >
        <span aria-hidden className={thumbClasses} />
      </button>
      {label ? (
        <label htmlFor={id} className="select-none text-base text-fg cursor-pointer">
          {label}
        </label>
      ) : null}
    </span>
  );
});
