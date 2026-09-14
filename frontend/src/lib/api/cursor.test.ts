import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  isHistoryCursor,
  isStreamsCursor,
} from './cursor';
import { ParamError } from './params';

describe('cursor codec', () => {
  it('round-trips a streams cursor', () => {
    const c = encodeCursor({ k: 1_700_000_000, id: 42 });
    expect(c).not.toMatch(/[+/=]/); // base64url
    expect(decodeCursor(c, isStreamsCursor)).toEqual({ k: 1_700_000_000, id: 42 });
  });
  it('round-trips a history cursor', () => {
    const c = encodeCursor({ ts: 1, log_index: 2_000_000, id: 'a'.repeat(24) });
    expect(decodeCursor(c, isHistoryCursor)).toEqual({ ts: 1, log_index: 2_000_000, id: 'a'.repeat(24) });
  });
  it('returns null for absent cursors', () => {
    expect(decodeCursor(null, isStreamsCursor)).toBeNull();
    expect(decodeCursor('', isStreamsCursor)).toBeNull();
  });
  it('rejects garbage and wrong shapes', () => {
    expect(() => decodeCursor('not-base64-json', isStreamsCursor)).toThrow(ParamError);
    const wrong = encodeCursor({ k: 'x', id: 1 });
    expect(() => decodeCursor(wrong, isStreamsCursor)).toThrow(ParamError);
    const hist = encodeCursor({ ts: 1, log_index: 2, id: 'zz' });
    expect(() => decodeCursor(hist, isHistoryCursor)).toThrow(ParamError);
  });
});
