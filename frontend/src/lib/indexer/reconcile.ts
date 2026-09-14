// Converge the materialized `streams` collection to on-chain truth using the
// NFT enumeration (every un-burned stream has exactly one NFT, token_id == id).

import { mapStream, type ChainReader } from './chain';
import type { IndexerStore } from './store';

export interface ReconcileOptions {
  contractId: string;
  now: () => number;
  concurrency: number;
}

export interface ReconcileResult {
  live: number;
  upserted: number;
  depleted: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function reconcile(
  chain: ChainReader,
  store: IndexerStore,
  opts: ReconcileOptions,
): Promise<ReconcileResult> {
  const now = opts.now();

  // 1. Enumerate live streams via the NFT extension.
  const supply = await chain.totalSupply();
  const liveIds = await mapLimit(
    Array.from({ length: supply }, (_, i) => i),
    opts.concurrency,
    (i) => chain.getTokenId(i),
  );
  const live = new Set<number>(liveIds);

  // 2. Upsert missing or non-terminal streams.
  const heads = await store.listStreamHeads();
  const known = new Map(heads.map((h) => [h._id, h]));
  const toFetch = [...live].filter((id) => {
    const h = known.get(id);
    return !h || (!h.was_canceled && !h.is_depleted);
  });
  const results = await mapLimit(toFetch, opts.concurrency, async (id) => {
    const s = await chain.getStream(id);
    if (!s) return false;
    const fields = mapStream(s);
    await store.upsertStream(
      id,
      { ...fields, contract: opts.contractId, updated_at: now, source: 'reconcile' },
      { created_at: fields.start_ts ?? now },
    );
    return true;
  });
  const upserted = results.filter(Boolean).length;

  // 3. Streams we know but the chain no longer lists were burned.
  let depleted = 0;
  for (const h of heads) {
    if (!live.has(h._id) && !h.is_depleted) {
      await store.markDepleted(h._id, now);
      depleted++;
    }
  }

  const result = { live: live.size, upserted, depleted };
  await store.saveReconcileMeta({ at: now, ...result });
  return result;
}
