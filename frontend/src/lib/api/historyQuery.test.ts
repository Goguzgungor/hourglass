import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { encodeCursor } from './cursor';
import { ParamError } from './params';
import { buildHistoryQuery, nextHistoryCursor } from './historyQuery';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const h = (s: string) => buildHistoryQuery(new URLSearchParams(s));

describe('buildHistoryQuery', () => {
  it('requires address', () => {
    expect(() => h('')).toThrow(ParamError);
  });
  it('filters on participants by default, actor with mine=1', () => {
    expect(h(`address=${G1}`).filter).toEqual({ participants: G1 });
    expect(h(`address=${G1}&mine=1`).filter).toEqual({ actor: G1 });
  });
  it('narrows by stream_id', () => {
    expect(h(`address=${G1}&stream_id=12`).filter).toEqual({ participants: G1, stream_id: 12 });
    expect(() => h(`address=${G1}&stream_id=x`)).toThrow(ParamError);
  });
  it('default limit 50, clamped to 100', () => {
    expect(h(`address=${G1}`).limit).toBe(50);
    expect(h(`address=${G1}&limit=1000`).limit).toBe(100);
  });
  it('cursor adds a keyset condition on (ts, log_index, _id) desc', () => {
    const id = new ObjectId('65a1b2c3d4e5f6a7b8c9d0e1');
    const c = encodeCursor({ ts: 100, log_index: 2_000_000, id: id.toHexString() });
    expect(h(`address=${G1}&cursor=${c}`).filter).toEqual({
      participants: G1,
      $or: [
        { ts: { $lt: 100 } },
        { ts: 100, log_index: { $lt: 2_000_000 } },
        { ts: 100, log_index: 2_000_000, _id: { $lt: id } },
      ],
    });
  });
  it('nextHistoryCursor round-trips', () => {
    const id = new ObjectId('65a1b2c3d4e5f6a7b8c9d0e1');
    const c = nextHistoryCursor({ _id: id, ts: 5, log_index: 3 });
    expect(h(`address=${G1}&cursor=${c}`).filter).toHaveProperty('$or');
  });
});
