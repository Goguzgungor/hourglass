'use client';
import { SORT_FIELDS } from '@/lib/api/streamsQuery';
import type { Order, SortField } from '@/lib/dashboard/filters';

const LABEL: Record<SortField, string> = { created_at: 'Created', start_ts: 'Start', end_ts: 'End' };

export default function SortControl({ sort, order, onChange }: { sort: SortField; order: Order; onChange: (p: { sort?: SortField; order?: Order }) => void }) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cream-dim">
      <label className="inline-flex items-center gap-2">
        Sort
        <select value={sort} onChange={(e) => onChange({ sort: e.target.value as SortField })} className="bg-transparent border-b border-stroke text-cream font-mono text-xs py-1 outline-none focus:border-sand" aria-label="Sort by">
          {SORT_FIELDS.map((f) => (
            <option key={f} value={f}>
              {LABEL[f]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onChange({ order: order === 'desc' ? 'asc' : 'desc' })} aria-label={order === 'desc' ? 'Descending — switch to ascending' : 'Ascending — switch to descending'} className="px-2 py-1 border border-stroke text-cream hover:border-stroke-2">
        {order === 'desc' ? '↓' : '↑'}
      </button>
    </div>
  );
}
