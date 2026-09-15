import { describe, expect, it } from 'vitest';
import {
  BATCH_START_MARGIN_SECS,
  BPS_DENOM,
  SINGLE_START_MARGIN_SECS,
  alignToMinute,
  buildSpec,
  clampScheduleStart,
  deriveTemplate,
  resolveSchedule,
  scheduleEnd,
  scheduleStart,
  shiftSchedule,
  validateSchedule,
  type Schedule,
  type ScheduleTemplate,
} from './schedule';

const D = 86_400;
const NOW = 1_800_000_000;

const linearT: ScheduleTemplate = {
  shape: 'linear', startOffset: 900, cliffOffset: 90 * D, duration: 365 * D, unlockAtStartBps: 0, unlockAtCliffBps: 2500,
};
const tranchedT: ScheduleTemplate = {
  shape: 'tranched', startOffset: 900,
  tranches: [{ offset: 90 * D, bps: 2500 }, { offset: 180 * D, bps: 2500 }, { offset: 270 * D, bps: 2500 }, { offset: 360 * D, bps: 2500 }],
};
const recurringT: ScheduleTemplate = { shape: 'recurring', startOffset: 900, periodSecs: 30 * D, count: 12 };

describe('resolveSchedule / deriveTemplate', () => {
  it('round-trips every shape', () => {
    for (const t of [linearT, tranchedT, recurringT]) {
      const s = resolveSchedule(t, NOW);
      expect(deriveTemplate(s, NOW)).toEqual(t);
    }
  });
  it('resolves linear absolute timestamps', () => {
    const s = resolveSchedule(linearT, NOW);
    expect(s).toEqual({
      shape: 'linear', startTs: NOW + 900, cliffTs: NOW + 900 + 90 * D, endTs: NOW + 900 + 365 * D, unlockAtStartBps: 0, unlockAtCliffBps: 2500,
    });
  });
  it('deriveTemplate clamps a past start to offset 0', () => {
    const s: Schedule = { shape: 'recurring', firstTs: NOW - 10, periodSecs: 60, count: 2 };
    expect(deriveTemplate(s, NOW).startOffset).toBe(0);
  });
});

describe('scheduleStart / scheduleEnd / shiftSchedule / alignToMinute', () => {
  it('computes start and end per shape', () => {
    const l = resolveSchedule(linearT, NOW);
    const t = resolveSchedule(tranchedT, NOW);
    const r = resolveSchedule(recurringT, NOW);
    expect([scheduleStart(l), scheduleEnd(l)]).toEqual([NOW + 900, NOW + 900 + 365 * D]);
    expect([scheduleStart(t), scheduleEnd(t)]).toEqual([NOW + 900, NOW + 900 + 360 * D]);
    expect([scheduleStart(r), scheduleEnd(r)]).toEqual([NOW + 900, NOW + 900 + 11 * 30 * D]);
  });
  it('shifts every timestamp', () => {
    const t = shiftSchedule(resolveSchedule(tranchedT, NOW), 100);
    expect(scheduleStart(t)).toBe(NOW + 1000);
    expect(t.shape === 'tranched' && t.tranches[3].ts).toBe(NOW + 1000 + 360 * D);
    const r = shiftSchedule(resolveSchedule(recurringT, NOW), -5);
    expect(scheduleStart(r)).toBe(NOW + 895);
  });
  it('clampScheduleStart shifts only when start is inside the margin', () => {
    const s = resolveSchedule({ ...linearT, startOffset: 10 }, NOW);
    const batch = clampScheduleStart(s, NOW, 'batch');
    expect(scheduleStart(batch)).toBe(NOW + BATCH_START_MARGIN_SECS);
    expect(scheduleEnd(batch) - scheduleStart(batch)).toBe(365 * D);
    const single = clampScheduleStart(s, NOW, 'single');
    expect(scheduleStart(single)).toBe(NOW + SINGLE_START_MARGIN_SECS);
    const far = resolveSchedule(linearT, NOW);
    expect(clampScheduleStart(far, NOW, 'batch')).toEqual(far);
  });
  it('alignToMinute rounds the start up to a whole minute and shifts the rest', () => {
    const s = resolveSchedule({ ...linearT, startOffset: 905 }, NOW); // NOW is a multiple of 60 → start = NOW + 905
    const aligned = alignToMinute(s);
    expect(scheduleStart(aligned)).toBe(NOW + 960);
    expect(scheduleEnd(aligned) - scheduleStart(aligned)).toBe(365 * D);
    const already = resolveSchedule(linearT, NOW); // NOW + 900, already aligned
    expect(alignToMinute(already)).toBe(already);
  });
});

