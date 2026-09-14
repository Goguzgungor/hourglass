import { describe, expect, it } from 'vitest';
import { ParamError, optAddress, optEnum, optEnumList, optInt } from './params';

const G = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const C = 'CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU';
const sp = (q: string) => new URLSearchParams(q);

describe('optAddress', () => {
  it('returns undefined when absent', () => {
    expect(optAddress(sp(''), 'address', 'G')).toBeUndefined();
  });
  it('accepts a valid strkey of the requested kind', () => {
    expect(optAddress(sp(`address=${G}`), 'address', 'G')).toBe(G);
    expect(optAddress(sp(`token=${C}`), 'token', 'C')).toBe(C);
  });
  it('rejects the wrong kind or garbage', () => {
    expect(() => optAddress(sp(`address=${C}`), 'address', 'G')).toThrow(ParamError);
    expect(() => optAddress(sp('address=hello'), 'address', 'G')).toThrow(ParamError);
  });
});

describe('optEnum / optEnumList', () => {
  const allowed = ['a', 'b'] as const;
  it('validates single values', () => {
    expect(optEnum(sp('x=a'), 'x', allowed)).toBe('a');
    expect(optEnum(sp(''), 'x', allowed)).toBeUndefined();
    expect(() => optEnum(sp('x=z'), 'x', allowed)).toThrow(ParamError);
  });
  it('validates comma lists and dedupes', () => {
    expect(optEnumList(sp('x=a,b,a'), 'x', allowed)).toEqual(['a', 'b']);
    expect(() => optEnumList(sp('x=a,z'), 'x', allowed)).toThrow(ParamError);
    expect(optEnumList(sp(''), 'x', allowed)).toBeUndefined();
  });
});

describe('optInt', () => {
  const o = { min: 1, max: 100, def: 50 };
  it('defaults, parses and clamps', () => {
    expect(optInt(sp(''), 'limit', o)).toBe(50);
    expect(optInt(sp('limit=7'), 'limit', o)).toBe(7);
    expect(optInt(sp('limit=500'), 'limit', o)).toBe(100);
  });
  it('rejects non-integers and values below min', () => {
    expect(() => optInt(sp('limit=abc'), 'limit', o)).toThrow(ParamError);
    expect(() => optInt(sp('limit=0'), 'limit', o)).toThrow(ParamError);
  });
});
