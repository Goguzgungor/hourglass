'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { formatStroops, formatTimestamp } from '@/lib/format';

type Tranche = { amount: bigint; ts: number };

type Props = {
  model: 'Linear' | 'Tranched';
  start_ts: number;
  cliff_ts?: number;
  end_ts: number;
  deposited: bigint;
  unlock_at_start?: bigint;
  unlock_at_cliff?: bigint;
  tranches?: Tranche[];
  tokenSymbol?: string;
};

/* ------------------------------------------------------------------ *
 * Geometry / sizing                                                  *
 * ------------------------------------------------------------------ */

const VBW = 1000;
const VBH = 320;
const PAD_L = 56;
const PAD_R = 22;
const PAD_T = 28;
const PAD_B = 44;
const PLOT_W = VBW - PAD_L - PAD_R;
const PLOT_H = VBH - PAD_T - PAD_B;

/* ------------------------------------------------------------------ *
 * Curve construction                                                 *
 * ------------------------------------------------------------------ */

type Point = { ts: number; amt: bigint };

function buildLinearPoints(
  start_ts: number,
  cliff_ts: number | undefined,
  end_ts: number,
  deposited: bigint,
  unlock_at_start: bigint,
  unlock_at_cliff: bigint,
): Point[] {
  const pts: Point[] = [];
  pts.push({ ts: start_ts, amt: 0n });
  // Jump at start if there's an unlock-at-start.
  if (unlock_at_start > 0n) {
    pts.push({ ts: start_ts, amt: unlock_at_start });
  }
  const cliff = cliff_ts && cliff_ts > start_ts ? cliff_ts : start_ts;
  if (cliff > start_ts) {
    // Before cliff: amount stays at unlock_at_start.
    pts.push({ ts: cliff, amt: unlock_at_start });
    // At cliff: jump up by unlock_at_cliff.
    if (unlock_at_cliff > 0n) {
      pts.push({ ts: cliff, amt: unlock_at_start + unlock_at_cliff });
    }
  }
  // From cliff to end: linear up to deposited.
  pts.push({ ts: end_ts, amt: deposited });
  return pts;
}

function buildTranchedPoints(
  start_ts: number,
  tranches: Tranche[],
  end_ts: number,
): Point[] {
  const pts: Point[] = [];
  pts.push({ ts: start_ts, amt: 0n });
  let cum = 0n;
  for (const t of tranches) {
    // Horizontal to tranche ts.
    pts.push({ ts: t.ts, amt: cum });
    cum = cum + t.amount;
    // Vertical jump.
    pts.push({ ts: t.ts, amt: cum });
  }
  // Hold flat until end_ts.
  pts.push({ ts: end_ts, amt: cum });
  return pts;
}

/* ------------------------------------------------------------------ *
 * Scaling                                                            *
 * ------------------------------------------------------------------ */

function xFromTs(ts: number, start: number, end: number): number {
  if (end <= start) return PAD_L;
  return PAD_L + ((ts - start) / (end - start)) * PLOT_W;
}

function yFromAmt(amt: bigint, deposited: bigint): number {
  if (deposited <= 0n) return PAD_T + PLOT_H;
  const frac = Number((amt * 10000n) / deposited) / 10000;
  const clamped = Math.min(1, Math.max(0, frac));
  return PAD_T + PLOT_H - clamped * PLOT_H;
}

/* ------------------------------------------------------------------ *
 * Curve sampling for tooltip                                         *
 * ------------------------------------------------------------------ */

function interpolatePoints(
  pts: Point[],
  ts: number,
  start_ts: number,
  end_ts: number,
): bigint {
  if (ts <= start_ts) return pts[0]?.amt ?? 0n;
  if (ts >= end_ts) return pts[pts.length - 1]?.amt ?? 0n;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (ts >= a.ts && ts <= b.ts) {
      if (b.ts === a.ts) return b.amt;
      // Linear within segment.
      const frac = (ts - a.ts) / (b.ts - a.ts);
      const delta = b.amt - a.amt;
      // Need integer math; convert via Number then back to bigint.
      const interpolated = a.amt + (delta * BigInt(Math.round(frac * 10_000))) / 10_000n;
      return interpolated;
    }
  }
  return pts[pts.length - 1]?.amt ?? 0n;
}

