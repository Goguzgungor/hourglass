//
// Built-in presets + user templates persisted in localStorage under
// `hourglass:templates:v1`. Built-ins are never written to storage.

import type { ScheduleTemplate } from './schedule';
import { readJson, writeJson, type StorageLike } from './storage';

export type Template = {
  id: string;
  name: string;
  builtIn: boolean;
  schedule: ScheduleTemplate;
  /** SAC contract id; undefined = keep the current token selection. */
  token?: string;
  cancelable: boolean;
  transferable: boolean;
  /** unix seconds; 0 for built-ins */
  createdAt: number;
};

export type SaveResult = { ok: true; template: Template } | { ok: false; reason: string };

export const TEMPLATES_KEY = 'hourglass:templates:v1';
export const TEMPLATES_VERSION = 1;
export const MAX_USER_TEMPLATES = 50;
export const MAX_TEMPLATE_NAME = 40;

const D = 86_400;
const START = 900;

function preset(id: string, name: string, schedule: ScheduleTemplate): Template {
  return { id, name, builtIn: true, schedule, cancelable: true, transferable: true, createdAt: 0 };
}

export const BUILT_IN_TEMPLATES: readonly Template[] = [
  preset('linear-1y', 'Linear · 1 year', {
    shape: 'linear', startOffset: START, cliffOffset: 0, duration: 365 * D, unlockAtStartBps: 0, unlockAtCliffBps: 0,
  }),
  preset('linear-1y-3m-cliff', '1 year · 3-month cliff', {
    shape: 'linear', startOffset: START, cliffOffset: 90 * D, duration: 365 * D, unlockAtStartBps: 0, unlockAtCliffBps: 0,
  }),
  preset('linear-4y-1y-cliff-25', '4 years · 1-year cliff · 25% at cliff', {
    shape: 'linear', startOffset: START, cliffOffset: 365 * D, duration: 1460 * D, unlockAtStartBps: 0, unlockAtCliffBps: 2500,
  }),
  preset('recurring-monthly-12', 'Monthly × 12', { shape: 'recurring', startOffset: START, periodSecs: 30 * D, count: 12 }),
  preset('recurring-weekly-52', 'Weekly × 52', { shape: 'recurring', startOffset: START, periodSecs: 7 * D, count: 52 }),
  preset('recurring-daily-30', 'Daily drip × 30', { shape: 'recurring', startOffset: START, periodSecs: D, count: 30 }),
  preset('tranched-quarterly-4', 'Quarterly tranches × 4', {
    shape: 'tranched',
    startOffset: START,
    tranches: [
      { offset: 90 * D, bps: 2500 },
      { offset: 180 * D, bps: 2500 },
      { offset: 270 * D, bps: 2500 },
      { offset: 360 * D, bps: 2500 },
    ],
  }),
];

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;

export function isScheduleTemplate(x: unknown): x is ScheduleTemplate {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (!isNum(o.startOffset)) return false;
  switch (o.shape) {
    case 'linear':
      return isNum(o.cliffOffset) && isNum(o.duration) && isNum(o.unlockAtStartBps) && isNum(o.unlockAtCliffBps);
    case 'tranched':
      return (
        Array.isArray(o.tranches) &&
        o.tranches.every((t) => t && typeof t === 'object' && isNum((t as { offset: unknown }).offset) && isNum((t as { bps: unknown }).bps))
      );
    case 'recurring':
      return isNum(o.periodSecs) && isNum(o.count);
    default:
      return false;
  }
}

export function isTemplate(x: unknown): x is Template {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    isStr(o.id) &&
    o.id.length > 0 &&
    isStr(o.name) &&
    typeof o.builtIn === 'boolean' &&
    isScheduleTemplate(o.schedule) &&
    (o.token === undefined || (isStr(o.token) && CONTRACT_ID_RE.test(o.token))) &&
    typeof o.cancelable === 'boolean' &&
    typeof o.transferable === 'boolean' &&
    isNum(o.createdAt)
  );
}

type Stored = { version: number; items: unknown };

export function loadUserTemplates(storage: StorageLike | null): Template[] {
  const data = readJson<Stored>(storage, TEMPLATES_KEY);
  if (!data || data.version !== TEMPLATES_VERSION || !Array.isArray(data.items)) return [];
  return data.items.filter((i): i is Template => isTemplate(i) && !i.builtIn);
}

function persist(storage: StorageLike, items: Template[]): boolean {
  return writeJson(storage, TEMPLATES_KEY, { version: TEMPLATES_VERSION, items });
}

export function saveUserTemplate(storage: StorageLike | null, t: Template): SaveResult {
  if (!storage) return { ok: false, reason: 'Storage is unavailable in this browser.' };
  if (t.builtIn) return { ok: false, reason: 'Built-in presets cannot be modified.' };
  const name = t.name.trim();
  if (!name) return { ok: false, reason: 'Template name is required.' };
  if (name.length > MAX_TEMPLATE_NAME) return { ok: false, reason: `Template name must be at most ${MAX_TEMPLATE_NAME} characters.` };
  const items = loadUserTemplates(storage);
  const idx = items.findIndex((x) => x.id === t.id);
  if (idx === -1 && items.length >= MAX_USER_TEMPLATES) {
    return { ok: false, reason: `Template limit (${MAX_USER_TEMPLATES}) reached — delete one first.` };
  }
  const saved: Template = { ...t, name, builtIn: false };
  if (idx === -1) items.push(saved);
  else items[idx] = saved;
  if (!persist(storage, items)) return { ok: false, reason: 'Could not write to storage.' };
  return { ok: true, template: saved };
}

export function renameUserTemplate(storage: StorageLike | null, id: string, name: string): SaveResult {
  const existing = loadUserTemplates(storage).find((x) => x.id === id);
  if (!existing) return { ok: false, reason: 'Template not found.' };
  return saveUserTemplate(storage, { ...existing, name });
}

export function deleteUserTemplate(storage: StorageLike | null, id: string): boolean {
  if (!storage) return false;
  const items = loadUserTemplates(storage);
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return false;
  return persist(storage, next);
}

export function newTemplateId(): string {
  let s = '';
  while (s.length < 12) s += Math.random().toString(36).slice(2);
  return `u_${s.slice(0, 12)}`;
}

export function findTemplate(user: readonly Template[], id: string): Template | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? user.find((t) => t.id === id);
}
