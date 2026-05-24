// GET /api/streams/[id]
//
// Returns the materialized stream document plus its full action log,
// newest-first. 404 if the id isn't an integer or no doc exists.

import { NextResponse, type NextRequest } from 'next/server';
import {
  actionsCollection,
  streamsCollection,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const streamId = Number.parseInt(id, 10);
  if (!Number.isFinite(streamId) || streamId < 1) {
    return NextResponse.json(
      { error: 'invalid stream id' },
      { status: 400 },
    );
  }

  try {
    const streams = await streamsCollection();
    const actions = await actionsCollection();

    const stream = await streams.findOne({ _id: streamId });
    if (!stream) {
      return NextResponse.json(
        { error: 'stream not found in index' },
        { status: 404 },
      );
    }

    const log = await actions
      .find({ stream_id: streamId })
      .sort({ ts: -1, log_index: -1 })
      .toArray();

    return NextResponse.json({ stream, actions: log });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json(
      { error: `db unreachable: ${msg}` },
      { status: 503 },
    );
  }
}
