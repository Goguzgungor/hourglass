'use client';

import { useState, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

type Props = {
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  fullWidthMobile?: boolean;
};

/**
 * WithdrawButton — the polished primary button used on /stream/[id].
 *
 * Variants reuse the same shape so they can sit on the same row:
 *   - primary  → solid sand background, sheen wipe on hover.
 *   - secondary→ outlined sand text, subtle fill on hover.
 *   - danger   → outlined rose for cancel / renounce flows.
 */
export default function WithdrawButton({
  variant = 'primary',
  disabled,
  loading,
  onClick,
  children,
  className,
  fullWidthMobile = true,
}: Props) {
  const [pressed, setPressed] = useState(false);
  // Used to retrigger the sheen keyframe on each hover entry.
  const [sheenKey, setSheenKey] = useState(0);
  const isDisabled = disabled || loading;

  const base =
    'group relative inline-flex items-center justify-center gap-2 ' +
    'overflow-hidden rounded-sm border ' +
    'px-6 py-3 text-[11px] uppercase tracking-[0.18em] font-medium ' +
    'transition-transform duration-150 select-none ' +
    (fullWidthMobile ? 'w-full md:w-auto ' : '');

  const variantClass: Record<Variant, string> = {
    primary: isDisabled
      ? 'border-stroke bg-stroke text-cream-dim cursor-not-allowed'
      : 'border-sand bg-sand text-night hover:bg-sand-bright hover:border-sand-bright shadow-[0_0_0_0_rgba(232,183,107,0)] hover:shadow-[0_0_18px_rgba(232,183,107,0.45)]',
    secondary: isDisabled
      ? 'border-stroke text-cream-dim cursor-not-allowed'
      : 'border-sand/60 text-sand hover:border-sand hover:text-sand-bright hover:bg-sand/5',
    danger: isDisabled
      ? 'border-stroke text-cream-dim cursor-not-allowed'
      : 'border-rose/60 text-rose hover:border-rose hover:bg-rose/5',
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onMouseEnter={() => setSheenKey((k) => k + 1)}
      onClick={onClick}
      className={
        base +
        variantClass[variant] +
        (pressed && !isDisabled ? ' scale-[0.97]' : '') +
        (className ? ' ' + className : '')
      }
    >
      {/* Sheen wipe — primary only, only when interactive */}
      {variant === 'primary' && !isDisabled && (
        <span
          key={sheenKey}
          aria-hidden
          className="
            pointer-events-none absolute inset-y-0 left-0 w-1/3
            bg-gradient-to-r from-transparent via-white/45 to-transparent
            opacity-0 group-hover:opacity-100
          "
          style={{
            animation: 'sheen 0.7s ease-out 1',
          }}
        />
      )}

      <span className="relative inline-flex items-center gap-2">
        {loading ? (
          <span className="inline-flex items-center gap-1">
            <span
              className="block w-1.5 h-1.5 rounded-full bg-current"
              style={{ animation: 'load-dot 1.2s ease-in-out infinite' }}
            />
            <span
              className="block w-1.5 h-1.5 rounded-full bg-current"
              style={{
                animation: 'load-dot 1.2s ease-in-out infinite',
                animationDelay: '0.2s',
              }}
            />
            <span
              className="block w-1.5 h-1.5 rounded-full bg-current"
              style={{
                animation: 'load-dot 1.2s ease-in-out infinite',
                animationDelay: '0.4s',
              }}
            />
          </span>
        ) : (
          children
        )}
      </span>
    </button>
  );
}
