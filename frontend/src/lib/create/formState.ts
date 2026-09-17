// frontend/src/lib/create/formState.ts
//
// The create form as a reducer over plain strings (what the inputs hold) plus
// `parseForm`, which turns those strings into a `Schedule` and field errors.
// The page owns a `useReducer(formReducer, …)`; components dispatch actions.

import { datetimeLocalToUnix, unixToDatetimeLocal } from '@/lib/format';
import type { TokenInfo } from '@/lib/tokens';
import { parseRows, type RowInput, type Skipped } from './rows';
import {
  BATCH_START_MARGIN_SECS,
  BPS_DENOM,
  alignToMinute,
  clampScheduleStart,
  resolveSchedule,
  scheduleStart,
  shiftSchedule,
  validateSchedule,
  type Mode,
  type Schedule,
  type Shape,
} from './schedule';
import type { Template } from './templates';

/**
 * How far ahead a default / bumped start sits (25 min). Comfortably above the
 * 15-minute batch margin: a form that sits open for a few minutes (or a
 * template applied in batch mode) must not fail validation on the next tick.
 */
export const START_LEAD_SECS = 1500;

export type TrancheField = { id: string; offsetValue: string; offsetUnit: 'hours' | 'days'; pct: string };
export type PeriodUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export type FormState = {
  templateId: string | null;
  templateDirty: boolean;
  token: string;
  shape: Shape;
  linear: { start: string; hasCliff: boolean; cliff: string; end: string; unlockAtStartPct: string; unlockAtCliffPct: string };
  tranched: { start: string; tranches: TrancheField[]; nextId: number };
  recurring: { first: string; periodValue: string; periodUnit: PeriodUnit; count: string };
  cancelable: boolean;
  transferable: boolean;
  mode: Mode;
  single: { recipient: string; amount: string };
  batch: { rows: RowInput[]; nextId: number; lastImport?: { added: number; skipped: Skipped[] } };
};

export type FormAction =
  | { type: 'apply_template'; template: Template; nowSec: number; knownTokens: string[] }
  | { type: 'set_token'; token: string }
  | { type: 'set_shape'; shape: Shape }
  | { type: 'set_linear'; patch: Partial<FormState['linear']> }
  | { type: 'set_tranched_start'; start: string }
  | { type: 'add_tranche' }
  | { type: 'update_tranche'; id: string; patch: Partial<Omit<TrancheField, 'id'>> }
  | { type: 'remove_tranche'; id: string }
  | { type: 'split_tranches_evenly' }
  | { type: 'set_recurring'; patch: Partial<FormState['recurring']> }
  | { type: 'set_flag'; flag: 'cancelable' | 'transferable'; value: boolean }
  | { type: 'set_mode'; mode: Mode }
  | { type: 'set_single'; patch: Partial<FormState['single']> }
  | { type: 'add_row' }
  | { type: 'update_row'; id: string; patch: Partial<Pick<RowInput, 'recipient' | 'amount'>> }
  | { type: 'remove_row'; id: string }
  /** Drop several rows at once (e.g. the rows a finished batch already created). Unknown ids are ignored. */
  | { type: 'remove_rows'; ids: string[] }
  | { type: 'clear_rows' }
  | { type: 'import_rows'; text: string }
  | { type: 'template_saved'; templateId: string }
  | { type: 'clear_template' }
  /** Shift the whole schedule so its start lands on `ceilMinute(nowSec + margin)` (duration preserved). */
  | { type: 'bump_start'; nowSec: number; margin: number };

const UNIT_SECS: Record<PeriodUnit, number> = { minutes: 60, hours: 3600, days: 86_400, weeks: 604_800 };
const OFFSET_SECS: Record<TrancheField['offsetUnit'], number> = { hours: 3600, days: 86_400 };

const ceilMinute = (ts: number) => Math.ceil(ts / 60) * 60;
const trimNum = (n: number) => String(Number(n.toFixed(4)));

