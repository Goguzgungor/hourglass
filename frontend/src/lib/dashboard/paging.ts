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
