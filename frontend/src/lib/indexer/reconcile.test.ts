import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import { chainStream, FakeChain, MemoryIndexerStore } from './testing';

const opts = { contractId: 'CLOCKUP', now: () => 5_000, concurrency: 2 };

describe('reconcile', () => {
  it('inserts missing live streams, refreshes non-terminal ones, marks burned ones depleted', async () => {
    const chain = new FakeChain(new Map([
      [1, chainStream({ withdrawn: 10n })],   // in mongo, non-terminal → refreshed
      [2, chainStream({ was_canceled: true, is_depleted: true })], // in mongo, terminal → skipped
      [4, chainStream()],                       // missing in mongo → inserted
    ]));
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, sender: 'GSENDER', recipient: 'GRECIP', withdrawn: '0', was_canceled: false, is_depleted: false } as never);
    store.streams.set(2, { _id: 2, was_canceled: true, is_depleted: true } as never);
    store.streams.set(3, { _id: 3, was_canceled: false, is_depleted: false } as never); // burned on chain

    const r = await reconcile(chain, store, opts);
    expect(r).toEqual({ live: 3, upserted: 2, depleted: 1 });
    expect(store.streams.get(1)!.withdrawn).toBe('10');
    expect(store.streams.get(4)).toMatchObject({ _id: 4, sender: 'GSENDER', contract: 'CLOCKUP', source: 'reconcile', created_at: 1_000 });
    expect(store.streams.get(3)!.is_depleted).toBe(true);
    expect(chain.calls.getStream).toBe(2); // ids 1 and 4 only
    expect(store.reconcileMeta).toMatchObject({ at: 5_000, live: 3, upserted: 2, depleted: 1 });
  });
  it('does nothing on an empty chain and empty store', async () => {
    const r = await reconcile(new FakeChain(new Map()), new MemoryIndexerStore(), opts);
    expect(r).toEqual({ live: 0, upserted: 0, depleted: 0 });
  });
  it('keeps provenance when refreshing an existing doc', async () => {
    const chain = new FakeChain(new Map([[1, chainStream()]]));
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, created_tx: 'h1', created_ledger: 9, created_at: 900, was_canceled: false, is_depleted: false } as never);
    await reconcile(chain, store, opts);
    expect(store.streams.get(1)).toMatchObject({ created_tx: 'h1', created_ledger: 9, created_at: 900 });
  });
});
