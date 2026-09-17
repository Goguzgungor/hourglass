'use client';
import type { Paged } from '@/lib/dashboard/paging';

export default function LoadMore<T>({ state, label, onClick }: { state: Paged<T>; label: string; onClick: () => void }) {
  if (!state.loadedOnce || state.items.length === 0) return null;
  if (state.exhausted) return <p className="py-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim">All loaded</p>;
  return (
    <button type="button" onClick={onClick} disabled={state.loading} className="w-full py-4 border border-stroke font-mono text-[10px] uppercase tracking-[0.18em] text-sand hover:text-sand-bright hover:border-sand disabled:opacity-50">
      {state.loading ? 'Loading…' : label}
    </button>
  );
}
