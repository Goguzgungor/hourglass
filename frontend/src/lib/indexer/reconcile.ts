// Converge the materialized `streams` collection to on-chain truth using the
// NFT enumeration (every un-burned stream has exactly one NFT, token_id == id).

import { mapStream, type ChainReader, type StreamChain } from './chain';
import type { IndexerStore } from './store';

export interface ReconcileOptions {
  contractId: string;
  now: () => number;
  concurrency: number;
}

export interface ReconcileResult {
  /**
   * Size of the deduped enumerated id set; may be below `total_supply` during a
   * race — a burn mid-scan shifts the remaining indices, so an id can be missed
   * (step 3 verifies those) or enumerated twice (the `Set` collapses them).
   */
  live: number;
  upserted: number;
  depleted: number;
}

/** What one stream's pass actually did, so totals are counted and never inferred. */
type Verdict = 'upserted' | 'depleted' | 'skipped';

/**
 * Run `fn` over `items` with at most `limit` calls in flight, preserving order.
 * One rejected call rejects the whole pass; sibling workers already in flight
 * are NOT cancelled and their writes stand. That is safe here because every
 * write is an idempotent upsert — the next pass redoes them.
 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  // A non-finite or sub-1 `limit` (NaN from a bad env var, 0, -1) must never
  // spawn zero workers: that resolves immediately with a sparse array of
  // `undefined`s, which callers would read as work successfully done.
  const workers = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1;
  const pool = Array.from({ length: Math.max(1, Math.min(workers, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(pool);
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

  // 2. Refresh every live stream Mongo is missing or that can still change.
  // `is_depleted` is the only terminal state: cancelling does NOT end a stream
  // — withdrawing stays legal until the balance is drained — so a
  // canceled-but-not-depleted doc keeps moving (`withdrawn`, and `recipient`
  // via `withdraw_max_and_transfer`). Only a depleted doc is frozen for good.
  const heads = await store.listStreamHeads();
  const known = new Map(heads.map((h) => [h._id, h]));
  const toFetch = [...live].filter((id) => {
    const h = known.get(id);
    return !h || !h.is_depleted;
  });
  const upsertFromChain = async (id: number, s: StreamChain) => {
    const fields = mapStream(s);
    await store.upsertStream(
      id,
      { ...fields, contract: opts.contractId, updated_at: now, source: 'reconcile' },
      { created_at: fields.start_ts ?? now },
    );
  };
  const fetched = await mapLimit(toFetch, opts.concurrency, async (id): Promise<Verdict> => {
    const s = await chain.getStream(id);
    // Enumerated moments ago but already gone: a burn landed mid-pass. Nothing
    // to write — the `burned` event, or the next pass's step 3, depletes it.
    if (!s) return 'skipped';
    await upsertFromChain(id, s);
    return 'upserted';
  });

  // 3. Streams we know that the enumeration no longer lists look burned — but
  // `total_supply` + `get_token_id` is not an atomic snapshot: a burn landing
  // mid-scan shifts the remaining indices, so a still-live id can silently drop
  // out of `live`. Marking it depleted would be sticky (depleted docs are
  // terminal, so step 2 never refreshes them again), so confirm each candidate
  // with `get_stream` before writing it off: a record that still exists means
  // the enumeration raced, and the stream is refreshed like any other live one.
  const suspects = heads.filter((h) => !live.has(h._id) && !h.is_depleted);
  const verified = await mapLimit(suspects, opts.concurrency, async (h): Promise<Verdict> => {
    const s = await chain.getStream(h._id);
    if (!s) {
      await store.markDepleted(h._id, now);
      return 'depleted';
    }
    await upsertFromChain(h._id, s);
    return 'upserted';
  });

  const verdicts = [...fetched, ...verified];
  const result = {
    live: live.size,
    upserted: verdicts.filter((v) => v === 'upserted').length,
    depleted: verdicts.filter((v) => v === 'depleted').length,
  };
  await store.saveReconcileMeta({ at: now, ...result });
  return result;
}
