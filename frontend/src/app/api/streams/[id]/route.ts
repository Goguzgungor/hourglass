// GET /api/streams/[id]?limit&cursor
//
// Returns the materialized stream document plus a page of its action log,
// newest-first, with an opaque cursor for the next page. 404 if the id isn't
// an integer or no doc exists.

import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Filter } from 'mongodb';
import { actionsCollection, streamsCollection, type ActionDoc } from '@/lib/db';
import { decodeCursor, isHistoryCursor } from '@/lib/api/cursor';
import { nextHistoryCursor } from '@/lib/api/historyQuery';
import { optInt, ParamError } from '@/lib/api/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const streamId = Number.parseInt(id, 10);
  if (!Number.isFinite(streamId) || streamId < 1) {
    return NextResponse.json({ error: 'invalid stream id' }, { status: 400 });
  }

  const sp = new URL(req.url).searchParams;
  let limit: number;
  let cursor;
  try {
    limit = optInt(sp, 'limit', { min: 1, max: 100, def: 50 });
    cursor = decodeCursor(sp.get('cursor'), isHistoryCursor);
  } catch (err) {
    if (err instanceof ParamError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  const now = Math.floor(Date.now() / 1000);

  try {
    const streams = await streamsCollection();
    const actions = await actionsCollection();

    const stream = await streams.findOne({ _id: streamId });
    if (!stream) {
      return NextResponse.json({ error: 'stream not found in index' }, { status: 404 });
    }

    const filter: Filter<ActionDoc> = { stream_id: streamId };
    if (cursor) {
      filter.$or = [
        { ts: { $lt: cursor.ts } },
        { ts: cursor.ts, log_index: { $lt: cursor.log_index } },
        { ts: cursor.ts, log_index: cursor.log_index, _id: { $lt: new ObjectId(cursor.id) } },
      ];
    }
    const rows = (await actions
      .find(filter)
      .sort({ ts: -1, log_index: -1, _id: -1 })
      .limit(limit + 1)
      .toArray()) as (ActionDoc & { _id: ObjectId })[];
    const page = rows.slice(0, limit);
    const next_cursor = rows.length > limit ? nextHistoryCursor(page[page.length - 1]) : null;

    return NextResponse.json({ stream, actions: page, next_cursor, now });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json({ error: `db unreachable: ${msg}` }, { status: 503 });
  }
}
