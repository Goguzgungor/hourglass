'use client';
import { ACTION_KINDS, type ActionKind } from '@/lib/dashboard/filters';
import { KIND_LABEL, filterHistoryRows, type HistoryRow } from '@/lib/dashboard/history';
import type { Paged } from '@/lib/dashboard/paging';
import HistoryRowView from './HistoryRow';
import LoadMore from './LoadMore';
import NewItemsBanner from './NewItemsBanner';

const chip = (active: boolean) =>
  'px-2.5 py-1 rounded-none border font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ' +
  (active ? 'border-teal bg-teal/10 text-teal-bright' : 'border-stroke text-cream-dim hover:text-cream hover:border-stroke-2');

export default function HistoryList({ state, nowSec, kinds, mine, onKinds, onMine, onLoadMore, onAbsorbNew }: {
  state: Paged<HistoryRow>; nowSec: number; kinds: ActionKind[]; mine: boolean;
  onKinds: (k: ActionKind[]) => void; onMine: (v: boolean) => void; onLoadMore: () => void; onAbsorbNew: () => void;
}) {
  const rows = filterHistoryRows(state.items, kinds);
  const toggle = (k: ActionKind) => onKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-4">
        <div role="group" aria-label="Action kind" className="inline-flex flex-wrap gap-1">
          {ACTION_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kinds.includes(k)} onClick={() => toggle(k)} className={chip(kinds.includes(k))}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cream-dim">
          <input type="checkbox" checked={mine} onChange={(e) => onMine(e.target.checked)} /> Only my actions
        </label>
      </div>
      <NewItemsBanner count={state.newCount} noun="action" onShow={onAbsorbNew} />
      {!state.loadedOnce && state.loading && <p className="text-xs text-cream-dim py-6">Loading…</p>}
      {state.loadedOnce && state.items.length === 0 && <p className="text-xs text-cream-dim py-6">No actions yet for this wallet.</p>}
      {state.items.length > 0 && rows.length === 0 && <p className="text-xs text-cream-dim py-6">None of the loaded {state.items.length} actions match — load more or change the kinds.</p>}
      <ul className="border-t border-stroke/40">
        {rows.map((r) => (
          <HistoryRowView key={r.id} row={r} nowSec={nowSec} />
        ))}
      </ul>
      <LoadMore state={state} label="Load 25 more" onClick={onLoadMore} />
    </div>
  );
}
