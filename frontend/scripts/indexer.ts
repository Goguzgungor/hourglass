/**
 * Hourglass indexer.
 *
 * Polls the Soroban RPC every few seconds for events emitted by the lockup
 * contract, decodes them, and upserts the materialized state into MongoDB.
 *
 *   - `streams` — one document per stream, refreshed from the contract on
 *                 every event (so deposited / withdrawn / refunded are
 *                 always current).
 *   - `actions` — append-only audit log of every event; idempotent via a
 *                 unique compound index on (tx_hash, log_index).
 *   - `meta`    — single-document scratch space; we use it to persist the
 *                 next ledger to fetch so the indexer can resume cleanly.
 *
 * Run with `npm run indexer` (uses `tsx` so we don't need a build step).
 */

import 'dotenv/config';
import {
  rpc as StellarRpc,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import { lockup as lockupSdk } from 'hourglass';

import { DEPLOYMENT } from '../src/lib/deployments';
import {
  actionsCollection,
  ensureIndexes,
  metaCollection,
  streamsCollection,
  type ActionDoc,
  type StreamDoc,
} from '../src/lib/db';

const POLL_MS = Number(process.env.INDEXER_POLL_MS ?? 3000);
const CURSOR_KEY = 'cursor';
const STARTUP_BUFFER_LEDGERS = 100;
const PAGE_LIMIT = 100;

const server = new StellarRpc.Server(DEPLOYMENT.rpcUrl, {
  // Local quickstart RPC is plain http; the SDK refuses by default.
  allowHttp: DEPLOYMENT.rpcUrl.startsWith('http://'),
});

const CONTRACT = DEPLOYMENT.lockup;

/* ------------------------------------------------------------------ *
 * Cursor                                                             *
 * ------------------------------------------------------------------ */

async function loadCursor(): Promise<number> {
  const meta = await metaCollection();
  const doc = await meta.findOne({ _id: CURSOR_KEY });
  if (doc && typeof doc.value === 'number' && doc.value > 0) {
    return doc.value;
  }
  // First boot: rewind a bit so we catch any streams created just before us.
  const latest = await server.getLatestLedger();
  const start = Math.max(1, latest.sequence - STARTUP_BUFFER_LEDGERS);
  await meta.updateOne(
    { _id: CURSOR_KEY },
    { $set: { value: start } },
    { upsert: true },
  );
  return start;
}

async function saveCursor(seq: number): Promise<void> {
  const meta = await metaCollection();
  await meta.updateOne(
    { _id: CURSOR_KEY },
    { $set: { value: seq } },
    { upsert: true },
  );
}

/* ------------------------------------------------------------------ *
 * Event decode                                                       *
 * ------------------------------------------------------------------ */

type ActionName = ActionDoc['action'];

interface ParsedEvent {
  action: ActionName;
  streamId: number;
  topics: unknown[];
  data: unknown;
  ledger: number;
  tx_hash: string;
  // (tx_hash, log_index) is our idempotency key. The RPC returns events with
  // a globally unique `id` string and per-tx (transactionIndex, operationIndex)
  // — we combine the latter into a single integer so it remains stable across
  // re-fetches of the same page.
  log_index: number;
  ts: number;
}

const KNOWN_ACTIONS: ReadonlySet<string> = new Set([
  'created',
  'withdrawn',
  'canceled',
  'renounced',
  'transferred',
  'burned',
]);

function parseEvent(e: StellarRpc.Api.EventResponse): ParsedEvent | null {
  // First topic is the domain symbol; second is the action; third is the
  // u32 stream_id; fourth (when present) is an address. See
  // `contracts/lockup/src/events.rs` for the canonical shape.
  const topics = (e.topic as xdr.ScVal[]).map((t) => {
    try {
      return scValToNative(t);
    } catch {
      return null;
    }
  });
  if (topics[0] !== 'stream') return null;

  const action = topics[1];
  if (typeof action !== 'string' || !KNOWN_ACTIONS.has(action)) return null;

  const rawStreamId = topics[2];
  const streamId = Number(rawStreamId);
  if (!Number.isInteger(streamId) || streamId < 1) return null;

  let data: unknown = null;
  try {
    data = scValToNative(e.value as xdr.ScVal);
  } catch {
    /* leave data null */
  }

  const closedAt = Date.parse(e.ledgerClosedAt);
  const ts = Number.isFinite(closedAt)
    ? Math.floor(closedAt / 1000)
    : Math.floor(Date.now() / 1000);

  // Encode (transactionIndex, operationIndex) into a single int so the unique
  // (tx_hash, log_index) compound index is stable across re-fetches.
  const txIdx = Number(e.transactionIndex ?? 0);
  const opIdx = Number(e.operationIndex ?? 0);
  const logIndex = txIdx * 1_000_000 + opIdx;

  return {
    action: action as ActionName,
    streamId,
    topics,
    data,
    ledger: e.ledger,
    tx_hash: e.txHash,
    log_index: logIndex,
    ts,
  };
}

/* ------------------------------------------------------------------ *
 * Contract read (refresh the materialized stream doc)                *
 * ------------------------------------------------------------------ */

// Reusable view client — view functions don't sign, so any caller works.
const viewClient = new lockupSdk.Client({
  contractId: CONTRACT,
  networkPassphrase: DEPLOYMENT.networkPassphrase,
  rpcUrl: DEPLOYMENT.rpcUrl,
  publicKey: DEPLOYMENT.deployer,
  allowHttp: DEPLOYMENT.rpcUrl.startsWith('http://'),
});

// The generated Client class only types `fromJSON` in its .d.ts; the real
// methods are attached at runtime via ContractSpec. Narrow to what we need.
type ViewClient = {
  get_stream(args: {
    stream_id: number;
  }): Promise<{ result: unknown }>;
};
const view = viewClient as unknown as ViewClient;

interface ShapeLinearChain {
  tag: 'Linear';
  values: readonly [{
    cliff_ts: bigint | number;
    unlock_at_start: bigint;
    unlock_at_cliff: bigint;
  }];
}

interface ShapeTranchedChain {
  tag: 'Tranched';
  values: readonly [{
    tranches: Array<{ amount: bigint; ts: bigint | number }>;
  }];
}

interface ShapeRecurringChain {
  tag: 'Recurring';
  values: readonly [{
    first_ts: bigint | number;
    period_secs: bigint | number;
    count: number;
    amount_per_period: bigint;
  }];
}

interface StreamChain {
  sender: string;
  recipient: string;
  token: string;
  start_ts: bigint | number;
  end_ts: bigint | number;
  deposited: bigint;
  withdrawn: bigint;
  refunded: bigint;
  is_cancelable: boolean;
  is_transferable: boolean;
  was_canceled: boolean;
  is_depleted: boolean;
  shape: ShapeLinearChain | ShapeTranchedChain | ShapeRecurringChain;
}

async function fetchStreamFromChain(
  streamId: number,
): Promise<Partial<StreamDoc> | null> {
  try {
    const tx = await view.get_stream({ stream_id: streamId });
    const s = tx.result as StreamChain | undefined;
    if (!s || !s.sender) return null;

    let shapeFields: Partial<StreamDoc>;
    if (s.shape.tag === 'Linear') {
      shapeFields = {
        model: 'Linear',
        cliff_ts: Number(s.shape.values[0].cliff_ts),
        unlock_at_start: String(s.shape.values[0].unlock_at_start),
        unlock_at_cliff: String(s.shape.values[0].unlock_at_cliff),
      };
    } else if (s.shape.tag === 'Tranched') {
      shapeFields = {
        model: 'Tranched',
        tranches: s.shape.values[0].tranches.map((t) => ({
          amount: String(t.amount),
          ts: Number(t.ts),
        })),
      };
    } else {
      shapeFields = {
        model: 'Recurring',
        first_ts: Number(s.shape.values[0].first_ts),
        period_secs: Number(s.shape.values[0].period_secs),
        count: Number(s.shape.values[0].count),
        amount_per_period: String(s.shape.values[0].amount_per_period),
      };
    }

    return {
      sender: String(s.sender),
      recipient: String(s.recipient),
      token: String(s.token),
      start_ts: Number(s.start_ts),
      end_ts: Number(s.end_ts),
      deposited: String(s.deposited),
      withdrawn: String(s.withdrawn),
      refunded: String(s.refunded),
      is_cancelable: Boolean(s.is_cancelable),
      is_transferable: Boolean(s.is_transferable),
      was_canceled: Boolean(s.was_canceled),
      is_depleted: Boolean(s.is_depleted),
      ...shapeFields,
    };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.warn(
      `[indexer] could not fetch stream ${streamId} from chain: ${msg}`,
    );
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Per-event handler                                                  *
 * ------------------------------------------------------------------ */

async function handleEvent(p: ParsedEvent): Promise<void> {
  const streams = await streamsCollection();
  const actions = await actionsCollection();
  const now = Math.floor(Date.now() / 1000);

  const actionDoc: ActionDoc = {
    stream_id: p.streamId,
    action: p.action,
    ts: p.ts,
    ledger: p.ledger,
    tx_hash: p.tx_hash,
    log_index: p.log_index,
  };

  // Helper: refresh the materialized stream from the contract.
  const refresh = async (extra: Partial<StreamDoc> = {}): Promise<void> => {
    const fresh = await fetchStreamFromChain(p.streamId);
    if (!fresh) return;
    await streams.updateOne(
      { _id: p.streamId },
      { $set: { ...fresh, ...extra, updated_at: now } },
      { upsert: true },
    );
  };

  switch (p.action) {
    case 'created': {
      // topics = ['stream', 'created', stream_id, sender]
      // value  = (recipient, token, deposited)
      const sender = String(p.topics[3] ?? '');
      actionDoc.actor = sender;

      const fresh = await fetchStreamFromChain(p.streamId);
      if (fresh) {
        await streams.updateOne(
          { _id: p.streamId },
          {
            $set: {
              ...fresh,
              contract: CONTRACT,
              updated_at: now,
            },
            // Only stamp the provenance fields once, on the *first* time we
            // see this stream — $setOnInsert avoids overwriting them if the
            // doc was already upserted by a later event we processed first.
            $setOnInsert: {
              created_ledger: p.ledger,
              created_tx: p.tx_hash,
              created_at: p.ts,
            },
          },
          { upsert: true },
        );
      }
      break;
    }

    case 'withdrawn': {
      // topics = ['stream', 'withdrawn', stream_id, to]
      // value  = (amount, caller)
      const to = String(p.topics[3] ?? '');
      actionDoc.to = to;
      if (Array.isArray(p.data)) {
        const [amount, caller] = p.data as [unknown, unknown];
        if (amount !== undefined) actionDoc.amount = String(amount);
        if (caller !== undefined) actionDoc.actor = String(caller);
      }
      await refresh();
      break;
    }

    case 'canceled': {
      // topics = ['stream', 'canceled', stream_id]
      // value  = (sender_refund, recipient_balance)
      if (Array.isArray(p.data)) {
        const [refund, balance] = p.data as [unknown, unknown];
        if (refund !== undefined) actionDoc.sender_refund = String(refund);
        if (balance !== undefined) {
          actionDoc.recipient_balance = String(balance);
        }
      }
      await refresh();
      break;
    }

    case 'renounced': {
      // topics = ['stream', 'renounced', stream_id]
      await refresh();
      break;
    }

    case 'transferred': {
      // topics = ['stream', 'transferred', stream_id, new_owner]
      // value  = from
      const newOwner = String(p.topics[3] ?? '');
      actionDoc.new_owner = newOwner;
      if (p.data !== null && p.data !== undefined) {
        actionDoc.actor = String(p.data);
      }
      await refresh();
      break;
    }

    case 'burned': {
      // topics = ['stream', 'burned', stream_id]
      // The on-chain record is removed when a stream is burned; we can't
      // re-fetch it. Mark the materialized doc depleted instead.
      await streams.updateOne(
        { _id: p.streamId },
        { $set: { is_depleted: true, updated_at: now } },
      );
      break;
    }
  }

  // Append the audit row last so a fresh-state refresh failure can't
  // duplicate the action. Duplicates on the (tx_hash, log_index) unique
  // index throw E11000 — swallow.
  try {
    await actions.insertOne(actionDoc);
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code !== 11000) throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Polling loop                                                       *
 * ------------------------------------------------------------------ */

async function tick(): Promise<void> {
  const cursor = await loadCursor();

  let res: StellarRpc.Api.GetEventsResponse;
  try {
    res = await server.getEvents({
      startLedger: cursor,
      filters: [{ type: 'contract', contractIds: [CONTRACT] }],
      limit: PAGE_LIMIT,
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    // The most common cause here is the cursor being older than the RPC's
    // event retention window. Heal by jumping to the latest ledger.
    if (msg.includes('start is before oldest ledger') || msg.includes('oldest')) {
      console.warn(
        `[indexer] cursor ${cursor} predates RPC retention — jumping forward`,
      );
      const latest = await server.getLatestLedger();
      await saveCursor(Math.max(1, latest.sequence - STARTUP_BUFFER_LEDGERS));
      return;
    }
    throw err;
  }

  if (res.events.length > 0) {
    console.log(
      `[indexer] fetched ${res.events.length} event(s) from ledger ${cursor}`,
    );
  }

  for (const e of res.events) {
    const parsed = parseEvent(e);
    if (!parsed) continue;
    console.log(
      `[indexer] ${parsed.action} stream=${parsed.streamId} ledger=${parsed.ledger} tx=${parsed.tx_hash.slice(0, 8)}…`,
    );
    try {
      await handleEvent(parsed);
    } catch (err) {
      console.error(`[indexer] error handling event:`, err);
    }
  }

  if (typeof res.latestLedger === 'number' && res.latestLedger >= cursor) {
    await saveCursor(res.latestLedger + 1);
  }
}

async function main(): Promise<void> {
  if (!CONTRACT || CONTRACT.length === 0) {
    console.error(
      '[indexer] no lockup contract id in deployment — run scripts/deploy-local.sh first',
    );
    process.exit(1);
  }
  console.log(
    `[indexer] starting against ${DEPLOYMENT.rpcUrl}, contract ${CONTRACT}`,
  );
  await ensureIndexes();
  console.log('[indexer] indexes ensured');

  // Graceful shutdown: allow ctrl-c to finish in-flight work.
  let shuttingDown = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[indexer] ${sig} received — shutting down`);
      // tick is short; just exit on next loop turn.
      setTimeout(() => process.exit(0), 250);
    });
  }

  // Main loop.
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error('[indexer] tick error:', err);
    }
    if (shuttingDown) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error('[indexer] fatal:', err);
  process.exit(1);
});
