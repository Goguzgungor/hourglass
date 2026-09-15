// frontend/src/lib/create/formState.test.ts
import { describe, expect, it } from 'vitest';
import { datetimeLocalToUnix, unixToDatetimeLocal } from '@/lib/format';
import type { TokenInfo } from '@/lib/tokens';
import { bpsToPct, formReducer, initialFormState, parseForm, pctToBps, type FormState } from './formState';
import { BUILT_IN_TEMPLATES } from './templates';
import { scheduleStart } from './schedule';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const NOW = 1_800_000_000; // divisible by 60
const tokens: TokenInfo[] = [
  { id: 'CNATIVE', symbol: 'XLM', name: 'x', decimals: 7, glyphColor: '', description: '' },
  { id: 'CUSDC', symbol: 'USDC', name: 'u', decimals: 7, issuer: 'G', glyphColor: '', description: '' },
];
const preset = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!;

describe('initialFormState / parseForm', () => {
  it('starts linear, 15 minutes ahead on a whole minute, 1h long, valid in both modes', () => {
    const s = initialFormState(NOW + 7, tokens);
    expect(s.shape).toBe('linear');
    expect(s.mode).toBe('single');
    expect(s.token).toBe('CNATIVE');
    const p = parseForm(s, NOW + 7);
    expect(p.valid).toBe(true);
    expect(p.errors).toEqual({});
    expect(scheduleStart(p.schedule!)).toBe(NOW + 960); // ceil((NOW+7+900)/60)*60
    expect(p.schedule).toMatchObject({ shape: 'linear', endTs: NOW + 960 + 3600, unlockAtStartBps: 0, unlockAtCliffBps: 0 });
    expect(parseForm({ ...s, mode: 'batch' }, NOW + 7).valid).toBe(true);
  });
  it('percent ↔ bps helpers', () => {
    expect(pctToBps('25')).toBe(2500);
    expect(pctToBps('33.33')).toBe(3333);
    expect(pctToBps('0')).toBe(0);
    expect(pctToBps('100')).toBe(10000);
    expect(pctToBps('100.01')).toBeNull();
    expect(pctToBps('1.234')).toBeNull();
    expect(pctToBps('abc')).toBeNull();
    expect(pctToBps('')).toBeNull();
    expect(bpsToPct(2500)).toBe('25');
    expect(bpsToPct(3333)).toBe('33.33');
  });
});