export function bpsToPct(bps: number): string {
  return trimNum(bps / 100);
}

/** "25" → 2500, "33.33" → 3333; null when not 0..100 with ≤ 2 decimals. */
export function pctToBps(pct: string): number | null {
  const t = pct.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps >= 0 && bps <= BPS_DENOM ? bps : null;
}

function parseNonNegNumber(s: string): number | null {
  const t = s.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function offsetFields(secs: number): Pick<TrancheField, 'offsetValue' | 'offsetUnit'> {
  return secs % 86_400 === 0 ? { offsetValue: String(secs / 86_400), offsetUnit: 'days' } : { offsetValue: trimNum(secs / 3600), offsetUnit: 'hours' };
}

function periodFields(secs: number): Pick<FormState['recurring'], 'periodValue' | 'periodUnit'> {
  for (const unit of ['weeks', 'days', 'hours'] as const) {
    if (secs % UNIT_SECS[unit] === 0) return { periodValue: String(secs / UNIT_SECS[unit]), periodUnit: unit };
  }
  return { periodValue: trimNum(secs / 60), periodUnit: 'minutes' };
}

export function initialFormState(nowSec: number, tokens: TokenInfo[]): FormState {
  const start = ceilMinute(nowSec + START_LEAD_SECS);
  const startStr = unixToDatetimeLocal(start);
  return {
    templateId: null,
    templateDirty: false,
    token: tokens[0]?.id ?? '',
    shape: 'linear',
    linear: { start: startStr, hasCliff: false, cliff: startStr, end: unixToDatetimeLocal(start + 3600), unlockAtStartPct: '0', unlockAtCliffPct: '0' },
    tranched: {
      start: startStr,
      tranches: [
        { id: 't1', offsetValue: '30', offsetUnit: 'days', pct: '50' },
        { id: 't2', offsetValue: '60', offsetUnit: 'days', pct: '50' },
      ],
      nextId: 3,
    },
    recurring: { first: startStr, periodValue: '30', periodUnit: 'days', count: '12' },
    cancelable: true,
    transferable: true,
    mode: 'single',
    single: { recipient: '', amount: '' },
    batch: { rows: [], nextId: 1 },
  };
}

/** The datetime-local string of the current shape's start. */
export function currentStartField(s: FormState): string {
  switch (s.shape) {
    case 'linear':
      return s.linear.start;
    case 'tranched':
      return s.tranched.start;
    case 'recurring':
      return s.recurring.first;
  }
}

function scheduleToFields(s: FormState, sch: Schedule): FormState {
  switch (sch.shape) {
    case 'linear':
      return {
        ...s,
        shape: 'linear',
        linear: {
          start: unixToDatetimeLocal(sch.startTs),
          hasCliff: sch.cliffTs > sch.startTs,
          cliff: unixToDatetimeLocal(sch.cliffTs),
          end: unixToDatetimeLocal(sch.endTs),
          unlockAtStartPct: bpsToPct(sch.unlockAtStartBps),
          unlockAtCliffPct: bpsToPct(sch.unlockAtCliffBps),
        },
      };
    case 'tranched':
      return {
        ...s,
        shape: 'tranched',
        tranched: {
          start: unixToDatetimeLocal(sch.startTs),
          tranches: sch.tranches.map((t, i) => ({ id: `t${i + 1}`, ...offsetFields(t.ts - sch.startTs), pct: bpsToPct(t.bps) })),
          nextId: sch.tranches.length + 1,
        },
      };
    case 'recurring':
      return {
        ...s,
        shape: 'recurring',
        recurring: { first: unixToDatetimeLocal(sch.firstTs), ...periodFields(sch.periodSecs), count: String(sch.count) },
      };
  }
}

const dirty = (s: FormState): FormState => (s.templateId && !s.templateDirty ? { ...s, templateDirty: true } : s);

export function formReducer(s: FormState, a: FormAction): FormState {
  switch (a.type) {
    case 'apply_template': {
      const t = a.template;
      // In batch mode pad the clamp so the start lands ≥ now + START_LEAD_SECS, not on the 15-minute margin itself.
      const pad = s.mode === 'batch' ? START_LEAD_SECS - BATCH_START_MARGIN_SECS : 0;
      const sch = alignToMinute(clampScheduleStart(resolveSchedule(t.schedule, a.nowSec), a.nowSec + pad, s.mode));
      const next = scheduleToFields(s, sch);
      return {
        ...next,
        token: t.token && a.knownTokens.includes(t.token) ? t.token : s.token,
        cancelable: t.cancelable,
        transferable: t.transferable,
        templateId: t.id,
        templateDirty: false,
      };
    }
    case 'set_token':
      return a.token === s.token ? s : dirty({ ...s, token: a.token });
    case 'set_shape': {
      if (a.shape === s.shape) return s;
      const start = currentStartField(s);
      const next: FormState = { ...s, shape: a.shape };
      if (a.shape === 'linear') next.linear = { ...s.linear, start, cliff: s.linear.hasCliff ? s.linear.cliff : start };
      if (a.shape === 'tranched') next.tranched = { ...s.tranched, start };
      if (a.shape === 'recurring') next.recurring = { ...s.recurring, first: start };
      return dirty(next);
    }
    case 'set_linear':
      return dirty({ ...s, linear: { ...s.linear, ...a.patch } });
    case 'set_tranched_start':
      return dirty({ ...s, tranched: { ...s.tranched, start: a.start } });
    case 'add_tranche': {
      const id = `t${s.tranched.nextId}`;
      return dirty({
        ...s,
        tranched: {
          ...s.tranched,
          nextId: s.tranched.nextId + 1,
          tranches: [...s.tranched.tranches, { id, offsetValue: '', offsetUnit: 'days', pct: '' }],
        },
      });
    }
    case 'update_tranche':
      return dirty({
        ...s,
        tranched: { ...s.tranched, tranches: s.tranched.tranches.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) },
      });
    case 'remove_tranche':
      return dirty({ ...s, tranched: { ...s.tranched, tranches: s.tranched.tranches.filter((t) => t.id !== a.id) } });
    case 'split_tranches_evenly': {
      const n = s.tranched.tranches.length;
      if (n === 0) return s;
      const base = Math.floor(BPS_DENOM / n);
      const tranches = s.tranched.tranches.map((t, i) => ({ ...t, pct: bpsToPct(i === n - 1 ? BPS_DENOM - base * (n - 1) : base) }));
      return dirty({ ...s, tranched: { ...s.tranched, tranches } });
    }
    case 'set_recurring':
      return dirty({ ...s, recurring: { ...s.recurring, ...a.patch } });
    case 'set_flag':
      return s[a.flag] === a.value ? s : dirty({ ...s, [a.flag]: a.value });
    case 'set_mode':
      return { ...s, mode: a.mode };
    case 'set_single':
      return { ...s, single: { ...s.single, ...a.patch } };
    case 'add_row':
      return {
        ...s,
        batch: {
          ...s.batch,
          nextId: s.batch.nextId + 1,
          rows: [...s.batch.rows, { id: `r${s.batch.nextId}`, recipient: '', amount: '', source: 'manual' }],
        },
      };
    case 'update_row':
      return { ...s, batch: { ...s.batch, rows: s.batch.rows.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)) } };
    case 'remove_row':
      return { ...s, batch: { ...s.batch, rows: s.batch.rows.filter((r) => r.id !== a.id) } };
    case 'remove_rows': {
      if (a.ids.length === 0) return s;
      const drop = new Set(a.ids);
      const rows = s.batch.rows.filter((r) => !drop.has(r.id));
      return rows.length === s.batch.rows.length ? s : { ...s, batch: { ...s.batch, rows } };
    }
    case 'clear_rows':
      return { ...s, batch: { rows: [], nextId: s.batch.nextId } };
    case 'import_rows': {
      const { rows, skipped } = parseRows(a.text, s.batch.nextId, s.batch.rows.length);
      return {
        ...s,
        batch: {
          rows: [...s.batch.rows, ...rows],
          nextId: s.batch.nextId + rows.length,
          lastImport: { added: rows.length, skipped },
        },
      };
    }
    case 'template_saved':
      return { ...s, templateId: a.templateId, templateDirty: false };
    case 'clear_template':
      return { ...s, templateId: null, templateDirty: false };
    case 'bump_start': {
      const { schedule } = parseForm(s, a.nowSec);
      if (!schedule) return s;
      return dirty(scheduleToFields(s, shiftSchedule(schedule, ceilMinute(a.nowSec + a.margin) - scheduleStart(schedule))));
    }
  }
}

