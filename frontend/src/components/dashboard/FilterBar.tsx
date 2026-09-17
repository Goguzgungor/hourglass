'use client';
import { isDefault, type DashboardFilters } from '@/lib/dashboard/filters';
import ModelSelect from './ModelSelect';
import RoleSegment from './RoleSegment';
import SearchBox from './SearchBox';
import SortControl from './SortControl';
import StatusMultiSelect from './StatusMultiSelect';
import TokenSelect from './TokenSelect';

const FILTER_KEYS: (keyof DashboardFilters)[] = ['role', 'status', 'token', 'model', 'q', 'sort', 'order'];

export default function FilterBar({ filters, tokens, onChange, onClear }: { filters: DashboardFilters; tokens: string[]; onChange: (patch: Partial<DashboardFilters>) => void; onClear: () => void }) {
  const clean = isDefault(filters, FILTER_KEYS);
  return (
    <div className="border border-stroke bg-night/40 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <RoleSegment value={filters.role} onChange={(role) => onChange({ role })} />
        <StatusMultiSelect value={filters.status} onChange={(status) => onChange({ status })} />
        <TokenSelect value={filters.token} tokens={tokens} onChange={(token) => onChange({ token })} />
        <ModelSelect value={filters.model} onChange={(model) => onChange({ model })} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <SearchBox value={filters.q} onChange={(q) => onChange({ q })} />
        <SortControl sort={filters.sort} order={filters.order} onChange={onChange} />
        {!clean && (
          <button type="button" onClick={onClear} className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim hover:text-sand-bright">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
