import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import type { ParsedEvent } from './events';
import { fetchAndIngest, handleEvent, participantsFor } from './ingest';
import { chainStream, FakeChain, MemoryIndexerStore } from './testing';

describe('participantsFor', () => {
  it('unions stream parties with the action addresses, deduped', () => {
    expect(participantsFor({ actor: 'GA', to: 'GB' }, { sender: 'GS', recipient: 'GA' })).toEqual(['GS', 'GA', 'GB']);
    expect(participantsFor({}, null)).toEqual([]);
    expect(participantsFor({ new_owner: 'GN' }, { sender: 'GS', recipient: 'GR' })).toEqual(['GS', 'GR', 'GN']);
  });
});

function fakeRpc(total: number, pageLimit: number, latest = 5_000) {
  const calls: rpc.Api.GetEventsRequest[] = [];
  let served = 0;
  const server: {
    getEvents(req: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
    getLatestLedger(): Promise<{ sequence: number }>;
  } = {
    async getEvents(req) {
      calls.push(req);
      const n = Math.min(pageLimit, total - served);
      const events = Array.from({ length: n }, (_, i) => ({ id: String(served + i) })) as unknown as rpc.Api.EventResponse[];
      served += n;
      return { events, cursor: `c${calls.length}`, latestLedger: latest, oldestLedger: 1, latestLedgerCloseTime: 0, oldestLedgerCloseTime: 0 } as unknown as rpc.Api.GetEventsResponse;
    },
    async getLatestLedger() { return { sequence: latest }; },
  };
  return { server, calls };
}

const opts = { contractId: 'CLOCKUP', pageLimit: 100, maxPages: 20, startupBufferLedgers: 100 };

describe('fetchAndIngest', () => {
  it('pages until a short page, persisting the cursor after every page', async () => {
    const { server, calls } = fakeRpc(250, 100);
    const store = new MemoryIndexerStore();
    const seen: string[] = [];
    const r = await fetchAndIngest(server, store, opts, async (e) => { seen.push((e as { id: string }).id); });
    expect(r).toEqual({ pages: 3, events: 250, reset: false });
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
    const filters = [{ type: 'contract', contractIds: ['CLOCKUP'] }];
    expect(calls[0]).toMatchObject({ startLedger: 4_900, limit: 100, filters });
    expect(calls[1]).toMatchObject({ cursor: 'c1', limit: 100, filters });
    expect(calls[2]).toMatchObject({ cursor: 'c2', limit: 100, filters });
    expect(store.cursorSaves.map((s) => s.cursor)).toEqual(['c1', 'c2', 'c3']);
    expect(store.cursor).toEqual({ cursor: 'c3', ledger: 5_000 });
  });
  it('stops at maxPages and resumes from the saved cursor next time', async () => {
    const { server, calls } = fakeRpc(250, 100);
    const store = new MemoryIndexerStore();
    const r1 = await fetchAndIngest(server, store, { ...opts, maxPages: 2 }, async () => {});
    expect(r1.pages).toBe(2);
    const r2 = await fetchAndIngest(server, store, { ...opts, maxPages: 2 }, async () => {});
    expect(r2).toEqual({ pages: 1, events: 50, reset: false });
    expect(calls[2]).toMatchObject({ cursor: 'c2' });
  });
  it('resets to latest - buffer on a retention error and reports reset', async () => {
    const store = new MemoryIndexerStore();
    store.cursor = { cursor: 'stale', ledger: 10 };
    const server = {
      async getEvents() { throw new Error('start is before oldest ledger'); },
      async getLatestLedger() { return { sequence: 9_000 }; },
    };
    const r = await fetchAndIngest(server, store, opts, async () => {});
    expect(r).toEqual({ pages: 0, events: 0, reset: true });
    expect(store.cursor).toEqual({ cursor: null, ledger: 8_900 });
  });
  it('rethrows other errors', async () => {
    const store = new MemoryIndexerStore();
    const server = { async getEvents() { throw new Error('boom'); }, async getLatestLedger() { return { sequence: 1 }; } };
    await expect(fetchAndIngest(server, store, opts, async () => {})).rejects.toThrow('boom');
  });
  it('rethrows a non-retention error that merely mentions "cursor"', async () => {
    const store = new MemoryIndexerStore();
    store.cursor = { cursor: 'stale', ledger: 10 };
    const server = {
      async getEvents() { throw new Error('cursor parameter is required'); },
      async getLatestLedger() { return { sequence: 9_000 }; },
    };
    await expect(fetchAndIngest(server, store, opts, async () => {})).rejects.toThrow('cursor parameter is required');
    expect(store.cursor).toEqual({ cursor: 'stale', ledger: 10 });
  });
  it('resets on a retention error that mentions "cursor" alongside a qualifier', async () => {
    const store = new MemoryIndexerStore();
    store.cursor = { cursor: 'stale', ledger: 10 };
    const server = {
      async getEvents() { throw new Error('invalid cursor: before oldest ledger'); },
      async getLatestLedger() { return { sequence: 9_000 }; },
    };
    const r = await fetchAndIngest(server, store, opts, async () => {});
    expect(r).toEqual({ pages: 0, events: 0, reset: true });
    expect(store.cursor).toEqual({ cursor: null, ledger: 8_900 });
  });
});

function parsed(over: Partial<ParsedEvent>): ParsedEvent {
  return { action: 'created', streamId: 1, topics: ['stream', 'created', 1, 'GSENDER'], data: null, ledger: 100, tx_hash: 'h1', log_index: 1, ts: 1_500, ...over };
}

describe('handleEvent', () => {
  const now = () => 2_000;
  it('created: materializes the stream with provenance and writes the action with participants', async () => {
    const chain = new FakeChain(new Map([[1, chainStream()]]));
    const store = new MemoryIndexerStore();
    await handleEvent(parsed({}), { chain, store, contractId: 'CLOCKUP', now });
    const s = store.streams.get(1)!;
    expect(s).toMatchObject({ _id: 1, sender: 'GSENDER', recipient: 'GRECIP', contract: 'CLOCKUP', created_tx: 'h1', created_ledger: 100, created_at: 1_500, source: 'event', updated_at: 2_000 });
    expect(store.actions).toHaveLength(1);
    expect(store.actions[0]).toMatchObject({ action: 'created', actor: 'GSENDER', participants: ['GSENDER', 'GRECIP'] });
  });
  it('withdrawn: refreshes the stream and records amount/actor/to', async () => {
    const chain = new FakeChain(new Map([[1, chainStream({ withdrawn: 250n })]]));
    const store = new MemoryIndexerStore();
    await handleEvent(parsed({ action: 'withdrawn', topics: ['stream', 'withdrawn', 1, 'GRECIP'], data: [250n, 'GRECIP'], tx_hash: 'h2' }), { chain, store, contractId: 'CLOCKUP', now });
    expect(store.streams.get(1)!.withdrawn).toBe('250');
    expect(store.actions[0]).toMatchObject({ action: 'withdrawn', amount: '250', actor: 'GRECIP', to: 'GRECIP', participants: ['GSENDER', 'GRECIP'] });
  });
  it('transferred: records new_owner and includes it in participants', async () => {
    const chain = new FakeChain(new Map([[1, chainStream({ recipient: 'GNEW' })]]));
    const store = new MemoryIndexerStore();
    await handleEvent(parsed({ action: 'transferred', topics: ['stream', 'transferred', 1, 'GNEW'], data: 'GRECIP', tx_hash: 'h3' }), { chain, store, contractId: 'CLOCKUP', now });
    expect(store.actions[0]).toMatchObject({ action: 'transferred', new_owner: 'GNEW', actor: 'GRECIP', participants: ['GSENDER', 'GNEW', 'GRECIP'] });
  });
  it('burned: marks the existing doc depleted without a chain read', async () => {
    const chain = new FakeChain(new Map());
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, sender: 'GSENDER', recipient: 'GRECIP', is_depleted: false } as never);
    await handleEvent(parsed({ action: 'burned', topics: ['stream', 'burned', 1], tx_hash: 'h4' }), { chain, store, contractId: 'CLOCKUP', now });
    expect(store.streams.get(1)!.is_depleted).toBe(true);
    expect(chain.calls.getStream).toBe(0);
    expect(store.actions[0]).toMatchObject({ action: 'burned', participants: ['GSENDER', 'GRECIP'] });
  });
  it('is idempotent on (tx_hash, log_index)', async () => {
    const chain = new FakeChain(new Map([[1, chainStream()]]));
    const store = new MemoryIndexerStore();
    await handleEvent(parsed({}), { chain, store, contractId: 'CLOCKUP', now });
    await handleEvent(parsed({}), { chain, store, contractId: 'CLOCKUP', now });
    expect(store.actions).toHaveLength(1);
  });
});