export function parseForm(
  s: FormState,
  nowSec: number,
): { schedule: Schedule | null; valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let schedule: Schedule | null = null;
  switch (s.shape) {
    case 'linear': {
      const startTs = datetimeLocalToUnix(s.linear.start);
      const endTs = datetimeLocalToUnix(s.linear.end);
      const cliffTs = s.linear.hasCliff ? datetimeLocalToUnix(s.linear.cliff) : startTs;
      const us = pctToBps(s.linear.unlockAtStartPct);
      const uc = pctToBps(s.linear.unlockAtCliffPct);
      if (!startTs) errors.start = 'Enter a start time.';
      if (!endTs) errors.end = 'Enter an end time.';
      if (s.linear.hasCliff && !cliffTs) errors.cliff = 'Enter a cliff time.';
      if (us === null) errors.unlockAtStartPct = 'Enter a percentage between 0 and 100 (max 2 decimals).';
      if (uc === null) errors.unlockAtCliffPct = 'Enter a percentage between 0 and 100 (max 2 decimals).';
      if (Object.keys(errors).length === 0) {
        schedule = { shape: 'linear', startTs, cliffTs, endTs, unlockAtStartBps: us as number, unlockAtCliffBps: uc as number };
      }
      break;
    }
    case 'tranched': {
      const startTs = datetimeLocalToUnix(s.tranched.start);
      if (!startTs) errors.start = 'Enter a start time.';
      const tranches: Array<{ ts: number; bps: number }> = [];
      for (const t of s.tranched.tranches) {
        const off = parseNonNegNumber(t.offsetValue);
        const bps = pctToBps(t.pct);
        if (off === null || bps === null) {
          errors[`tranche.${t.id}`] = 'Enter an offset and a percentage.';
          continue;
        }
        tranches.push({ ts: startTs + Math.round(off * OFFSET_SECS[t.offsetUnit]), bps });
      }
      if (Object.keys(errors).length === 0) schedule = { shape: 'tranched', startTs, tranches };
      break;
    }
    case 'recurring': {
      const firstTs = datetimeLocalToUnix(s.recurring.first);
      const pv = parseNonNegNumber(s.recurring.periodValue);
      const countStr = s.recurring.count.trim();
      const count = /^\d+$/.test(countStr) ? Number(countStr) : NaN;
      if (!firstTs) errors.start = 'Enter a start time.';
      if (pv === null || pv <= 0) errors.period = 'Enter a period.';
      if (!Number.isInteger(count)) errors.count = 'Enter a whole number.';
      if (Object.keys(errors).length === 0) {
        schedule = { shape: 'recurring', firstTs, periodSecs: Math.round((pv as number) * UNIT_SECS[s.recurring.periodUnit]), count };
      }
      break;
    }
  }
  if (schedule) {
    for (const e of validateSchedule(schedule, nowSec, s.mode)) errors[e.field] ??= e.message;
  }
  return { schedule, valid: schedule !== null && Object.keys(errors).length === 0, errors };
}
