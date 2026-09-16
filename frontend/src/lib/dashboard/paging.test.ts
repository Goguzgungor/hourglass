import { describe, expect, it } from 'vitest';
import { emptyPaged, mergeFirstPage, pagedReducer, type Paged } from './paging';

type Row = { id: number; v: string };
const idOf = (r: Row) => r.id;
const rows = (...ids: number[]): Row[] => ids.map((id) => ({ id, v: `v${id}` }));

describe('pagedReducer', () => {
  it('reset → loading empty state keyed by the filter key', () => {
    const s: Paged<Row> = pagedReducer(emptyPaged('old'), { type: 'reset', key: 'k1' });
    expect(s).toEqual({ key: 'k1', items: [], pending: [], cursor: null, loading: true, error: null, exhausted: false, newCount: 0, loadedOnce: false });
  });
  it('page appends and tracks cursor / exhaustion; stale keys are ignored', () => {
    let s: Paged<Row> = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
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
    let s: Paged<Row> = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
    s = pagedReducer(s, { type: 'fail', key: 'k1', error: 'boom' });
    expect(s).toMatchObject({ loading: false, error: 'boom' });
    expect(pagedReducer(s, { type: 'fail', key: 'zzz', error: 'x' })).toBe(s);
  });
  it('refresh updates loaded rows in place, holds new rows until absorb_new', () => {
    let s: Paged<Row> = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
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
    let s: Paged<Row> = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
    s = pagedReducer(s, { type: 'page', key: 'k1', items: rows(1), cursor: null });
    s = pagedReducer(s, { type: 'refresh', key: 'k1', items: rows(2, 1), cursor: null, idOf });
    s = pagedReducer(s, { type: 'refresh', key: 'k1', items: rows(3, 2, 1), cursor: null, idOf });
    expect(s.pending.map(idOf)).toEqual([3, 2]);
    expect(s.newCount).toBe(2);
  });
  it('refresh with a stale key is ignored', () => {
    const s: Paged<Row> = pagedReducer(emptyPaged('k1'), { type: 'reset', key: 'k1' });
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
