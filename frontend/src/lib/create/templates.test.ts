import { describe, expect, it } from 'vitest';
import { memoryStorage } from './storage';
import {
  BUILT_IN_TEMPLATES,
  MAX_USER_TEMPLATES,
  TEMPLATES_KEY,
  deleteUserTemplate,
  findTemplate,
  isTemplate,
  loadUserTemplates,
  newTemplateId,
  renameUserTemplate,
  saveUserTemplate,
  type Template,
} from './templates';
import { resolveSchedule, validateSchedule } from './schedule';

const NOW = 1_800_000_000;

function user(over: Partial<Template> = {}): Template {
  return {
    id: 'u_abc123def456',
    name: 'Payroll',
    builtIn: false,
    schedule: { shape: 'recurring', startOffset: 900, periodSecs: 2_592_000, count: 12 },
    cancelable: true,
    transferable: false,
    createdAt: NOW,
    ...over,
  };
}

describe('built-in presets', () => {
  it('has the 7 presets in order, all valid in batch mode', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.id)).toEqual([
      'linear-1y', 'linear-1y-3m-cliff', 'linear-4y-1y-cliff-25',
      'recurring-monthly-12', 'recurring-weekly-52', 'recurring-daily-30', 'tranched-quarterly-4',
    ]);
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.builtIn).toBe(true);
      expect(t.cancelable && t.transferable).toBe(true);
      expect(t.token).toBeUndefined();
      expect(validateSchedule(resolveSchedule(t.schedule, NOW), NOW, 'batch')).toEqual([]);
    }
  });
  it('4y preset unlocks 25% at the 1-year cliff', () => {
    const t = BUILT_IN_TEMPLATES.find((x) => x.id === 'linear-4y-1y-cliff-25')!;
    expect(t.schedule).toEqual({ shape: 'linear', startOffset: 900, cliffOffset: 365 * 86_400, duration: 1460 * 86_400, unlockAtStartBps: 0, unlockAtCliffBps: 2500 });
  });
});

describe('loadUserTemplates', () => {
  it('returns [] for null storage, missing key, corrupt JSON, wrong version, non-array items', () => {
    expect(loadUserTemplates(null)).toEqual([]);
    const s = memoryStorage();
    expect(loadUserTemplates(s)).toEqual([]);
    s.setItem(TEMPLATES_KEY, '{not json');
    expect(loadUserTemplates(s)).toEqual([]);
    s.setItem(TEMPLATES_KEY, JSON.stringify({ version: 2, items: [user()] }));
    expect(loadUserTemplates(s)).toEqual([]);
    s.setItem(TEMPLATES_KEY, JSON.stringify({ version: 1, items: 'nope' }));
    expect(loadUserTemplates(s)).toEqual([]);
  });
  it('skips invalid items and built-ins, keeps valid ones', () => {
    const s = memoryStorage();
    const good = user();
    s.setItem(TEMPLATES_KEY, JSON.stringify({
      version: 1,
      items: [good, { id: 'x' }, user({ id: 'u_2', builtIn: true }), user({ id: 'u_3', schedule: { shape: 'linear' } as never }), 42],
    }));
    expect(loadUserTemplates(s)).toEqual([good]);
  });
});

describe('saveUserTemplate / rename / delete', () => {
  it('inserts, replaces by id, and enforces name + count limits', () => {
    const s = memoryStorage();
    expect(saveUserTemplate(s, user())).toEqual({ ok: true, template: user() });
    expect(saveUserTemplate(s, user({ name: 'Payroll v2' })).ok).toBe(true);
    expect(loadUserTemplates(s)).toEqual([user({ name: 'Payroll v2' })]);
    expect(saveUserTemplate(s, user({ id: 'u_x', name: '' }))).toEqual({ ok: false, reason: 'Template name is required.' });
    expect(saveUserTemplate(s, user({ id: 'u_x', name: 'x'.repeat(41) })).ok).toBe(false);
    for (let i = 1; i < MAX_USER_TEMPLATES; i++) expect(saveUserTemplate(s, user({ id: `u_${i}` })).ok).toBe(true);
    expect(saveUserTemplate(s, user({ id: 'u_overflow' }))).toEqual({ ok: false, reason: 'Template limit (50) reached — delete one first.' });
    // replacing an existing one still works at the limit
    expect(saveUserTemplate(s, user({ id: 'u_1', name: 'renamed' })).ok).toBe(true);
  });
  it('refuses to write built-ins and null storage', () => {
    const s = memoryStorage();
    expect(saveUserTemplate(s, { ...BUILT_IN_TEMPLATES[0] }).ok).toBe(false);
    expect(saveUserTemplate(null, user())).toEqual({ ok: false, reason: 'Storage is unavailable in this browser.' });
    expect(s.getItem(TEMPLATES_KEY)).toBeNull();
  });
  it('renames and deletes user templates only', () => {
    const s = memoryStorage();
    saveUserTemplate(s, user());
    expect(renameUserTemplate(s, 'u_abc123def456', 'Salaries').ok).toBe(true);
    expect(loadUserTemplates(s)[0].name).toBe('Salaries');
    expect(renameUserTemplate(s, 'missing', 'x')).toEqual({ ok: false, reason: 'Template not found.' });
    expect(deleteUserTemplate(s, 'linear-1y')).toBe(false);
    expect(deleteUserTemplate(s, 'u_abc123def456')).toBe(true);
    expect(loadUserTemplates(s)).toEqual([]);
  });
});

describe('helpers', () => {
  it('newTemplateId is u_ + 12 base36 chars and unique', () => {
    const a = newTemplateId();
    const b = newTemplateId();
    expect(a).toMatch(/^u_[a-z0-9]{12}$/);
    expect(a).not.toBe(b);
  });
  it('findTemplate searches built-ins then user templates', () => {
    expect(findTemplate([], 'linear-1y')?.builtIn).toBe(true);
    expect(findTemplate([user()], 'u_abc123def456')?.name).toBe('Payroll');
    expect(findTemplate([user()], 'nope')).toBeUndefined();
  });
  it('isTemplate validates every field', () => {
    expect(isTemplate(user())).toBe(true);
    expect(isTemplate(user({ token: 'C' + 'A'.repeat(55) }))).toBe(true);
    expect(isTemplate(user({ token: 'bad' as never }))).toBe(false);
    expect(isTemplate(user({ createdAt: 'x' as never }))).toBe(false);
    expect(isTemplate(user({ schedule: { shape: 'tranched', startOffset: 0, tranches: [{ offset: 1, bps: 'x' }] } as never }))).toBe(false);
  });
});
