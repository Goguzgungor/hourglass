'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Most-recent known withdrawable balance (in stroops). */
  currentValue: bigint;
  /** Upper bound; rendered value never exceeds this. */
  targetValue: bigint;
  /**
   * Per-second emission rate, in stroops/sec. Computed by the parent from the
   * stream params (`deposited / (end_ts - cliff_ts)`).
   */
  rate: bigint;
  /** When (in ms since epoch) `currentValue` was observed. */
  lastUpdateMs: number;
  /** Formatter for the displayed number (e.g. stroops → "1.2345678"). */
  format: (n: bigint) => string;
  /** Optional className override for the digits element. */
  className?: string;
};

/**
 * LiveCounter — a number that ticks up smoothly via requestAnimationFrame
 * interpolation. The parent polls the contract every few seconds; in between,
 * this component projects the value forward using the per-second rate.
 *
 * Capped at `targetValue` to avoid drifting past the actual balance.
 */
export default function LiveCounter({
  currentValue,
  targetValue,
  rate,
  lastUpdateMs,
  format,
  className,
}: Props) {
  const [display, setDisplay] = useState<bigint>(currentValue);
  const rafRef = useRef<number | null>(null);

  // Always restart the rAF loop when the upstream sample changes so we
  // continue interpolating from the freshest known point.
  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const deltaMs = Math.max(0, Date.now() - lastUpdateMs);
      const accruedMicro = (rate * BigInt(Math.floor(deltaMs))) / 1000n;
      let projected = currentValue + accruedMicro;
      if (projected > targetValue) projected = targetValue;
      setDisplay(projected);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [currentValue, targetValue, rate, lastUpdateMs]);

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
