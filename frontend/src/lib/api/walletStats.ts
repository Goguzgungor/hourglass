// Per-wallet aggregates over the wallet's streams. Pure; the route fetches.

import type { StreamDoc } from '../db';
import { deriveStatus, withdrawableNow, type StreamStatus } from '../streaming';

export interface TokenTotals {
  token: string;
  sent_deposited: string;
  sent_locked: string;
  received_withdrawn: string;
  received_withdrawable_now: string;
}

export interface WalletStats {
  now: number;
  counts: { sending: number; receiving: number; by_status: Record<StreamStatus, number> };
  by_token: TokenTotals[];
}

export function walletStats(address: string, streams: StreamDoc[], now: number): WalletStats {
  const by_status: Record<StreamStatus, number> = { PENDING: 0, STREAMING: 0, SETTLED: 0, CANCELED: 0, DEPLETED: 0 };
  let sending = 0;
  let receiving = 0;
  const totals = new Map<string, { sd: bigint; sl: bigint; rw: bigint; rwn: bigint }>();
  const bucket = (token: string) => {
    let t = totals.get(token);
    if (!t) { t = { sd: 0n, sl: 0n, rw: 0n, rwn: 0n }; totals.set(token, t); }
    return t;
  };

  for (const s of streams) {
    by_status[deriveStatus(s, now)]++;
    const t = bucket(s.token);
    if (s.sender === address) {
      sending++;
      t.sd += BigInt(s.deposited);
      // A depleted stream holds nothing, whatever its (possibly stale) amounts
      // say; otherwise the clamp guards against `withdrawn + refunded`
      // overshooting `deposited` — which the on-chain withdraw-after-cancel gap
      // can actually produce (see `withdrawableNow`).
      if (!s.is_depleted) {
        const locked = BigInt(s.deposited) - BigInt(s.withdrawn) - BigInt(s.refunded);
        if (locked > 0n) t.sl += locked;
      }
    }
    if (s.recipient === address) {
      receiving++;
      t.rw += BigInt(s.withdrawn);
      t.rwn += withdrawableNow(s, now);
    }
  }

  const by_token = [...totals.entries()]
    .map(([token, t]) => ({
      token,
      sent_deposited: t.sd.toString(),
      sent_locked: t.sl.toString(),
      received_withdrawn: t.rw.toString(),
      received_withdrawable_now: t.rwn.toString(),
    }))
    .sort((a, b) => a.token.localeCompare(b.token));

  return { now, counts: { sending, receiving, by_status }, by_token };
}
