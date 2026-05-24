'use client';

import type { ReactNode } from 'react';

export type AmountAccent =
  | 'cream'
  | 'sand'
  | 'teal'
  | 'cream-muted'
  | 'rose'
  | 'violet';

type Props = {
  label: string;
  amount: ReactNode;
  unit?: string;
  accent?: AmountAccent;
  pulse?: boolean;
  tooltip?: string;
  /** Optional super-small caption rendered below the unit (e.g. a rate). */
  caption?: string;
};

const ACCENT_TEXT: Record<AmountAccent, string> = {
  cream: 'text-cream',
  sand: 'text-sand-bright',
  teal: 'text-teal-bright',
  'cream-muted': 'text-cream-muted',
  rose: 'text-rose',
  violet: 'text-violet',
};

const ACCENT_BORDER: Record<AmountAccent, string> = {
  cream: 'border-l-cream/60',
  sand: 'border-l-sand',
  teal: 'border-l-teal-bright',
  'cream-muted': 'border-l-stroke-2',
  rose: 'border-l-rose',
  violet: 'border-l-violet',
};

const ACCENT_GLOW: Record<AmountAccent, string> = {
  cream: '[text-shadow:0_0_22px_rgba(245,235,217,0.45)]',
  sand: '[text-shadow:0_0_22px_rgba(251,211,141,0.55)]',
  teal: '[text-shadow:0_0_24px_rgba(132,227,229,0.55)]',
  'cream-muted': '',
  rose: '[text-shadow:0_0_22px_rgba(255,122,143,0.5)]',
  violet: '[text-shadow:0_0_22px_rgba(139,124,240,0.5)]',
};

/**
 * AmountTile — a single quantity, framed with an accent left-edge.
 *
 * The container intentionally uses a subtle gradient (midnight → night) so the
 * tiles still feel quietly cinematic when grouped in a 4-up grid. Set `pulse`
 * to wrap a soft glow animation around the amount.
 */
export default function AmountTile({
  label,
  amount,
  unit = 'XLM',
  accent = 'cream',
  pulse,
  tooltip,
  caption,
}: Props) {
  return (
    <div
      title={tooltip}
      className={
        'relative overflow-hidden rounded-sm border border-stroke ' +
        'border-l-2 bg-gradient-to-br from-midnight to-night/80 ' +
        'px-4 py-5 xl:px-6 xl:py-7 2xl:px-8 2xl:py-9 transition-colors hover:border-stroke-2 ' +
        ACCENT_BORDER[accent]
      }
    >
      <p className="eyebrow text-cream-dim xl:text-[0.78rem] 2xl:text-[0.85rem]">{label}</p>
      <p
        className={
          'mt-3 xl:mt-4 font-mono tabular text-2xl xl:text-3xl 2xl:text-4xl leading-none truncate ' +
          ACCENT_TEXT[accent] +
          ' ' +
          (pulse ? ACCENT_GLOW[accent] : '')
        }
      >
        {pulse ? (
          <span
            className="inline-block"
            style={{ animation: 'pulse-glow 2.4s ease-in-out infinite' }}
          >
            {amount}
          </span>
        ) : (
          amount
        )}
      </p>
      <p className="mt-2 xl:mt-3 font-mono text-[10px] xl:text-[11px] 2xl:text-[12px] uppercase tracking-[0.18em] text-cream-dim">
        {unit}
        {caption && <span className="ml-2 normal-case tracking-normal text-cream-dim/70">{caption}</span>}
      </p>
    </div>
  );
}
