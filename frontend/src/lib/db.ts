// MongoDB connection helper for the indexer + API routes.
//
// All DB access goes through this module so:
//   - the client + db handle are memoized across hot reloads / handler calls,
//   - the shape of every document is captured by a typed interface,
//   - indexes are declared in one place (ensureIndexes()).
//
// Configuration:
//   MONGODB_URL    default mongodb://localhost:27017 (the existing id-mongodb-1 container)
//   MONGODB_DB     default 'hourglass' (kept distinct from anything else in that container)

import { MongoClient, type Collection, type Db } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB ?? 'hourglass';

// Memoize the client + db handle so repeated handler invocations don't open
// a new connection every time. Next.js dev server hot-reloads can run this
// module multiple times in the same process — re-using `globalThis` keeps
// us to a single live client.
const g = globalThis as unknown as {
  __hourglassMongoClient?: MongoClient | null;
  __hourglassMongoDb?: Db | null;
};

async function client(): Promise<MongoClient> {
  if (g.__hourglassMongoClient) return g.__hourglassMongoClient;
  const c = new MongoClient(MONGODB_URL, {
    // Sensible defaults for a local dev mongo with no auth.
    serverSelectionTimeoutMS: 5_000,
    maxPoolSize: 10,
  });
  await c.connect();
  g.__hourglassMongoClient = c;
  return c;
}

export async function getDb(): Promise<Db> {
  if (g.__hourglassMongoDb) return g.__hourglassMongoDb;
  const c = await client();
  g.__hourglassMongoDb = c.db(MONGODB_DB);
  return g.__hourglassMongoDb;
}

/* ------------------------------------------------------------------ *
 * Document shapes                                                    *
 * ------------------------------------------------------------------ */

export interface LinearTerms {
  cliff_ts: number;
  unlock_at_start: string; // i128 as decimal string (BigInt-safe)
  unlock_at_cliff: string;
}

export interface TrancheTerms {
  amount: string; // i128 as decimal string
  ts: number;
}

/**
 * Canonical document for a stream. `_id` is the on-chain `stream_id` so we
 * never accidentally insert duplicates. `contract` is the lockup contract id
 * the stream came from — included for multi-network safety even though the
 * MVP only indexes a single contract per database.
 */
export interface StreamDoc {
  _id: number;
  contract: string;
  sender: string;
  recipient: string;
  token: string;
  model: 'Linear' | 'Tranched' | 'Recurring';
  start_ts: number;
  end_ts: number;
  // Linear-only:
  cliff_ts?: number;
  unlock_at_start?: string;
  unlock_at_cliff?: string;
  // Tranched-only:
  tranches?: TrancheTerms[];
  // Recurring-only:
  first_ts?: number;
  period_secs?: number;
  count?: number;
  amount_per_period?: string;
  // Common balance / flags (i128 amounts stored as decimal strings):
  deposited: string;
  withdrawn: string;
  refunded: string;
  is_cancelable: boolean;
  is_transferable: boolean;
  was_canceled: boolean;
  is_depleted: boolean;
  // Provenance:
  created_ledger?: number;
  created_tx?: string;
  created_at: number; // unix seconds (ledger close time when known)
  updated_at: number; // unix seconds
  /** How the doc was last materialized: from an event or from a reconcile pass. */
  source?: 'event' | 'reconcile';
}

/**
 * Per-event row. The `(tx_hash, log_index)` pair is unique — this is what
 * makes ingestion idempotent: re-processing the same RPC page is a no-op.
 */
export interface ActionDoc {
  stream_id: number;
  action:
    | 'created'
    | 'withdrawn'
    | 'canceled'
    | 'renounced'
    | 'transferred'
    | 'burned';
  ts: number;
  ledger: number;
  tx_hash: string;
  log_index: number;
  /**
   * Addresses involved in this action: the stream's sender + recipient at
   * event time plus the action's actor / to / new_owner. Multikey-indexed so
   * a wallet's whole history is one query.
   */
  participants: string[];
  // Optional per-action fields:
  amount?: string;
  actor?: string;
  to?: string;
  new_owner?: string;
  sender_refund?: string;
  recipient_balance?: string;
}

/**
 * Small key/value scratch space used by the indexer (e.g. `'cursor'` stores
 * the next ledger to fetch).
 */
export interface MetaDoc {
  _id: string;
  value: unknown;
}

/* ------------------------------------------------------------------ *
 * Typed collection getters                                           *
 * ------------------------------------------------------------------ */

export async function streamsCollection(): Promise<Collection<StreamDoc>> {
  const db = await getDb();
  return db.collection<StreamDoc>('streams');
}

export async function actionsCollection(): Promise<Collection<ActionDoc>> {
  const db = await getDb();
  return db.collection<ActionDoc>('actions');
}

export async function metaCollection(): Promise<Collection<MetaDoc>> {
  const db = await getDb();
  return db.collection<MetaDoc>('meta');
}

/* ------------------------------------------------------------------ *
 * Index setup (idempotent)                                           *
 * ------------------------------------------------------------------ */

/**
 * Declare indexes once on indexer startup. Mongo's `createIndex` is a no-op
 * if the same index already exists, so this is safe to call on every boot.
 */
export async function ensureIndexes(): Promise<void> {
  const streams = await streamsCollection();
  await streams.createIndex({ sender: 1, created_at: -1 });
  await streams.createIndex({ recipient: 1, created_at: -1 });
  await streams.createIndex({ token: 1 });
  await streams.createIndex({ model: 1 });
  await streams.createIndex({ end_ts: 1 });
  await streams.createIndex({ created_at: -1, _id: -1 });
  await streams.createIndex({ contract: 1, _id: 1 });

  const actions = await actionsCollection();
  // Unique compound on (tx_hash, log_index) means re-ingesting the same
  // event throws a duplicate-key error (code 11000), which the indexer
  // swallows. This is the idempotency guarantee.
  await actions.createIndex(
    { tx_hash: 1, log_index: 1 },
    { unique: true, name: 'tx_logidx_unique' },
  );
  await actions.createIndex({ stream_id: 1, ts: -1 });
  await actions.createIndex({ participants: 1, ts: -1, log_index: -1 });
  await actions.createIndex({ actor: 1, ts: -1 });
}
