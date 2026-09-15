// GET /api/tokens — distinct tokens seen across indexed streams, most used first.

import { NextResponse } from 'next/server';
import { streamsCollection } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const col = await streamsCollection();
    const rows = await col
      .aggregate<{ _id: string; streams: number }>([
        { $group: { _id: '$token', streams: { $sum: 1 } } },
        { $sort: { streams: -1, _id: 1 } },
      ])
      .toArray();
    return NextResponse.json({ tokens: rows.map((r) => ({ token: r._id, streams: r.streams })) });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json({ tokens: [], error: `db unreachable: ${msg}` }, { status: 503 });
  }
}
