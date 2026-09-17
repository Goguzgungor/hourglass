'use client';
import Link from 'next/link';
import type { Paged } from '@/lib/dashboard/paging';
import LoadMore from './LoadMore';
import NewItemsBanner from './NewItemsBanner';
import StreamRow, { type ApiStream } from './StreamRow';

function Skeletons() {
  return (
    <ul className="border-t border-stroke/40">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="py-5 border-b border-stroke/40 space-y-3">
          <div className="h-3 w-44 bg-stroke/30 animate-pulse rounded-sm" />
          <div className="h-6 w-56 bg-stroke/30 animate-pulse rounded-sm" />
          <div className="h-2 w-full bg-stroke/20 animate-pulse rounded-sm" />
        </li>
      ))}
    </ul>
  );
}

export default function StreamList({ state, nowSec, address, hasFilters, invalidSearch, onClear, onLoadMore, onAbsorbNew }: {
  state: Paged<ApiStream>; nowSec: number; address: string; hasFilters: boolean; invalidSearch: boolean;
  onClear: () => void; onLoadMore: () => void; onAbsorbNew: () => void;
}) {
  if (invalidSearch) return <p className="py-8 text-xs text-cream-dim">Search by stream id, G… account or C… token.</p>;
  if (!state.loadedOnce && state.loading) return <Skeletons />;
  if (state.loadedOnce && state.items.length === 0 && state.pending.length === 0) {
    return hasFilters ? (
      <div className="py-10 text-center">
        <p className="text-sm text-cream-muted">No streams match these filters.</p>
        <button type="button" onClick={onClear} className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-sand hover:text-sand-bright">Clear filters</button>
      </div>
    ) : (
      <div className="mt-10 mx-auto max-w-[520px] text-center">
        <p className="eyebrow text-cream-dim mb-4">· Quiet ledger</p>
        <h2 className="headline text-3xl text-cream leading-snug">Nothing is flowing yet.</h2>
        <p className="mt-6 text-sm text-cream-muted">The indexer hasn’t seen any streams involving this wallet. Start by creating one.</p>
        <Link href="/create" className="mt-8 inline-block text-[11px] uppercase tracking-[0.18em] text-sand hover:text-sand-bright transition-colors border-b border-sand/60 hover:border-sand pb-1">Create your first stream →</Link>
      </div>
    );
  }
  return (
    <div>
      <NewItemsBanner count={state.newCount} noun="stream" onShow={onAbsorbNew} />
      <ul className="border-t border-stroke/40">
        {state.items.map((s) => (
          <StreamRow key={s._id} stream={s} nowSec={nowSec} address={address} />
        ))}
      </ul>
      <LoadMore state={state} label="Load 20 more" onClick={onLoadMore} />
    </div>
  );
}
