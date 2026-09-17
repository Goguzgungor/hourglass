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

/** Search text as the API wants it: trimmed and upper-cased (ids unaffected). */
export function normalizeSearch(q: string): string {
  return q.trim().toUpperCase();
}

export function searchKind(q: string): SearchKind {
  const t = normalizeSearch(q);
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
  if (kind !== 'empty') p.set('q', normalizeSearch(f.q));
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

/**
 * Identity of a paged list: the address plus exactly the fields that list's
 * request depends on (so an edit to the other tab's filters never resets it).
 */
export function filtersKey(f: DashboardFilters, address: string): string {
  if (f.tab === 'history') return `history|${historyApiUrl(address, f)}`;
  return `streams|${streamsApiUrl(address, f) ?? 'invalid'}`;
}
