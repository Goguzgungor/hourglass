//
// Pure schedule model for the create flow. A `ScheduleTemplate` is relative
// (seconds from "now" / from start, percentages in basis points) and is what
// templates persist; a `Schedule` is absolute (unix seconds) and is what the
// form holds. `buildSpec` turns a schedule + total amount into the contract's
// `CreateSpec`. No React, no clocks: `now` is always a parameter.

import type { CreateSpec } from 'hourglass/lockup';

export type Shape = 'linear' | 'tranched' | 'recurring';
export type Mode = 'single' | 'batch';

export const BPS_DENOM = 10_000;
export const SINGLE_START_MARGIN_SECS = 120;
export const BATCH_START_MARGIN_SECS = 900;
export const MAX_TRANCHES = 100;
export const MIN_PERIOD_SECS = 60;
export const MAX_RECURRING_COUNT = 1000;

export type ScheduleTemplate =
  | {
      shape: 'linear';
      startOffset: number;
      cliffOffset: number;
      duration: number;
      unlockAtStartBps: number;
      unlockAtCliffBps: number;
    }
  | { shape: 'tranched'; startOffset: number; tranches: Array<{ offset: number; bps: number }> }
  | { shape: 'recurring'; startOffset: number; periodSecs: number; count: number };

export type Schedule =
  | {
      shape: 'linear';
      startTs: number;
      cliffTs: number;
      endTs: number;
      unlockAtStartBps: number;
      unlockAtCliffBps: number;
    }
  | { shape: 'tranched'; startTs: number; tranches: Array<{ ts: number; bps: number }> }
  | { shape: 'recurring'; firstTs: number; periodSecs: number; count: number };

export type ScheduleError = { field: string; message: string };

export type BuiltSpec = {
  spec: CreateSpec;
  /** Amount actually deposited on-chain (≤ the requested total). */
  deposited: bigint;
  /** `deposited − total`; 0 or negative (recurring rounding). */
  adjustment: bigint;
};

export function startMargin(mode: Mode): number {
  return mode === 'batch' ? BATCH_START_MARGIN_SECS : SINGLE_START_MARGIN_SECS;
}

export function resolveSchedule(t: ScheduleTemplate, nowSec: number): Schedule {
  const start = nowSec + t.startOffset;
  switch (t.shape) {
    case 'linear':
      return {
        shape: 'linear',
        startTs: start,
        cliffTs: start + t.cliffOffset,
        endTs: start + t.duration,
        unlockAtStartBps: t.unlockAtStartBps,
        unlockAtCliffBps: t.unlockAtCliffBps,
      };
    case 'tranched':
      return {
        shape: 'tranched',
        startTs: start,
        tranches: t.tranches.map((x) => ({ ts: start + x.offset, bps: x.bps })),
      };
    case 'recurring':
      return { shape: 'recurring', firstTs: start, periodSecs: t.periodSecs, count: t.count };
  }
}

export function scheduleStart(s: Schedule): number {
  return s.shape === 'recurring' ? s.firstTs : s.startTs;
}

export function scheduleEnd(s: Schedule): number {
  switch (s.shape) {
    case 'linear':
      return s.endTs;
    case 'tranched':
      return s.tranches.length ? s.tranches[s.tranches.length - 1].ts : s.startTs;
    case 'recurring':
      return s.firstTs + s.periodSecs * (s.count - 1);
  }
}

export function deriveTemplate(s: Schedule, nowSec: number): ScheduleTemplate {
  const startOffset = Math.max(0, scheduleStart(s) - nowSec);
  switch (s.shape) {
    case 'linear':
      return {
        shape: 'linear',
        startOffset,
        cliffOffset: s.cliffTs - s.startTs,
        duration: s.endTs - s.startTs,
        unlockAtStartBps: s.unlockAtStartBps,
        unlockAtCliffBps: s.unlockAtCliffBps,
      };
    case 'tranched':
      return {
        shape: 'tranched',
        startOffset,
        tranches: s.tranches.map((t) => ({ offset: t.ts - s.startTs, bps: t.bps })),
      };
    case 'recurring':
      return { shape: 'recurring', startOffset, periodSecs: s.periodSecs, count: s.count };
  }
}

export function shiftSchedule(s: Schedule, seconds: number): Schedule {
  switch (s.shape) {
    case 'linear':
      return { ...s, startTs: s.startTs + seconds, cliffTs: s.cliffTs + seconds, endTs: s.endTs + seconds };
    case 'tranched':
      return { ...s, startTs: s.startTs + seconds, tranches: s.tranches.map((t) => ({ ...t, ts: t.ts + seconds })) };
    case 'recurring':
      return { ...s, firstTs: s.firstTs + seconds };
  }
}

/** Shift the whole schedule forward so that start ≥ now + margin(mode). */
export function clampScheduleStart(s: Schedule, nowSec: number, mode: Mode): Schedule {
  const min = nowSec + startMargin(mode);
  const start = scheduleStart(s);
  return start >= min ? s : shiftSchedule(s, min - start);
}

/** Shift so the start lands on a whole minute (datetime-local inputs have minute resolution). */
export function alignToMinute(s: Schedule): Schedule {
  const start = scheduleStart(s);
  const aligned = Math.ceil(start / 60) * 60;
  return aligned === start ? s : shiftSchedule(s, aligned - start);
}

