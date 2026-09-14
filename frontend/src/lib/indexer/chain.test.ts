import { describe, expect, it } from 'vitest';
import { makeChainReaderFromClient, mapStream, type ViewClient } from './chain';
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

function fakeClient(over: Partial<ViewClient> = {}): ViewClient {
  return {
    async get_stream() { return { result: undefined }; },
    async total_supply() { return { result: 3 }; },
    async get_token_id({ index }) { return { result: index + 10 }; },
    ...over,
  };
}

describe('makeChainReaderFromClient', () => {
  it('returns null when the contract reports StreamNotFound (#30)', async () => {
    const r = makeChainReaderFromClient(fakeClient({
      async get_stream() { throw new Error('HostError: Error(Contract, #30)'); },
    }));
    expect(await r.getStream(9)).toBeNull();
  });
  it('returns null when the result is empty', async () => {
    const r = makeChainReaderFromClient(fakeClient());
    expect(await r.getStream(9)).toBeNull();
  });
  it('rethrows non-contract failures', async () => {
    const r = makeChainReaderFromClient(fakeClient({
      async get_stream() { throw new Error('fetch failed: 404 Not Found'); },
    }));
    await expect(r.getStream(9)).rejects.toThrow('fetch failed');
  });
  it('maps total_supply and get_token_id results to numbers', async () => {
    const r = makeChainReaderFromClient(fakeClient());
    expect(await r.totalSupply()).toBe(3);
    expect(await r.getTokenId(2)).toBe(12);
  });
});