describe('apply_template', () => {
  it('fills linear fields from a preset, clamps to the mode margin, clears dirty', () => {
    let s = initialFormState(NOW, tokens);
    s = { ...s, mode: 'batch', templateDirty: true };
    s = formReducer(s, { type: 'apply_template', template: preset('linear-4y-1y-cliff-25'), nowSec: NOW, knownTokens: tokens.map((t) => t.id) });
    expect(s.templateId).toBe('linear-4y-1y-cliff-25');
    expect(s.templateDirty).toBe(false);
    expect(s.shape).toBe('linear');
    expect(s.linear.hasCliff).toBe(true);
    expect(s.linear.unlockAtCliffPct).toBe('25');
    expect(s.linear.unlockAtStartPct).toBe('0');
    const p = parseForm(s, NOW);
    expect(p.valid).toBe(true);
    expect(p.schedule).toMatchObject({ startTs: NOW + 900, cliffTs: NOW + 900 + 365 * 86_400, endTs: NOW + 900 + 1460 * 86_400 });
  });
  it('fills recurring and tranched fields with friendly units', () => {
    let s = formReducer(initialFormState(NOW, tokens), { type: 'apply_template', template: preset('recurring-weekly-52'), nowSec: NOW, knownTokens: [] });
    expect(s.shape).toBe('recurring');
    expect(s.recurring).toMatchObject({ periodValue: '1', periodUnit: 'weeks', count: '52' });
    expect(parseForm(s, NOW).schedule).toMatchObject({ shape: 'recurring', firstTs: NOW + 900, periodSecs: 604_800, count: 52 });
    s = formReducer(s, { type: 'apply_template', template: preset('tranched-quarterly-4'), nowSec: NOW, knownTokens: [] });
    expect(s.shape).toBe('tranched');
    expect(s.tranched.tranches.map((t) => [t.offsetValue, t.offsetUnit, t.pct])).toEqual([
      ['90', 'days', '25'], ['180', 'days', '25'], ['270', 'days', '25'], ['360', 'days', '25'],
    ]);
    const p = parseForm(s, NOW);
    expect(p.valid).toBe(true);
    expect(p.schedule).toMatchObject({ shape: 'tranched', startTs: NOW + 900 });
    expect(p.schedule?.shape === 'tranched' && p.schedule.tranches[3]).toEqual({ ts: NOW + 900 + 360 * 86_400, bps: 2500 });
  });
  it('applies token and flags only when known', () => {
    const t = { ...preset('linear-1y'), id: 'u_x', builtIn: false, token: 'CUSDC', cancelable: false, transferable: false };
    let s = formReducer(initialFormState(NOW, tokens), { type: 'apply_template', template: t, nowSec: NOW, knownTokens: ['CNATIVE', 'CUSDC'] });
    expect(s.token).toBe('CUSDC');
    expect(s.cancelable).toBe(false);
    s = formReducer(initialFormState(NOW, tokens), { type: 'apply_template', template: { ...t, token: 'CUNKNOWN' }, nowSec: NOW, knownTokens: ['CNATIVE'] });
    expect(s.token).toBe('CNATIVE');
  });
  it('a past-dated template is shifted forward to the margin', () => {
    const t = { ...preset('linear-1y'), schedule: { ...preset('linear-1y').schedule, startOffset: 0 } };
    const s = formReducer({ ...initialFormState(NOW, tokens), mode: 'batch' }, { type: 'apply_template', template: t, nowSec: NOW + 30, knownTokens: [] });
    const p = parseForm(s, NOW + 30);
    expect(p.valid).toBe(true);
    expect(scheduleStart(p.schedule!)).toBe(NOW + 960);
  });
});

describe('dirty tracking and shape switching', () => {
  const applied = () => formReducer(initialFormState(NOW, tokens), { type: 'apply_template', template: preset('linear-1y'), nowSec: NOW, knownTokens: [] });
  it('schedule / shape / token / flag edits dirty the template; recipient edits do not', () => {
    expect(formReducer(applied(), { type: 'set_linear', patch: { end: unixToDatetimeLocal(NOW + 5000) } }).templateDirty).toBe(true);
    expect(formReducer(applied(), { type: 'set_shape', shape: 'recurring' }).templateDirty).toBe(true);
    expect(formReducer(applied(), { type: 'set_token', token: 'CUSDC' }).templateDirty).toBe(true);
    expect(formReducer(applied(), { type: 'set_flag', flag: 'cancelable', value: false }).templateDirty).toBe(true);
    expect(formReducer(applied(), { type: 'set_single', patch: { recipient: G1 } }).templateDirty).toBe(false);
    expect(formReducer(applied(), { type: 'set_mode', mode: 'batch' }).templateDirty).toBe(false);
    expect(formReducer(initialFormState(NOW, tokens), { type: 'set_token', token: 'CUSDC' }).templateDirty).toBe(false); // no template selected
  });
  it('template_saved marks the current form as that template; clear_template detaches it', () => {
    const s = formReducer(formReducer(applied(), { type: 'set_shape', shape: 'recurring' }), { type: 'template_saved', templateId: 'u_new' });
    expect(s).toMatchObject({ templateId: 'u_new', templateDirty: false });
    expect(formReducer(s, { type: 'clear_template' })).toMatchObject({ templateId: null, templateDirty: false });
  });
  it('switching shapes carries the start time over', () => {
    let s = applied();
    s = formReducer(s, { type: 'set_linear', patch: { start: unixToDatetimeLocal(NOW + 7200) } });
    s = formReducer(s, { type: 'set_shape', shape: 'recurring' });
    expect(s.recurring.first).toBe(unixToDatetimeLocal(NOW + 7200));
    s = formReducer(s, { type: 'set_shape', shape: 'tranched' });
    expect(s.tranched.start).toBe(unixToDatetimeLocal(NOW + 7200));
  });
});

