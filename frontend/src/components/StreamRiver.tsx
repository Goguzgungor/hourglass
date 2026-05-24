'use client';

import { useEffect, useId, useMemo, useState } from 'react';

type Props = {
  start_ts: number;
  cliff_ts: number;
  end_ts: number;
  deposited: bigint;
  withdrawn: bigint;
  withdrawable: bigint;
  refunded?: bigint;
  is_canceled?: boolean;
  is_depleted?: boolean;
  /** Total chrome height in CSS px. */
  height?: number;
  /** Reduces particle count + animation when set (e.g. for the /create preview). */
  compact?: boolean;
};

/**
 * StreamRiver — the headline banner on /stream/[id].
 *
 * Three stacked horizontal bands visualise the lifecycle of a stream:
 *   1. STREAMED — sand-amber, particles drifting left → right.
 *   2. WITHDRAWABLE — luminous teal, pulses softly.
 *   3. WITHDRAWN — muted cream, dormant.
 *
 * The right-hand portion (after the "NOW" line) is the REMAINING balance,
 * outlined only. A vertical teal line marks "now" and a small triangular
 * indicator bobs on top. Cliffs and cancelations surface in-band.
 */
export default function StreamRiver({
  start_ts,
  cliff_ts,
  end_ts,
  deposited,
  withdrawn,
  withdrawable,
  refunded = 0n,
  is_canceled = false,
  is_depleted = false,
  height = 280,
  compact = false,
}: Props) {
  const id = useId().replace(/:/g, '');
  const [nowSec, setNowSec] = useState(() =>
    Math.floor(Date.now() / 1000),
  );

  useEffect(() => {
    const handle = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(handle);
  }, []);

  const W = 1000;
  const H = 280;

  const duration = Math.max(1, end_ts - start_ts);
  const elapsed = Math.min(duration, Math.max(0, nowSec - start_ts));
  const nowPct = elapsed / duration;

  const cliffPct =
    cliff_ts > start_ts && cliff_ts <= end_ts
      ? (cliff_ts - start_ts) / duration
      : 0;

  // Slice widths in viewbox space.
  const streamedX = 0;
  const streamedW = W * nowPct;

  // The WITHDRAWN slice always starts at the left edge and grows with
  // `withdrawn / deposited`.
  const dep = deposited > 0n ? deposited : 1n;
  const withdrawnPct = Number((withdrawn * 10_000n) / dep) / 10_000;
  const withdrawablePct = Number((withdrawable * 10_000n) / dep) / 10_000;

  // The WITHDRAWABLE band is the slice from (withdrawn) to (withdrawn + withdrawable).
  const withdrawableLeft = W * withdrawnPct;
  const withdrawableWidth = W * withdrawablePct;

  const bandHeight = 70;
  const bandGap = 14;
  const bandsTop = 36;
  const bandStreamedY = bandsTop;
  const bandWithdrawableY = bandsTop + bandHeight + bandGap;
  const bandWithdrawnY = bandsTop + (bandHeight + bandGap) * 2;

  // Particle positions seeded for a natural-looking spread, recomputed only on
  // mount + compact toggle so animations don't restart every render.
  const particles = useMemo(() => {
    const count = compact ? 6 : 14;
    return Array.from({ length: count }, (_, i) => ({
      // y offset inside the band (0..1)
      yOff: ((i * 91) % 100) / 100,
      // radius
      r: 0.9 + ((i * 37) % 100) / 100 * 1.4,
      // duration in seconds
      dur: 4.5 + ((i * 53) % 100) / 100 * 4,
      // delay in seconds
      delay: -((i * 11) % 100) / 100 * 6,
    }));
  }, [compact]);

  const showCliff = cliffPct > 0.005 && cliffPct < 0.995;
  const withdrawableColor = is_canceled ? 'var(--rose)' : 'var(--teal-bright)';

  // The "NOW" marker x position — clamp into [4, W-4] for legibility.
  const nowX = Math.min(W - 4, Math.max(4, W * nowPct));

  // Right (remaining) hairline outline geometry.
  const remainingX = streamedW;
  const remainingW = Math.max(0, W - streamedW);

  return (
    <div
      className="relative w-full overflow-hidden rounded-sm border border-stroke bg-gradient-to-br from-midnight to-night/80"
      style={{ height }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden
      >
        <defs>
          {/* Streamed: sand-deep → sand-bright */}
          <linearGradient id={`g-streamed-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--sand-deep)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--sand-bright)" stopOpacity="0.95" />
          </linearGradient>
          {/* Withdrawable: teal-deep → teal-bright */}
          <linearGradient
            id={`g-withdrawable-${id}`}
            x1="0"
            x2="1"
            y1="0"
            y2="0"
          >
            <stop offset="0" stopColor="var(--teal-deep)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--teal-bright)" stopOpacity="0.95" />
          </linearGradient>
          {/* Withdrawn: cream-dim plain */}
          <linearGradient id={`g-withdrawn-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--cream-dim)" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--cream-muted)" stopOpacity="0.45" />
          </linearGradient>
          {/* Rose fallback when canceled */}
          <linearGradient id={`g-rose-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--rose-deep)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--rose)" stopOpacity="0.95" />
          </linearGradient>

          {/* Clip the STREAMED band to the elapsed portion. */}
          <clipPath id={`clip-streamed-${id}`}>
            <rect
              x={streamedX}
              y={bandStreamedY}
              width={Math.max(0, streamedW)}
              height={bandHeight}
            />
          </clipPath>
          {/* Clip the WITHDRAWABLE band to the withdrawable slice. */}
          <clipPath id={`clip-withdrawable-${id}`}>
            <rect
              x={withdrawableLeft}
              y={bandWithdrawableY}
              width={Math.max(0, withdrawableWidth)}
              height={bandHeight}
            />
          </clipPath>
          {/* Clip the WITHDRAWN band to the withdrawn portion. */}
          <clipPath id={`clip-withdrawn-${id}`}>
            <rect
              x={0}
              y={bandWithdrawnY}
              width={Math.max(0, W * withdrawnPct)}
              height={bandHeight}
            />
          </clipPath>
        </defs>

        {/* Hairline frame for each empty band (so users see the "track"). */}
        {[bandStreamedY, bandWithdrawableY, bandWithdrawnY].map((y, i) => (
          <rect
            key={i}
            x={0.5}
            y={y + 0.5}
            width={W - 1}
            height={bandHeight - 1}
            fill="transparent"
            stroke="var(--stroke)"
            strokeWidth="1"
          />
        ))}

        {/* STREAMED band fill */}
        <rect
          x={streamedX}
          y={bandStreamedY}
          width={Math.max(0, streamedW)}
          height={bandHeight}
          fill={`url(#g-streamed-${id})`}
        />

        {/* Particles drifting through the STREAMED band — purely decorative. */}
        <g clipPath={`url(#clip-streamed-${id})`}>
          {particles.map((p, i) => (
            <circle
              key={`p1-${i}`}
              cx={0}
              cy={bandStreamedY + 12 + p.yOff * (bandHeight - 24)}
              r={p.r}
              fill="var(--sand-bright)"
              style={{
                animation: `drift ${p.dur}s linear infinite`,
                animationDelay: `${p.delay}s`,
                transformBox: 'view-box',
                transformOrigin: '0 0',
              }}
            />
          ))}
        </g>

        {/* WITHDRAWABLE band */}
        <rect
          x={withdrawableLeft}
          y={bandWithdrawableY}
          width={Math.max(0, withdrawableWidth)}
          height={bandHeight}
          fill={
            is_canceled
              ? `url(#g-rose-${id})`
              : `url(#g-withdrawable-${id})`
          }
          style={{
            animation: compact
              ? undefined
              : 'pulse-glow 2.4s ease-in-out infinite',
          }}
        />

        {/* WITHDRAWN band fill (no animation, muted) */}
        <rect
          x={0}
          y={bandWithdrawnY}
          width={Math.max(0, W * withdrawnPct)}
          height={bandHeight}
          fill={`url(#g-withdrawn-${id})`}
        />

        {/* Remaining (right of NOW) — hairline outline only */}
        {remainingW > 2 && (
          <rect
            x={remainingX}
            y={bandStreamedY}
            width={remainingW}
            height={bandHeight + bandGap + bandHeight + bandGap + bandHeight}
            fill="transparent"
            stroke="var(--stroke-2)"
            strokeDasharray="2 4"
            strokeWidth="1"
            opacity="0.6"
          />
        )}

        {/* Cliff marker */}
        {showCliff && (
          <g>
            <line
              x1={W * cliffPct}
              x2={W * cliffPct}
              y1={bandStreamedY - 10}
              y2={bandWithdrawnY + bandHeight + 4}
              stroke="var(--violet)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.85"
            />
            <text
              x={W * cliffPct + 6}
              y={bandStreamedY - 14}
              fill="var(--violet)"
              fontSize="9"
              fontFamily="var(--font-geist-mono)"
              letterSpacing="2"
            >
              CLIFF
            </text>
          </g>
        )}

        {/* NOW marker — vertical luminous line */}
        <g>
          <line
            x1={nowX}
            x2={nowX}
            y1={bandStreamedY - 18}
            y2={bandWithdrawnY + bandHeight + 8}
            stroke="var(--teal-bright)"
            strokeWidth="1.5"
            opacity="0.9"
          />
          <line
            x1={nowX}
            x2={nowX}
            y1={bandStreamedY - 18}
            y2={bandWithdrawnY + bandHeight + 8}
            stroke="var(--teal-bright)"
            strokeWidth="6"
            opacity="0.18"
          />
          {/* Bobbing triangle */}
          <g
            style={{
              animation: compact ? undefined : 'bob 2.2s ease-in-out infinite',
              transformOrigin: `${nowX}px ${bandStreamedY - 24}px`,
              transformBox: 'fill-box',
            }}
          >
            <polygon
              points={`${nowX - 5},${bandStreamedY - 30} ${nowX + 5},${bandStreamedY - 30} ${nowX},${bandStreamedY - 22}`}
              fill="var(--teal-bright)"
            />
          </g>
          <text
            x={nowX + 8}
            y={bandWithdrawnY + bandHeight + 20}
            fill="var(--teal-bright)"
            fontSize="10"
            fontFamily="var(--font-geist-mono)"
            letterSpacing="2.4"
          >
            NOW
          </text>
        </g>

        {/* Band labels — left edge */}
        <g
          fontSize="9"
          fontFamily="var(--font-geist-mono)"
          letterSpacing="2.4"
          fill="var(--cream-dim)"
        >
          <text x="12" y={bandStreamedY - 6}>
            STREAMED
          </text>
          <text x="12" y={bandWithdrawableY - 6}>
            WITHDRAWABLE
          </text>
          <text x="12" y={bandWithdrawnY - 6}>
            WITHDRAWN
          </text>
        </g>

        {/* Refunded indicator (overlay on the right of the bands) when canceled */}
        {(is_canceled || (refunded > 0n)) && (
          <g>
            <text
              x={W - 12}
              y={bandStreamedY - 6}
              textAnchor="end"
              fontSize="10"
              fontFamily="var(--font-geist-mono)"
              letterSpacing="3"
              fill="var(--rose)"
            >
              {is_canceled ? '— CANCELED —' : '— REFUNDED —'}
            </text>
          </g>
        )}

        {/* Depleted ribbon */}
        {is_depleted && !is_canceled && (
          <text
            x={W - 12}
            y={bandStreamedY - 6}
            textAnchor="end"
            fontSize="10"
            fontFamily="var(--font-geist-mono)"
            letterSpacing="3"
            fill="var(--cream-dim)"
          >
            — DEPLETED —
          </text>
        )}
      </svg>
    </div>
  );
}
