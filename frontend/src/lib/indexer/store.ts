// Persistence boundary for the indexer. `IndexerStore` is the interface the
// ingest + reconcile logic depends on; `MongoIndexerStore` is the real one.
// Tests use `MemoryIndexerStore` from ./testing.

import {
  actionsCollection,
  metaCollection,
  streamsCollection,
  type ActionDoc,
  type StreamDoc,
} from '../db';

export interface CursorState {
  cursor: string | null;
  ledger: number;
}

export interface ReconcileMeta {
  at: number;
  live: number;
  upserted: number;
  depleted: number;
}

export interface StreamHead {
  _id: number;
  was_canceled: boolean;
  is_depleted: boolean;
}

export interface ActionKey {
  ts: number;
  log_index: number;
}

export interface TransferRef {
  ts: number;
  log_index: number;
  actor?: string;
  new_owner?: string;
}

/** Recipient of a stream at the moment of `key`, reconstructed from its transfer history. */
export function recipientAt(key: ActionKey, transfersAsc: TransferRef[], current: string): string {
  for (const t of transfersAsc) {
    if (t.ts > key.ts || (t.ts === key.ts && t.log_index > key.log_index)) return t.actor ?? current;
  }
  return current;
}

export interface IndexerStore {
  loadCursorState(): Promise<CursorState | null>;
  saveCursorState(s: CursorState): Promise<void>;
  getStream(id: number): Promise<StreamDoc | null>;
  /** Keys present in `set` take precedence; overlapping keys are dropped from `setOnInsert`. */
  upsertStream(id: number, set: Partial<StreamDoc>, setOnInsert?: Partial<StreamDoc>): Promise<void>;
  markDepleted(id: number, now: number): Promise<void>;
  /** Idempotent: duplicate (tx_hash, log_index) is silently ignored. */
  insertAction(a: ActionDoc): Promise<void>;
  listStreamHeads(): Promise<StreamHead[]>;
  saveReconcileMeta(m: ReconcileMeta): Promise<void>;
}

const CURSOR_KEY = 'events_cursor';
const RECONCILE_KEY = 'last_reconcile';

export class MongoIndexerStore implements IndexerStore {
  async loadCursorState(): Promise<CursorState | null> {
    const meta = await metaCollection();
    const doc = await meta.findOne({ _id: CURSOR_KEY });
    const v = doc?.value as Partial<CursorState> | undefined;
    if (!v || typeof v.ledger !== 'number') return null;
    return { cursor: typeof v.cursor === 'string' ? v.cursor : null, ledger: v.ledger };
  }

  async saveCursorState(s: CursorState): Promise<void> {
    const meta = await metaCollection();
    await meta.updateOne({ _id: CURSOR_KEY }, { $set: { value: s } }, { upsert: true });
  }

  async getStream(id: number): Promise<StreamDoc | null> {
    const streams = await streamsCollection();
    return streams.findOne({ _id: id });
  }

  async upsertStream(id: number, set: Partial<StreamDoc>, setOnInsert?: Partial<StreamDoc>): Promise<void> {
    const streams = await streamsCollection();
    const update: Record<string, unknown> = { $set: set };
    // Mongo rejects an update where the same field path appears in both
    // $set and $setOnInsert, so drop any keys already present in `set`.
    const onInsert = Object.fromEntries(
      Object.entries(setOnInsert ?? {}).filter(([k]) => !(k in set)),
    );
    if (Object.keys(onInsert).length > 0) update.$setOnInsert = onInsert;
    await streams.updateOne({ _id: id }, update, { upsert: true });
  }

  async markDepleted(id: number, now: number): Promise<void> {
    const streams = await streamsCollection();
    await streams.updateOne({ _id: id }, { $set: { is_depleted: true, updated_at: now } });
  }

  async insertAction(a: ActionDoc): Promise<void> {
    const actions = await actionsCollection();
    try {
      await actions.insertOne(a);
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  async listStreamHeads(): Promise<StreamHead[]> {
    const streams = await streamsCollection();
    return streams
      .find({}, { projection: { _id: 1, was_canceled: 1, is_depleted: 1 } })
      .toArray() as Promise<StreamHead[]>;
  }

  async saveReconcileMeta(m: ReconcileMeta): Promise<void> {
    const meta = await metaCollection();
    await meta.updateOne({ _id: RECONCILE_KEY }, { $set: { value: m } }, { upsert: true });
  }

  /**
   * One-time migration: fill `created_at` on streams written before every
   * first materialization set it (a doc first seen through a non-`created`
   * event had no sort key, so it was invisible to the default `created_at`
   * ordering). `start_ts` is the same fallback a fresh insert uses. Returns
   * the number of streams updated.
   */
  async backfillCreatedAt(): Promise<number> {
    const streams = await streamsCollection();
    const res = await streams.updateMany(
      { created_at: { $exists: false } },
      [{ $set: { created_at: '$start_ts' } }],
    );
    return res.modifiedCount;
  }

  /**
   * One-time migration: fill `participants` on actions written before the
   * field existed. The recipient is reconstructed at the action's own
   * (ts, log_index) from the stream's transfer history — using the stream
   * doc's CURRENT recipient would misattribute pre-transfer actions to a
   * later owner. Returns the number of actions updated.
   */
  async backfillParticipants(): Promise<number> {
    const actions = await actionsCollection();
    const streams = await streamsCollection();
    const missing = await actions.find({ participants: { $exists: false } }).toArray();
    if (missing.length === 0) return 0;

    const streamIds = [...new Set(missing.map((a) => a.stream_id))];

    const streamDocs = await streams
      .find({ _id: { $in: streamIds } }, { projection: { sender: 1, recipient: 1 } })
      .toArray();
    const streamById = new Map(streamDocs.map((s) => [s._id, { sender: s.sender, recipient: s.recipient }]));

    const transferDocs = await actions
      .find({ stream_id: { $in: streamIds }, action: 'transferred' })
      .sort({ ts: 1, log_index: 1 })
      .toArray();
    const transfersByStream = new Map<number, TransferRef[]>();
    for (const t of transferDocs) {
      const list = transfersByStream.get(t.stream_id) ?? [];
      list.push({ ts: t.ts, log_index: t.log_index, actor: t.actor, new_owner: t.new_owner });
      transfersByStream.set(t.stream_id, list);
    }

    let n = 0;
    for (const a of missing) {
      const s = streamById.get(a.stream_id);
      const transfers = transfersByStream.get(a.stream_id) ?? [];
      const set = new Set<string>();
      if (s) {
        set.add(s.sender);
        set.add(recipientAt({ ts: a.ts, log_index: a.log_index }, transfers, s.recipient));
      }
      for (const v of [a.actor, a.to, a.new_owner]) if (v) set.add(v);
      await actions.updateOne({ _id: a._id }, { $set: { participants: [...set] } });
      n++;
    }
    return n;
  }
}
