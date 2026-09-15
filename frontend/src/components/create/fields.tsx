// frontend/src/components/create/fields.tsx
'use client';

import { useState, type ReactNode } from 'react';
import Toggle from '@/components/Toggle';

export const bareInputClass =
  'w-full bg-transparent border-0 border-b border-stroke px-0 py-2 text-cream ' +
  'placeholder:text-cream-dim/60 outline-none focus:border-sand transition-colors';

export const primaryButtonClass =
  'w-full flex items-center justify-center gap-3 bg-sand text-night px-7 py-4 ' +
  'text-[11px] uppercase tracking-[0.18em] font-medium rounded-none border border-sand ' +
  'hover:bg-sand-bright hover:border-sand-bright disabled:opacity-50 disabled:cursor-not-allowed ' +
  'disabled:hover:bg-sand disabled:hover:border-sand transition-colors duration-200';

export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 text-sand px-5 py-2 text-[11px] uppercase tracking-[0.18em] ' +
  'font-medium rounded-none border border-sand/60 hover:border-sand hover:text-sand-bright hover:bg-sand/5 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200';

export const ghostButtonClass =
  'inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim ' +
  'hover:text-sand-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-cream-dim block mb-3">{label}</span>
      {children}
      {error ? (
        <span className="block mt-2 text-xs text-danger">{error}</span>
      ) : (
        hint && <span className="block mt-2 text-xs text-cream-dim/80">{hint}</span>
      )}
    </label>
  );
}

export function AmountInput({
  value,
  onChange,
  symbol,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  symbol: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-stroke focus-within:border-sand transition-colors">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent border-0 px-0 py-2 text-cream outline-none font-mono"
        spellCheck={false}
        autoComplete="off"
      />
      <span className="font-mono text-xs text-cream-dim uppercase tracking-[0.18em]">{symbol}</span>
    </div>
  );
}

export function PctInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-stroke focus-within:border-sand transition-colors">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent border-0 px-0 py-2 text-cream outline-none font-mono"
        spellCheck={false}
        autoComplete="off"
      />
      <span className="font-mono text-xs text-cream-dim">%</span>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-5 py-4 border-t border-stroke/60 cursor-pointer select-none group">
      <Toggle checked={value} onChange={onChange} ariaLabel={label} />
      <div className="flex-1 min-w-0">
        <span className="eyebrow text-cream block group-hover:text-sand-bright transition-colors">{label}</span>
        {hint && <span className="block mt-1 text-xs text-cream-dim/80 leading-snug">{hint}</span>}
      </div>
      <span
        className={
          'font-mono text-[11px] uppercase tracking-[0.18em] shrink-0 ' + (value ? 'text-sand-bright' : 'text-cream-dim')
        }
      >
        {value ? 'On' : 'Off'}
      </span>
    </label>
  );
}

export function SubmittingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="size-[5px] bg-night rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="size-[5px] bg-night rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="size-[5px] bg-night rounded-full animate-bounce" />
    </span>
  );
}

export function NoDeploymentWarning() {
  return (
    <div className="mt-10 border border-warning/40 bg-warning/5 px-5 py-4">
      <p className="eyebrow text-warning mb-2">· No on-chain deployment</p>
      <p className="text-sm text-cream-muted leading-relaxed">
        The build placeholder is empty. Run <span className="font-mono text-cream">./scripts/quickstart-up.sh</span> then{' '}
        <span className="font-mono text-cream">./scripts/deploy-local.sh</span> from the repo root, then restart the dev
        server.
      </p>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim hover:text-sand-bright transition-colors"
      aria-label="Copy"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}
