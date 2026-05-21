/**
 * Slider — labelled range input with a value bubble above the thumb.
 *
 * Wraps a native <input type="range"> so keyboard nav (arrows / Home
 * / End / PageUp / PageDown) is free. Visual track + thumb are layered
 * on top via CSS in a sibling element.
 */

import { useId, type ChangeEvent } from 'react';

interface SliderProps {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  /** Optional formatter for the value bubble (e.g., "65%", "1.2x"). */
  format?: (value: number) => string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format,
  disabled = false,
  id,
  className,
}: SliderProps) {
  const autoId = useId();
  const realId = id ?? autoId;
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : String(value);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className={['flex flex-col gap-2', className ?? ''].join(' ')}>
      {label ? (
        <label htmlFor={realId} className="text-sm font-bold text-fg-mute">
          {label}
        </label>
      ) : null}
      <div className="relative h-10">
        {/* Track */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-pill bg-ink-700"
        />
        {/* Fill */}
        <div
          aria-hidden
          className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-pill bg-swoosh-400 transition-[width] duration-100"
          style={{ width: `${pct}%` }}
        />
        {/* Value bubble */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-1 -translate-x-1/2 rounded-pill bg-ink-700 px-2 py-0.5 text-xs font-extrabold text-fg shadow-md"
          style={{ left: `${pct}%` }}
        >
          {display}
        </div>
        {/* Native input — visually transparent, full hit area */}
        <input
          id={realId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={handleChange}
          className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent focus:outline-none disabled:cursor-not-allowed"
          style={{ accentColor: 'var(--swoosh-mint)' }}
        />
      </div>
    </div>
  );
}
