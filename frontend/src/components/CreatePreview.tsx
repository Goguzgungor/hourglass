// frontend/src/components/CreatePreview.tsx
'use client';

/**
 * /create preview pane — a diagrammatic sketch of the vesting curve for the
 * current schedule (linear, tranched or recurring) plus a tight spec sheet.
 * In batch mode `total` is the grand total and `recipients` > 1.
 */

import { useEffect, useState } from 'react';
import { buildSpec, scheduleEnd, scheduleStart, type Schedule } from '@/lib/create/schedule';
import { formatDuration, formatStroops, truncAddress } from '@/lib/format';

type Props = {
  schedule: Schedule | null;
  /** Per-recipient total (single) or grand total (batch), stroops. */
  total: bigint | null;
  recipients: number;
  recipient?: string;
  symbol: string;
  glyphColor?: string;
  cancelable: boolean;
  transferable: boolean;
};

const MAX_DRAWN_STEPS = 200;

export default function CreatePreview({ schedule, total, recipients, recipient, symbol, glyphColor = 'bg-sand', cancelable, transferable }: Props) {
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <EmissionSketch schedule={schedule} total={total} symbol={symbol} recipients={recipients} nowSec={nowSec} />
      <SpecSheet schedule={schedule} total={total} recipients={recipients} recipient={recipient} symbol={symbol} glyphColor={glyphColor} cancelable={cancelable} transferable={transferable} nowSec={nowSec} />
    </div>
  );
}

/** Cumulative-amount breakpoints `[t, amount]` for the sketch; `step` = draw as a staircase. */
function breakpoints(s: Schedule, total: bigint): { pts: Array<[number, number]>; step: boolean } {
  const T = Number(total);
  switch (s.shape) {
    case 'linear': {
      const us = (T * s.unlockAtStartBps) / 10_000;
      const uc = (T * s.unlockAtCliffBps) / 10_000;
      const pts: Array<[number, number]> = [[s.startTs, 0]];
      if (us > 0) pts.push([s.startTs, us]);
      if (s.cliffTs > s.startTs) {
        pts.push([s.cliffTs, us]);
        if (uc > 0) pts.push([s.cliffTs, us + uc]);
      }
      pts.push([s.endTs, T]);
      return { pts, step: false };
    }
    case 'tranched': {
      const pts: Array<[number, number]> = [[s.startTs, 0]];
      let acc = 0;
      for (const t of s.tranches) {
        acc += (T * t.bps) / 10_000;
        pts.push([t.ts, Math.min(acc, T)]);
      }
      return { pts, step: true };
    }
    case 'recurring': {
      const per = T / s.count;
      const n = Math.min(s.count, MAX_DRAWN_STEPS);
      const stride = s.count / n;
      const pts: Array<[number, number]> = [[s.firstTs, 0]];
      for (let i = 0; i < n; i++) {
        const k = Math.min(s.count - 1, Math.round((i + 1) * stride) - 1);
        pts.push([s.firstTs + k * s.periodSecs, per * (k + 1)]);
      }
      return { pts, step: true };
    }
  }
}

function EmissionSketch({ schedule, total, symbol, recipients, nowSec }: { schedule: Schedule | null; total: bigint | null; symbol: string; recipients: number; nowSec: number }) {
  const fallback: Schedule = { shape: 'linear', startTs: nowSec, cliffTs: nowSec, endTs: nowSec + 3600, unlockAtStartBps: 0, unlockAtCliffBps: 0 };
  const s = schedule ?? fallback;
  const amount = total && total > 0n ? total : 100_000_000n; // 10 XLM display fallback
  const start = scheduleStart(s);
  const end = Math.max(scheduleEnd(s), start + 1);
  const { pts, step } = breakpoints(s, amount);
  const D = Number(amount);
  const range = end - start || 1;
  const x = (t: number) => Math.max(0, Math.min(100, ((t - start) / range) * 100));
  const y = (v: number) => 100 - Math.max(0, Math.min(100, (v / Math.max(D, 1)) * 100));

  let d = '';
  pts.forEach(([t, v], i) => {
    if (i === 0) {
      d += `M ${x(t)} ${y(v)}`;
      return;
    }
    if (step) d += ` L ${x(t)} ${y(pts[i - 1][1])}`;
    d += ` L ${x(t)} ${y(v)}`;
  });
  const areaPath = `${d} L ${x(end)} 100 L ${x(start)} 100 Z`;
  const cliff = s.shape === 'linear' && s.cliffTs > s.startTs ? s.cliffTs : null;
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
        {[25, 50, 75].map((v) => (
          <line key={v} x1="0" x2="100" y1={v} y2={v} stroke="var(--stroke)" strokeOpacity="0.4" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
        ))}
        {cliff !== null && (
          <line x1={x(cliff)} x2={x(cliff)} y1="0" y2="100" stroke="var(--violet)" strokeWidth="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity="0.6" />
        )}
        <path d={areaPath} fill="url(#emissionFill)" />
        <path d={d} fill="none" stroke="var(--sand-bright)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" strokeLinecap="square" />
        {nowInWindow && (
          <line x1={x(nowSec)} x2={x(nowSec)} y1="0" y2="100" stroke="var(--teal-bright)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" opacity="0.8" />
        )}
      </svg>
      <div className="flex justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cream-dim border-t border-stroke/60">
        <span>
          <span className="text-sand">Start</span> <span className="text-cream-dim/60">{relativeFromNow(start, nowSec)}</span>
        </span>
        {cliff !== null && (
          <span>
            <span className="text-violet">Cliff</span> <span className="text-cream-dim/60">{relativeFromNow(cliff, nowSec)}</span>
          </span>
        )}
        <span>
          <span className="text-cream">End</span> <span className="text-cream-dim/60">{relativeFromNow(end, nowSec)}</span>
        </span>
      </div>
      <div className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cream-dim/80">
        {schedule && total
          ? recipients > 1
            ? `${recipients} recipients claim ${formatStroops(total)} ${symbol} in total by End`
            : `Recipient claims up to ${formatStroops(total)} ${symbol} by End`
          : 'Fill the form to render the schedule.'}
      </div>
    </div>
  );
}