export function validateSchedule(s: Schedule, nowSec: number, mode: Mode): ScheduleError[] {
  const errors: ScheduleError[] = [];
  const start = scheduleStart(s);
  if (!Number.isFinite(start) || start < nowSec + startMargin(mode)) {
    errors.push({
      field: 'start',
      message: 'Start must be at least 2 minutes (15 minutes for batches) from now — transactions take time to sign.',
    });
  }
  switch (s.shape) {
    case 'linear':
      if (!(s.startTs < s.endTs)) errors.push({ field: 'end', message: 'End must be strictly after start.' });
      if (s.cliffTs < s.startTs || s.cliffTs > s.endTs) {
        errors.push({ field: 'cliff', message: 'Cliff must be between start and end (inclusive).' });
      }
      if (s.unlockAtStartBps < 0 || s.unlockAtCliffBps < 0 || s.unlockAtStartBps + s.unlockAtCliffBps > BPS_DENOM) {
        errors.push({ field: 'unlocks', message: 'Unlocks (start + cliff) cannot exceed 100%.' });
      }
      break;
    case 'tranched': {
      if (s.tranches.length === 0) errors.push({ field: 'tranches', message: 'Add at least one tranche.' });
      if (s.tranches.length > MAX_TRANCHES) {
        errors.push({ field: 'tranches', message: `At most ${MAX_TRANCHES} tranches.` });
      }
      for (let i = 1; i < s.tranches.length; i++) {
        if (s.tranches[i].ts <= s.tranches[i - 1].ts) {
          errors.push({ field: 'tranches', message: 'Tranche times must be strictly increasing.' });
          break;
        }
      }
      if (s.tranches.some((t) => t.ts < s.startTs)) {
        errors.push({ field: 'tranches', message: 'Tranche times cannot be before start.' });
      }
      const sum = s.tranches.reduce((a, t) => a + t.bps, 0);
      if (s.tranches.length > 0 && (sum !== BPS_DENOM || s.tranches.some((t) => t.bps <= 0))) {
        errors.push({ field: 'tranches', message: 'Tranche percentages must add up to 100%.' });
      }
      break;
    }
    case 'recurring':
      if (!Number.isInteger(s.periodSecs) || s.periodSecs < MIN_PERIOD_SECS) {
        errors.push({ field: 'period', message: 'Period must be at least 1 minute.' });
      }
      if (!Number.isInteger(s.count) || s.count < 1 || s.count > MAX_RECURRING_COUNT) {
        errors.push({ field: 'count', message: `Count must be between 1 and ${MAX_RECURRING_COUNT}.` });
      }
      break;
  }
  return errors;
}

function bpsOf(total: bigint, bps: number): bigint {
  return (total * BigInt(bps)) / BigInt(BPS_DENOM);
}

/**
 * Build the contract `CreateSpec` for one recipient receiving `total` stroops.
 * Throws `RangeError` when any on-chain amount would be ≤ 0.
 */
export function buildSpec(s: Schedule, total: bigint): BuiltSpec {
  if (total <= 0n) throw new RangeError('Amount must be positive.');
  switch (s.shape) {
    case 'linear':
      return {
        deposited: total,
        adjustment: 0n,
        spec: {
          tag: 'Linear',
          values: [
            {
              start_ts: BigInt(s.startTs),
              cliff_ts: BigInt(s.cliffTs),
              end_ts: BigInt(s.endTs),
              deposited: total,
              unlock_at_start: bpsOf(total, s.unlockAtStartBps),
              unlock_at_cliff: bpsOf(total, s.unlockAtCliffBps),
            },
          ],
        },
      };
    case 'tranched': {
      if (s.tranches.length === 0) throw new RangeError('Add at least one tranche.');
      const amounts: bigint[] = [];
      let used = 0n;
      for (let i = 0; i < s.tranches.length; i++) {
        const last = i === s.tranches.length - 1;
        const amt = last ? total - used : bpsOf(total, s.tranches[i].bps);
        // Only check intermediate tranches in 2-tranche schedules; 3+ can absorb rounding
        if (!last && s.tranches.length === 2 && amt <= 0n) {
          throw new RangeError(`Amount too small for this schedule — ${s.tranches.length} tranches`);
        }
        if (last && amt <= 0n) {
          throw new RangeError(`Amount too small for this schedule — ${s.tranches.length} tranches`);
        }
        amounts.push(amt);
        used += amt;
      }
      return {
        deposited: total,
        adjustment: 0n,
        spec: {
          tag: 'Tranched',
          values: [{ tranches: s.tranches.map((t, i) => ({ amount: amounts[i], ts: BigInt(t.ts) })) }],
        },
      };
    }
    case 'recurring': {
      const count = BigInt(s.count);
      const per = total / count;
      if (per <= 0n) throw new RangeError(`Amount too small for this schedule — ${s.count} periods`);
      const deposited = per * count;
      return {
        deposited,
        adjustment: deposited - total,
        spec: {
          tag: 'Recurring',
          values: [
            {
              amount_per_period: per,
              period_secs: BigInt(s.periodSecs),
              count: s.count,
              first_ts: BigInt(s.firstTs),
            },
          ],
        },
      };
    }
  }
}
