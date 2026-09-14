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
    // ids 1 and 4 (live, refreshed) + id 3 (absent from the enumeration, so it is
    // verified with get_stream before being written off as burned).
    expect(chain.calls.getStream).toBe(3);
    expect(store.reconcileMeta).toMatchObject({ at: 5_000, live: 3, upserted: 2, depleted: 1 });
  });
  it('refreshes canceled-but-not-depleted streams', async () => {
    // Cancelling does not end a stream: withdrawing stays legal until the
    // balance is drained, so the doc keeps changing after `was_canceled`.
    const chain = new FakeChain(new Map([[1, chainStream({ was_canceled: true, withdrawn: 5n })]]));
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, was_canceled: true, is_depleted: false, withdrawn: '0' } as never);
    const r = await reconcile(chain, store, opts);
    expect(store.streams.get(1)!.withdrawn).toBe('5');
    expect(store.streams.get(1)!.is_depleted).toBe(false);
    expect(r.upserted).toBe(1);
  });
  it('treats a non-finite concurrency as 1 instead of spawning zero workers', async () => {
    const chain = new FakeChain(new Map([
      [1, chainStream({ withdrawn: 10n })],
      [2, chainStream({ was_canceled: true, is_depleted: true })],
      [4, chainStream()],
    ]));
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, was_canceled: false, is_depleted: false, withdrawn: '0' } as never);
    store.streams.set(2, { _id: 2, was_canceled: true, is_depleted: true } as never);
    store.streams.set(3, { _id: 3, was_canceled: false, is_depleted: false } as never);

    const r = await reconcile(chain, store, { ...opts, concurrency: NaN });
    expect(r).toEqual({ live: 3, upserted: 2, depleted: 1 });
    expect(store.streams.get(1)!.withdrawn).toBe('10');
    expect(store.streams.get(4)).toMatchObject({ _id: 4, source: 'reconcile' });
    expect(store.streams.get(3)!.is_depleted).toBe(true);
    expect(chain.calls.getStream).toBe(3);
  });
  it('does nothing on an empty chain and empty store', async () => {
    const r = await reconcile(new FakeChain(new Map()), new MemoryIndexerStore(), opts);
    expect(r).toEqual({ live: 0, upserted: 0, depleted: 0 });
  });
  it('does not mark a live stream depleted when enumeration under-reports it', async () => {
    // total_supply + get_token_id is not an atomic snapshot: a burn mid-scan can
    // shift indices so a still-live id never shows up in the enumeration.
    class UnderReportingChain extends FakeChain {
      async totalSupply() { this.calls.totalSupply++; return 1; } // hides id 5 from enumeration
    }
    const chain = new UnderReportingChain(new Map([[1, chainStream()], [5, chainStream({ withdrawn: 7n })]]));
    const store = new MemoryIndexerStore();
    store.streams.set(5, { _id: 5, was_canceled: false, is_depleted: false, withdrawn: '0' } as never);
    const r = await reconcile(chain, store, opts);
    expect(store.streams.get(5)!.is_depleted).toBe(false);
    expect(store.streams.get(5)!.withdrawn).toBe('7');
    expect(r.depleted).toBe(0);
    expect(r.upserted).toBe(2); // id 1 (live, missing in mongo) + id 5 (verified live)
    expect(r.live).toBe(1);
  });
  it('keeps provenance — including source: event — when refreshing an existing doc', async () => {
    const chain = new FakeChain(new Map([[1, chainStream({ withdrawn: 3n })]]));
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, created_tx: 'h1', created_ledger: 9, created_at: 900, source: 'event', withdrawn: '0', was_canceled: false, is_depleted: false } as never);
    await reconcile(chain, store, opts);
    // `withdrawn`/`updated_at` prove the doc really was refreshed, so the
    // surviving provenance is not just an untouched doc. `source` records who
    // first materialized it, so a reconcile refresh must not rewrite it.
    expect(store.streams.get(1)).toMatchObject({
      created_tx: 'h1', created_ledger: 9, created_at: 900, source: 'event', withdrawn: '3', updated_at: 5_000,
    });
  });
  it('marks only docs it inserted itself with source: reconcile', async () => {
    const chain = new FakeChain(new Map([[7, chainStream()]]));
    const store = new MemoryIndexerStore();
    await reconcile(chain, store, opts);
    expect(store.streams.get(7)).toMatchObject({ source: 'reconcile', created_at: 1_000 });
  });
  it('skips an enumeration index whose get_token_id throws instead of failing the pass', async () => {
    class FlakyChain extends FakeChain {
      async getTokenId(index: number) {
        this.calls.getTokenId++;
        if (index === 1) throw new Error('rpc blew up on index 1');
        return [...this.streams.keys()][index];
      }
    }
    const chain = new FlakyChain(new Map([[1, chainStream()], [2, chainStream()], [3, chainStream()]]));
    const store = new MemoryIndexerStore();
    const warns: string[] = [];
    const r = await reconcile(chain, store, { ...opts, concurrency: 1 }, { warn: (m) => warns.push(m) });
    // Index 1 (stream id 2) is skipped; the other two are still reconciled.
    expect(r.live).toBe(2);
    expect([...store.streams.keys()].sort()).toEqual([1, 3]);
    expect(warns).toHaveLength(1);
  });
});
