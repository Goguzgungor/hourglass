import { describe, expect, it } from 'vitest';
import { mapStream } from './chain';
import { chainStream } from './testing';

describe('mapStream', () => {
  it('maps Linear fields', () => {
    const d = mapStream(chainStream());
    expect(d).toMatchObject({ model: 'Linear', cliff_ts: 1_000, unlock_at_start: '0', unlock_at_cliff: '0', deposited: '1000', sender: 'GSENDER' });
  });
  it('maps Tranched fields to decimal strings', () => {
    const d = mapStream(chainStream({ shape: { tag: 'Tranched', values: [{ tranches: [{ amount: 5n, ts: 1_000 }, { amount: 7n, ts: 2_000 }] }] } }));
    expect(d).toMatchObject({ model: 'Tranched', tranches: [{ amount: '5', ts: 1_000 }, { amount: '7', ts: 2_000 }] });
  });
  it('maps Recurring fields', () => {
    const d = mapStream(chainStream({ shape: { tag: 'Recurring', values: [{ first_ts: 1_000, period_secs: 60, count: 3, amount_per_period: 10n }] } }));
    expect(d).toMatchObject({ model: 'Recurring', first_ts: 1_000, period_secs: 60, count: 3, amount_per_period: '10' });
  });
});
