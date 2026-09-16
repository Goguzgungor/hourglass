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