function SpecSheet({ schedule, total, recipients, recipient, symbol, glyphColor, cancelable, transferable, nowSec }: Omit<Props, 'glyphColor'> & { glyphColor: string; nowSec: number }) {
  const rows: { label: string; value: React.ReactNode; accent?: string }[] = [];
  const perRecipient = total && recipients > 1 ? null : total;
  const built = (() => {
    if (!schedule || !perRecipient) return null;
    try {
      return buildSpec(schedule, perRecipient);
    } catch {
      return null;
    }
  })();

  rows.push({ label: 'To', value: recipients > 1 ? `${recipients} recipients` : recipient ? truncAddress(recipient) : '—' });
  rows.push({
    label: 'Token',
    value: (
      <span className="inline-flex items-center gap-2">
        <span className={`size-[7px] rounded-full ${glyphColor}`} />
        <span>{symbol}</span>
      </span>
    ),
  });
  rows.push({ label: recipients > 1 ? 'Total' : 'Deposit', value: total ? `${formatStroops(total)} ${symbol}` : '—', accent: 'text-sand-bright' });
  rows.push({ label: 'Shape', value: schedule ? schedule.shape : '—' });
  if (schedule) {
    const start = scheduleStart(schedule);
    const end = scheduleEnd(schedule);
    rows.push({ label: 'Starts', value: relativeFromNow(start, nowSec), accent: 'text-cream' });
    rows.push({ label: 'Duration', value: end > start ? formatDuration(end - start) : '—', accent: 'text-teal-bright' });
    if (schedule.shape === 'linear') {
      const hasCliff = schedule.cliffTs > schedule.startTs;
      rows.push({ label: 'Cliff', value: hasCliff ? `at ${relativeFromNow(schedule.cliffTs, nowSec)}` : 'none', accent: hasCliff ? 'text-violet' : 'text-cream-dim' });
      if (schedule.unlockAtStartBps > 0) rows.push({ label: 'Unlock @ start', value: `${schedule.unlockAtStartBps / 100}%` });
      if (schedule.unlockAtCliffBps > 0) rows.push({ label: 'Unlock @ cliff', value: `${schedule.unlockAtCliffBps / 100}%` });
      if (built && built.spec.tag === 'Linear') {
        const p = built.spec.values[0];
        const vestingDur = schedule.endTs - schedule.cliffTs;
        const remaining = p.deposited - p.unlock_at_start - p.unlock_at_cliff;
        if (vestingDur > 0 && remaining > 0n) {
          rows.push({
            label: 'Linear rate',
            value: `${formatStroops((remaining * 3600n) / BigInt(vestingDur))} ${symbol} / hour`,
            accent: 'text-cream-muted',
          });
        }
      }
    }
    if (schedule.shape === 'tranched') {
      rows.push({ label: 'Tranches', value: String(schedule.tranches.length) });
      if (built && built.spec.tag === 'Tranched') {
        const t = built.spec.values[0].tranches;
        rows.push({ label: 'First / last', value: `${formatStroops(t[0].amount)} / ${formatStroops(t[t.length - 1].amount)} ${symbol}` });
      }
    }
    if (schedule.shape === 'recurring') {
      rows.push({ label: 'Every', value: formatDuration(schedule.periodSecs) });
      rows.push({ label: 'Count', value: String(schedule.count) });
      if (built && built.spec.tag === 'Recurring') {
        rows.push({ label: 'Per period', value: `${formatStroops(built.spec.values[0].amount_per_period)} ${symbol}` });
        if (built.adjustment < 0n) rows.push({ label: 'Adjusted', value: `${formatStroops(built.adjustment)} ${symbol}`, accent: 'text-cream-dim' });
      }
    }
  }
  rows.push({ label: 'Cancelable', value: cancelable ? 'Yes' : 'No', accent: cancelable ? 'text-sand-bright' : 'text-cream-dim' });
  rows.push({ label: 'Transferable', value: transferable ? 'Yes' : 'No', accent: transferable ? 'text-violet' : 'text-cream-dim' });

  return (
    <dl className="divide-y divide-stroke/40 text-[11px]">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="flex items-center justify-between py-2">
          <dt className="font-mono uppercase tracking-[0.16em] text-[9px] text-cream-dim">{r.label}</dt>
          <dd className={'font-mono text-right max-w-[60%] truncate ' + (r.accent || 'text-cream')}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function relativeFromNow(ts: number, nowSec: number): string {
  const delta = ts - nowSec;
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
