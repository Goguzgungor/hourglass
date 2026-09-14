// Vesting math shared by API routes and the UI. Mirrors
// contracts/shared/src/math.rs exactly (integer division floors).

import type { StreamDoc } from './db';

export type StreamStatus =
  | 'PENDING'
  | 'STREAMING'
  | 'SETTLED'
  | 'CANCELED'
  | 'DEPLETED';

export type StreamTerms = Pick<
  StreamDoc,
  | 'model'
  | 'start_ts'
  | 'end_ts'
  | 'deposited'
  | 'withdrawn'
  | 'refunded'
  | 'was_canceled'
  | 'is_depleted'
  | 'cliff_ts'
  | 'unlock_at_start'
  | 'unlock_at_cliff'
  | 'tranches'
  | 'first_ts'
  | 'period_secs'
  | 'count'
  | 'amount_per_period'
>;

function big(v: string | undefined): bigint {
  return BigInt(v ?? '0');
}

/** Cumulative amount vested at `now` (unix seconds). */
export function streamedAmount(t: StreamTerms, now: number): bigint {
  const deposited = big(t.deposited);
  switch (t.model) {
    case 'Linear': {
      const start = t.start_ts;
      const cliff = t.cliff_ts ?? t.start_ts;
      const end = t.end_ts;
      const us = big(t.unlock_at_start);
      const uc = big(t.unlock_at_cliff);
      if (now < start) return 0n;
      if (now < cliff) return us;
      if (now >= end) return deposited;
      const base = deposited - us - uc;
      const elapsed = BigInt(now - cliff);
      const span = BigInt(end - cliff);
      return us + uc + (base * elapsed) / span;
    }
    case 'Tranched': {
      let acc = 0n;
      for (const tr of t.tranches ?? []) {
        if (tr.ts > now) break;
        acc += big(tr.amount);
      }
      return acc;
    }
    case 'Recurring': {
      const first = t.first_ts ?? t.start_ts;
      const period = t.period_secs ?? 0;
      const count = t.count ?? 0;
      if (now < first || period <= 0 || count <= 0) return 0n;
      const elapsedPeriods = Math.floor((now - first) / period);
      const unlocked = Math.min(elapsedPeriods + 1, count);
      return big(t.amount_per_period) * BigInt(unlocked);
    }
  }
}

/** `max(0, streamed(now) - withdrawn)`. */
export function withdrawableNow(t: StreamTerms, now: number): bigint {
  const w = streamedAmount(t, now) - big(t.withdrawn);
  return w > 0n ? w : 0n;
}

/** Same precedence as `Stream::status` on-chain. */
export function deriveStatus(t: StreamTerms, now: number): StreamStatus {
  if (t.is_depleted) return 'DEPLETED';
  if (t.was_canceled) return 'CANCELED';
  if (now < t.start_ts) return 'PENDING';
  if (now >= t.end_ts) return 'SETTLED';
  return 'STREAMING';
}
