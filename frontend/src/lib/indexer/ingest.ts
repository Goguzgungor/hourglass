// Event ingestion: cursor-paged fetch from RPC and per-event materialization.
// All I/O goes through the injected `EventsRpc`, `ChainReader`, `IndexerStore`.

import type { rpc } from '@stellar/stellar-sdk';
import type { ActionDoc, StreamDoc } from '../db';
import { mapStream, type ChainReader } from './chain';
import type { ParsedEvent } from './events';
import type { CursorState, IndexerStore } from './store';

export interface EventsRpc {
  getEvents(req: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
  getLatestLedger(): Promise<{ sequence: number }>;
}

export interface IngestOptions {
  contractId: string;
  pageLimit: number;
  maxPages: number;
  startupBufferLedgers: number;
}

export interface IngestResult {
  pages: number;
  events: number;
  reset: boolean;
}

export function participantsFor(
  a: Pick<ActionDoc, 'actor' | 'to' | 'new_owner'>,
  stream: { sender: string; recipient: string } | null,
): string[] {
  const out: string[] = [];
  const push = (v: string | undefined) => { if (v && !out.includes(v)) out.push(v); };
  if (stream) { push(stream.sender); push(stream.recipient); }
  push(a.actor); push(a.to); push(a.new_owner);
  return out;
}

// A bare mention of "cursor" in an error message is not enough on its own —
// e.g. "cursor parameter is required" is a caller bug, not exhausted
// retention — so that word only counts alongside a qualifier that actually
// describes a retention failure.
const CURSOR_RETENTION_QUALIFIERS = ['invalid', 'before', 'retention', 'expired', 'unknown'];

function isRetentionError(err: unknown): boolean {
  const msg = ((err as Error)?.message ?? String(err)).toLowerCase();
  if (msg.includes('oldest')) return true;
  if (msg.includes('cursor')) return CURSOR_RETENTION_QUALIFIERS.some((k) => msg.includes(k));
  return false;
}

/**
 * Fetch every event since the saved cursor state, page by page, persisting
 * the RPC cursor after each page so a crash resumes exactly where it stopped.
 * A throwing `handleRaw` aborts the page before its cursor is saved, so the
 * whole page is re-fetched next tick; callers must not swallow errors inside
 * `handleRaw`.
 */
export async function fetchAndIngest(
  rpcServer: EventsRpc,
  store: IndexerStore,
  opts: IngestOptions,
  handleRaw: (e: rpc.Api.EventResponse) => Promise<void>,
): Promise<IngestResult> {
  let state: CursorState | null = await store.loadCursorState();
  if (!state) {
    const latest = await rpcServer.getLatestLedger();
    state = { cursor: null, ledger: Math.max(1, latest.sequence - opts.startupBufferLedgers) };
    // Not persisted yet: the first successful page saves the real RPC cursor.
  }
  const filters = [{ type: 'contract' as const, contractIds: [opts.contractId] }];
  let pages = 0;
  let events = 0;

  while (pages < opts.maxPages) {
    const req: rpc.Api.GetEventsRequest = state.cursor
      ? { filters, cursor: state.cursor, limit: opts.pageLimit }
      : { filters, startLedger: state.ledger, limit: opts.pageLimit };

    let res: rpc.Api.GetEventsResponse;
    try {
      res = await rpcServer.getEvents(req);
    } catch (err) {
      if (!isRetentionError(err)) throw err;
      const latest = await rpcServer.getLatestLedger();
      state = { cursor: null, ledger: Math.max(1, latest.sequence - opts.startupBufferLedgers) };
      await store.saveCursorState(state);
      return { pages, events, reset: true };
    }

    pages++;
    for (const e of res.events) {
      await handleRaw(e);
      events++;
    }
    state = { cursor: res.cursor, ledger: res.latestLedger };
    await store.saveCursorState(state);
    if (res.events.length < opts.pageLimit) break;
  }
  return { pages, events, reset: false };
}

/** Materialize one parsed lockup event into the store. */
export async function handleEvent(
  p: ParsedEvent,
  deps: { chain: ChainReader; store: IndexerStore; contractId: string; now: () => number },
): Promise<void> {
  const { chain, store, contractId } = deps;
  const now = deps.now();
  const action: ActionDoc = {
    stream_id: p.streamId,
    action: p.action,
    ts: p.ts,
    ledger: p.ledger,
    tx_hash: p.tx_hash,
    log_index: p.log_index,
    participants: [],
  };

  let parties: { sender: string; recipient: string } | null = null;

  const refresh = async (extra: Partial<StreamDoc> = {}, onInsert: Partial<StreamDoc> = {}) => {
    const s = await chain.getStream(p.streamId);
    if (!s) return;
    const fields = mapStream(s);
    parties = { sender: fields.sender!, recipient: fields.recipient! };
    await store.upsertStream(
      p.streamId,
      { ...fields, ...extra, contract: contractId, updated_at: now, source: 'event' },
      onInsert,
    );
  };

  switch (p.action) {
    case 'created': {
      action.actor = String(p.topics[3] ?? '');
      await refresh({}, { created_ledger: p.ledger, created_tx: p.tx_hash, created_at: p.ts });
      break;
    }
    case 'withdrawn': {
      action.to = String(p.topics[3] ?? '');
      if (Array.isArray(p.data)) {
        const [amount, caller] = p.data as [unknown, unknown];
        if (amount !== undefined) action.amount = String(amount);
        if (caller !== undefined) action.actor = String(caller);
      }
      await refresh();
      break;
    }
    case 'canceled': {
      if (Array.isArray(p.data)) {
        const [refund, balance] = p.data as [unknown, unknown];
        if (refund !== undefined) action.sender_refund = String(refund);
        if (balance !== undefined) action.recipient_balance = String(balance);
      }
      await refresh();
      break;
    }
    case 'renounced': {
      await refresh();
      break;
    }
    case 'transferred': {
      action.new_owner = String(p.topics[3] ?? '');
      if (p.data !== null && p.data !== undefined) action.actor = String(p.data);
      await refresh();
      break;
    }
    case 'burned': {
      await store.markDepleted(p.streamId, now);
      break;
    }
  }

  if (!parties) {
    const existing = await store.getStream(p.streamId);
    if (existing) parties = { sender: existing.sender, recipient: existing.recipient };
  }
  action.participants = participantsFor(action, parties);
  await store.insertAction(action);
}
