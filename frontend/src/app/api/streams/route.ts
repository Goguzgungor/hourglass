// GET /api/streams — list/search/filter/sort/paginate the materialized streams.
// See docs/superpowers/specs/2026-09-14-indexer-api-v2-design.md §9 for params.

import { NextResponse, type NextRequest } from 'next/server';
import { streamsCollection } from '@/lib/db';
import { ParamError } from '@/lib/api/params';
import { buildStreamsQuery, nextStreamsCursor } from '@/lib/api/streamsQuery';
import { deriveStatus, withdrawableNow } from '@/lib/streaming';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const now = Math.floor(Date.now() / 1000);

  let q;
  try {
    q = buildStreamsQuery(searchParams, now);
  } catch (err) {
    if (err instanceof ParamError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const col = await streamsCollection();
    const docs = await col.find(q.filter).sort(q.sort).limit(q.limit + 1).toArray();
    const page = docs.slice(0, q.limit);
    const next_cursor = docs.length > q.limit ? nextStreamsCursor(page[page.length - 1], q.sortField) : null;
    const streams = page.map((d) => ({
      ...d,
      status: deriveStatus(d, now),
      withdrawable_now: withdrawableNow(d, now).toString(),
    }));
    return NextResponse.json({ streams, next_cursor, now });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json({ streams: [], next_cursor: null, now, error: `db unreachable: ${msg}` }, { status: 503 });
  }
}
