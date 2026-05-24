'use client';

import { useRef, useState, type ReactNode } from 'react';

export type AttributeAccent =
  | 'sand'
  | 'teal'
  | 'violet'
  | 'rose'
  | 'cream-muted';

type Props = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  copyable?: string;
  accent?: AttributeAccent;
};

const ACCENT: Record<AttributeAccent, string> = {
  sand: 'text-sand',
  teal: 'text-teal-bright',
  violet: 'text-violet',
  rose: 'text-rose',
  'cream-muted': 'text-cream-muted',
};

/**
 * AttributePill — a single row in the right-side receipt panel.
 *
 * Not a card. Just a borderless cell with a hairline bottom divider, an
 * uppercase tracked label on top, value below. Optional copy button for
 * addresses.
 */
export default function AttributePill({
  label,
  value,
  icon,
  copyable,
  accent,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCopy = async () => {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(copyable);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const labelClass = accent
    ? `text-[10px] uppercase tracking-[0.16em] ${ACCENT[accent]}`
    : 'text-[10px] uppercase tracking-[0.16em] text-cream-dim';

  return (
    <div className="py-3 px-0 border-b border-stroke/40">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="inline-flex items-center justify-center text-cream-dim/80 w-3 h-3">
            {icon}
          </span>
        )}
        <span className={labelClass}>{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <div className="text-sm text-cream truncate min-w-0">{value}</div>
        {copyable && (
          <button
            type="button"
            onClick={onCopy}
            className={
              'shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ' +
              (copied
                ? 'text-teal-bright'
                : 'text-cream-dim hover:text-cream')
            }
            title={copyable}
          >
            {copied ? 'copied' : 'copy'}
          </button>
        )}
      </div>
    </div>
  );
}
