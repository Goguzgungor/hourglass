'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import LiveCounter from './LiveCounter';
import StatusPill, { type StreamStatusTag } from './StatusPill';
import { formatStroops } from '@/lib/format';

type Props = {
  deposited: bigint;
  withdrawn: bigint;
  withdrawable: bigint;
  refunded: bigint;
  start_ts: number;
  cliff_ts: number;
  end_ts: number;
  status: StreamStatusTag;
  /** stroops per second for LiveCounter interpolation */
  rate: bigint;
  lastUpdateMs: number;
  tokenSymbol?: string;
};

/* ----------------------------------------------------------------- *
 * Geometry helpers                                                  *
 * ----------------------------------------------------------------- */

const VB = 440; // viewBox size
const CX = VB / 2;
const CY = VB / 2;

/** Convert a 0..1 progress (12 o'clock origin, clockwise) to (x,y) on a circle. */
function polar(radius: number, fraction: number): { x: number; y: number } {
  // SVG: 0 deg is at 3 o'clock and goes clockwise; we want 12 o'clock origin.
  const angle = (fraction * 360 - 90) * (Math.PI / 180);
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  };
}

/** SVG arc path for a fraction (0..1) of a full circle, starting at 12. */
function arcPath(radius: number, fraction: number): string {
  if (fraction <= 0) return '';
  const clamped = Math.min(0.99999, Math.max(0, fraction));
  const start = polar(radius, 0);
  const end = polar(radius, clamped);
  const largeArc = clamped > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** Deterministic pseudo-random in [0,1] from an integer seed. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/* ----------------------------------------------------------------- *
 * Component                                                         *
 * ----------------------------------------------------------------- */

export default function CelestialDial({
  deposited,
  withdrawn,
  withdrawable,
  refunded,
  start_ts,
  cliff_ts,
  end_ts,
  status,
  rate,
  lastUpdateMs,
  tokenSymbol = 'XLM',
}: Props) {
  const id = useId().replace(/:/g, '');

  // Live clock for the "now" pointer; reads at 1s cadence.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const handle = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(handle);
  }, []);

  const dep = deposited > 0n ? deposited : 1n;
  const streamed = withdrawn + withdrawable;
  const streamedFraction = Number((streamed * 100000n) / dep) / 100000;
  const withdrawableFraction = Number((withdrawable * 100000n) / dep) / 100000;

  const duration = Math.max(1, end_ts - start_ts);
  const nowFraction = Math.min(1, Math.max(0, (nowSec - start_ts) / duration));
  const cliffFraction =
    cliff_ts > start_ts && cliff_ts <= end_ts
      ? (cliff_ts - start_ts) / duration
      : 0;

  // Geometry
  const outerR = 184; // outer (STREAMED) arc radius
  const innerR = 160; // inner (WITHDRAWABLE) arc radius

  const isCanceled = status === 'CANCELED';
  const innerColor = isCanceled ? 'var(--rose)' : 'var(--teal-bright)';

  // Per-stream constellation accent: 6 dots scattered outside outer arc.
  const constellationDots = useMemo(() => {
    const seed = Number((BigInt(start_ts) ^ BigInt(end_ts)) & 0xffffn) || 1;
    return Array.from({ length: 6 }, (_, i) => {
      // Polar position outside the outer arc, but staying inside the viewBox.
      const ringR = outerR + 12 + rnd(seed + i * 7) * 16;
      const ang = rnd(seed + i * 13) * Math.PI * 2;
      return {
        x: CX + ringR * Math.cos(ang),
        y: CY + ringR * Math.sin(ang),
        r: 0.8 + rnd(seed + i * 31) * 1.2,
        delay: rnd(seed + i * 41) * 4,
      };
    });
  }, [start_ts, end_ts]);

  // Always-on caption beneath the dial
  const captionFormatted = formatStroops(deposited);

  // Now pointer position — inside the outer arc, on the elapsed line.
  const nowAt = polar(outerR - 8, nowFraction);

  // Counter target: never project beyond what's still owed.
  const counterTarget = deposited - withdrawn;

  // Empty inner (no withdrawable) — render as hairline outline.
  const innerEmpty = withdrawable === 0n;

  return (
    <div className="relative w-full max-w-[440px] mx-auto">
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        width="100%"
        height="100%"
        className="block"
        aria-hidden
      >
        <defs>
          {/* OUTER (STREAMED) gradient — sand-deep → sand-bright */}
          <linearGradient
            id={`g-outer-${id}`}
            x1="0"
            x2="1"
            y1="0"
            y2="1"
            gradientUnits="objectBoundingBox"
          >
            <stop offset="0" stopColor="var(--sand-deep)" />
            <stop offset="1" stopColor="var(--sand-bright)" />
          </linearGradient>

          {/* INNER (WITHDRAWABLE) gradient — teal-deep → teal-bright */}
          <linearGradient
            id={`g-inner-${id}`}
            x1="0"
            x2="1"
            y1="0"
            y2="1"
            gradientUnits="objectBoundingBox"
          >
            <stop offset="0" stopColor="var(--teal-deep)" />
            <stop offset="1" stopColor="var(--teal-bright)" />
          </linearGradient>

          {/* CANCELED rose gradient */}
          <linearGradient
            id={`g-inner-rose-${id}`}
            x1="0"
            x2="1"
            y1="0"
            y2="1"
            gradientUnits="objectBoundingBox"
          >
            <stop offset="0" stopColor="var(--rose-deep)" />
            <stop offset="1" stopColor="var(--rose)" />
          </linearGradient>

          {/* Inset glow for the dial's center vignette. */}
          <radialGradient id={`g-vignette-${id}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.0" stopColor="var(--midnight-2)" stopOpacity="0.0" />
            <stop offset="0.85" stopColor="var(--midnight)" stopOpacity="0.0" />
            <stop offset="1.0" stopColor="var(--night)" stopOpacity="0.4" />
          </radialGradient>
        </defs>

        {/* Center vignette wash (gives the dial slight depth). */}
        <circle
          cx={CX}
          cy={CY}
          r={outerR - 7}
          fill={`url(#g-vignette-${id})`}
        />

        {/* OUTER hairline track (full circle) */}
        <circle
          cx={CX}
          cy={CY}
          r={outerR}
          fill="none"
          stroke="var(--stroke)"
          strokeWidth="1"
          opacity="0.8"
        />

        {/* OUTER filled arc — STREAMED fraction */}
        {streamedFraction > 0 && (
          <path
            d={arcPath(outerR, streamedFraction)}
            fill="none"
            stroke={`url(#g-outer-${id})`}
            strokeWidth="14"
            strokeLinecap="butt"
          />
        )}

        {/* INNER hairline track */}
        <circle
          cx={CX}
          cy={CY}
          r={innerR}
          fill="none"
          stroke="var(--stroke)"
          strokeWidth="1"
          opacity="0.5"
        />

        {/* INNER arc — WITHDRAWABLE fraction (or hairline if 0). */}
        {innerEmpty ? (
          <circle
            cx={CX}
            cy={CY}
            r={innerR}
            fill="none"
            stroke={innerColor}
            strokeWidth="1"
            strokeDasharray="2 6"
            opacity="0.35"
          />
        ) : (
          withdrawableFraction > 0 && (
            <path
              d={arcPath(innerR, withdrawableFraction)}
              fill="none"
              stroke={
                isCanceled
                  ? `url(#g-inner-rose-${id})`
                  : `url(#g-inner-${id})`
              }
              strokeWidth="10"
              strokeLinecap="round"
              style={{
                animation: 'pulse-glow 2.4s ease-in-out infinite',
              }}
            />
          )
        )}

        {/* CLIFF marker — small violet notch on the OUTER arc. */}
        {cliffFraction > 0.01 && cliffFraction < 0.99 && (() => {
          const onOuter = polar(outerR, cliffFraction);
          const outNotch = polar(outerR + 12, cliffFraction);
          const labelP = polar(outerR + 22, cliffFraction);
          // Tangent direction for triangle base.
          const ang = cliffFraction * 360 - 90;
          const rad = ang * (Math.PI / 180);
          const tx = -Math.sin(rad);
          const ty = Math.cos(rad);
          const baseHalf = 4.5;
          const p1 = {
            x: onOuter.x + tx * baseHalf,
            y: onOuter.y + ty * baseHalf,
          };
          const p2 = {
            x: onOuter.x - tx * baseHalf,
            y: onOuter.y - ty * baseHalf,
          };
          return (
            <g>
              <polygon
                points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${outNotch.x},${outNotch.y}`}
                fill="var(--violet)"
              />
              <text
                x={labelP.x}
                y={labelP.y}
                fontFamily="var(--font-geist-mono)"
                fontSize="9"
                letterSpacing="1.4"
                fill="var(--cream-dim)"
                textAnchor={labelP.x > CX ? 'start' : 'end'}
                alignmentBaseline="middle"
              >
                CLIFF
              </text>
            </g>
          );
        })()}

        {/* NOW pointer — filled triangle, pointing inward, with bob animation. */}
        {nowFraction > 0 && nowFraction < 1 && (() => {
          const ang = nowFraction * 360 - 90;
          const rad = ang * (Math.PI / 180);
          const tx = -Math.sin(rad);
          const ty = Math.cos(rad);
          // Triangle base sits at outerR - 14, tip points inward to outerR - 24.
          const baseCenter = polar(outerR - 14, nowFraction);
          const tip = polar(outerR - 26, nowFraction);
          const baseHalf = 4.5;
          const b1 = {
            x: baseCenter.x + tx * baseHalf,
            y: baseCenter.y + ty * baseHalf,
          };
          const b2 = {
            x: baseCenter.x - tx * baseHalf,
            y: baseCenter.y - ty * baseHalf,
          };
          return (
            <g
              style={{
                animation: 'bob 2.4s ease-in-out infinite',
                transformBox: 'fill-box',
                transformOrigin: 'center',
              }}
            >
              <polygon
                points={`${b1.x},${b1.y} ${b2.x},${b2.y} ${tip.x},${tip.y}`}
                fill={isCanceled ? 'var(--rose)' : 'var(--teal-bright)'}
              />
              {/* Tiny halo behind */}
              <circle
                cx={nowAt.x}
                cy={nowAt.y}
                r="2"
                fill="var(--teal-bright)"
                opacity="0.5"
              />
            </g>
          );
        })()}

        {/* Constellation accent — dots scattered outside the outer arc. */}
        <g>
          {/* Hairline connecting first two dots, low opacity. */}
          {constellationDots.length >= 2 && (
            <line
              x1={constellationDots[0].x}
              y1={constellationDots[0].y}
              x2={constellationDots[1].x}
              y2={constellationDots[1].y}
              stroke="var(--cream)"
              strokeWidth="0.3"
              opacity="0.15"
            />
          )}
          {constellationDots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill="var(--cream)"
              opacity="0.3"
              style={{
                animation: `twinkle ${3 + (i % 3)}s ease-in-out infinite`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </g>

        {/* 12-o'clock tick — anchor for the eye. */}
        <line
          x1={CX}
          y1={CY - outerR - 8}
          x2={CX}
          y2={CY - outerR - 14}
          stroke="var(--cream-dim)"
          strokeWidth="1"
          opacity="0.5"
        />
      </svg>

      {/* HTML center stack — absolute over the SVG center. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6"
        style={{ paddingBottom: 0 }}
      >
        <p className="eyebrow text-cream-dim mb-3">Available to claim</p>
        <LiveCounter
          currentValue={withdrawable}
          targetValue={counterTarget > 0n ? counterTarget : withdrawable}
          rate={status === 'STREAMING' ? rate : 0n}
          lastUpdateMs={lastUpdateMs}
          format={(n) => formatStroops(n)}
          className={
            'block font-display italic tabular leading-none text-5xl ' +
            (isCanceled
              ? 'text-rose [text-shadow:0_0_28px_rgba(255,122,143,0.45)]'
              : 'text-teal-bright [text-shadow:0_0_28px_rgba(132,227,229,0.5)]')
          }
        />
        <p className="mt-3 font-mono text-[10px] text-cream-dim">
          of {captionFormatted}{' '}
          <span className="uppercase tracking-[0.18em]">
            {tokenSymbol} streaming
          </span>
        </p>
        <div className="mt-4 pointer-events-auto">
          <StatusPill status={status} size="sm" />
        </div>
        {isCanceled && (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-rose">
            — canceled —
          </p>
        )}
        {refunded > 0n && !isCanceled && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-cream-dim">
            refunded · {formatStroops(refunded)} {tokenSymbol}
          </p>
        )}
      </div>
    </div>
  );
}
