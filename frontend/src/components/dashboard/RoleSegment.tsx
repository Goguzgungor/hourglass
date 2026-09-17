'use client';
import type { Role } from '@/lib/dashboard/filters';

const OPTS: Array<{ id: Role; label: string }> = [
  { id: 'any', label: 'All' },
  { id: 'sender', label: 'Sending' },
  { id: 'recipient', label: 'Receiving' },
];
const seg = (active: boolean) =>
  'px-3 py-1.5 rounded-none border font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ' +
  (active ? 'border-sand bg-sand/10 text-sand-bright' : 'border-stroke text-cream hover:border-stroke-2');

export default function RoleSegment({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div role="group" aria-label="Role" className="inline-flex gap-1">
      {OPTS.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={seg(value === o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
