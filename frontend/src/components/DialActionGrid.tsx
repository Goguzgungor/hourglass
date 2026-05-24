'use client';

import { type ReactNode } from 'react';

export type ActionId = 'withdraw' | 'cancel' | 'renounce' | 'transfer';

export type ActionProps = {
  id: ActionId;
  label: string;
  icon: ReactNode;
  enabled: boolean;
  primary?: boolean;
  onClick: () => void;
  loading?: boolean;
  tooltip?: string;
};

type Props = { actions: ActionProps[] };

/**
 * DialActionGrid — the 2x2 / 1x4 ghost-button row sitting under the
 * CelestialDial. The primary action (typically Withdraw) takes a sand
 * accent; the rest are bordered cream pills.
 */
export default function DialActionGrid({ actions }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {actions.map((a) => (
        <DialAction key={a.id} {...a} />
      ))}
    </div>
  );
}

function DialAction({
  label,
  icon,
  enabled,
  primary,
  onClick,
  loading,
  tooltip,
}: ActionProps) {
  const disabled = !enabled || loading;

  const base =
    'group relative inline-flex flex-col items-center justify-center gap-1.5 ' +
    'py-4 px-3 rounded-sm border transition-colors duration-150 select-none ' +
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sand ';

  let cls: string;
  if (disabled) {
    cls =
      'border-stroke text-cream-dim/40 cursor-not-allowed bg-transparent';
  } else if (primary) {
    cls =
      'border-sand text-sand hover:bg-sand/10 hover:text-sand-bright hover:border-sand-bright bg-transparent';
  } else {
    cls =
      'border-stroke text-cream-dim hover:bg-midnight-2 hover:text-cream hover:border-stroke-2 bg-transparent';
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={tooltip}
      className={base + cls + (disabled ? '' : ' active:scale-[0.98]')}
    >
      <span className="inline-flex items-center justify-center w-4 h-4">
        {loading ? (
          <span className="inline-flex items-center gap-0.5">
            <span
              className="block w-1 h-1 rounded-full bg-current"
              style={{ animation: 'load-dot 1.2s ease-in-out infinite' }}
            />
            <span
              className="block w-1 h-1 rounded-full bg-current"
              style={{
                animation: 'load-dot 1.2s ease-in-out infinite',
                animationDelay: '0.2s',
              }}
            />
            <span
              className="block w-1 h-1 rounded-full bg-current"
              style={{
                animation: 'load-dot 1.2s ease-in-out infinite',
                animationDelay: '0.4s',
              }}
            />
          </span>
        ) : (
          icon
        )}
      </span>
      <span className="text-[10px] uppercase tracking-[0.18em]">{label}</span>
    </button>
  );
}
