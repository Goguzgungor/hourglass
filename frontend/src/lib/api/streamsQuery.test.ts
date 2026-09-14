import { describe, expect, it } from 'vitest';
import { encodeCursor } from './cursor';
import { ParamError } from './params';
import { buildStreamsQuery, nextStreamsCursor } from './streamsQuery';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const G2 = 'GAFD2RMEQCGQ2BRXPFVECOUT3AT7UIZWPMSJRZFFHH5CI2TTTGKAQNNQ';
const C1 = 'CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU';
const NOW = 1_800_000_000;
const q = (s: string) => buildStreamsQuery(new URLSearchParams(s), NOW);

describe('buildStreamsQuery — defaults', () => {
  it('returns an empty filter, created_at desc, limit 50', () => {
    const r = q('');
    expect(r.filter).toEqual({});
    expect(r.sort).toEqual({ created_at: -1, _id: -1 });
    expect(r.limit).toBe(50);
  });
});

describe('address + role', () => {
  it('any → $or on sender/recipient', () => {
    expect(q(`address=${G1}`).filter).toEqual({ $or: [{ sender: G1 }, { recipient: G1 }] });
  });
  it('sender / recipient roles', () => {
    expect(q(`address=${G1}&role=sender`).filter).toEqual({ sender: G1 });
    expect(q(`address=${G1}&role=recipient`).filter).toEqual({ recipient: G1 });
  });
  it('legacy sender= / recipient= map to the same filters with default limit 100', () => {
    expect(q(`sender=${G1}`).filter).toEqual({ sender: G1 });
    expect(q(`sender=${G1}`).limit).toBe(100);
    expect(q(`sender=${G1}&recipient=${G2}`).filter).toEqual({ sender: G1, recipient: G2 });
  });
});

describe('status', () => {
  it('legacy active/inactive', () => {
    expect(q('status=active').filter).toEqual({ was_canceled: false, is_depleted: false });
    expect(q('status=inactive').filter).toEqual({ $or: [{ was_canceled: true }, { is_depleted: true }] });
  });
  it('derived statuses use plain time comparisons against now', () => {
    expect(q('status=pending').filter).toEqual({
      start_ts: { $gt: NOW }, was_canceled: false, is_depleted: false,
    });
    expect(q('status=streaming').filter).toEqual({
      start_ts: { $lte: NOW }, end_ts: { $gt: NOW }, was_canceled: false, is_depleted: false,
    });
    expect(q('status=settled').filter).toEqual({
      end_ts: { $lte: NOW }, was_canceled: false, is_depleted: false,
    });
    expect(q('status=canceled').filter).toEqual({ was_canceled: true, is_depleted: false });
    expect(q('status=depleted').filter).toEqual({ is_depleted: true });
  });
  it('a list becomes $or', () => {
    expect(q('status=canceled,depleted').filter).toEqual({
      $or: [{ was_canceled: true, is_depleted: false }, { is_depleted: true }],
    });
  });
  it('rejects unknown values', () => {
    expect(() => q('status=bogus')).toThrow(ParamError);
  });
});

describe('token, model, q', () => {
  it('exact token and model', () => {
    expect(q(`token=${C1}&model=Recurring`).filter).toEqual({ token: C1, model: 'Recurring' });
  });
  it('numeric q → _id', () => {
    expect(q('q=42').filter).toEqual({ _id: 42 });
  });
  it('G-prefix q → sender/recipient prefix, C-prefix → token prefix', () => {
    expect(q('q=GBXD').filter).toEqual({
      $or: [{ sender: { $regex: '^GBXD' } }, { recipient: { $regex: '^GBXD' } }],
    });
    expect(q('q=CCP7').filter).toEqual({ token: { $regex: '^CCP7' } });
  });
  it('anything else is ignored', () => {
    expect(q('q=hello world').filter).toEqual({});
  });
  it('combines several $or clauses with $and', () => {
    expect(q(`address=${G1}&q=GAFD`).filter).toEqual({
      $and: [
        { $or: [{ sender: G1 }, { recipient: G1 }] },
        { $or: [{ sender: { $regex: '^GAFD' } }, { recipient: { $regex: '^GAFD' } }] },
      ],
    });
  });
});

describe('sort, order, limit, cursor', () => {
  it('sort/order', () => {
    expect(q('sort=end_ts&order=asc').sort).toEqual({ end_ts: 1, _id: 1 });
    expect(() => q('sort=deposited')).toThrow(ParamError);
  });
  it('limit is clamped to 100', () => {
    expect(q('limit=500').limit).toBe(100);
  });
  it('cursor adds a keyset condition matching sort + order', () => {
    const c = encodeCursor({ k: 1_000, id: 7 });
    expect(q(`cursor=${c}`).filter).toEqual({
      $or: [{ created_at: { $lt: 1_000 } }, { created_at: 1_000, _id: { $lt: 7 } }],
    });
    expect(q(`sort=start_ts&order=asc&cursor=${c}`).filter).toEqual({
      $or: [{ start_ts: { $gt: 1_000 } }, { start_ts: 1_000, _id: { $gt: 7 } }],
    });
  });
  it('nextStreamsCursor encodes the last row', () => {
    const c = nextStreamsCursor({ _id: 9, created_at: 5, start_ts: 1, end_ts: 2 }, 'created_at');
    expect(buildStreamsQuery(new URLSearchParams(`cursor=${c}`), NOW).filter).toEqual({
      $or: [{ created_at: { $lt: 5 } }, { created_at: 5, _id: { $lt: 9 } }],
    });
  });
});