describe('tranche and recurring editing', () => {
  it('add / update / remove / split evenly', () => {
    let s = formReducer(initialFormState(NOW, tokens), { type: 'set_shape', shape: 'tranched' });
    expect(s.tranched.tranches).toHaveLength(2);
    s = formReducer(s, { type: 'add_tranche' });
    expect(s.tranched.tranches).toHaveLength(3);
    const id = s.tranched.tranches[2].id;
    s = formReducer(s, { type: 'update_tranche', id, patch: { offsetValue: '90', offsetUnit: 'days' } });
    s = formReducer(s, { type: 'split_tranches_evenly' });
    expect(s.tranched.tranches.map((t) => t.pct)).toEqual(['33.33', '33.33', '33.34']);
    expect(parseForm(s, NOW).valid).toBe(true);
    s = formReducer(s, { type: 'remove_tranche', id });
    expect(s.tranched.tranches).toHaveLength(2);
    expect(parseForm(s, NOW).errors.tranches).toBe('Tranche percentages must add up to 100%.');
  });
  it('recurring units and count validation', () => {
    let s = formReducer(initialFormState(NOW, tokens), { type: 'set_shape', shape: 'recurring' });
    s = formReducer(s, { type: 'set_recurring', patch: { periodValue: '2', periodUnit: 'hours', count: '3' } });
    expect(parseForm(s, NOW).schedule).toMatchObject({ periodSecs: 7200, count: 3 });
    s = formReducer(s, { type: 'set_recurring', patch: { count: '2.5' } });
    expect(parseForm(s, NOW).errors.count).toBe('Enter a whole number.');
    s = formReducer(s, { type: 'set_recurring', patch: { count: '3', periodValue: '0.5', periodUnit: 'minutes' } });
    expect(parseForm(s, NOW).errors.period).toBe('Period must be at least 1 minute.');
  });
  it('reports field-level errors for bad inputs', () => {
    let s = initialFormState(NOW, tokens);
    s = formReducer(s, { type: 'set_linear', patch: { unlockAtStartPct: '150', end: '' } });
    const p = parseForm(s, NOW);
    expect(p.valid).toBe(false);
    expect(p.schedule).toBeNull();
    expect(p.errors.unlockAtStartPct).toMatch(/percentage/);
    expect(p.errors.end).toBe('Enter an end time.');
    s = formReducer(initialFormState(NOW, tokens), { type: 'set_linear', patch: { start: unixToDatetimeLocal(NOW + 60) } });
    const q = parseForm(s, NOW);
    expect(q.valid).toBe(false);
    expect(q.schedule).not.toBeNull();
    expect(q.errors.start).toMatch(/at least 2 minutes/);
  });
});

describe('batch rows', () => {
  it('add / update / remove / clear / import keep ids unique and track the last import', () => {
    let s = formReducer(initialFormState(NOW, tokens), { type: 'set_mode', mode: 'batch' });
    s = formReducer(s, { type: 'add_row' });
    s = formReducer(s, { type: 'add_row' });
    expect(s.batch.rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    s = formReducer(s, { type: 'update_row', id: 'r2', patch: { recipient: G1, amount: '5' } });
    expect(s.batch.rows[1]).toMatchObject({ recipient: G1, amount: '5', source: 'manual' });
    s = formReducer(s, { type: 'import_rows', text: `recipient,amount\n${G1},1\n${G1},2` });
    expect(s.batch.rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(s.batch.lastImport).toEqual({ added: 2, skipped: [{ line: 1, reason: 'header' }] });
    s = formReducer(s, { type: 'remove_row', id: 'r1' });
    expect(s.batch.rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r4']);
    s = formReducer(s, { type: 'add_row' });
    expect(s.batch.rows[3].id).toBe('r5');
    s = formReducer(s, { type: 'clear_rows' });
    expect(s.batch.rows).toEqual([]);
    expect(s.batch.lastImport).toBeUndefined();
  });
});

describe('datetime helpers round-trip', () => {
  it('unixToDatetimeLocal → datetimeLocalToUnix is identity at minute resolution', () => {
    expect(datetimeLocalToUnix(unixToDatetimeLocal(NOW + 960))).toBe(NOW + 960);
  });
});

// keep TS happy about unused type import in some editors
export type _T = FormState;
