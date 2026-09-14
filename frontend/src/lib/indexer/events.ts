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
