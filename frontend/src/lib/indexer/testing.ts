// In-memory fakes for unit tests. Never imported by production code.

import type { ActionDoc, StreamDoc } from '../db';
import type { CursorState, IndexerStore, ReconcileMeta, StreamHead } from './store';

export class MemoryIndexerStore implements IndexerStore {
  streams = new Map<number, StreamDoc>();
  actions: ActionDoc[] = [];
  cursor: CursorState | null = null;
  cursorSaves: CursorState[] = [];
  reconcileMeta: ReconcileMeta | null = null;

  async loadCursorState() { return this.cursor; }
  async saveCursorState(s: CursorState) { this.cursor = s; this.cursorSaves.push(s); }
  async getStream(id: number) { return this.streams.get(id) ?? null; }
  async upsertStream(id: number, set: Partial<StreamDoc>, setOnInsert?: Partial<StreamDoc>) {
    const existing = this.streams.get(id);
    const merged = { ...(existing ?? setOnInsert ?? {}), ...set, _id: id } as StreamDoc;
    this.streams.set(id, merged);
  }
  async markDepleted(id: number, now: number) {
    const s = this.streams.get(id);
    if (s) this.streams.set(id, { ...s, is_depleted: true, updated_at: now });
  }
  async insertAction(a: ActionDoc) {
    if (this.actions.some((x) => x.tx_hash === a.tx_hash && x.log_index === a.log_index)) return;
    this.actions.push(a);
  }
  async listStreamHeads(): Promise<StreamHead[]> {
    return [...this.streams.values()].map((s) => ({ _id: s._id, was_canceled: s.was_canceled, is_depleted: s.is_depleted }));
  }
  async saveReconcileMeta(m: ReconcileMeta) { this.reconcileMeta = m; }
}

// Minimal structural copy of Task 5's ChainReader so tests compile before/after.
export interface StreamChainLike {
  sender: string; recipient: string; token: string;
  start_ts: number; end_ts: number;
  deposited: bigint; withdrawn: bigint; refunded: bigint;
  is_cancelable: boolean; is_transferable: boolean; was_canceled: boolean; is_depleted: boolean;
  shape:
    | { tag: 'Linear'; values: readonly [{ cliff_ts: number; unlock_at_start: bigint; unlock_at_cliff: bigint }] }
    | { tag: 'Tranched'; values: readonly [{ tranches: Array<{ amount: bigint; ts: number }> }] }
    | { tag: 'Recurring'; values: readonly [{ first_ts: number; period_secs: number; count: number; amount_per_period: bigint }] };
}

export class FakeChain {
  calls = { getStream: 0, totalSupply: 0, getTokenId: 0 };
  constructor(public streams: Map<number, StreamChainLike>) {}
  async getStream(id: number) { this.calls.getStream++; return this.streams.get(id) ?? null; }
  async totalSupply() { this.calls.totalSupply++; return this.streams.size; }
  async getTokenId(index: number) { this.calls.getTokenId++; return [...this.streams.keys()][index]; }
}

export function chainStream(over: Partial<StreamChainLike> = {}): StreamChainLike {
  return {
    sender: 'GSENDER', recipient: 'GRECIP', token: 'CTOKEN',
    start_ts: 1_000, end_ts: 2_000,
    deposited: 1_000n, withdrawn: 0n, refunded: 0n,
    is_cancelable: true, is_transferable: true, was_canceled: false, is_depleted: false,
    shape: { tag: 'Linear', values: [{ cliff_ts: 1_000, unlock_at_start: 0n, unlock_at_cliff: 0n }] },
    ...over,
  };
}
