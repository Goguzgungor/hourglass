// GET /api/streams?sender=<G…>&recipient=<G…>&status=<active|inactive>
//
// Reads the materialized `streams` collection. Supports filtering by sender,
// recipient, or status. Mongo driver requires the Node runtime (not Edge).
//
// The query is always forced dynamic — caching would defeat the purpose of
// the dashboard ("show me my live state").

import { NextResponse, type NextRequest } from 'next/server';
import { streamsCollection, type StreamDoc } from '@/lib/db';
import type { Filter } from 'mongodb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const sender = searchParams.get('sender');
  const recipient = searchParams.get('recipient');
  const status = searchParams.get('status'); // 'active' | 'inactive' | null
  const limitParam = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : 100;

  const filter: Filter<StreamDoc> = {};
  if (sender) filter.sender = sender;
  if (recipient) filter.recipient = recipient;

  if (status === 'active') {
    filter.was_canceled = false;
    filter.is_depleted = false;
  } else if (status === 'inactive') {
    filter.$or = [{ was_canceled: true }, { is_depleted: true }];
  }

  try {
    const col = await streamsCollection();
    const docs = await col
      .find(filter)
      .sort({ created_at: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return NextResponse.json({ streams: docs });
  } catch (err) {
    // Likely cause in local dev: mongo isn't running. Surface a clear error
    // so the dashboard can render an empty state instead of a hard crash.
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json(
      { streams: [], error: `db unreachable: ${msg}` },
      { status: 503 },
    );
  }
}