/* ------------------------------------------------------------------ *
 * Component                                                          *
 * ------------------------------------------------------------------ */

export default function EmissionChart({
  model,
  start_ts,
  cliff_ts,
  end_ts,
  deposited,
  unlock_at_start = 0n,
  unlock_at_cliff = 0n,
  tranches = [],
  tokenSymbol = 'XLM',
}: Props) {
  const id = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);

  // Live "now".
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const handle = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      5000,
    );
    return () => clearInterval(handle);
  }, []);

  // Curve points in (ts, amt) space.
  const points = useMemo<Point[]>(() => {
    if (model === 'Linear') {
      return buildLinearPoints(
        start_ts,
        cliff_ts,
        end_ts,
        deposited,
        unlock_at_start,
        unlock_at_cliff,
      );
    }
    return buildTranchedPoints(start_ts, tranches, end_ts);
  }, [
    model,
    start_ts,
    cliff_ts,
    end_ts,
    deposited,
    unlock_at_start,
    unlock_at_cliff,
    tranches,
  ]);

  // Build the polyline (curve) and the area-under-curve path.
  const curveD = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => {
        const x = xFromTs(p.ts, start_ts, end_ts);
        const y = yFromAmt(p.amt, deposited);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points, start_ts, end_ts, deposited]);

  const areaD = useMemo(() => {
    if (points.length === 0) return '';
    const baselineY = PAD_T + PLOT_H;
    const first = points[0];
    const last = points[points.length - 1];
    const head = `M ${xFromTs(first.ts, start_ts, end_ts).toFixed(2)} ${baselineY}`;
    const seg = points
      .map((p) => {
        const x = xFromTs(p.ts, start_ts, end_ts);
        const y = yFromAmt(p.amt, deposited);
        return `L ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
    const tail = `L ${xFromTs(last.ts, start_ts, end_ts).toFixed(2)} ${baselineY} Z`;
    return `${head} ${seg} ${tail}`;
  }, [points, start_ts, end_ts, deposited]);

  // X ticks: 5 stops (0, .25, .5, .75, 1).
  const xTicks = useMemo(() => {
    const stops = [0, 0.25, 0.5, 0.75, 1];
    return stops.map((f) => ({
      x: PAD_L + f * PLOT_W,
      ts: start_ts + f * (end_ts - start_ts),
    }));
  }, [start_ts, end_ts]);

  // Y ticks: 0%, 25, 50, 75, 100%.
  const yTicks = useMemo(() => {
    const stops = [0, 0.25, 0.5, 0.75, 1];
    return stops.map((f) => {
      const amt = deposited > 0n ? (deposited * BigInt(Math.round(f * 10_000))) / 10_000n : 0n;
      return {
        y: PAD_T + PLOT_H - f * PLOT_H,
        amt,
        pct: f,
      };
    });
  }, [deposited]);

  /* ---------- Hover / tooltip ---------- */

  const [hover, setHover] = useState<null | {
    px: number; // pixel x in container coords
    py: number; // pixel y in container coords
    ts: number;
    amt: bigint;
    cx: number; // svg viewBox x
    cy: number; // svg viewBox y
  }>(null);

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      // Map clientX to viewBox x.
      const xFrac = (e.clientX - rect.left) / rect.width;
      const vbX = xFrac * VBW;
      if (vbX < PAD_L || vbX > VBW - PAD_R) {
        setHover(null);
        return;
      }
      const tsFrac = (vbX - PAD_L) / PLOT_W;
      const ts = start_ts + tsFrac * (end_ts - start_ts);
      const amt = interpolatePoints(points, ts, start_ts, end_ts);
      const vbY = yFromAmt(amt, deposited);
      // Translate viewBox coords back to container pixel coords.
      const px = rect.width * (vbX / VBW);
      const py = rect.height * (vbY / VBH);
      setHover({ px, py, ts, amt, cx: vbX, cy: vbY });
    },
    [points, start_ts, end_ts, deposited],
  );

  const onLeave = useCallback(() => setHover(null), []);

  // "Today" guide
  const todayX = useMemo(() => {
    if (nowSec <= start_ts) return PAD_L;
    if (nowSec >= end_ts) return PAD_L + PLOT_W;
    return xFromTs(nowSec, start_ts, end_ts);
  }, [nowSec, start_ts, end_ts]);

  const showToday = nowSec >= start_ts && nowSec <= end_ts;

  return (
    <div className="relative w-full overflow-hidden rounded-sm border border-stroke bg-gradient-to-br from-midnight to-night/80">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        width="100%"
        className="block"
        style={{ height: 240 }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <defs>
          <linearGradient
            id={`g-emission-fill-${id}`}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0" stopColor="var(--sand)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--sand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid lines (4 of them, skipping the axis baseline) */}
        {yTicks.map((t, i) => (
          <line
            key={`yg-${i}`}
            x1={PAD_L}
            x2={VBW - PAD_R}
            y1={t.y}
            y2={t.y}
            stroke="var(--cream-dim)"
            strokeOpacity={i === 0 ? '0.18' : '0.08'}
            strokeWidth="1"
            strokeDasharray={i === 0 ? '0' : '2 4'}
          />
        ))}

        {/* Y axis labels */}
        {yTicks.map((t, i) => (
          <text
            key={`yl-${i}`}
            x={PAD_L - 8}
            y={t.y + 3}
            textAnchor="end"
            fontFamily="var(--font-geist-mono)"
            fontSize="9"
            fill="var(--cream-dim)"
          >
            {Math.round(t.pct * 100)}%
          </text>
        ))}

        {/* X axis baseline (hairline) */}
        <line
          x1={PAD_L}
          x2={VBW - PAD_R}
          y1={PAD_T + PLOT_H}
          y2={PAD_T + PLOT_H}
          stroke="var(--stroke-2)"
          strokeWidth="1"
        />

        {/* Area fill */}
        <path d={areaD} fill={`url(#g-emission-fill-${id})`} />

        {/* Curve */}
        <path
          d={curveD}
          fill="none"
          stroke="var(--sand-bright)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* X axis labels */}
        {xTicks.map((t, i) => (
          <text
            key={`xl-${i}`}
            x={t.x}
            y={PAD_T + PLOT_H + 18}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontFamily="var(--font-geist-mono)"
            fontSize="9"
            fill="var(--cream-dim)"
          >
            {new Date(t.ts * 1000).toLocaleDateString(undefined, {
              month: 'short',
              day: '2-digit',
            })}
          </text>
        ))}

        {/* TODAY indicator */}
        {showToday && (
          <g>
            <line
              x1={todayX}
              x2={todayX}
              y1={PAD_T - 6}
              y2={PAD_T + PLOT_H + 2}
              stroke="var(--teal-bright)"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.8"
            />
            <text
              x={todayX}
              y={PAD_T - 10}
              textAnchor="middle"
              fontFamily="var(--font-geist-mono)"
              fontSize="9"
              letterSpacing="2"
              fill="var(--teal-bright)"
            >
              TODAY
            </text>
          </g>
        )}

        {/* Hover dot on curve */}
        {hover && (
          <g>
            <line
              x1={hover.cx}
              x2={hover.cx}
              y1={PAD_T}
              y2={PAD_T + PLOT_H}
              stroke="var(--cream)"
              strokeWidth="1"
              opacity="0.18"
            />
            <circle
              cx={hover.cx}
              cy={hover.cy}
              r="4"
              fill="var(--sand-bright)"
              stroke="var(--night)"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>

      {/* Tooltip — HTML overlay */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[110%] whitespace-nowrap bg-night/90 border border-stroke px-3 py-2 rounded-sm shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
          style={{
            left: hover.px,
            top: hover.py,
          }}
        >
          <p className="font-mono text-[10px] text-cream-dim uppercase tracking-[0.12em]">
            {formatTimestamp(Math.round(hover.ts))}
          </p>
          <p className="mt-1 font-mono text-sm text-sand-bright tabular">
            {formatStroops(hover.amt)}
            <span className="ml-1 text-[10px] text-cream-dim uppercase tracking-[0.16em]">
              {tokenSymbol}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
