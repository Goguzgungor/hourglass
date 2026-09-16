# Dashboard Filters, Search & Wallet History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/dashboard` into a two-tab (Streams | History), URL-driven, filterable / searchable / sortable / paginated view of a wallet's streams and actions on top of the existing v2 API, and close the unbounded recurring-shape rendering on the stream page.

**Architecture:** Pure modules under `frontend/src/lib/dashboard/` (filter ↔ URL, paged-list reducer, history row mapping) are unit-tested with vitest; two hooks (`useDashboardFilters`, `usePagedList`) own URL sync and fetching; presentational components under `frontend/src/components/dashboard/` render state and call callbacks; `app/dashboard/page.tsx` becomes thin composition. `streamedFraction` moves into `lib/streaming.ts`; `LiveCounter`'s view shape gains an O(1) `Recurring` variant.

**Tech Stack:** Next.js 16 app router (`useSearchParams`, `useRouter`), React 19, TypeScript, Tailwind v4 with the existing tokens, vitest 3 (node env).

**Spec:** `docs/superpowers/specs/2026-09-17-dashboard-filters-history-design.md`

## Global Constraints

- Branch `feat/dashboard-v2` in the worktree `/Users/midex/Documents/hourglass/.worktrees/dashboard-v2` (forked from `origin/main` @ `1accac6`; the main checkout is in use by the user — never run git commands there). Commit after every task with trailers `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01WH2kMjAMbi5EMFENHLWZVx`.
- All commands from `/Users/midex/Documents/hourglass/.worktrees/dashboard-v2/frontend`. Tests `npm test` (vitest, node env, `src/**/*.test.ts`); types `npm run typecheck`; build `npm run build`. No dev server unless a task says so (the user's dev server on port 3000 belongs to the main checkout — use port 3011 for any smoke).
- Pure modules (`lib/dashboard/{filters,paging,history}.ts`, `lib/streaming.ts`) import no React, `fetch`, `window`, `Date.now()`; `now` is a parameter.
- Enum values are the API's, single source: `STATUSES`, `ROLES`, `MODELS`, `SORT_FIELDS`, `ORDERS` exported from `frontend/src/lib/api/streamsQuery.ts` (Task 1). Page sizes: **20** streams, **25** history rows. First-page refresh every **10 s** while visible; `nowSec` tick every **1 s**. Search debounce **300 ms**. Rendered recurring unlocks cap **24** (`RENDERED_UNLOCKS`).
- Do not add API endpoints or change `frontend/src/app/api/**` or `frontend/src/lib/indexer/**`.
- Money stays `bigint`; display via `formatStroops`. `Number` only for progress fractions (computed from bigint scaling in `streamedFraction`).
- `frontend/src/lib/explorer.ts` must be byte-identical to the one on `feat/create-flow-v2` (3a) so the two branches merge cleanly (Task 3 copies it verbatim).
- UI copy in English; existing classes `eyebrow`, `headline`, colours `sand`, `cream`, `cream-dim`, `cream-muted`, `stroke`, `stroke-2`, `night`, `midnight-2`, `teal`, `violet`, `rose`, `warning`, `danger`, `success`.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `frontend/src/lib/api/streamsQuery.ts` | export the enum constants | 1 |
| `frontend/src/lib/dashboard/filters.ts` (+test) | `DashboardFilters`, parse/serialize, `searchKind`, API URL builders | 1 |
| `frontend/src/lib/dashboard/paging.ts` (+test) | `Paged<T>`, `pagedReducer`, `mergeFirstPage` | 2 |
| `frontend/src/lib/explorer.ts` | explorer URL helpers (copied from 3a) | 3 |
| `frontend/src/lib/dashboard/history.ts` (+test) | `HistoryRow`, `toHistoryRow`, `filterHistoryRows`, `KIND_COLOR` | 3 |
| `frontend/src/lib/streaming.ts` (+test) | `streamedFraction` for all shapes | 4 |
| `frontend/src/components/LiveCounter.tsx` (+test) | `Recurring` view shape, O(1) math, exported `streamedAtMs` | 4 |
| `frontend/src/app/stream/[id]/page.tsx` | Recurring mapping, capped unlock list, chart points | 5 |
| `docs/superpowers/plans/2026-09-14-lockup-v0.2-followups.md` | mark the recurringToTranches item fixed | 5 |
| `frontend/src/lib/dashboard/useDashboardFilters.ts`, `usePagedList.ts` | URL sync hook, paged fetch hook | 6 |
| `frontend/src/components/dashboard/{StatsStrip,FilterBar,RoleSegment,StatusMultiSelect,TokenSelect,ModelSelect,SearchBox,SortControl}.tsx` | stats + filter UI | 7 |
| `frontend/src/components/dashboard/{StreamRow,StreamList,LoadMore,NewItemsBanner,HistoryRow,HistoryList}.tsx` | lists | 8 |
| `frontend/src/app/dashboard/page.tsx`, `frontend/README.md`, `docs/evidence/2026-09-dashboard-v2.md` | composition, docs, checklist | 9 |

---

### Task 1: Filters ↔ URL (+ export the API enums)

**Files:**
- Modify: `frontend/src/lib/api/streamsQuery.ts` (lines 11–15: the five `const … as const` declarations become `export const`)
- Create: `frontend/src/lib/dashboard/filters.ts`
- Test: `frontend/src/lib/dashboard/filters.test.ts`

**Interfaces:**
- Consumes: `STATUSES`, `ROLES`, `MODELS`, `SORT_FIELDS`, `ORDERS` from `@/lib/api/streamsQuery`.
- Produces: `Tab`, `Role`, `Model`, `SortField`, `Order`, `StatusParam`, `ActionKind`, `ACTION_KINDS`, `DashboardFilters`, `DEFAULT_FILTERS`, `STREAMS_PAGE = 20`, `HISTORY_PAGE = 25`, `parseFilters(sp)`, `filtersToQuery(f)`, `isDefault(f, keys?)`, `searchKind(q)`, `streamsApiUrl(address, f, cursor?)`, `historyApiUrl(address, f, cursor?)`, `filtersKey(f, address)`.

Note: `ACTION_KINDS`/`ActionKind` live here (not in `history.ts`) because filters reference them and `history.ts` (Task 3) imports from here — no cycle.

- [ ] **Step 1: Export the enums in `streamsQuery.ts`**

Change lines 11–15 to:
```ts
export const SORT_FIELDS = ['created_at', 'start_ts', 'end_ts'] as const;
export const ORDERS = ['asc', 'desc'] as const;
export const ROLES = ['sender', 'recipient', 'any'] as const;
export const MODELS = ['Linear', 'Tranched', 'Recurring'] as const;
export const STATUSES = ['pending', 'streaming', 'settled', 'canceled', 'depleted', 'active', 'inactive'] as const;
```
Everything else in the file stays unchanged. Run `npx vitest run src/lib/api 2>&1 | tail -5` → still green.

- [ ] **Step 2: Write the failing tests**

```ts
// frontend/src/lib/dashboard/filters.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  HISTORY_PAGE,
  STREAMS_PAGE,
  filtersKey,
  filtersToQuery,
  historyApiUrl,
  isDefault,
  parseFilters,
  searchKind,
  streamsApiUrl,
  type DashboardFilters,
} from './filters';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const C1 = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const sp = (s: string) => new URLSearchParams(s);

describe('parseFilters', () => {
  it('returns defaults for an empty query', () => {
    expect(parseFilters(sp(''))).toEqual(DEFAULT_FILTERS);
    expect(DEFAULT_FILTERS).toEqual({
      tab: 'streams', role: 'any', status: [], token: null, model: null, q: '', sort: 'created_at', order: 'desc', mine: false, kinds: [],
    });
  });
  it('parses every key and drops invalid values per key', () => {
    const f = parseFilters(sp(`tab=history&role=sender&status=streaming,pending,bogus&token=${C1}&model=Recurring&q=%2045%20&sort=start_ts&order=asc&mine=1&kinds=withdrawn,nope,created`));
    expect(f).toEqual({
      tab: 'history', role: 'sender', status: ['streaming', 'pending'], token: C1, model: 'Recurring', q: '45', sort: 'start_ts', order: 'asc', mine: true, kinds: ['withdrawn', 'created'],
    });
    const bad = parseFilters(sp('tab=nope&role=owner&token=notacontract&model=Cubic&sort=amount&order=sideways&mine=yes'));
    expect(bad).toEqual(DEFAULT_FILTERS);
  });
  it('ignores unknown keys and dedupes lists', () => {
    const f = parseFilters(sp('foo=1&status=streaming,streaming&kinds=created,created'));
    expect(f.status).toEqual(['streaming']);
    expect(f.kinds).toEqual(['created']);
  });
});

describe('filtersToQuery', () => {
  it('omits defaults and keeps a stable key order', () => {
    expect(filtersToQuery(DEFAULT_FILTERS).toString()).toBe('');
    const f: DashboardFilters = { ...DEFAULT_FILTERS, tab: 'history', role: 'recipient', status: ['streaming', 'pending'], q: 'G', order: 'asc', mine: true, kinds: ['withdrawn'] };
    expect(filtersToQuery(f).toString()).toBe('tab=history&role=recipient&status=streaming%2Cpending&q=G&order=asc&mine=1&kinds=withdrawn');
  });
  it('round-trips', () => {
    const f: DashboardFilters = { ...DEFAULT_FILTERS, token: C1, model: 'Linear', sort: 'end_ts', q: '12' };
    expect(parseFilters(filtersToQuery(f))).toEqual(f);
  });
  it('isDefault checks all or some keys', () => {
    expect(isDefault(DEFAULT_FILTERS)).toBe(true);
    const f = { ...DEFAULT_FILTERS, tab: 'history' as const };
    expect(isDefault(f)).toBe(false);
    expect(isDefault(f, ['role', 'status', 'token', 'model', 'q', 'sort', 'order'])).toBe(true);
  });
});

describe('searchKind', () => {
  it('classifies ids, account prefixes, contract prefixes, invalid and empty', () => {
    expect(searchKind('')).toBe('empty');
    expect(searchKind('  ')).toBe('empty');
    expect(searchKind('45')).toBe('id');
    expect(searchKind('G')).toBe('account');
    expect(searchKind(G1)).toBe('account');
    expect(searchKind('CDLZ')).toBe('contract');
    expect(searchKind('hello')).toBe('invalid');
    expect(searchKind('g1')).toBe('invalid');
    expect(searchKind('4x')).toBe('invalid');
  });
});

describe('API url builders', () => {
  it('streamsApiUrl encodes every active filter, the page size and the cursor', () => {
    const f: DashboardFilters = { ...DEFAULT_FILTERS, role: 'sender', status: ['streaming'], token: C1, model: 'Linear', q: '45', sort: 'end_ts', order: 'asc' };
    expect(streamsApiUrl(G1, f)).toBe(`/api/streams?address=${G1}&role=sender&status=streaming&token=${C1}&model=Linear&q=45&sort=end_ts&order=asc&limit=${STREAMS_PAGE}`);
    expect(streamsApiUrl(G1, DEFAULT_FILTERS, 'abc=')).toBe(`/api/streams?address=${G1}&limit=${STREAMS_PAGE}&cursor=abc%3D`);
  });
  it('streamsApiUrl returns null for an invalid search', () => {
    expect(streamsApiUrl(G1, { ...DEFAULT_FILTERS, q: 'hello' })).toBeNull();
  });
  it('historyApiUrl uses address, mine and the history page size', () => {
    expect(historyApiUrl(G1, DEFAULT_FILTERS)).toBe(`/api/history?address=${G1}&limit=${HISTORY_PAGE}`);
    expect(historyApiUrl(G1, { ...DEFAULT_FILTERS, mine: true }, 'c')).toBe(`/api/history?address=${G1}&mine=1&limit=${HISTORY_PAGE}&cursor=c`);
  });
  it('filtersKey changes with the address, the tab and any server-side filter, not with client-only kinds', () => {
    const a = filtersKey(DEFAULT_FILTERS, G1);
    expect(filtersKey(DEFAULT_FILTERS, 'GOTHER')).not.toBe(a);
    expect(filtersKey({ ...DEFAULT_FILTERS, tab: 'history' }, G1)).not.toBe(a);
    expect(filtersKey({ ...DEFAULT_FILTERS, status: ['streaming'] }, G1)).not.toBe(a);
    expect(filtersKey({ ...DEFAULT_FILTERS, kinds: ['created'] }, G1)).toBe(a);
  });
});
```

- [ ] **Step 3: Run to verify RED**

Run: `npx vitest run src/lib/dashboard/filters.test.ts 2>&1 | tail -6` → `Cannot find module './filters'`.

- [ ] **Step 4: Implement `filters.ts`**

```ts
// frontend/src/lib/dashboard/filters.ts
//
// Dashboard view state ⇄ URL query. Pure: no React, no window.
// The enum values are the API's own (single source in streamsQuery.ts).

import { MODELS, ORDERS, ROLES, SORT_FIELDS, STATUSES } from '@/lib/api/streamsQuery';

export type Tab = 'streams' | 'history';
export type Role = (typeof ROLES)[number];
export type Model = (typeof MODELS)[number];
export type SortField = (typeof SORT_FIELDS)[number];
export type Order = (typeof ORDERS)[number];
export type StatusParam = (typeof STATUSES)[number];

export const ACTION_KINDS = ['created', 'withdrawn', 'canceled', 'renounced', 'transferred', 'burned'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const STREAMS_PAGE = 20;
export const HISTORY_PAGE = 25;

export type DashboardFilters = {
  tab: Tab;
  role: Role;
  status: StatusParam[];
  token: string | null;
  model: Model | null;
  q: string;
  sort: SortField;
  order: Order;
  mine: boolean;
  kinds: ActionKind[];
};

export const DEFAULT_FILTERS: DashboardFilters = {
  tab: 'streams',
  role: 'any',
  status: [],
  token: null,
  model: null,
  q: '',
  sort: 'created_at',
  order: 'desc',
  mine: false,
  kinds: [],
};

const TABS = ['streams', 'history'] as const;
const CONTRACT_RE = /^C[A-Z2-7]{55}$/;

function oneOf<T extends string>(list: readonly T[], v: string | null): T | null {
  return v !== null && (list as readonly string[]).includes(v) ? (v as T) : null;
}

function listOf<T extends string>(list: readonly T[], v: string | null): T[] {
  if (!v) return [];
  const out: T[] = [];
  for (const part of v.split(',')) {
    const x = oneOf(list, part.trim());
    if (x && !out.includes(x)) out.push(x);
  }
  return out;
}

export function parseFilters(sp: URLSearchParams): DashboardFilters {
  const token = sp.get('token');
  return {
    tab: oneOf(TABS, sp.get('tab')) ?? DEFAULT_FILTERS.tab,
    role: oneOf(ROLES, sp.get('role')) ?? DEFAULT_FILTERS.role,
    status: listOf(STATUSES, sp.get('status')),
    token: token && CONTRACT_RE.test(token) ? token : null,
    model: oneOf(MODELS, sp.get('model')),
    q: (sp.get('q') ?? '').trim(),
    sort: oneOf(SORT_FIELDS, sp.get('sort')) ?? DEFAULT_FILTERS.sort,
    order: oneOf(ORDERS, sp.get('order')) ?? DEFAULT_FILTERS.order,
    mine: sp.get('mine') === '1',
    kinds: listOf(ACTION_KINDS, sp.get('kinds')),
  };
}

/** Serialise without defaults, in a fixed key order (short, shareable URLs). */
export function filtersToQuery(f: DashboardFilters): URLSearchParams {
  const out = new URLSearchParams();
  if (f.tab !== DEFAULT_FILTERS.tab) out.set('tab', f.tab);
  if (f.role !== DEFAULT_FILTERS.role) out.set('role', f.role);
  if (f.status.length) out.set('status', f.status.join(','));
  if (f.token) out.set('token', f.token);
  if (f.model) out.set('model', f.model);
  if (f.q) out.set('q', f.q);
  if (f.sort !== DEFAULT_FILTERS.sort) out.set('sort', f.sort);
  if (f.order !== DEFAULT_FILTERS.order) out.set('order', f.order);
  if (f.mine) out.set('mine', '1');
  if (f.kinds.length) out.set('kinds', f.kinds.join(','));
  return out;
}

export function isDefault(f: DashboardFilters, keys?: (keyof DashboardFilters)[]): boolean {
  const ks = keys ?? (Object.keys(DEFAULT_FILTERS) as (keyof DashboardFilters)[]);
  return ks.every((k) => JSON.stringify(f[k]) === JSON.stringify(DEFAULT_FILTERS[k]));
}

export type SearchKind = 'id' | 'account' | 'contract' | 'invalid' | 'empty';

export function searchKind(q: string): SearchKind {
  const t = q.trim();
  if (!t) return 'empty';
  if (/^\d+$/.test(t)) return 'id';
  if (/^G[A-Z2-7]*$/.test(t)) return 'account';
  if (/^C[A-Z2-7]*$/.test(t)) return 'contract';
  return 'invalid';
}

/** `/api/streams` URL for the filters, or null when the search text cannot be sent. */
export function streamsApiUrl(address: string, f: DashboardFilters, cursor?: string | null): string | null {
  const kind = searchKind(f.q);
  if (kind === 'invalid') return null;
  const p = new URLSearchParams();
  p.set('address', address);
  if (f.role !== 'any') p.set('role', f.role);
  if (f.status.length) p.set('status', f.status.join(','));
  if (f.token) p.set('token', f.token);
  if (f.model) p.set('model', f.model);
  if (kind !== 'empty') p.set('q', f.q.trim());
  if (f.sort !== DEFAULT_FILTERS.sort) p.set('sort', f.sort);
  if (f.order !== DEFAULT_FILTERS.order) p.set('order', f.order);
  p.set('limit', String(STREAMS_PAGE));
  if (cursor) p.set('cursor', cursor);
  return `/api/streams?${p.toString()}`;
}

export function historyApiUrl(address: string, f: DashboardFilters, cursor?: string | null): string {
  const p = new URLSearchParams();
  p.set('address', address);
  if (f.mine) p.set('mine', '1');
  p.set('limit', String(HISTORY_PAGE));
  if (cursor) p.set('cursor', cursor);
  return `/api/history?${p.toString()}`;
}

/** Identity of a paged list: address + tab + every server-side filter (client-only `kinds` excluded). */
export function filtersKey(f: DashboardFilters, address: string): string {
  const { kinds: _kinds, ...server } = f;
  return `${address}|${filtersToQuery({ ...server, kinds: [] }).toString()}`;
}
```

- [ ] **Step 5: Run GREEN + typecheck**

Run: `npx vitest run src/lib/dashboard/filters.test.ts src/lib/api 2>&1 | tail -6 && npm run typecheck 2>&1 | tail -3` → all pass, clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api/streamsQuery.ts frontend/src/lib/dashboard/filters.ts frontend/src/lib/dashboard/filters.test.ts
git commit -m "feat(dashboard): filter model, URL serialisation and API url builders"
```

---

### Task 2: Paged-list reducer

**Files:**
- Create: `frontend/src/lib/dashboard/paging.ts`
- Test: `frontend/src/lib/dashboard/paging.test.ts`

**Interfaces:**
- Produces: `Paged<T>`, `PagedAction<T>`, `emptyPaged(key)`, `pagedReducer`, `mergeFirstPage`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/dashboard/paging.test.ts
import { describe, expect, it } from 'vitest';
import { emptyPaged, mergeFirstPage, pagedReducer, type Paged } from './paging';

type Row = { id: number; v: string };
const idOf = (r: Row) => r.id;
const rows = (...ids: number[]): Row[] => ids.map((id) => ({ id, v: `v${id}` }));

describe('pagedReducer', () => {
  it('reset → loading empty state keyed by the filter key', () => {
    const s = pagedReducer(emptyPaged('old'), { type: 'reset', key: 'k1' });
    expect(s).toEqual({ key: 'k1', items: [], pending: [], cursor: null, loading: true, error: null, exhausted: false, newCount: 0, loadedOnce: false });
  });
  it('page appends and tracks cursor / exhaustion; stale keys are ignored', () => {
    let s = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
    s = pagedReducer(s, { type: 'page', key: 'k1', items: rows(1, 2), cursor: 'c1' });
    expect(s).toMatchObject({ items: rows(1, 2), cursor: 'c1', loading: false, exhausted: false, loadedOnce: true });
    const stale = pagedReducer(s, { type: 'page', key: 'other', items: rows(9), cursor: null });
    expect(stale).toBe(s);
    s = pagedReducer(s, { type: 'load_more' });
    expect(s.loading).toBe(true);
    s = pagedReducer(s, { type: 'page', key: 'k1', items: rows(3), cursor: null });
    expect(s).toMatchObject({ items: rows(1, 2, 3), cursor: null, loading: false, exhausted: true });
  });
  it('fail stores the error and stops loading; stale keys ignored', () => {
    let s = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
    s = pagedReducer(s, { type: 'fail', key: 'k1', error: 'boom' });
    expect(s).toMatchObject({ loading: false, error: 'boom' });
    expect(pagedReducer(s, { type: 'fail', key: 'zzz', error: 'x' })).toBe(s);
  });
  it('refresh updates loaded rows in place, holds new rows until absorb_new', () => {
    let s = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
    s = pagedReducer(s, { type: 'page', key: 'k1', items: rows(5, 4, 3), cursor: 'c' });
    s = pagedReducer(s, { type: 'refresh', key: 'k1', items: [{ id: 7, v: 'new7' }, { id: 6, v: 'new6' }, { id: 5, v: 'upd5' }, { id: 4, v: 'v4' }], cursor: 'c2', idOf });
    expect(s.items).toEqual([{ id: 5, v: 'upd5' }, { id: 4, v: 'v4' }, { id: 3, v: 'v3' }]);
    expect(s.pending).toEqual([{ id: 7, v: 'new7' }, { id: 6, v: 'new6' }]);
    expect(s.newCount).toBe(2);
    expect(s.cursor).toBe('c'); // paging cursor is not replaced by a refresh
    s = pagedReducer(s, { type: 'absorb_new' });
    expect(s.items.map(idOf)).toEqual([7, 6, 5, 4, 3]);
    expect(s.pending).toEqual([]);
    expect(s.newCount).toBe(0);
  });
  it('a second refresh does not double-count already pending rows', () => {
    let s = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
    s = pagedReducer(s, { type: 'page', key: 'k1', items: rows(1), cursor: null });
    s = pagedReducer(s, { type: 'refresh', key: 'k1', items: rows(2, 1), cursor: null, idOf });
    s = pagedReducer(s, { type: 'refresh', key: 'k1', items: rows(3, 2, 1), cursor: null, idOf });
    expect(s.pending.map(idOf)).toEqual([3, 2]);
    expect(s.newCount).toBe(2);
  });
  it('refresh with a stale key is ignored', () => {
    const s = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
    expect(pagedReducer(s, { type: 'refresh', key: 'k2', items: rows(1), cursor: null, idOf })).toBe(s);
  });
});

describe('mergeFirstPage', () => {
  it('updates existing rows and returns the unseen ones in order', () => {
    const { items, fresh } = mergeFirstPage(rows(3, 2, 1), [{ id: 4, v: 'n' }, { id: 3, v: 'u' }], idOf);
    expect(items).toEqual([{ id: 3, v: 'u' }, { id: 2, v: 'v2' }, { id: 1, v: 'v1' }]);
    expect(fresh).toEqual([{ id: 4, v: 'n' }]);
  });
});
```

- [ ] **Step 2: RED** — `npx vitest run src/lib/dashboard/paging.test.ts 2>&1 | tail -6` → cannot find module.

- [ ] **Step 3: Implement `paging.ts`**

```ts
// frontend/src/lib/dashboard/paging.ts
//
// Cursor-paged list state for the dashboard. Pure reducer; the hook in
// usePagedList.ts performs the fetches and dispatches here.

export type Paged<T> = {
  /** Identity of the list (address + tab + server-side filters). */
  key: string;
  items: T[];
  /** Rows that appeared at the top on refresh, held back until the user asks. */
  pending: T[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
  exhausted: boolean;
  newCount: number;
  loadedOnce: boolean;
};

export type PagedAction<T> =
  | { type: 'reset'; key: string }
  | { type: 'page'; key: string; items: T[]; cursor: string | null }
  | { type: 'refresh'; key: string; items: T[]; cursor: string | null; idOf: (t: T) => string | number }
  | { type: 'fail'; key: string; error: string }
  | { type: 'load_more' }
  | { type: 'absorb_new' };

export function emptyPaged<T>(key: string): Paged<T> {
  return { key, items: [], pending: [], cursor: null, loading: false, error: null, exhausted: false, newCount: 0, loadedOnce: false };
}

/** Update rows already in `existing` from `fresh`; return rows of `fresh` not yet present, in their order. */
export function mergeFirstPage<T>(existing: T[], freshPage: T[], idOf: (t: T) => string | number): { items: T[]; fresh: T[] } {
  const byId = new Map<string | number, T>();
  for (const f of freshPage) byId.set(idOf(f), f);
  const items = existing.map((e) => byId.get(idOf(e)) ?? e);
  const known = new Set(existing.map(idOf));
  const fresh = freshPage.filter((f) => !known.has(idOf(f)));
  return { items, fresh };
}

export function pagedReducer<T>(s: Paged<T>, a: PagedAction<T>): Paged<T> {
  switch (a.type) {
    case 'reset':
      return { ...emptyPaged<T>(a.key), loading: true };
    case 'page':
      if (a.key !== s.key) return s;
      return { ...s, items: [...s.items, ...a.items], cursor: a.cursor, loading: false, error: null, exhausted: a.cursor === null, loadedOnce: true };
    case 'refresh': {
      if (a.key !== s.key) return s;
      const { items, fresh } = mergeFirstPage(s.items, a.items, a.idOf);
      const pendingIds = new Set(s.pending.map(a.idOf));
      const pending = [...fresh.filter((f) => !pendingIds.has(a.idOf(f))), ...s.pending.map((p) => a.items.find((x) => a.idOf(x) === a.idOf(p)) ?? p)];
      // keep the fresh page's order for pending rows
      const order = new Map(a.items.map((x, i) => [a.idOf(x), i] as const));
      pending.sort((x, y) => (order.get(a.idOf(x)) ?? 0) - (order.get(a.idOf(y)) ?? 0));
      return { ...s, items, pending, newCount: pending.length, error: null };
    }
    case 'fail':
      if (a.key !== s.key) return s;
      return { ...s, loading: false, error: a.error };
    case 'load_more':
      return s.exhausted || s.loading ? s : { ...s, loading: true };
    case 'absorb_new':
      return s.pending.length ? { ...s, items: [...s.pending, ...s.items], pending: [], newCount: 0 } : s;
  }
}
```

- [ ] **Step 4: GREEN + typecheck** — `npx vitest run src/lib/dashboard/paging.test.ts 2>&1 | tail -6 && npm run typecheck 2>&1 | tail -3`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dashboard/paging.ts frontend/src/lib/dashboard/paging.test.ts
git commit -m "feat(dashboard): cursor-paged list reducer with in-place refresh and held-back new rows"
```

---

### Task 3: History rows (+ explorer helper)

**Files:**
- Create: `frontend/src/lib/explorer.ts` (verbatim copy of the file on `feat/create-flow-v2`: run `git show feat/create-flow-v2:frontend/src/lib/explorer.ts > frontend/src/lib/explorer.ts` from the worktree — the branch is visible to every worktree)
- Create: `frontend/src/lib/dashboard/history.ts`
- Test: `frontend/src/lib/dashboard/history.test.ts`

**Interfaces:**
- Consumes: `ActionDoc` (`@/lib/db`), `ACTION_KINDS`, `ActionKind` (Task 1).
- Produces: `HistoryItem` (API item type), `HistoryRow`, `toHistoryRow(item, address)`, `filterHistoryRows(rows, kinds)`, `KIND_COLOR`, `KIND_LABEL`; `explorerBase`, `txUrl`, `accountUrl` from `@/lib/explorer`.

- [ ] **Step 1: Copy `explorer.ts`**

`git show feat/create-flow-v2:frontend/src/lib/explorer.ts > frontend/src/lib/explorer.ts` then `cat frontend/src/lib/explorer.ts` — it must export `explorerBase()`, `txUrl(hash)`, `accountUrl(address)` and import `DEPLOYMENT` from `./deployments`.

- [ ] **Step 2: Write the failing tests**

```ts
// frontend/src/lib/dashboard/history.test.ts
import { describe, expect, it } from 'vitest';
import { KIND_COLOR, KIND_LABEL, filterHistoryRows, toHistoryRow, type HistoryItem } from './history';
import { ACTION_KINDS } from './filters';

const ME = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const OTHER = 'GAWIFBYR7ATAATABJT5XT5PI3PQAUK4ZZF4EODQCWKINA3PTV43NWWAA';
const THIRD = 'GAFD2RMEQCGQ2BRXPFVECOUT3AT7UIZWPMSJRZFFHH5CI2TTTGKAQNNQ';

function item(over: Partial<HistoryItem>): HistoryItem {
  return {
    _id: 'x', stream_id: 7, action: 'created', ts: 1_800_000_000, ledger: 1, tx_hash: 'ab'.repeat(32), log_index: 3, participants: [ME, OTHER],
    stream: { id: 7, model: 'Linear', token: 'CTOKEN', sender: ME, recipient: OTHER, deposited: '1000' },
    ...over,
  } as HistoryItem;
}

describe('toHistoryRow', () => {
  it('created: amount = deposited, counterparty = the other party, mine when I am the actor', () => {
    const r = toHistoryRow(item({ actor: ME }), ME);
    expect(r).toEqual({ id: `${'ab'.repeat(32)}:3`, kind: 'created', ts: 1_800_000_000, streamId: 7, model: 'Linear', token: 'CTOKEN', amount: 1000n, secondary: null, counterparty: OTHER, actor: ME, mine: true, txHash: 'ab'.repeat(32) });
    expect(toHistoryRow(item({ actor: ME }), OTHER).counterparty).toBe(ME);
    expect(toHistoryRow(item({ actor: ME }), OTHER).mine).toBe(false);
  });
  it('withdrawn: amount, counterparty = `to` when it is not me', () => {
    const r = toHistoryRow(item({ action: 'withdrawn', amount: '250', actor: OTHER, to: THIRD }), ME);
    expect(r).toMatchObject({ kind: 'withdrawn', amount: 250n, counterparty: THIRD, actor: OTHER, mine: false });
    expect(toHistoryRow(item({ action: 'withdrawn', amount: '250', actor: OTHER, to: OTHER }), ME).counterparty).toBe(OTHER);
  });
  it('canceled: amount = sender_refund, secondary = recipient_balance', () => {
    const r = toHistoryRow(item({ action: 'canceled', actor: ME, sender_refund: '600', recipient_balance: '400' }), ME);
    expect(r).toMatchObject({ kind: 'canceled', amount: 600n, secondary: 400n, counterparty: OTHER, mine: true });
  });
  it('transferred: counterparty = new_owner; renounced/burned: no amount', () => {
    expect(toHistoryRow(item({ action: 'transferred', actor: OTHER, new_owner: THIRD }), ME)).toMatchObject({ kind: 'transferred', amount: null, counterparty: THIRD });
    expect(toHistoryRow(item({ action: 'renounced', actor: ME }), ME)).toMatchObject({ kind: 'renounced', amount: null, secondary: null });
    expect(toHistoryRow(item({ action: 'burned', actor: OTHER }), ME)).toMatchObject({ kind: 'burned', amount: null, counterparty: OTHER });
  });
  it('tolerates a missing stream summary and bad numbers', () => {
    const r = toHistoryRow(item({ stream: null, amount: 'nope', action: 'withdrawn' }), ME);
    expect(r).toMatchObject({ streamId: 7, model: null, token: null, amount: null, counterparty: OTHER });
  });
});

describe('filterHistoryRows / tables', () => {
  it('empty kinds = all; otherwise only the listed kinds', () => {
    const rows = ACTION_KINDS.map((k) => toHistoryRow(item({ action: k }), ME));
    expect(filterHistoryRows(rows, [])).toHaveLength(6);
    expect(filterHistoryRows(rows, ['withdrawn', 'burned']).map((r) => r.kind)).toEqual(['withdrawn', 'burned']);
  });
  it('every kind has a colour and a label', () => {
    for (const k of ACTION_KINDS) {
      expect(KIND_COLOR[k]).toMatch(/^bg-/);
      expect(KIND_LABEL[k].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: RED** — `npx vitest run src/lib/dashboard/history.test.ts 2>&1 | tail -6`.

- [ ] **Step 4: Implement `history.ts`**

```ts
// frontend/src/lib/dashboard/history.ts
//
// /api/history items → view rows. Pure.

import type { ActionDoc } from '@/lib/db';
import type { ActionKind } from './filters';

export type HistoryItem = ActionDoc & {
  stream: { id: number; model: 'Linear' | 'Tranched' | 'Recurring'; token: string; sender: string; recipient: string; deposited: string } | null;
};

export type HistoryRow = {
  id: string;
  kind: ActionKind;
  ts: number;
  streamId: number;
  model: 'Linear' | 'Tranched' | 'Recurring' | null;
  token: string | null;
  /** created: deposited · withdrawn: amount · canceled: sender refund */
  amount: bigint | null;
  /** canceled: what stayed withdrawable for the recipient */
  secondary: bigint | null;
  /** The other party relative to `address`. */
  counterparty: string | null;
  actor: string | null;
  mine: boolean;
  txHash: string;
};

export const KIND_LABEL: Record<ActionKind, string> = {
  created: 'Created',
  withdrawn: 'Withdrawn',
  canceled: 'Canceled',
  renounced: 'Renounced',
  transferred: 'Transferred',
  burned: 'Burned',
};

export const KIND_COLOR: Record<ActionKind, string> = {
  created: 'bg-sand',
  withdrawn: 'bg-teal',
  canceled: 'bg-rose',
  renounced: 'bg-violet',
  transferred: 'bg-cream',
  burned: 'bg-cream-dim',
};

function big(v: string | undefined): bigint | null {
  if (v === undefined) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

function otherParty(item: HistoryItem, address: string): string | null {
  const s = item.stream;
  if (item.action === 'transferred' && item.new_owner) return item.new_owner;
  if (item.action === 'withdrawn' && item.to && item.to !== address) return item.to;
  if (s) {
    if (s.sender === address) return s.recipient;
    if (s.recipient === address) return s.sender;
    return s.recipient;
  }
  const others = item.participants.filter((p) => p !== address);
  return others[0] ?? null;
}

export function toHistoryRow(item: HistoryItem, address: string): HistoryRow {
  const kind = item.action as ActionKind;
  let amount: bigint | null = null;
  let secondary: bigint | null = null;
  switch (kind) {
    case 'created':
      amount = big(item.stream?.deposited);
      break;
    case 'withdrawn':
      amount = big(item.amount);
      break;
    case 'canceled':
      amount = big(item.sender_refund);
      secondary = big(item.recipient_balance);
      break;
    default:
      break;
  }
  return {
    id: `${item.tx_hash}:${item.log_index}`,
    kind,
    ts: item.ts,
    streamId: item.stream_id,
    model: item.stream?.model ?? null,
    token: item.stream?.token ?? null,
    amount,
    secondary,
    counterparty: otherParty(item, address),
    actor: item.actor ?? null,
    mine: item.actor === address,
    txHash: item.tx_hash,
  };
}

export function filterHistoryRows(rows: HistoryRow[], kinds: ActionKind[]): HistoryRow[] {
  return kinds.length ? rows.filter((r) => kinds.includes(r.kind)) : rows;
}
```

- [ ] **Step 5: GREEN + typecheck**, then commit:

```bash
git add frontend/src/lib/explorer.ts frontend/src/lib/dashboard/history.ts frontend/src/lib/dashboard/history.test.ts
git commit -m "feat(dashboard): history row mapping; explorer url helpers (same as 3a)"
```

---

### Task 4: `streamedFraction` for all shapes + Recurring view shape in `LiveCounter`

**Files:**
- Modify: `frontend/src/lib/streaming.ts` (append `streamedFraction`)
- Modify: `frontend/src/lib/streaming.test.ts` (append tests)
- Modify: `frontend/src/components/LiveCounter.tsx` (`StreamShape` + `streamedAtMs` Recurring branch; export `streamedAtMs`)
- Test: `frontend/src/components/LiveCounter.test.ts`

**Interfaces:**
- Produces: `streamedFraction(t: StreamTerms, now: number): number` (0..1); `StreamShape` gains `{ tag: 'Recurring'; first_ts: number; period_secs: number; count: number; amount_per_period: bigint }`; `export function streamedAtMs(shape, startTs, endTs, deposited, nowMs): bigint`.

- [ ] **Step 1: Failing tests**

Append to `frontend/src/lib/streaming.test.ts` (keep existing imports; add `streamedFraction` to the import from `./streaming`):
```ts
describe('streamedFraction', () => {
  const base = { withdrawn: '0', refunded: '0', was_canceled: false, is_depleted: false } as const;
  it('linear: 0 before start, 1 after end, proportional in between', () => {
    const t = { ...base, model: 'Linear' as const, start_ts: 1000, cliff_ts: 1000, end_ts: 2000, deposited: '1000', unlock_at_start: '0', unlock_at_cliff: '0' };
    expect(streamedFraction(t, 999)).toBe(0);
    expect(streamedFraction(t, 1500)).toBe(0.5);
    expect(streamedFraction(t, 2500)).toBe(1);
  });
  it('tranched and recurring use the shared vesting math', () => {
    const tr = { ...base, model: 'Tranched' as const, start_ts: 100, end_ts: 300, deposited: '400', tranches: [{ amount: '100', ts: 100 }, { amount: '300', ts: 300 }] };
    expect(streamedFraction(tr, 200)).toBe(0.25);
    const rc = { ...base, model: 'Recurring' as const, start_ts: 100, end_ts: 400, deposited: '400', first_ts: 100, period_secs: 100, count: 4, amount_per_period: '100' };
    expect(streamedFraction(rc, 250)).toBe(0.5);
    expect(streamedFraction(rc, 5000)).toBe(1);
  });
  it('zero deposit → 0; huge amounts do not overflow', () => {
    const z = { ...base, model: 'Linear' as const, start_ts: 0, cliff_ts: 0, end_ts: 10, deposited: '0', unlock_at_start: '0', unlock_at_cliff: '0' };
    expect(streamedFraction(z, 5)).toBe(0);
    const h = { ...base, model: 'Linear' as const, start_ts: 0, cliff_ts: 0, end_ts: 4, deposited: '100000000000000000000000000', unlock_at_start: '0', unlock_at_cliff: '0' };
    expect(streamedFraction(h, 1)).toBe(0.25);
  });
});
```

Create `frontend/src/components/LiveCounter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { streamedAtMs, type StreamShape } from './LiveCounter';

describe('streamedAtMs — Recurring (O(1))', () => {
  const shape: StreamShape = { tag: 'Recurring', first_ts: 1_000, period_secs: 100, count: 5, amount_per_period: 10n };
  const start = 1_000;
  const end = 1_400; // first + (count-1)*period
  const dep = 50n;
  it('0 before the first unlock, A per elapsed period (inclusive), capped at count', () => {
    expect(streamedAtMs(shape, start, end, dep, 999_999)).toBe(0n);
    expect(streamedAtMs(shape, start, end, dep, 1_000_000)).toBe(10n);
    expect(streamedAtMs(shape, start, end, dep, 1_099_999)).toBe(10n);
    expect(streamedAtMs(shape, start, end, dep, 1_100_000)).toBe(20n);
    expect(streamedAtMs(shape, start, end, dep, 1_350_000)).toBe(40n);
    expect(streamedAtMs(shape, start, end, dep, 1_400_000)).toBe(50n);
    expect(streamedAtMs(shape, start, end, dep, 9_999_999_000)).toBe(50n);
  });
  it('does not allocate per period (count = 1e9 computes instantly)', () => {
    const huge: StreamShape = { tag: 'Recurring', first_ts: 0, period_secs: 1, count: 1_000_000_000, amount_per_period: 1n };
    const t0 = Date.now();
    expect(streamedAtMs(huge, 0, 999_999_999, 1_000_000_000n, 500_000_000_000)).toBe(500_000_001n);
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: RED** — `npx vitest run src/lib/streaming.test.ts src/components/LiveCounter.test.ts 2>&1 | tail -8` (streamedFraction not exported; LiveCounter has no `streamedAtMs` export / Recurring tag).

- [ ] **Step 3: Implement**

Append to `frontend/src/lib/streaming.ts`:
```ts
/** Share of the deposit vested at `now`, 0..1 (4-decimal precision, bigint-scaled). */
export function streamedFraction(t: StreamTerms, now: number): number {
  const deposited = big(t.deposited);
  if (deposited <= 0n) return 0;
  const streamed = streamedAmount(t, now);
  if (streamed <= 0n) return 0;
  if (streamed >= deposited) return 1;
  return Number((streamed * 10_000n) / deposited) / 10_000;
}
```

In `frontend/src/components/LiveCounter.tsx`: extend the type and the math, and export the function.
```ts
export type StreamShape =
  | { tag: 'Linear'; cliff_ts: number; unlock_at_start: bigint; unlock_at_cliff: bigint }
  | { tag: 'Tranched'; tranches: Array<{ amount: bigint; ts: number }> }
  | { tag: 'Recurring'; first_ts: number; period_secs: number; count: number; amount_per_period: bigint };
```
Replace `function streamedAtMs(` with `export function streamedAtMs(` and, before the `// Tranched` block, add:
```ts
  if (shape.tag === 'Recurring') {
    const firstMs = shape.first_ts * 1000;
    if (nowMs < firstMs) return 0n;
    const periodMs = Math.max(1, shape.period_secs) * 1000;
    const elapsedPeriods = Math.floor((nowMs - firstMs) / periodMs) + 1;
    const unlocked = Math.min(shape.count, elapsedPeriods);
    return shape.amount_per_period * BigInt(unlocked);
  }
```
(The existing `if (nowMs >= endMs) return deposited;` guard above stays; for recurring `endTs` = last unlock, so the cap is consistent.) Update the `Props.shape` doc comment to mention Recurring.

- [ ] **Step 4: GREEN + typecheck** — `npx vitest run src/lib/streaming.test.ts src/components/LiveCounter.test.ts 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3` (typecheck may now flag `stream/[id]/page.tsx` where `vshape.tag === 'Tranched'` narrowing is used — it should still compile since the union only grew; if `EmissionChart`'s `model={vshape.tag}` errors, that is fixed in Task 5 — in that case commit here with typecheck noting the one expected error and fix it in Task 5).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/streaming.ts frontend/src/lib/streaming.test.ts frontend/src/components/LiveCounter.tsx frontend/src/components/LiveCounter.test.ts
git commit -m "feat(streaming): streamedFraction for all shapes; O(1) Recurring view shape in LiveCounter"
```

---

### Task 5: Stream page — Recurring without materialising tranches

**Files:**
- Modify: `frontend/src/app/stream/[id]/page.tsx` (`recurringToTranches` ~line 61, `viewShape` ~line 78, unlock list ~lines 878–905, `EmissionChart` ~lines 911–920)
- Modify: `docs/superpowers/plans/2026-09-14-lockup-v0.2-followups.md` (mark the `recurringToTranches` bullet fixed)

**Interfaces:**
- Consumes: `StreamShape` with `Recurring` (Task 4).
- Produces: `RENDERED_UNLOCKS = 24`, `recurringPreview(shape, n)` (local helper) used for the unlock list and the emission chart.

- [ ] **Step 1: Replace the mapping**

Delete `recurringToTranches`. In `viewShape`, replace the last line with:
```ts
  const r = s.shape.values[0];
  return {
    tag: 'Recurring',
    first_ts: Number(r.first_ts),
    period_secs: Number(r.period_secs),
    count: Number(r.count),
    amount_per_period: BigInt(r.amount_per_period),
  };
```
Add after `viewShape`:
```ts
const RENDERED_UNLOCKS = 24;

/** First `n` unlocks of a recurring shape as tranche points (for lists and charts). */
function recurringPreview(
  r: Extract<ViewShape, { tag: 'Recurring' }>,
  n: number = RENDERED_UNLOCKS,
): Array<{ amount: bigint; ts: number }> {
  const shown = Math.min(n, r.count);
  return Array.from({ length: shown }, (_, i) => ({ amount: r.amount_per_period, ts: r.first_ts + i * r.period_secs }));
}
```

- [ ] **Step 2: Unlock list**

Replace the block `{vshape.tag === 'Tranched' && ( … tranches list … )}` (the `<div className="mt-8 pt-6 border-t border-stroke/40">` with `Unlocks`/`Tranches` eyebrow) with a version that handles both:
```tsx
{(vshape.tag === 'Tranched' || vshape.tag === 'Recurring') && (() => {
  const points = vshape.tag === 'Tranched' ? vshape.tranches : recurringPreview(vshape);
  const hidden = vshape.tag === 'Recurring' ? Math.max(0, vshape.count - points.length) : 0;
  return (
    <div className="mt-8 pt-6 border-t border-stroke/40">
      <p className="eyebrow text-cream-dim mb-4">{vshape.tag === 'Recurring' ? 'Unlocks' : 'Tranches'}</p>
      <ul className="space-y-0">
        {points.map((t, i) => (
          /* keep the existing <li> markup exactly as it is today */
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-3 text-xs text-cream-dim">
          and {hidden} more unlock{hidden === 1 ? '' : 's'} every {formatDuration(vshape.period_secs)} until {formatTimestamp(vshape.first_ts + (vshape.count - 1) * vshape.period_secs)}
        </p>
      )}
    </div>
  );
})()}
```
Keep the existing `<li>` body verbatim (only the array it maps over changes). `formatDuration` / `formatTimestamp` are already imported on this page (verify with grep; add to the `@/lib/format` import if missing).

- [ ] **Step 3: Emission chart**

Change the `EmissionChart` props to:
```tsx
model={vshape.tag === 'Linear' ? 'Linear' : 'Tranched'}
…
tranches={vshape.tag === 'Tranched' ? vshape.tranches : vshape.tag === 'Recurring' ? recurringPreview(vshape) : []}
```
(`unlock_at_start` / `unlock_at_cliff` lines stay as they are.)

- [ ] **Step 4: Follow-ups doc**

In `docs/superpowers/plans/2026-09-14-lockup-v0.2-followups.md`, prefix the "Frontend (sub-project 3, before public beta)" bullet's `recurringToTranches` sentence with `~~` … `~~` and add `**Fixed on feat/dashboard-v2** (O(1) Recurring view shape; unlock list capped at 24).` at its start.

- [ ] **Step 5: Verify**

`npm run typecheck 2>&1 | tail -3` clean; `npm test 2>&1 | grep -E "Test Files|Tests "` green; `grep -n recurringToTranches frontend/src -r` → nothing.

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/stream/[id]/page.tsx" docs/superpowers/plans/2026-09-14-lockup-v0.2-followups.md
git commit -m "fix(stream): render Recurring streams without materialising every unlock"
```

---

### Task 6: Hooks — URL-synced filters and paged fetching

**Files:**
- Create: `frontend/src/lib/dashboard/useDashboardFilters.ts`
- Create: `frontend/src/lib/dashboard/usePagedList.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `useDashboardFilters(): { filters, set(patch), reset(keys?) }`; `usePagedList<T>(opts: { key: string; firstUrl: string | null; nextUrl: (cursor: string) => string | null; pick: (json: unknown) => { items: T[]; cursor: string | null }; idOf: (t: T) => string | number; refreshMs?: number }): { state: Paged<T>; loadMore(): void; absorbNew(): void; refresh(): void }`.

- [ ] **Step 1: `useDashboardFilters.ts`**

```ts
// frontend/src/lib/dashboard/useDashboardFilters.ts
'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_FILTERS, filtersToQuery, parseFilters, type DashboardFilters } from './filters';

/** Dashboard view state lives in the URL query; edits use router.replace (no history spam). */
export function useDashboardFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);

  const write = useCallback(
    (next: DashboardFilters) => {
      const qs = filtersToQuery(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const set = useCallback((patch: Partial<DashboardFilters>) => write({ ...filters, ...patch }), [filters, write]);
  const reset = useCallback(
    (keys?: (keyof DashboardFilters)[]) => {
      if (!keys) return write(DEFAULT_FILTERS);
      const next = { ...filters };
      for (const k of keys) (next as Record<string, unknown>)[k] = DEFAULT_FILTERS[k];
      write(next);
    },
    [filters, write],
  );

  return { filters, set, reset };
}
```

- [ ] **Step 2: `usePagedList.ts`**

```ts
// frontend/src/lib/dashboard/usePagedList.ts
'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { emptyPaged, pagedReducer, type Paged, type PagedAction } from './paging';

type Opts<T> = {
  /** Identity of the list; changing it resets and refetches. */
  key: string;
  /** First-page URL, or null to stay idle (invalid search, no wallet). */
  firstUrl: string | null;
  nextUrl: (cursor: string) => string | null;
  pick: (json: unknown) => { items: T[]; cursor: string | null };
  idOf: (t: T) => string | number;
  /** First-page refresh interval while the tab is visible; 0 disables. */
  refreshMs?: number;
};

async function fetchPage<T>(url: string, pick: Opts<T>['pick']): Promise<{ items: T[]; cursor: string | null }> {
  const res = await fetch(url, { cache: 'no-store' });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return pick(json);
}

export function usePagedList<T>(opts: Opts<T>) {
  const { key, firstUrl, nextUrl, pick, idOf, refreshMs = 10_000 } = opts;
  const [state, dispatch] = useReducer(pagedReducer<T>, emptyPaged<T>(key));
  const stateRef = useRef(state);
  stateRef.current = state;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const idRef = useRef(idOf);
  idRef.current = idOf;

  // Reset + first page whenever the identity or the first URL changes.
  useEffect(() => {
    dispatch({ type: 'reset', key } as PagedAction<T>);
    if (!firstUrl) {
      dispatch({ type: 'page', key, items: [], cursor: null } as PagedAction<T>);
      return;
    }
    let cancelled = false;
    fetchPage<T>(firstUrl, pickRef.current)
      .then((p) => !cancelled && dispatch({ type: 'page', key, items: p.items, cursor: p.cursor }))
      .catch((e: Error) => !cancelled && dispatch({ type: 'fail', key, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [key, firstUrl]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.loading || s.exhausted || !s.cursor) return;
    const url = nextUrl(s.cursor);
    if (!url) return;
    dispatch({ type: 'load_more' } as PagedAction<T>);
    fetchPage<T>(url, pickRef.current)
      .then((p) => dispatch({ type: 'page', key, items: p.items, cursor: p.cursor }))
      .catch((e: Error) => dispatch({ type: 'fail', key, error: e.message }));
  }, [key, nextUrl]);

  const refresh = useCallback(() => {
    const s = stateRef.current;
    if (!firstUrl || !s.loadedOnce || s.loading) return;
    fetchPage<T>(firstUrl, pickRef.current)
      .then((p) => dispatch({ type: 'refresh', key, items: p.items, cursor: p.cursor, idOf: idRef.current }))
      .catch(() => {
        /* a failed background refresh keeps the current list */
      });
  }, [key, firstUrl]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      refresh();
    }, refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  const absorbNew = useCallback(() => dispatch({ type: 'absorb_new' } as PagedAction<T>), []);

  return { state: state as Paged<T>, loadMore, absorbNew, refresh };
}
```

- [ ] **Step 3: Verify + commit** — `npm run typecheck 2>&1 | tail -3` clean (hooks not yet used).

```bash
git add frontend/src/lib/dashboard/useDashboardFilters.ts frontend/src/lib/dashboard/usePagedList.ts
git commit -m "feat(dashboard): URL-synced filter hook and cursor-paged fetch hook"
```

---

### Task 7: Stats strip and filter bar components

**Files:**
- Create: `frontend/src/components/dashboard/StatsStrip.tsx`, `FilterBar.tsx`, `RoleSegment.tsx`, `StatusMultiSelect.tsx`, `TokenSelect.tsx`, `ModelSelect.tsx`, `SearchBox.tsx`, `SortControl.tsx`

**Interfaces:**
- Consumes: `DashboardFilters`, `DEFAULT_FILTERS`, `isDefault`, `searchKind`, `STATUSES`-derived types (Task 1); `WalletStats` shape (from `@/lib/api/walletStats`: `{ now, counts: { sending, receiving, by_status }, by_token: [{ token, sent_deposited, sent_locked, received_withdrawn, received_withdrawable_now }] }`); `findToken`, `TOKENS`; `AmountTile`.
- Produces: `StatsStrip({ stats: WalletStats | null })`; `FilterBar({ filters, tokens: string[], onChange(patch), onClear() })` composed of the six controls; controls export their own small prop types.

- [ ] **Step 1: `StatsStrip.tsx`**

```tsx
// frontend/src/components/dashboard/StatsStrip.tsx
'use client';

import AmountTile from '@/components/AmountTile';
import type { WalletStats } from '@/lib/api/walletStats';
import { formatStroops, truncAddress } from '@/lib/format';
import { findToken } from '@/lib/tokens';

function sym(token: string): string {
  return findToken(token)?.symbol ?? truncAddress(token);
}

export default function StatsStrip({ stats }: { stats: WalletStats | null }) {
  const bs = stats?.counts.by_status;
  const breakdown = bs
    ? `${bs.STREAMING} streaming · ${bs.PENDING} pending · ${bs.SETTLED} settled · ${bs.CANCELED} canceled · ${bs.DEPLETED} depleted`
    : undefined;
  const tokens = (stats?.by_token ?? []).filter((t) => BigInt(t.sent_locked) > 0n || BigInt(t.received_withdrawable_now) > 0n);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:gap-4">
        <AmountTile label="Sending" amount={stats ? String(stats.counts.sending) : '—'} unit="streams" accent="sand" />
        <AmountTile label="Receiving" amount={stats ? String(stats.counts.receiving) : '—'} unit="streams" accent="teal" pulse={!!bs && bs.STREAMING > 0} />
        <AmountTile label="By status" amount={stats ? String(bs!.STREAMING) : '—'} unit="streaming" accent="cream" caption={breakdown} />
      </div>
      {tokens.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 xl:gap-4">
          {tokens.map((t) => (
            <div key={t.token} className="border border-stroke bg-night/40 px-4 py-3 font-mono text-xs">
              <p className="eyebrow text-cream-dim mb-2">· {sym(t.token)}</p>
              <p className="text-cream">
                locked <span className="text-sand-bright">{formatStroops(t.sent_locked)}</span>
                <span className="text-cream-dim"> as sender</span>
              </p>
              <p className="text-cream mt-1">
                claimable <span className="text-teal-bright">{formatStroops(t.received_withdrawable_now)}</span>
                <span className="text-cream-dim"> as recipient</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```
(Check `AmountTile`'s `caption` prop exists — `frontend/src/components/AmountTile.tsx` line ~21; if its name differs, adapt to the existing prop.)

- [ ] **Step 2: Controls**

`RoleSegment.tsx`:
```tsx
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
```

`StatusMultiSelect.tsx`:
```tsx
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
```

`TokenSelect.tsx`:
```tsx
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
```

`ModelSelect.tsx`:
```tsx
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
```

`SearchBox.tsx` (300 ms debounce; the URL only receives settled text):
```tsx
'use client';
import { useEffect, useState } from 'react';
import { searchKind } from '@/lib/dashboard/filters';

export default function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const id = setTimeout(() => onChange(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text, value, onChange]);
  const kind = searchKind(text);
  return (
    <div className="flex-1 min-w-[220px]">
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search: stream id, G… account or C… token"
        aria-label="Search streams"
        spellCheck={false}
        className="w-full bg-transparent border-b border-stroke px-0 py-1.5 font-mono text-xs text-cream placeholder:text-cream-dim/60 outline-none focus:border-sand"
      />
      {kind === 'invalid' && <p className="mt-1 text-[10px] text-warning">Search by stream id, G… account or C… token.</p>}
    </div>
  );
}
```

`SortControl.tsx`:
```tsx
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
```

`FilterBar.tsx`:
```tsx
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
```

- [ ] **Step 3: Verify + commit** — `npm run typecheck 2>&1 | tail -3`.

```bash
git add frontend/src/components/dashboard/StatsStrip.tsx frontend/src/components/dashboard/FilterBar.tsx frontend/src/components/dashboard/RoleSegment.tsx frontend/src/components/dashboard/StatusMultiSelect.tsx frontend/src/components/dashboard/TokenSelect.tsx frontend/src/components/dashboard/ModelSelect.tsx frontend/src/components/dashboard/SearchBox.tsx frontend/src/components/dashboard/SortControl.tsx
git commit -m "feat(dashboard): wallet stats strip and filter bar controls"
```

---

### Task 8: List components — StreamRow (moved), StreamList, LoadMore, NewItemsBanner, HistoryRow, HistoryList

**Files:**
- Create: `frontend/src/components/dashboard/StreamRow.tsx` (moved from `app/dashboard/page.tsx` lines 293–412, adapted), `StreamList.tsx`, `LoadMore.tsx`, `NewItemsBanner.tsx`, `HistoryRow.tsx`, `HistoryList.tsx`

**Interfaces:**
- Consumes: `StreamDoc & { status: StreamStatus; withdrawable_now: string }` rows (`ApiStream`), `streamedFraction` (Task 4), `HistoryRow` (Task 3), `Paged<T>` (Task 2), `txUrl` (Task 3), `KIND_COLOR`, `KIND_LABEL`, `findToken`, `formatStroops`, `formatDuration`, `formatTimestamp`, `truncAddress`, `StatusPill`.
- Produces: `ApiStream` type (in `StreamRow.tsx`), `StreamRow({ stream, nowSec, address })`, `StreamList({ state: Paged<ApiStream>, nowSec, address, hasFilters, onClear, onLoadMore, onAbsorbNew, invalidSearch })`, `LoadMore({ state, label, onClick })`, `NewItemsBanner({ count, noun, onShow })`, `HistoryRowView({ row, nowSec })` (default export of `HistoryRow.tsx`), `HistoryList({ state: Paged<HistoryRow>, nowSec, kinds, onLoadMore, onAbsorbNew })`.

- [ ] **Step 1: `StreamRow.tsx`**

Copy `StreamRow` from the page verbatim, then apply exactly these changes: `'use client'` + imports at top; props become `{ stream: ApiStream; nowSec: number; address: string }`; `const side = stream.sender === address ? 'sender' : 'recipient';` computed inside; `const status = stream.status;` (from the API row, not `deriveStatus`); `const fraction = useMemo(() => streamedFraction(stream, nowSec), [stream, nowSec]);` importing `streamedFraction` from `@/lib/streaming`; the hard-coded `XLM` unit becomes `{findToken(stream.token)?.symbol ?? 'TOKEN'}`; the arrow: `counterpartyLabel` is `'→ to'` for sender and `'← from'` for recipient. Add at the top:
```ts
import type { StreamDoc } from '@/lib/db';
import type { StreamStatus } from '@/lib/streaming';
export type ApiStream = StreamDoc & { status: StreamStatus; withdrawable_now: string };
```
Export default `StreamRow`.

- [ ] **Step 2: `LoadMore.tsx` and `NewItemsBanner.tsx`**

```tsx
// LoadMore.tsx
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
```
```tsx
// NewItemsBanner.tsx
'use client';
export default function NewItemsBanner({ count, noun, onShow }: { count: number; noun: string; onShow: () => void }) {
  if (count === 0) return null;
  return (
    <button type="button" onClick={onShow} className="w-full mb-3 py-2 border border-teal/50 bg-teal/5 font-mono text-[10px] uppercase tracking-[0.18em] text-teal-bright hover:bg-teal/10" aria-live="polite">
      {count} new {noun}{count === 1 ? '' : 's'} — show
    </button>
  );
}
```

- [ ] **Step 3: `StreamList.tsx`**

```tsx
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
```

- [ ] **Step 4: `HistoryRow.tsx` and `HistoryList.tsx`**

```tsx
// HistoryRow.tsx
'use client';
import Link from 'next/link';
import { KIND_COLOR, KIND_LABEL, type HistoryRow } from '@/lib/dashboard/history';
import { txUrl } from '@/lib/explorer';
import { formatDuration, formatStroops, formatTimestamp, truncAddress } from '@/lib/format';
import { findToken } from '@/lib/tokens';

export default function HistoryRowView({ row, nowSec }: { row: HistoryRow; nowSec: number }) {
  const sym = row.token ? (findToken(row.token)?.symbol ?? truncAddress(row.token)) : '';
  const link = txUrl(row.txHash);
  const ago = nowSec >= row.ts ? `${formatDuration(nowSec - row.ts)} ago` : 'just now';
  return (
    <li className="grid grid-cols-[12px_1fr_auto] gap-x-3 items-baseline py-3 border-b border-stroke/40">
      <span aria-hidden className={`mt-1 size-[8px] rounded-full ${KIND_COLOR[row.kind]}`} />
      <div className="min-w-0 font-mono text-xs">
        <p className="text-cream">
          <span className="uppercase tracking-[0.16em] text-[10px] text-cream-dim mr-2">{KIND_LABEL[row.kind]}</span>
          <Link href={`/stream/${row.streamId}`} className="text-sand hover:text-sand-bright">#{row.streamId}</Link>
          {row.model && <span className="text-cream-dim"> · {row.model}</span>}
          {row.amount !== null && (
            <span className="ml-2 text-sand-bright">
              {row.kind === 'canceled' ? 'refund ' : ''}{formatStroops(row.amount)} {sym}
            </span>
          )}
          {row.kind === 'canceled' && row.secondary !== null && <span className="text-cream-dim"> · {formatStroops(row.secondary)} {sym} left to recipient</span>}
        </p>
        <p className="mt-1 text-[11px] text-cream-dim truncate">
          {row.mine ? 'by you' : row.actor ? `by ${truncAddress(row.actor)}` : ''}
          {row.counterparty && <span> · {row.kind === 'transferred' ? 'to' : 'with'} {truncAddress(row.counterparty)}</span>}
        </p>
      </div>
      <div className="text-right font-mono text-[10px] text-cream-dim">
        <span title={formatTimestamp(row.ts)}>{ago}</span>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="block text-sand hover:text-sand-bright">tx ↗</a>
        )}
      </div>
    </li>
  );
}
```
```tsx
// HistoryList.tsx
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
```

- [ ] **Step 5: Verify + commit** — `npm run typecheck 2>&1 | tail -3`.

```bash
git add frontend/src/components/dashboard/StreamRow.tsx frontend/src/components/dashboard/StreamList.tsx frontend/src/components/dashboard/LoadMore.tsx frontend/src/components/dashboard/NewItemsBanner.tsx frontend/src/components/dashboard/HistoryRow.tsx frontend/src/components/dashboard/HistoryList.tsx
git commit -m "feat(dashboard): stream and history list components with load-more and new-items banner"
```

---

### Task 9: Compose `/dashboard`, docs, checklist, build

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx` (replace whole file)
- Modify: `frontend/README.md` (new "Dashboard" section after "Create flow" if present, else after "Layout")
- Create: `docs/evidence/2026-09-dashboard-v2.md`

- [ ] **Step 1: Replace `page.tsx`**

```tsx
'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import TabBar from '@/components/TabBar';
import WalletButton from '@/components/WalletButton';
import FilterBar from '@/components/dashboard/FilterBar';
import HistoryList from '@/components/dashboard/HistoryList';
import StatsStrip from '@/components/dashboard/StatsStrip';
import StreamList from '@/components/dashboard/StreamList';
import type { ApiStream } from '@/components/dashboard/StreamRow';
import type { WalletStats } from '@/lib/api/walletStats';
import { filtersKey, historyApiUrl, isDefault, searchKind, streamsApiUrl, type DashboardFilters } from '@/lib/dashboard/filters';
import { toHistoryRow, type HistoryItem, type HistoryRow } from '@/lib/dashboard/history';
import { useDashboardFilters } from '@/lib/dashboard/useDashboardFilters';
import { usePagedList } from '@/lib/dashboard/usePagedList';
import { useWallet } from '@/lib/wallet-context';

const FILTER_KEYS: (keyof DashboardFilters)[] = ['role', 'status', 'token', 'model', 'q', 'sort', 'order'];
const TABS = [
  { id: 'streams', label: 'Streams' },
  { id: 'history', label: 'History' },
];

export default function DashboardPage(): ReactNode {
  return (
    <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24 pt-10 sm:pt-16 md:pt-24 xl:pt-28 pb-16">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-8 sm:mb-10">
        <p className="eyebrow xl:text-[0.78rem] 2xl:text-[0.85rem]">
          <span className="text-sand">·</span> <span className="ml-1">Dashboard</span> <span className="mx-2 text-stroke-2">/</span> Your streams
        </p>
      </div>
      {/* useSearchParams needs a Suspense boundary for static prerendering */}
      <Suspense fallback={null}>
        <DashboardBody />
      </Suspense>
    </div>
  );
}

function DashboardBody(): ReactNode {
  const { address, pending } = useWallet();
  if (!address) return <DisconnectedView pending={pending} />;
  return <ConnectedView address={address} />;
}

function DisconnectedView({ pending: _pending }: { pending: boolean }): ReactNode {
  return (
    <div className="mt-12 sm:mt-20 xl:mt-28 mx-auto max-w-[560px] xl:max-w-[720px] 2xl:max-w-[840px] text-center">
      <h1 className="headline text-4xl sm:text-5xl md:text-6xl xl:text-7xl 2xl:text-8xl text-cream leading-[0.95]">
        A ledger,
        <br />
        <span className="text-sand-bright">awaiting an owner.</span>
      </h1>
      <p className="mt-6 sm:mt-8 xl:mt-10 xl:text-lg 2xl:text-xl text-cream-muted leading-relaxed">
        Connect a wallet to see the streams you’ve sent and the streams flowing toward you.
      </p>
      <div className="mt-8 sm:mt-10 flex justify-center">
        <WalletButton />
      </div>
    </div>
  );
}

function ConnectedView({ address }: { address: string }): ReactNode {
  const { filters, set, reset } = useDashboardFilters();
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Stats + token list (refreshed with the first page cadence).
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const loadStats = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        fetch(`/api/stats?address=${encodeURIComponent(address)}`, { cache: 'no-store' }),
        fetch('/api/tokens', { cache: 'no-store' }),
      ]);
      if (!s.ok) throw new Error(((await s.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${s.status}`);
      setStats((await s.json()) as WalletStats);
      if (t.ok) setTokens((((await t.json()) as { tokens?: Array<{ token: string }> }).tokens ?? []).map((x) => x.token));
      setApiError(null);
    } catch (e) {
      setApiError((e as Error).message);
    }
  }, [address]);
  useEffect(() => {
    void loadStats();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void loadStats();
    }, 10_000);
    return () => clearInterval(id);
  }, [loadStats]);

  // Streams list
  const streamsFirst = useMemo(() => streamsApiUrl(address, filters), [address, filters]);
  const streamsNext = useCallback((c: string) => streamsApiUrl(address, filters, c), [address, filters]);
  const streams = usePagedList<ApiStream>({
    key: filtersKey({ ...filters, tab: 'streams' }, address),
    firstUrl: streamsFirst, // both lists stay live across tab switches (spec §4)
    nextUrl: streamsNext,
    pick: (json) => {
      const j = json as { streams?: ApiStream[]; next_cursor?: string | null };
      return { items: j.streams ?? [], cursor: j.next_cursor ?? null };
    },
    idOf: (s) => s._id,
  });

  // History list
  const historyFirst = useMemo(() => historyApiUrl(address, filters), [address, filters]);
  const historyNext = useCallback((c: string) => historyApiUrl(address, filters, c), [address, filters]);
  const history = usePagedList<HistoryRow>({
    key: filtersKey({ ...filters, tab: 'history' }, address),
    firstUrl: historyFirst,
    nextUrl: historyNext,
    pick: (json) => {
      const j = json as { items?: HistoryItem[]; next_cursor?: string | null };
      return { items: (j.items ?? []).map((i) => toHistoryRow(i, address)), cursor: j.next_cursor ?? null };
    },
    idOf: (r) => r.id,
  });

  const hasFilters = !isDefault(filters, FILTER_KEYS);
  const listError = filters.tab === 'streams' ? streams.state.error : history.state.error;
  const error = apiError ?? listError;

  return (
    <>
      <StatsStrip stats={stats} />

      {error && (
        <div className="mt-8 border border-warning/40 bg-warning/5 px-5 py-4 rounded-sm">
          <p className="eyebrow text-warning mb-2">· Indexer offline?</p>
          <p className="text-xs text-cream-muted leading-relaxed">
            Could not reach the indexer API. Make sure the indexer is running (<span className="font-mono text-cream">npx tsx scripts/indexer.ts</span>) and that Mongo is up.
          </p>
          <p className="mt-3 font-mono text-[11px] text-cream-dim break-all">{error}</p>
        </div>
      )}

      <div className="mt-10">
        <TabBar tabs={TABS} active={filters.tab} onChange={(id) => set({ tab: id as DashboardFilters['tab'] })} />
      </div>

      {filters.tab === 'streams' ? (
        <div className="mt-6 space-y-6">
          <FilterBar filters={filters} tokens={tokens} onChange={set} onClear={() => reset(FILTER_KEYS)} />
          <StreamList
            state={streams.state}
            nowSec={nowSec}
            address={address}
            hasFilters={hasFilters}
            invalidSearch={searchKind(filters.q) === 'invalid'}
            onClear={() => reset(FILTER_KEYS)}
            onLoadMore={streams.loadMore}
            onAbsorbNew={streams.absorbNew}
          />
        </div>
      ) : (
        <div className="mt-6">
          <HistoryList
            state={history.state}
            nowSec={nowSec}
            kinds={filters.kinds}
            mine={filters.mine}
            onKinds={(kinds) => set({ kinds })}
            onMine={(mine) => set({ mine })}
            onLoadMore={history.loadMore}
            onAbsorbNew={history.absorbNew}
          />
        </div>
      )}
    </>
  );
}
```
Check `TabBar`'s `onChange` signature (`(id: string) => void`) — adapt the cast if it is typed differently.

- [ ] **Step 2: README + evidence checklist**

`frontend/README.md`: add
```markdown
## Dashboard

`/dashboard` has two tabs whose state lives in the URL (`?tab=history&role=sender&status=streaming,pending&token=C…&model=Recurring&q=45&sort=start_ts&order=asc&mine=1&kinds=withdrawn`), so any view can be shared or reloaded.

- **Streams**: role (all / sending / receiving), status chips, token, shape, search (stream id, `G…` account prefix or `C…` token prefix — anything else is not sent), sort field + order; 20 per page with "Load 20 more"; the first page refreshes every 10 s and new streams are announced in a banner instead of shifting the list.
- **History**: every action on every stream the wallet participates in (`/api/history`), "Only my actions", client-side kind chips; 25 per page.
- Stats come from `/api/stats?address=`; tokens from `/api/tokens`. Logic lives in `src/lib/dashboard/` (pure, unit-tested); UI in `src/components/dashboard/`.
```
`docs/evidence/2026-09-dashboard-v2.md`:
```markdown
# Dashboard v2 — manual checklist (testnet, wallet with ≥ 21 streams: the deployer has 65)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Open `/dashboard`, connect | stats strip shows sending/receiving counts and token totals; 20 rows; "Load 20 more" | |
| 2 | Role = Sending, Status = streaming, Shape = Recurring | list narrows; URL contains `role=sender&status=streaming&model=Recurring` | |
| 3 | Reload the page | same filters and list | |
| 4 | Search `45` / a `G…` prefix / `hello` | id match / prefix matches / hint, no request | |
| 5 | Sort by End ascending | order flips; URL `sort=end_ts&order=asc` | |
| 6 | Create a stream in another tab, wait ≤ 10 s | "1 new stream — show" banner; click → row at top | |
| 7 | History tab, Only my actions off/on, kinds = Withdrawn | rows with tx links; filters apply | |
| 8 | Open a recurring stream with count ≥ 100 | detail page renders instantly; "and N more unlocks" caption | |
```

- [ ] **Step 3: Verify**

`npm run typecheck 2>&1 | tail -3`; `npm test 2>&1 | grep -E "Test Files|Tests "`; `npm run build 2>&1 | tail -15` (expect `/dashboard` to build; if Next reports "useSearchParams() should be wrapped in a suspense boundary", the `Suspense` in `DashboardPage` is missing); dev smoke on a free port: `(npm run dev -- -p 3011 > /tmp/hg-dash.log 2>&1 &)`, poll `curl -s -o /dev/null -w "%{http_code}" http://localhost:3011/dashboard` until 200 (≤ 60 s), then `pkill -f "next dev -p 3011" || pkill -f "next dev" ; true` — never kill the user's server on port 3000: check `pgrep -fl "next dev"` and only kill the process whose args contain `3011`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx frontend/README.md docs/evidence/2026-09-dashboard-v2.md
git commit -m "feat(dashboard): two-tab dashboard with URL-driven filters, search, paging and wallet history"
```

---

## Self-review notes (plan author)

- **Spec coverage:** §4 → Task 1; §5 → Tasks 2, 6; §6 → Tasks 7, 8, 9; §7 → Tasks 3, 8; §8 → Tasks 4, 5; §9 edge cases → invalid search (Tasks 1, 8), stale key drop (Task 2), address in key (Task 1), `status=active` chip (Task 7), cursor not in URL (Task 2/6); §10 → tests in Tasks 1–4, checklist in Task 9; §11 file map matches.
- **Deviations:** `ACTION_KINDS` lives in `filters.ts` (history imports it) to avoid a cycle; the page's stats/token fetch is a small inline effect rather than a hook (two calls, no paging); the stream page's `EventsLog` stays as is (spec amended); both lists fetch regardless of the active tab so switching tabs keeps loaded pages (two small requests per 10 s).
- **Type consistency:** `Paged<T>` fields (`loadedOnce`, `pending`, `newCount`) used identically in Tasks 2, 6, 8; `ApiStream` defined in Task 8 and consumed in Task 9; `HistoryItem`/`HistoryRow` from Task 3 used in Task 9's `pick`; `filtersKey(f, address)` signature consistent between Tasks 1 and 9.
