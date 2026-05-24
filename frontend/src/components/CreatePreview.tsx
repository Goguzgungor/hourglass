'use client';

/**
 * /create preview pane — a clean, diagrammatic sketch of the vesting curve
 * + a tight spec sheet beside it. Replaces the previous live-streaming
 * StreamRiver mockup, which was confusing for a pre-submission preview.
 */

import { useEffect, useState } from 'react';
import {
  formatDuration,
  formatStroops,
  truncAddress,
} from '@/lib/format';

type Parsed = {
  depositStroops: bigint;
  unlockStartStroops: bigint;
  unlockCliffStroops: bigint;
  startTs: number;
  cliffTs: number;
  endTs: number;
  duration: number;
  hasCliff: boolean;
};

type Props = {
  parsed: Parsed | null;
  recipient: string;
  symbol: string;
  glyphColor?: string;
  cancelable: boolean;
  transferable: boolean;
};

export default function CreatePreview({
  parsed,
  recipient,
  symbol,
  glyphColor = 'bg-sand',
  cancelable,
  transferable,
}: Props) {
  return (
    <div className="space-y-6">
      <EmissionSketch parsed={parsed} symbol={symbol} />
      <SpecSheet
        parsed={parsed}
        recipient={recipient}
        symbol={symbol}
        glyphColor={glyphColor}
        cancelable={cancelable}
        transferable={transferable}
      />
    </div>
  );
}

/* ---------------- Emission sketch ---------------- */

