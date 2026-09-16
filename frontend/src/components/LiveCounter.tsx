'use client';

import { useEffect, useRef, useState } from 'react';

/* ---------------- Schedule shape ---------------- */

export type StreamShape =
  | {
      tag: 'Linear';
      cliff_ts: number;
      unlock_at_start: bigint;
      unlock_at_cliff: bigint;
    }
  | {
      tag: 'Tranched';
      tranches: Array<{ amount: bigint; ts: number }>;
    }
  | {
      tag: 'Recurring';
      first_ts: number;
      period_secs: number;
      count: number;
      amount_per_period: bigint;
    };

type Props = {
  /** Full vesting shape (Linear with optional cliff + unlocks, Tranched, or Recurring). */
  shape: StreamShape;
  startTs: number;
  endTs: number;
  /** Total deposit in stroops. */
  deposited: bigint;
  /** Amount the recipient has already pulled. */
  withdrawn: bigint;
  /** Derived status. Frozen statuses (PENDING / SETTLED / CANCELED / DEPLETED)
   *  pin the display to `fallbackValue`; STREAMING projects from the schedule. */
  status: 'PENDING' | 'STREAMING' | 'SETTLED' | 'CANCELED' | 'DEPLETED';
  /** Most-recent on-chain withdrawable from the poll loop — used as the
   *  frozen value in non-STREAMING phases. */
  fallbackValue: bigint;
  /** Formatter for the displayed number (stroops → readable). */
  format: (n: bigint) => string;
  /** Optional className override for the digits element. */
  className?: string;
};

/* ---------------- Pure schedule math (mirror of contract `streamed_amount`) ---------------- */

/**
 * Cumulative streamed amount at `nowMs` (millisecond precision).
 *
 * Semantics match `contracts/shared/src/math.rs`:
 *   - before start:           0
 *   - in [start, cliff):      unlock_at_start (frozen — NO linear ramp here)
 *   - at cliff:               unlock_at_start + unlock_at_cliff
 *   - in (cliff, end):        + (deposited - unlocks) * (now - cliff) / (end - cliff)
 *   - at or after end:        deposited
 *
 * For Tranched: sum of tranches whose ts <= now.
 * For Recurring: O(1) — `amount_per_period * min(count, floor((now - first) / period) + 1)`.
 */
export function streamedAtMs(
  shape: StreamShape,
  startTs: number,
  endTs: number,
  deposited: bigint,
  nowMs: number,
): bigint {
  const startMs = startTs * 1000;
  const endMs = endTs * 1000;
  if (nowMs < startMs) return 0n;
  if (nowMs >= endMs) return deposited;

  if (shape.tag === 'Linear') {
    const cliffMs = shape.cliff_ts * 1000;
    if (nowMs < cliffMs) return shape.unlock_at_start;
    const base = deposited - shape.unlock_at_start - shape.unlock_at_cliff;
    if (base <= 0n) {
      return shape.unlock_at_start + shape.unlock_at_cliff;
    }
    const elapsedMs = BigInt(nowMs - cliffMs);
    const spanMs = BigInt(endMs - cliffMs);
    if (spanMs <= 0n) return deposited;
    const portion = (base * elapsedMs) / spanMs;
    return shape.unlock_at_start + shape.unlock_at_cliff + portion;
  }

  if (shape.tag === 'Recurring') {
    const firstMs = shape.first_ts * 1000;
    if (nowMs < firstMs) return 0n;
    const periodMs = Math.max(1, shape.period_secs) * 1000;
    const elapsedPeriods = Math.floor((nowMs - firstMs) / periodMs) + 1;
    const unlocked = Math.min(shape.count, elapsedPeriods);
    return shape.amount_per_period * BigInt(unlocked);
  }

  // Tranched
  let acc = 0n;
  for (const t of shape.tranches) {
    if (t.ts * 1000 > nowMs) break;
    acc += t.amount;
  }
  return acc;
}

/* ---------------- Component ---------------- */

/**
 * LiveCounter — renders the recipient's current claimable balance, smoothly
 * ticking forward via requestAnimationFrame.
 *
 * Self-contained: takes the full schedule and recomputes the value from
 * first principles each frame. No "rate" prop needed; cliff/end transitions
 * are handled correctly without parent intervention. In frozen phases
 * (PENDING / SETTLED / CANCELED / DEPLETED) it pins to `fallbackValue` from
 * the last poll.
 */
export default function LiveCounter({
  shape,
  startTs,
  endTs,
  deposited,
  withdrawn,
  status,
  fallbackValue,
  format,
  className,
}: Props) {
  const [display, setDisplay] = useState<bigint>(fallbackValue);
  const rafRef = useRef<number | null>(null);

  // Stash the latest props in a ref so the rAF loop reads fresh values
  // without restarting whenever any prop changes (which would visibly stutter).
  const latestRef = useRef({
    shape,
    startTs,
    endTs,
    deposited,
    withdrawn,
    fallbackValue,
    status,
  });
  latestRef.current = {
    shape,
    startTs,
    endTs,
    deposited,
    withdrawn,
    fallbackValue,
    status,
  };

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const s = latestRef.current;

      if (
        s.status === 'CANCELED' ||
        s.status === 'DEPLETED' ||
        s.status === 'PENDING' ||
        s.status === 'SETTLED'
      ) {
        // Frozen phases: trust the on-chain value (no projection).
        setDisplay(s.fallbackValue);
      } else {
        // STREAMING: project from the schedule directly.
        const streamed = streamedAtMs(
          s.shape,
          s.startTs,
          s.endTs,
          s.deposited,
          Date.now(),
        );
        let next = streamed - s.withdrawn;
        if (next < 0n) next = 0n;
        setDisplay(next);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // Run the loop once per mount. The ref handles fresh props each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span
      className={
        className ??
        'block font-mono tabular text-5xl sm:text-6xl text-teal-bright leading-none [text-shadow:0_0_28px_rgba(132,227,229,0.55)]'
      }
    >
      {format(display)}
    </span>
  );
}
