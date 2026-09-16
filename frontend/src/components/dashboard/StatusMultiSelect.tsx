'use client';
import type { StatusParam } from '@/lib/dashboard/filters';

const CHIPS: StatusParam[] = ['pending', 'streaming', 'settled', 'canceled', 'depleted'];
const chip = (active: boolean) =>
  'px-2.5 py-1 rounded-none border font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ' +
  (active ? 'border-teal bg-teal/10 text-teal-bright' : 'border-stroke text-cream-dim hover:text-cream hover:border-stroke-2');

export default function StatusMultiSelect({ value, onChange }: { value: StatusParam[]; onChange: (v: StatusParam[]) => void }) {
  const toggle = (s: StatusParam) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  const extra = value.filter((v) => !CHIPS.includes(v)); // 'active' / 'inactive' from a shared URL
  return (
    <div role="group" aria-label="Status" className="inline-flex flex-wrap gap-1">
      {CHIPS.map((s) => (
        <button key={s} type="button" aria-pressed={value.includes(s)} onClick={() => toggle(s)} className={chip(value.includes(s))}>
          {s}
        </button>
      ))}
      {extra.map((s) => (
        <button key={s} type="button" aria-pressed onClick={() => toggle(s)} className={chip(true)} title="From the shared link — click to remove">
          {s} ×
        </button>
      ))}
    </div>
  );
}
