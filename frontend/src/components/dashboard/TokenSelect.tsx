'use client';
import { findToken } from '@/lib/tokens';
import { truncAddress } from '@/lib/format';

const selectClass = 'bg-transparent border-b border-stroke text-cream font-mono text-xs py-1 outline-none focus:border-sand';

export default function TokenSelect({ value, tokens, onChange }: { value: string | null; tokens: string[]; onChange: (t: string | null) => void }) {
  const opts = Array.from(new Set([...(value ? [value] : []), ...tokens]));
  return (
    <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cream-dim">
      Token
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={selectClass} aria-label="Token">
        <option value="">Any</option>
        {opts.map((t) => (
          <option key={t} value={t}>
            {findToken(t)?.symbol ?? truncAddress(t)}
          </option>
        ))}
      </select>
    </label>
  );
}
