// GET /api/stats
//
// Returns aggregate stats over the indexed streams. Used by the dashboard's
// header strip ("12 streams · 1,250 XLM locked · 4 in flight").

import { NextResponse, type NextRequest } from 'next/server';
import { streamsCollection } from '@/lib/db';
import { optAddress, ParamError } from '@/lib/api/params';
import { walletStats } from '@/lib/api/walletStats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface StatsResponse {
  total: number;
  active: number;
  inactive: number;
  /** Sum of `deposited - withdrawn - refunded` across all streams, as a
   *  decimal string (BigInt-safe; can be very large). */
  locked: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = new URL(req.url).searchParams;
  let address: string | undefined;
  try {
    address = optAddress(sp, 'address', 'G');
  } catch (err) {
    if (err instanceof ParamError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  if (address) {
    const now = Math.floor(Date.now() / 1000);
    try {
      const col = await streamsCollection();
      const docs = await col.find({ $or: [{ sender: address }, { recipient: address }] }).toArray();
      return NextResponse.json(walletStats(address, docs, now));
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      return NextResponse.json({ error: `db unreachable: ${msg}` }, { status: 503 });
    }
  }

  try {
    const col = await streamsCollection();
    // Fetch only the fields we need to compute the aggregate; for a few
    // hundred streams this is plenty fast.
    const docs = await col
      .find(
        {},
        {
          projection: {
            _id: 1,
            deposited: 1,
            withdrawn: 1,
            refunded: 1,
            was_canceled: 1,
            is_depleted: 1,
          },
        },
      )
      .toArray();

    let active = 0;
    let inactive = 0;
    let locked = 0n;
    for (const d of docs) {
      if (d.was_canceled || d.is_depleted) {
        inactive++;
      } else {
        active++;
      }
      try {
        const dep = BigInt(d.deposited);
        const wd = BigInt(d.withdrawn);
        const rf = BigInt(d.refunded);
        const remaining = dep - wd - rf;
        if (remaining > 0n) locked += remaining;
      } catch {
        // skip malformed rows
      }
    }

    const payload: StatsResponse = {
      total: docs.length,
      active,
      inactive,
      locked: locked.toString(),
    };
    return NextResponse.json(payload);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json(
      { total: 0, active: 0, inactive: 0, locked: '0', error: msg },
      { status: 503 },
    );
  }
}
