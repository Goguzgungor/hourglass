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
      // Deliberate divergence from math.rs: the contract rejects a
      // non-positive `period_secs` up front with `Err(InvalidPeriod)`, so such
      // a stream can never exist on chain. This read layer cannot throw at a
      // caller asking about a materialized doc, so it reports 0 streamed for
      // a (corrupt or hand-written) doc with `period_secs <= 0` instead.
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

/**
 * `max(0, min(streamed(now), deposited - refunded) - withdrawn)`, and `0` once
 * the stream is depleted.
 *
 * The `deposited - refunded` cap is a deliberate divergence from the contract:
 * `withdrawable_amount` in contracts/shared/src/math.rs still computes
 * `streamed(now) - withdrawn` after a `cancel`, so on chain a canceled
 * recipient can be quoted — and paid, out of the contract's pooled token
 * balance — more than the stream's own remaining balance. That is ticketed as
 * a contract follow-up (see docs/superpowers/plans/2026-09-14-lockup-v0.2-
 * followups.md); until it ships the API must never advertise more than the
 * stream actually holds. A depleted stream holds nothing, whatever a stale
 * `withdrawn` says.
 */
export function withdrawableNow(t: StreamTerms, now: number): bigint {
  if (t.is_depleted) return 0n;
  const remaining = big(t.deposited) - big(t.refunded);
  const streamed = streamedAmount(t, now);
  const capped = streamed < remaining ? streamed : remaining;
  const w = capped - big(t.withdrawn);
  return w > 0n ? w : 0n;
}

/** Share of the deposit vested at `now`, 0..1 (4-decimal precision, bigint-scaled). */
export function streamedFraction(t: StreamTerms, now: number): number {
  const deposited = big(t.deposited);
  if (deposited <= 0n) return 0;
  const streamed = streamedAmount(t, now);
  if (streamed <= 0n) return 0;
  if (streamed >= deposited) return 1;
  return Number((streamed * 10_000n) / deposited) / 10_000;
}

/** Same precedence as `Stream::status` on-chain. */
export function deriveStatus(t: StreamTerms, now: number): StreamStatus {
  if (t.is_depleted) return 'DEPLETED';
  if (t.was_canceled) return 'CANCELED';
  if (now < t.start_ts) return 'PENDING';
  if (now >= t.end_ts) return 'SETTLED';
  return 'STREAMING';
}

/* ----------------------------------------------------------------- *
 * Recurring schedule rendering (stream page unlock list + chart)    *
 * ----------------------------------------------------------------- */

/** A recurring schedule as the UI holds it: bigint money, unix-second times. */
export type RecurringSchedule = {
  first_ts: number;
  period_secs: number;
  count: number;
  amount_per_period: bigint;
};

export type UnlockPoint = { amount: bigint; ts: number };

/** How many unlocks the stream page lists / charts for a recurring stream. */
export const RENDERED_UNLOCKS = 24;

/** First `n` unlocks of a recurring schedule as tranche points (for the unlock list). */
export function recurringPreview(r: RecurringSchedule, n: number = RENDERED_UNLOCKS): UnlockPoint[] {
  const shown = Math.min(n, r.count);
  if (shown <= 0) return [];
  return Array.from({ length: shown }, (_, i) => ({ amount: r.amount_per_period, ts: r.first_ts + i * r.period_secs }));
}

/**
 * Up to `n` chart points sampled evenly across a recurring schedule (always
 * including the last unlock). Amounts are cumulative differences, so summing
 * them reproduces the total at each sampled point and `deposited` at the end.
 */
export function recurringChartTranches(r: RecurringSchedule, n: number = RENDERED_UNLOCKS): UnlockPoint[] {
  const shown = Math.min(n, r.count);
  if (shown <= 0) return [];
  const out: UnlockPoint[] = [];
  let prev = -1;
  for (let i = 0; i < shown; i++) {
    // last sample is always the final unlock (index count-1)
    const k = i === shown - 1 ? r.count - 1 : Math.floor(((i + 1) * r.count) / shown) - 1;
    const idx = Math.max(k, prev + 1);
    out.push({ amount: r.amount_per_period * BigInt(idx - prev), ts: r.first_ts + idx * r.period_secs });
    prev = idx;
  }
  return out;
}
