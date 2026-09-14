// GET /api/history?address=G…[&mine=1][&stream_id=N][&limit][&cursor]
// Wallet-wide action feed: every action on streams where the address is a
// participant (or only its own actions with mine=1), newest first.

import { NextResponse, type NextRequest } from 'next/server';
import type { ObjectId } from 'mongodb';
import { actionsCollection, streamsCollection, type ActionDoc } from '@/lib/db';
import { buildHistoryQuery, nextHistoryCursor } from '@/lib/api/historyQuery';
import { ParamError } from '@/lib/api/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const now = Math.floor(Date.now() / 1000);

  let q;
  try {
    q = buildHistoryQuery(searchParams);
  } catch (err) {
    if (err instanceof ParamError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const actions = await actionsCollection();
    const streams = await streamsCollection();
    const rows = (await actions
      .find(q.filter)
      .sort({ ts: -1, log_index: -1, _id: -1 })
      .limit(q.limit + 1)
      .toArray()) as (ActionDoc & { _id: ObjectId })[];
    const page = rows.slice(0, q.limit);
    const next_cursor = rows.length > q.limit ? nextHistoryCursor(page[page.length - 1]) : null;

    const ids = [...new Set(page.map((a) => a.stream_id))];
    const docs = await streams
      .find({ _id: { $in: ids } }, { projection: { _id: 1, model: 1, token: 1, sender: 1, recipient: 1, deposited: 1 } })
      .toArray();
    const byId = new Map(docs.map((d) => [d._id, { id: d._id, model: d.model, token: d.token, sender: d.sender, recipient: d.recipient, deposited: d.deposited }]));
    const items = page.map((a) => ({ ...a, stream: byId.get(a.stream_id) ?? null }));
    return NextResponse.json({ items, next_cursor, now });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json({ items: [], next_cursor: null, now, error: `db unreachable: ${msg}` }, { status: 503 });
  }
}
