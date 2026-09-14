// Pure translation of /api/history parameters into a Mongo filter + limit.

import type { Filter } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { ActionDoc } from '../db';
import { decodeCursor, encodeCursor, isHistoryCursor } from './cursor';
import { optAddress, optInt, ParamError } from './params';

// `ActionDoc` does not yet declare `participants` (Task 4 adds it). Until
// then, type the filter with the field added locally so this compiles;
// Task 4 removes the intersection.
export interface HistoryQuery {
  filter: Filter<ActionDoc & { participants?: string[] }>;
  limit: number;
}

export function buildHistoryQuery(sp: URLSearchParams): HistoryQuery {
  const address = optAddress(sp, 'address', 'G');
  if (!address) throw new ParamError('address is required');

  const filter: Filter<ActionDoc & { participants?: string[] }> =
    sp.get('mine') === '1' ? { actor: address } : { participants: address };

  const streamId = sp.get('stream_id');
  if (streamId !== null && streamId !== '') {
    if (!/^\d+$/.test(streamId)) throw new ParamError('stream_id must be an integer');
    filter.stream_id = Number.parseInt(streamId, 10);
  }

  const cursor = decodeCursor(sp.get('cursor'), isHistoryCursor);
  if (cursor) {
    filter.$or = [
      { ts: { $lt: cursor.ts } },
      { ts: cursor.ts, log_index: { $lt: cursor.log_index } },
      { ts: cursor.ts, log_index: cursor.log_index, _id: { $lt: new ObjectId(cursor.id) } },
    ];
  }

  const limit = optInt(sp, 'limit', { min: 1, max: 100, def: 50 });
  return { filter, limit };
}

export function nextHistoryCursor(last: { _id: ObjectId; ts: number; log_index: number }): string {
  return encodeCursor({ ts: last.ts, log_index: last.log_index, id: last._id.toHexString() });
}
