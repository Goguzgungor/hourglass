'use client';
import { MODELS } from '@/lib/api/streamsQuery';
import type { Model } from '@/lib/dashboard/filters';

export default function ModelSelect({ value, onChange }: { value: Model | null; onChange: (m: Model | null) => void }) {
  return (
    <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cream-dim">
      Shape
      <select value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as Model | null)} className="bg-transparent border-b border-stroke text-cream font-mono text-xs py-1 outline-none focus:border-sand" aria-label="Shape">
        <option value="">Any</option>
        {MODELS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  );
}
