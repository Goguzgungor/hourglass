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
