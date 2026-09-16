import { describe, expect, it } from 'vitest';
import {
  deriveStatus,
  streamedAmount,
  streamedFraction,
  withdrawableNow,
  type StreamTerms,
} from './streaming';

const base = {
  withdrawn: '0',
  refunded: '0',
  was_canceled: false,
  is_depleted: false,
};

function linear(over: Partial<StreamTerms> = {}): StreamTerms {
  return {
    ...base,
    model: 'Linear',
    start_ts: 1_000,
    end_ts: 4_000,
    cliff_ts: 2_000,
    deposited: '1000000',
    unlock_at_start: '0',
    unlock_at_cliff: '0',
    ...over,
  };
}

function tranched(): StreamTerms {
  return {
    ...base,
    model: 'Tranched',
    start_ts: 1_000,
    end_ts: 3_000,
    deposited: '600',
    tranches: [
      { amount: '100', ts: 1_000 },
      { amount: '200', ts: 2_000 },
      { amount: '300', ts: 3_000 },
    ],
  };
}

function recurring(count = 12): StreamTerms {
  return {
    ...base,
    model: 'Recurring',
    start_ts: 1_000,
    end_ts: 1_000 + (count - 1) * 100,
    deposited: String(1_000 * count),
    first_ts: 1_000,
    period_secs: 100,
    count,
    amount_per_period: '1000',
  };
}

describe('streamedAmount — Linear', () => {
  it('is zero before start', () => {
    expect(streamedAmount(linear(), 500)).toBe(0n);
  });
  it('returns only unlock_at_start before the cliff', () => {
    expect(streamedAmount(linear({ unlock_at_start: '100000' }), 1_500)).toBe(100_000n);
  });
  it('adds the cliff lump at the cliff', () => {
    expect(
      streamedAmount(linear({ unlock_at_start: '100000', unlock_at_cliff: '50000' }), 2_000),
    ).toBe(150_000n);
  });
  it('interpolates linearly between cliff and end', () => {
    expect(streamedAmount(linear(), 3_000)).toBe(500_000n);
  });
  it('is the deposit at and after end', () => {
    expect(streamedAmount(linear(), 4_000)).toBe(1_000_000n);
    expect(
      streamedAmount(linear({ unlock_at_start: '100000', unlock_at_cliff: '50000' }), 99_999),
    ).toBe(1_000_000n);
  });
  it('treats cliff == start as no cliff', () => {
    expect(streamedAmount(linear({ cliff_ts: 1_000, end_ts: 3_000 }), 2_000)).toBe(500_000n);
  });
  it('is exact past 2^53 (bigint math, no float rounding)', () => {
    // 1e20 deposited, midpoint of the cliff→end span: exactly half.
    expect(streamedAmount(linear({ deposited: '100000000000000000000' }), 3_000))
      .toBe(50_000_000_000_000_000_000n);
  });
  it('floors the division', () => {
    // base 1e6 over span 2000; at elapsed 1 → 500 exactly, at elapsed 3 → 1500
    expect(streamedAmount(linear(), 2_001)).toBe(500n);
    expect(streamedAmount(linear(), 2_003)).toBe(1_500n);
  });
});

describe('streamedAmount — Tranched', () => {
  it('is zero before the first tranche', () => {
    expect(streamedAmount(tranched(), 500)).toBe(0n);
  });
  it('unlocks a tranche at its timestamp', () => {
    expect(streamedAmount(tranched(), 1_000)).toBe(100n);
  });
  it('accumulates through tranches', () => {
    expect(streamedAmount(tranched(), 2_500)).toBe(300n);
  });
  it('is the full sum after the last tranche', () => {
    expect(streamedAmount(tranched(), 99_999)).toBe(600n);
  });
});

describe('streamedAmount — Recurring', () => {
  it('is zero before first_ts', () => {
    expect(streamedAmount(recurring(), 999)).toBe(0n);
  });
  it('unlocks one period at first_ts and stays flat until the next boundary', () => {
    expect(streamedAmount(recurring(), 1_000)).toBe(1_000n);
    expect(streamedAmount(recurring(), 1_099)).toBe(1_000n);
    expect(streamedAmount(recurring(), 1_100)).toBe(2_000n);
    expect(streamedAmount(recurring(), 1_250)).toBe(3_000n);
  });
  it('caps at count', () => {
    expect(streamedAmount(recurring(), 2_100)).toBe(12_000n);
    expect(streamedAmount(recurring(), 99_999)).toBe(12_000n);
  });
  it('handles count == 1', () => {
    expect(streamedAmount(recurring(1), 1_000)).toBe(1_000n);
    expect(streamedAmount(recurring(1), 2_000)).toBe(1_000n);
  });
  it('a recurring stream with period_secs 0 streams nothing', () => {
    // math.rs refuses to create this (Err(InvalidPeriod)); the read layer has
    // no error channel, so it reports 0 rather than dividing by zero.
    expect(streamedAmount({ ...recurring(), period_secs: 0 }, 99_999)).toBe(0n);
  });
  it('is monotonic', () => {
    let prev = 0n;
    for (let t = 0; t < 3_000; t += 7) {
      const cur = streamedAmount(recurring(), t);
      expect(cur >= prev).toBe(true);
      prev = cur;
    }
  });
});

describe('withdrawableNow', () => {
  it('subtracts withdrawn and never goes negative', () => {
    expect(withdrawableNow(linear({ withdrawn: '200000' }), 3_000)).toBe(300_000n);
    expect(withdrawableNow(linear({ withdrawn: '999999' }), 1_500)).toBe(0n);
  });
  it('caps at deposited - refunded after a cancel', () => {
    // Canceled at 60%: 400000 went back to the sender, so the stream holds
    // 600000 — never the full deposit, even long after end_ts.
    const t = linear({ was_canceled: true, refunded: '400000', withdrawn: '0' });
    expect(streamedAmount(t, 4_001)).toBe(1_000_000n);
    expect(withdrawableNow(t, 4_001)).toBe(600_000n);
  });
  it('is zero for a depleted stream even with a stale withdrawn', () => {
    expect(withdrawableNow(linear({ is_depleted: true, withdrawn: '0' }), 4_001)).toBe(0n);
  });
});

describe('deriveStatus', () => {
  it('follows the on-chain precedence', () => {
    expect(deriveStatus(linear(), 500)).toBe('PENDING');
    expect(deriveStatus(linear(), 1_000)).toBe('STREAMING');
    expect(deriveStatus(linear(), 3_999)).toBe('STREAMING');
    expect(deriveStatus(linear(), 4_000)).toBe('SETTLED');
    expect(deriveStatus(linear({ was_canceled: true }), 500)).toBe('CANCELED');
    expect(deriveStatus(linear({ was_canceled: true, is_depleted: true }), 500)).toBe('DEPLETED');
  });
  it('a single-period recurring stream is SETTLED at first_ts', () => {
    expect(deriveStatus(recurring(1), 1_000)).toBe('SETTLED');
  });
});

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
