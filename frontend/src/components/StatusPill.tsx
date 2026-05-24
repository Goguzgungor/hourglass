'use client';

/**
 * StatusPill — a small status badge for use in dashboard rows and the
 * /stream/[id] header. All-caps, tracked-out, sharp-cornered.
 *
 * The colour mapping signals lifecycle: cool teal for healthy/active flow,
 * rose for cancelations, and a muted line-through treatment for depleted
 * receipts that have been fully drained.
 */
export type StreamStatusTag =
  | 'PENDING'
  | 'STREAMING'
  | 'SETTLED'
  | 'CANCELED'
  | 'DEPLETED';

type Spec = {
  container: string;
  dot?: string;
  glyph?: string;
  line?: boolean;
};

const SPECS: Record<StreamStatusTag, Spec> = {
  PENDING: {
    container:
      'border border-cream-dim/50 text-cream-dim bg-transparent',
  },
  STREAMING: {
    container:
      'border border-teal/40 bg-teal/10 text-teal-bright',
    dot: 'bg-teal-bright',
  },
  SETTLED: {
    container:
      'border border-teal/40 bg-teal/20 text-teal-bright',
  },
  CANCELED: {
    container:
      'border border-rose/40 bg-rose/15 text-rose',
    glyph: '⊘',
  },
  DEPLETED: {
    container:
      'border border-stroke bg-night text-cream-dim',
    line: true,
  },
};

export default function StatusPill({
  status,
  size = 'md',
}: {
  status: StreamStatusTag;
  size?: 'sm' | 'md';
}) {
  const spec = SPECS[status];
  const padding = size === 'sm' ? 'px-2 py-[3px] text-[9px]' : 'px-3 py-1 text-[10px]';
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 uppercase tracking-[0.18em] rounded-sm font-medium ' +
        padding +
        ' ' +
        spec.container
      }
    >
      {spec.dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={
              'absolute inset-0 rounded-full opacity-70 animate-ping ' +
              spec.dot
            }
          />
          <span
            className={
              'relative inline-flex h-1.5 w-1.5 rounded-full ' + spec.dot
            }
          />
        </span>
      )}
      {spec.glyph && <span className="text-[11px] leading-none">{spec.glyph}</span>}
      <span className={spec.line ? 'line-through' : ''}>{status}</span>
    </span>
  );
}