function EmissionSketch({
  parsed,
  symbol,
}: {
  parsed: Parsed | null;
  symbol: string;
}) {
  // Fallback values keep the sketch shaped even before the user fills the form.
  const start = parsed?.startTs ?? Math.floor(Date.now() / 1000);
  const end =
    parsed && parsed.endTs > start ? parsed.endTs : start + 3600; // 1h default
  const cliff =
    parsed && parsed.cliffTs > start && parsed.cliffTs <= end
      ? parsed.cliffTs
      : start;
  const deposit = parsed?.depositStroops ?? 10_000_000_0n; // 10 XLM display
  const unlockStart = parsed?.unlockStartStroops ?? 0n;
  const unlockCliff = parsed?.unlockCliffStroops ?? 0n;

  // Convert to floats for SVG plotting only — won't be used for any
  // financial math, just visual proportions.
  const D = Number(deposit);
  const US = Number(unlockStart);
  const UC = Number(unlockCliff);
  const range = end - start || 1;

  // Map x in [start..end] → [0..100]
  const x = (t: number) => Math.max(0, Math.min(100, ((t - start) / range) * 100));
  // Map y in [0..D] → [100..0] (flip for SVG)
  const y = (v: number) => 100 - Math.max(0, Math.min(100, (v / Math.max(D, 1)) * 100));

  // Build the polyline points: (start, 0) -> jump to unlockStart -> hold to cliff -> jump by unlockCliff -> linear to deposit at end.
  const pts: [number, number][] = [];
  pts.push([x(start), y(0)]);
  if (US > 0) pts.push([x(start), y(US)]);
  if (cliff > start) {
    pts.push([x(cliff), y(US)]);
    if (UC > 0) pts.push([x(cliff), y(US + UC)]);
  }
  pts.push([x(end), y(D)]);

  const linePath = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  // Area: same path + close down to baseline
  const areaPath = `${linePath} L ${x(end)} 100 L ${x(start)} 100 Z`;

  // Live "now" position
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const nowInWindow = nowSec >= start && nowSec <= end;

  return (
    <div className="border border-stroke bg-night/40">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block w-full h-[160px]">
        <defs>
          <linearGradient id="emissionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sand)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--sand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines at 25/50/75 */}
        {[25, 50, 75].map((v) => (
          <line
            key={v}
            x1="0"
            x2="100"
            y1={v}
            y2={v}
            stroke="var(--stroke)"
            strokeOpacity="0.4"
            strokeWidth="0.3"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Cliff guideline */}
        {cliff > start && (
          <line
            x1={x(cliff)}
            x2={x(cliff)}
            y1="0"
            y2="100"
            stroke="var(--violet)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
            opacity="0.6"
          />
        )}

        {/* Area fill */}
        <path d={areaPath} fill="url(#emissionFill)" />
        {/* Curve */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--sand-bright)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="miter"
          strokeLinecap="square"
        />

        {/* Now guideline (only when we're inside the window) */}
        {nowInWindow && (
          <line
            x1={x(nowSec)}
            x2={x(nowSec)}
            y1="0"
            y2="100"
            stroke="var(--teal-bright)"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
            opacity="0.8"
          />
        )}
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cream-dim border-t border-stroke/60">
        <span>
          <span className="text-sand">Start</span>{' '}
          <span className="text-cream-dim/60">{relativeFromNow(start)}</span>
        </span>
        {cliff > start && (
          <span>
            <span className="text-violet">Cliff</span>{' '}
            <span className="text-cream-dim/60">{relativeFromNow(cliff)}</span>
          </span>
        )}
        <span>
          <span className="text-cream">End</span>{' '}
          <span className="text-cream-dim/60">{relativeFromNow(end)}</span>
        </span>
      </div>

      {/* Y-axis caption (deposit at top of curve) */}
      <div className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cream-dim/80">
        {parsed
          ? `Recipient claims up to ${formatStroops(deposit)} ${symbol} by End`
          : 'Fill the form to render the schedule.'}
      </div>
    </div>
  );
}

/* ---------------- Spec sheet ---------------- */

function SpecSheet({
  parsed,
  recipient,
  symbol,
  glyphColor,
  cancelable,
  transferable,
}: {
  parsed: Parsed | null;
  recipient: string;
  symbol: string;
  glyphColor: string;
  cancelable: boolean;
  transferable: boolean;
}) {
  const rows: { label: string; value: React.ReactNode; accent?: string }[] = [];

  rows.push({
    label: 'To',
    value: recipient ? truncAddress(recipient) : '—',
  });
  rows.push({
    label: 'Token',
    value: (
      <span className="inline-flex items-center gap-2">
        <span className={`size-[7px] rounded-full ${glyphColor}`} />
        <span>{symbol}</span>
      </span>
    ),
  });
  rows.push({
    label: 'Deposit',
    value: parsed
      ? `${formatStroops(parsed.depositStroops)} ${symbol}`
      : '—',
    accent: 'text-sand-bright',
  });
  rows.push({
    label: 'Duration',
    value:
      parsed && parsed.duration > 0 ? formatDuration(parsed.duration) : '—',
    accent: 'text-teal-bright',
  });

  if (parsed) {
    const starts = relativeFromNow(parsed.startTs);
    rows.push({
      label: 'Starts',
      value: starts,
      accent: 'text-cream',
    });
    rows.push({
      label: 'Cliff',
      value:
        parsed.hasCliff && parsed.cliffTs > parsed.startTs
          ? `at ${relativeFromNow(parsed.cliffTs)}`
          : 'none',
      accent:
        parsed.hasCliff && parsed.cliffTs > parsed.startTs
          ? 'text-violet'
          : 'text-cream-dim',
    });
    if (parsed.unlockStartStroops > 0n) {
      rows.push({
        label: 'Unlock @ start',
        value: `${formatStroops(parsed.unlockStartStroops)} ${symbol}`,
      });
    }
    if (parsed.unlockCliffStroops > 0n) {
      rows.push({
        label: 'Unlock @ cliff',
        value: `${formatStroops(parsed.unlockCliffStroops)} ${symbol}`,
      });
    }

    // Linear rate caption — only meaningful if there's a vesting window
    const vestingDur = parsed.endTs - parsed.cliffTs;
    const remaining =
      parsed.depositStroops -
      parsed.unlockStartStroops -
      parsed.unlockCliffStroops;
    if (vestingDur > 0 && remaining > 0n) {
      // Show as decimal per second, with enough precision to be readable.
      const ratePerSec = Number(remaining) / vestingDur / 1e7;
      rows.push({
        label: 'Linear rate',
        value: `${ratePerSec.toFixed(7)} ${symbol} / sec`,
        accent: 'text-cream-muted',
      });
    }
  }

  rows.push({
    label: 'Cancelable',
    value: cancelable ? 'Yes' : 'No',
    accent: cancelable ? 'text-sand-bright' : 'text-cream-dim',
  });
  rows.push({
    label: 'Transferable',
    value: transferable ? 'Yes' : 'No',
    accent: transferable ? 'text-violet' : 'text-cream-dim',
  });

  return (
    <dl className="divide-y divide-stroke/40 text-[11px]">
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className="flex items-center justify-between py-2"
        >
          <dt className="font-mono uppercase tracking-[0.16em] text-[9px] text-cream-dim">
            {r.label}
          </dt>
          <dd
            className={
              'font-mono text-right max-w-[60%] truncate ' +
              (r.accent || 'text-cream')
            }
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------- Helpers ---------------- */

function relativeFromNow(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = ts - now;
  if (Math.abs(delta) < 5) return 'now';
  if (delta < 0) return `${formatShortDuration(-delta)} ago`;
  return `in ${formatShortDuration(delta)}`;
}

function formatShortDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 && m < 5 ? `${m}m ${s}s` : `${m}m`;
  }
  if (secs < 86400) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return m > 0 && h < 3 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  return h > 0 && d < 4 ? `${d}d ${h}h` : `${d}d`;
}