describe('validateSchedule', () => {
  const ok = resolveSchedule(linearT, NOW) as Extract<Schedule, { shape: 'linear' }>;
  it('accepts every preset in both modes', () => {
    for (const t of [linearT, tranchedT, recurringT]) {
      expect(validateSchedule(resolveSchedule(t, NOW), NOW, 'single')).toEqual([]);
      expect(validateSchedule(resolveSchedule(t, NOW), NOW, 'batch')).toEqual([]);
    }
  });
  it('enforces the start margin per mode', () => {
    const soon = resolveSchedule({ ...linearT, startOffset: 300 }, NOW);
    expect(validateSchedule(soon, NOW, 'single')).toEqual([]);
    expect(validateSchedule(soon, NOW, 'batch').map((e) => e.field)).toEqual(['start']);
  });
  it('linear: end after start, cliff in range, unlocks ≤ 100%', () => {
    expect(validateSchedule({ ...ok, endTs: ok.startTs } as Schedule, NOW, 'single').map((e) => e.field)).toContain('end');
    expect(validateSchedule({ ...ok, cliffTs: ok.startTs - 1 } as Schedule, NOW, 'single').map((e) => e.field)).toContain('cliff');
    expect(validateSchedule({ ...ok, unlockAtStartBps: 8000, unlockAtCliffBps: 2500 } as Schedule, NOW, 'single').map((e) => e.field)).toContain('unlocks');
    expect(validateSchedule({ ...ok, unlockAtStartBps: -1 } as Schedule, NOW, 'single').map((e) => e.field)).toContain('unlocks');
  });
  it('tranched: count, ascending, ≥ start, sums to 100%', () => {
    const t = resolveSchedule(tranchedT, NOW);
    if (t.shape !== 'tranched') throw new Error('shape');
    expect(validateSchedule({ ...t, tranches: [] }, NOW, 'single').map((e) => e.message)).toContain('Add at least one tranche.');
    const many = { ...t, tranches: Array.from({ length: 101 }, (_, i) => ({ ts: t.startTs + i + 1, bps: i === 100 ? BPS_DENOM - 100 : 1 })) };
    expect(validateSchedule(many, NOW, 'single').map((e) => e.message)).toContain('At most 100 tranches.');
    const notAsc = { ...t, tranches: [{ ts: t.startTs + 10, bps: 5000 }, { ts: t.startTs + 10, bps: 5000 }] };
    expect(validateSchedule(notAsc, NOW, 'single').map((e) => e.message)).toContain('Tranche times must be strictly increasing.');
    const before = { ...t, tranches: [{ ts: t.startTs - 1, bps: 10000 }] };
    expect(validateSchedule(before, NOW, 'single').map((e) => e.message)).toContain('Tranche times cannot be before start.');
    const bad = { ...t, tranches: [{ ts: t.startTs + 10, bps: 5000 }, { ts: t.startTs + 20, bps: 4000 }] };
    expect(validateSchedule(bad, NOW, 'single').map((e) => e.message)).toContain('Tranche percentages must add up to 100%.');
  });
  it('recurring: period ≥ 60 s, count 1..1000', () => {
    const r = resolveSchedule(recurringT, NOW);
    expect(validateSchedule({ ...r, periodSecs: 59 } as Schedule, NOW, 'single').map((e) => e.field)).toContain('period');
    expect(validateSchedule({ ...r, count: 0 } as Schedule, NOW, 'single').map((e) => e.field)).toContain('count');
    expect(validateSchedule({ ...r, count: 1001 } as Schedule, NOW, 'single').map((e) => e.field)).toContain('count');
    expect(validateSchedule({ ...r, count: 2.5 } as Schedule, NOW, 'single').map((e) => e.field)).toContain('count');
  });
});

describe('buildSpec', () => {
  it('linear: floors unlock percentages, deposit = total', () => {
    const s = resolveSchedule(linearT, NOW);
    const b = buildSpec(s, 1_000_000_0n); // 1 XLM
    expect(b.deposited).toBe(1_000_000_0n);
    expect(b.adjustment).toBe(0n);
    expect(b.spec.tag).toBe('Linear');
    if (b.spec.tag !== 'Linear') throw new Error('tag');
    const p = b.spec.values[0];
    expect(p.unlock_at_cliff).toBe(2_500_000n);
    expect(p.unlock_at_start).toBe(0n);
    expect(p.start_ts).toBe(BigInt(NOW + 900));
    expect(p.cliff_ts).toBe(BigInt(NOW + 900 + 90 * D));
    expect(p.end_ts).toBe(BigInt(NOW + 900 + 365 * D));
  });
  it('tranched: last tranche absorbs rounding so the sum equals the total', () => {
    const s: Schedule = { shape: 'tranched', startTs: NOW + 900, tranches: [{ ts: NOW + 1000, bps: 3333 }, { ts: NOW + 2000, bps: 3333 }, { ts: NOW + 3000, bps: 3334 }] };
    for (const total of [1n, 7n, 1_000_000_1n]) {
      const b = buildSpec(s, total);
      if (b.spec.tag !== 'Tranched') throw new Error('tag');
      const sum = b.spec.values[0].tranches.reduce((a, t) => a + t.amount, 0n);
      expect(sum).toBe(total);
      expect(b.spec.values[0].tranches.map((t) => t.ts)).toEqual([BigInt(NOW + 1000), BigInt(NOW + 2000), BigInt(NOW + 3000)]);
    }
  });
  it('tranched: a tranche that floors to zero is rejected', () => {
    const s: Schedule = { shape: 'tranched', startTs: NOW + 900, tranches: [{ ts: NOW + 1000, bps: 1 }, { ts: NOW + 2000, bps: 9999 }] };
    expect(() => buildSpec(s, 100n)).toThrow(RangeError);
  });
  it('recurring: floors per-period amount and reports the adjustment', () => {
    const s = resolveSchedule(recurringT, NOW); // count 12
    const b = buildSpec(s, 100n);
    if (b.spec.tag !== 'Recurring') throw new Error('tag');
    expect(b.spec.values[0].amount_per_period).toBe(8n);
    expect(b.spec.values[0].count).toBe(12);
    expect(b.spec.values[0].period_secs).toBe(BigInt(30 * D));
    expect(b.spec.values[0].first_ts).toBe(BigInt(NOW + 900));
    expect(b.deposited).toBe(96n);
    expect(b.adjustment).toBe(-4n);
    expect(-b.adjustment < 12n).toBe(true);
    expect(buildSpec(s, 120n).adjustment).toBe(0n);
  });
  it('rejects non-positive totals and totals below the recurring count', () => {
    const s = resolveSchedule(recurringT, NOW);
    expect(() => buildSpec(s, 0n)).toThrow(RangeError);
    expect(() => buildSpec(s, 11n)).toThrow(/12 periods/);
  });
});
