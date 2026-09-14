// Pure translation of /api/streams query parameters into a Mongo filter,
// sort and limit. No I/O here — fully unit-testable.

import type { Filter } from 'mongodb';
import type { StreamDoc } from '../db';
import { decodeCursor, encodeCursor, isStreamsCursor } from './cursor';
import { optAddress, optEnum, optEnumList, optInt, ParamError } from './params';

export type SortField = 'created_at' | 'start_ts' | 'end_ts';
export type Order = 'asc' | 'desc';
const SORT_FIELDS = ['created_at', 'start_ts', 'end_ts'] as const;
const ORDERS = ['asc', 'desc'] as const;
const ROLES = ['sender', 'recipient', 'any'] as const;
const MODELS = ['Linear', 'Tranched', 'Recurring'] as const;
const STATUSES = ['pending', 'streaming', 'settled', 'canceled', 'depleted', 'active', 'inactive'] as const;
type StatusParam = (typeof STATUSES)[number];

export interface StreamsQuery {
  filter: Filter<StreamDoc>;
  sort: Record<string, 1 | -1>;
  sortField: SortField;
  order: Order;
  limit: number;
}

function statusClause(s: StatusParam, now: number): Filter<StreamDoc> {
  switch (s) {
    case 'active':
      return { was_canceled: false, is_depleted: false };
    case 'inactive':
      return { $or: [{ was_canceled: true }, { is_depleted: true }] };
    case 'pending':
      return { start_ts: { $gt: now }, was_canceled: false, is_depleted: false };
    case 'streaming':
      return { start_ts: { $lte: now }, end_ts: { $gt: now }, was_canceled: false, is_depleted: false };
    case 'settled':
      return { end_ts: { $lte: now }, was_canceled: false, is_depleted: false };
    case 'canceled':
      return { was_canceled: true, is_depleted: false };
    case 'depleted':
      return { is_depleted: true };
  }
}

function qClause(raw: string | null): Filter<StreamDoc> | null {
  if (raw === null) return null;
  const v = raw.trim();
  if (/^\d+$/.test(v)) return { _id: Number.parseInt(v, 10) };
  if (/^G[A-Z2-7]{1,55}$/.test(v)) {
    return { $or: [{ sender: { $regex: `^${v}` } }, { recipient: { $regex: `^${v}` } }] };
  }
  if (/^C[A-Z2-7]{1,55}$/.test(v)) return { token: { $regex: `^${v}` } };
  return null;
}

export function buildStreamsQuery(sp: URLSearchParams, now: number): StreamsQuery {
  const clauses: Filter<StreamDoc>[] = [];

  // Legacy exact-match parameters (dashboard v1) — keep behaviour identical.
  const legacySender = optAddress(sp, 'sender', 'G');
  const legacyRecipient = optAddress(sp, 'recipient', 'G');
  const legacy = legacySender !== undefined || legacyRecipient !== undefined;
  if (legacy) {
    const c: Filter<StreamDoc> = {};
    if (legacySender) c.sender = legacySender;
    if (legacyRecipient) c.recipient = legacyRecipient;
    clauses.push(c);
  }

  const address = optAddress(sp, 'address', 'G');
  const role = optEnum(sp, 'role', ROLES) ?? 'any';
  if (address) {
    if (role === 'sender') clauses.push({ sender: address });
    else if (role === 'recipient') clauses.push({ recipient: address });
    else clauses.push({ $or: [{ sender: address }, { recipient: address }] });
  }

  const statuses = optEnumList(sp, 'status', STATUSES);
  if (statuses && statuses.length > 0) {
    const parts = statuses.map((s) => statusClause(s, now));
    clauses.push(parts.length === 1 ? parts[0] : { $or: parts });
  }

  const token = optAddress(sp, 'token', 'C');
  if (token) clauses.push({ token });
  const model = optEnum(sp, 'model', MODELS);
  if (model) clauses.push({ model });

  const qc = qClause(sp.get('q'));
  if (qc) clauses.push(qc);

  const sortField = optEnum(sp, 'sort', SORT_FIELDS) ?? 'created_at';
  const order = optEnum(sp, 'order', ORDERS) ?? 'desc';
  const dir: 1 | -1 = order === 'asc' ? 1 : -1;

  const cursor = decodeCursor(sp.get('cursor'), isStreamsCursor);
  if (cursor) {
    const cmp = order === 'asc' ? '$gt' : '$lt';
    clauses.push({
      $or: [
        { [sortField]: { [cmp]: cursor.k } },
        { [sortField]: cursor.k, _id: { [cmp]: cursor.id } },
      ],
    } as Filter<StreamDoc>);
  }

  const limit = optInt(sp, 'limit', { min: 1, max: 100, def: legacy ? 100 : 50 });

  // Merge: plain object clauses are combined by key; $or clauses need $and.
  // Guard against a plain-clause key collision first — Object.assign would
  // silently drop an earlier constraint on the same key (e.g. an exact
  // `token=` alongside a `q=` prefix match on `token`, or a legacy
  // `sender=` alongside `address=`+`role=sender`). When two or more plain
  // clauses target the same key, every clause (plain and $or alike) becomes
  // its own $and element, in the order they were pushed, so no constraint
  // is lost.
  const isOrOnly = (c: Filter<StreamDoc>) => '$or' in c && Object.keys(c).length === 1;
  const seenKeys = new Set<string>();
  let collision = false;
  for (const c of clauses) {
    if (isOrOnly(c)) continue;
    for (const k of Object.keys(c)) {
      if (seenKeys.has(k)) {
        collision = true;
        break;
      }
      seenKeys.add(k);
    }
    if (collision) break;
  }

  let filter: Filter<StreamDoc>;
  if (collision) {
    filter = { $and: clauses } as Filter<StreamDoc>;
  } else {
    const plain: Filter<StreamDoc> = {};
    const ors: Filter<StreamDoc>[] = [];
    for (const c of clauses) {
      if (isOrOnly(c)) ors.push(c);
      else Object.assign(plain, c);
    }
    const hasPlain = Object.keys(plain).length > 0;
    if (ors.length === 0) filter = plain;
    else if (ors.length === 1 && !hasPlain) filter = ors[0];
    else if (ors.length === 1) filter = { ...plain, ...ors[0] };
    else filter = { $and: [...(hasPlain ? [plain] : []), ...ors] };
  }

  return { filter, sort: { [sortField]: dir, _id: dir }, sortField, order, limit };
}

export function nextStreamsCursor(
  last: Pick<StreamDoc, '_id' | SortField>,
  sortField: SortField,
): string {
  return encodeCursor({ k: last[sortField], id: last._id });
}
