// Event decode: turn a raw RPC event into our canonical `ParsedEvent` shape.
// Moved verbatim from `scripts/indexer.ts` (Task 8 removes the duplicate there).

import { scValToNative, type rpc, type xdr } from '@stellar/stellar-sdk';
import type { ActionDoc } from '../db';

export type ActionName = ActionDoc['action'];

export interface ParsedEvent {
  action: ActionName;
  streamId: number;
  topics: unknown[];
  data: unknown;
  ledger: number;
  tx_hash: string;
  // (tx_hash, log_index) is our idempotency key. We derive it from
  // transactionIndex (transaction order within the ledger) and the event's
  // ordinal inside the ledger, parsed from the RPC `id` suffix — this stays
  // unique even when a single operation emits several events for the same
  // action (e.g. `create_batch`). Falls back to operationIndex when the id
  // has no parsable ordinal, which is only unique per operation.
  log_index: number;
  ts: number;
}

/**
 * Per-event ordinal from the RPC event id (`<toid>-<%010d>`). Returns null
 * when the id has no parsable suffix (older RPCs / synthetic test events).
 */
export function eventOrdinal(id: string | undefined): number | null {
  if (!id) return null;
  const dash = id.lastIndexOf('-');
  if (dash < 0) return null;
  const n = Number.parseInt(id.slice(dash + 1), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const KNOWN_ACTIONS: ReadonlySet<string> = new Set([
  'created',
  'withdrawn',
  'canceled',
  'renounced',
  'transferred',
  'burned',
]);

export function parseEvent(e: rpc.Api.EventResponse): ParsedEvent | null {
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

  // Idempotency key, unique per event and monotonic within a ledger:
  // transaction order first, then the event's ordinal inside the ledger
  // (from the RPC id suffix). Falls back to the operation index for events
  // without a parsable id, which is only unique per operation.
  const txIdx = Number(e.transactionIndex ?? 0);
  const opIdx = Number(e.operationIndex ?? 0);
  const ordinal = eventOrdinal(e.id);
  const logIndex = txIdx * 1_000_000 + (ordinal ?? opIdx);

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
