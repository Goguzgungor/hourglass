# Create Flow v2 (Shapes, Batch, Templates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the linear-only `/create` page into one form that creates Linear, Tranched and Recurring streams for a single recipient or a CSV-imported list of recipients (chunked, resumable `create_batch` signing), with built-in schedule presets and localStorage templates.

**Architecture:** All business rules live in pure modules under `frontend/src/lib/create/` (schedule math, templates, row parsing/validation, batch planning + reducer, runner, error classification, form reducer), each unit-tested with vitest in the node environment. Effectful glue (`submit.ts`, `balance.ts`, `storage.ts`, two hooks) takes its clients as parameters. React components under `frontend/src/components/create/` render state and dispatch actions; `app/create/page.tsx` becomes a thin composition.

**Tech Stack:** Next.js 16 (app router, client components), React 19, TypeScript, Tailwind v4 with the existing custom design tokens, `@stellar/stellar-sdk` 15 contract client via the generated `hourglass` bindings, stellar-wallets-kit (Freighter), vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-15-create-flow-batch-templates-design.md`

## Global Constraints

- Branch `feat/create-flow-v2` (already created from `main` @ `1accac6`; spec committed as `35d7493`). Commit after every task with the trailers `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01WH2kMjAMbi5EMFENHLWZVx`.
- All commands run from `frontend/` unless stated. Tests: `npm test` (vitest, node env, `src/**/*.test.ts` only). Types: `npm run typecheck` (`tsc --noEmit`) must stay green after every task.
- Pure modules (`schedule`, `templates`, `rows`, `errors`, `batchPlan`, `runner`, `formState`) must not import React, `fetch`, `window`, or `Date.now()`; `now` is always a parameter.
- Amounts are `bigint` stroops (7 decimals) via `parseXlmToStroops` / `formatStroops` from `@/lib/format`; never `Number` for money. JSON-persisted amounts are decimal strings.
- Contract limits (verbatim from the spec): `DEFAULT_CHUNK_ROWS = 20`, `MAX_ROWS_PER_RUN = 500`, `CONTRACT_MAX_BATCH_ROWS = 100`, `MAX_TRANCHES = 100`, `MIN_PERIOD_SECS = 60`, `MAX_RECURRING_COUNT = 1000`, single-mode start margin `120` s, batch-mode start margin `900` s, basis-point denominator `10000`, fee reserve warning below `50_000_000n` stroops (5 XLM).
- Storage keys: templates `hourglass:templates:v1` (`{ version: 1, items: Template[] }`, max 50 user templates, name ≤ 40 chars); batch run `hourglass:batchRun:v1` (sessionStorage).
- UI copy is English (as the rest of the app). Existing design classes: `eyebrow`, `headline`, `headline-roman`, colors `sand`, `sand-bright`, `cream`, `cream-dim`, `cream-muted`, `stroke`, `stroke-2`, `night`, `midnight`, `teal`, `violet`, `rose`, `warning`, `danger`, `success`.
- Generated binding types (`hourglass/lockup`): `u32` = `number`, `u64` = `bigint`, `i128` = `bigint`; `CreateSpec` is `{ tag: 'Linear', values: readonly [LinearParams] } | { tag: 'Tranched', values: readonly [TranchedParams] } | { tag: 'Recurring', values: readonly [RecurringParams] }`.
- Never dispatch React state updates from the runner directly; the runner's `dispatch` must update a ref synchronously so `getRun()` reflects it immediately (Task 13).
- Do not touch `frontend/src/app/dashboard/**`, `frontend/src/app/api/**`, `frontend/src/lib/indexer/**` (sub-project 3b / done).

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `frontend/src/lib/create/schedule.ts` (+ test) | shape/schedule types, template ↔ absolute conversion, shifting, validation, `buildSpec` | 1 |
| `frontend/src/lib/create/storage.ts` | `StorageLike`, safe local/session adapters, JSON read/write, in-memory fake | 2 |
| `frontend/src/lib/create/templates.ts` (+ test) | built-in presets, user templates CRUD on `StorageLike` | 2 |
| `frontend/src/lib/create/rows.ts` (+ test) | CSV/paste parsing, row validation, summary | 3 |
| `frontend/src/lib/create/errors.ts` (+ test) | contract error table, `classifyTxError` | 4 |
| `frontend/src/lib/create/batchPlan.ts` (+ test) | run/chunk types, `planRun`, `runReducer`, `nextChunk`, `runProgress`, `loadStoredRun` | 5 |
| `frontend/src/lib/create/runner.ts` (+ test) | `runBatch` loop with injected deps | 6 |
| `frontend/src/lib/sdk.ts` | + `create_tranched`, `create_recurring`, `create_batch`, type re-exports | 7 |
| `frontend/src/lib/deployments.ts` | + `horizonUrl` | 7 |
| `frontend/src/lib/explorer.ts` | explorer URL helpers (tx / account) | 7 |
| `frontend/src/lib/create/submit.ts` (+ test) | `toCreateRow`, `submitSingle`, `prepareBatch`, `sendPrepared`, `txHashOf` | 7 |
| `frontend/src/lib/create/balance.ts` (+ test) | Horizon balance lookup | 7 |
| `frontend/src/lib/create/formState.ts` (+ test) | `FormState`, `formReducer`, `initialFormState`, `parseForm` | 8 |
| `frontend/src/components/ConfirmDialog.tsx` | shared modal (extracted from stream page) | 9 |
| `frontend/src/app/stream/[id]/page.tsx` | use `ConfirmDialog`, delete local `Modal` | 9 |
| `frontend/src/components/create/fields.tsx` | `bareInputClass`, `Field`, `AmountInput`, `PctInput`, `ToggleRow`, `SubmittingDots`, `NoDeploymentWarning`, `CopyButton` | 10 |
| `frontend/src/components/create/TokenPicker.tsx` | moved from page (verbatim) | 10 |
| `frontend/src/lib/create/useTemplates.ts` | hook over `templates.ts` | 10 |
| `frontend/src/components/create/TemplateBar.tsx`, `ShapeTabs.tsx`, `ScheduleFields.tsx` | template + schedule UI | 10 |
| `frontend/src/components/create/RecipientsSection.tsx`, `BatchTable.tsx`, `CsvImport.tsx` | recipients UI | 11 |
| `frontend/src/components/CreatePreview.tsx` | all three shapes, batch totals | 12 |
| `frontend/src/lib/create/useBatchRunner.ts` | hook: run state (ref + state), persistence, runner wiring | 13 |
| `frontend/src/components/create/BatchProgress.tsx`, `CreateResult.tsx`, `ResumeBanner.tsx` | batch execution UI | 13 |
| `frontend/src/app/create/page.tsx` | thin composition | 14 |
| `frontend/src/lib/create/errors.test.ts`, `docs/evidence/2026-09-create-flow-testnet.md`, `frontend/README.md`, `README.md` | real error vectors, evidence, docs | 15 |

---

### Task 1: Schedule model, validation and spec building

**Files:**
- Create: `frontend/src/lib/create/schedule.ts`
- Test: `frontend/src/lib/create/schedule.test.ts`

**Interfaces:**
- Consumes: `CreateSpec` type from `hourglass/lockup` (type-only import; erased at runtime so vitest never loads the SDK).
- Produces (used by Tasks 2, 3, 5, 7, 8, 12): `Shape`, `Mode`, `ScheduleTemplate`, `Schedule`, `ScheduleError`, `BuiltSpec`, constants `BPS_DENOM`, `SINGLE_START_MARGIN_SECS`, `BATCH_START_MARGIN_SECS`, `MAX_TRANCHES`, `MIN_PERIOD_SECS`, `MAX_RECURRING_COUNT`; functions `startMargin(mode)`, `resolveSchedule(t, nowSec)`, `deriveTemplate(s, nowSec)`, `scheduleStart(s)`, `scheduleEnd(s)`, `shiftSchedule(s, seconds)`, `clampScheduleStart(s, nowSec, mode)`, `alignToMinute(s)`, `validateSchedule(s, nowSec, mode)`, `buildSpec(s, total)`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/create/schedule.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/create/schedule.test.ts 2>&1 | tail -15`
Expected: FAIL — `Cannot find module './schedule'`.

- [ ] **Step 3: Implement `schedule.ts`**

```ts
// frontend/src/lib/create/schedule.ts
//
// Pure schedule model for the create flow. A `ScheduleTemplate` is relative
// (seconds from "now" / from start, percentages in basis points) and is what
// templates persist; a `Schedule` is absolute (unix seconds) and is what the
// form holds. `buildSpec` turns a schedule + total amount into the contract's
// `CreateSpec`. No React, no clocks: `now` is always a parameter.

import type { CreateSpec } from 'hourglass/lockup';

export type Shape = 'linear' | 'tranched' | 'recurring';
export type Mode = 'single' | 'batch';

export const BPS_DENOM = 10_000;
export const SINGLE_START_MARGIN_SECS = 120;
export const BATCH_START_MARGIN_SECS = 900;
export const MAX_TRANCHES = 100;
export const MIN_PERIOD_SECS = 60;
export const MAX_RECURRING_COUNT = 1000;

export type ScheduleTemplate =
  | {
      shape: 'linear';
      startOffset: number;
      cliffOffset: number;
      duration: number;
      unlockAtStartBps: number;
      unlockAtCliffBps: number;
    }
  | { shape: 'tranched'; startOffset: number; tranches: Array<{ offset: number; bps: number }> }
  | { shape: 'recurring'; startOffset: number; periodSecs: number; count: number };

export type Schedule =
  | {
      shape: 'linear';
      startTs: number;
      cliffTs: number;
      endTs: number;
      unlockAtStartBps: number;
      unlockAtCliffBps: number;
    }
  | { shape: 'tranched'; startTs: number; tranches: Array<{ ts: number; bps: number }> }
  | { shape: 'recurring'; firstTs: number; periodSecs: number; count: number };

export type ScheduleError = { field: string; message: string };

export type BuiltSpec = {
  spec: CreateSpec;
  /** Amount actually deposited on-chain (≤ the requested total). */
  deposited: bigint;
  /** `deposited − total`; 0 or negative (recurring rounding). */
  adjustment: bigint;
};

export function startMargin(mode: Mode): number {
  return mode === 'batch' ? BATCH_START_MARGIN_SECS : SINGLE_START_MARGIN_SECS;
}

export function resolveSchedule(t: ScheduleTemplate, nowSec: number): Schedule {
  const start = nowSec + t.startOffset;
  switch (t.shape) {
    case 'linear':
      return {
        shape: 'linear',
        startTs: start,
        cliffTs: start + t.cliffOffset,
        endTs: start + t.duration,
        unlockAtStartBps: t.unlockAtStartBps,
        unlockAtCliffBps: t.unlockAtCliffBps,
      };
    case 'tranched':
      return {
        shape: 'tranched',
        startTs: start,
        tranches: t.tranches.map((x) => ({ ts: start + x.offset, bps: x.bps })),
      };
    case 'recurring':
      return { shape: 'recurring', firstTs: start, periodSecs: t.periodSecs, count: t.count };
  }
}

export function scheduleStart(s: Schedule): number {
  return s.shape === 'recurring' ? s.firstTs : s.startTs;
}

export function scheduleEnd(s: Schedule): number {
  switch (s.shape) {
    case 'linear':
      return s.endTs;
    case 'tranched':
      return s.tranches.length ? s.tranches[s.tranches.length - 1].ts : s.startTs;
    case 'recurring':
      return s.firstTs + s.periodSecs * (s.count - 1);
  }
}

export function deriveTemplate(s: Schedule, nowSec: number): ScheduleTemplate {
  const startOffset = Math.max(0, scheduleStart(s) - nowSec);
  switch (s.shape) {
    case 'linear':
      return {
        shape: 'linear',
        startOffset,
        cliffOffset: s.cliffTs - s.startTs,
        duration: s.endTs - s.startTs,
        unlockAtStartBps: s.unlockAtStartBps,
        unlockAtCliffBps: s.unlockAtCliffBps,
      };
    case 'tranched':
      return {
        shape: 'tranched',
        startOffset,
        tranches: s.tranches.map((t) => ({ offset: t.ts - s.startTs, bps: t.bps })),
      };
    case 'recurring':
      return { shape: 'recurring', startOffset, periodSecs: s.periodSecs, count: s.count };
  }
}

export function shiftSchedule(s: Schedule, seconds: number): Schedule {
  switch (s.shape) {
    case 'linear':
      return { ...s, startTs: s.startTs + seconds, cliffTs: s.cliffTs + seconds, endTs: s.endTs + seconds };
    case 'tranched':
      return { ...s, startTs: s.startTs + seconds, tranches: s.tranches.map((t) => ({ ...t, ts: t.ts + seconds })) };
    case 'recurring':
      return { ...s, firstTs: s.firstTs + seconds };
  }
}

/** Shift the whole schedule forward so that start ≥ now + margin(mode). */
export function clampScheduleStart(s: Schedule, nowSec: number, mode: Mode): Schedule {
  const min = nowSec + startMargin(mode);
  const start = scheduleStart(s);
  return start >= min ? s : shiftSchedule(s, min - start);
}

/** Shift so the start lands on a whole minute (datetime-local inputs have minute resolution). */
export function alignToMinute(s: Schedule): Schedule {
  const start = scheduleStart(s);
  const aligned = Math.ceil(start / 60) * 60;
  return aligned === start ? s : shiftSchedule(s, aligned - start);
}

export function validateSchedule(s: Schedule, nowSec: number, mode: Mode): ScheduleError[] {
  const errors: ScheduleError[] = [];
  const start = scheduleStart(s);
  if (!Number.isFinite(start) || start < nowSec + startMargin(mode)) {
    errors.push({
      field: 'start',
      message: 'Start must be at least 2 minutes (15 minutes for batches) from now — transactions take time to sign.',
    });
  }
  switch (s.shape) {
    case 'linear':
      if (!(s.startTs < s.endTs)) errors.push({ field: 'end', message: 'End must be strictly after start.' });
      if (s.cliffTs < s.startTs || s.cliffTs > s.endTs) {
        errors.push({ field: 'cliff', message: 'Cliff must be between start and end (inclusive).' });
      }
      if (s.unlockAtStartBps < 0 || s.unlockAtCliffBps < 0 || s.unlockAtStartBps + s.unlockAtCliffBps > BPS_DENOM) {
        errors.push({ field: 'unlocks', message: 'Unlocks (start + cliff) cannot exceed 100%.' });
      }
      break;
    case 'tranched': {
      if (s.tranches.length === 0) errors.push({ field: 'tranches', message: 'Add at least one tranche.' });
      if (s.tranches.length > MAX_TRANCHES) {
        errors.push({ field: 'tranches', message: `At most ${MAX_TRANCHES} tranches.` });
      }
      for (let i = 1; i < s.tranches.length; i++) {
        if (s.tranches[i].ts <= s.tranches[i - 1].ts) {
          errors.push({ field: 'tranches', message: 'Tranche times must be strictly increasing.' });
          break;
        }
      }
      if (s.tranches.some((t) => t.ts < s.startTs)) {
        errors.push({ field: 'tranches', message: 'Tranche times cannot be before start.' });
      }
      const sum = s.tranches.reduce((a, t) => a + t.bps, 0);
      if (s.tranches.length > 0 && (sum !== BPS_DENOM || s.tranches.some((t) => t.bps <= 0))) {
        errors.push({ field: 'tranches', message: 'Tranche percentages must add up to 100%.' });
      }
      break;
    }
    case 'recurring':
      if (!Number.isInteger(s.periodSecs) || s.periodSecs < MIN_PERIOD_SECS) {
        errors.push({ field: 'period', message: 'Period must be at least 1 minute.' });
      }
      if (!Number.isInteger(s.count) || s.count < 1 || s.count > MAX_RECURRING_COUNT) {
        errors.push({ field: 'count', message: `Count must be between 1 and ${MAX_RECURRING_COUNT}.` });
      }
      break;
  }
  return errors;
}

function bpsOf(total: bigint, bps: number): bigint {
  return (total * BigInt(bps)) / BigInt(BPS_DENOM);
}

/**
 * Build the contract `CreateSpec` for one recipient receiving `total` stroops.
 * Throws `RangeError` when any on-chain amount would be ≤ 0.
 */
export function buildSpec(s: Schedule, total: bigint): BuiltSpec {
  if (total <= 0n) throw new RangeError('Amount must be positive.');
  switch (s.shape) {
    case 'linear':
      return {
        deposited: total,
        adjustment: 0n,
        spec: {
          tag: 'Linear',
          values: [
            {
              start_ts: BigInt(s.startTs),
              cliff_ts: BigInt(s.cliffTs),
              end_ts: BigInt(s.endTs),
              deposited: total,
              unlock_at_start: bpsOf(total, s.unlockAtStartBps),
              unlock_at_cliff: bpsOf(total, s.unlockAtCliffBps),
            },
          ],
        },
      };
    case 'tranched': {
      if (s.tranches.length === 0) throw new RangeError('Add at least one tranche.');
      const amounts: bigint[] = [];
      let used = 0n;
      for (let i = 0; i < s.tranches.length; i++) {
        const last = i === s.tranches.length - 1;
        const amt = last ? total - used : bpsOf(total, s.tranches[i].bps);
        if (amt <= 0n) {
          throw new RangeError(`Amount too small for this schedule — ${s.tranches.length} tranches`);
        }
        amounts.push(amt);
        used += amt;
      }
      return {
        deposited: total,
        adjustment: 0n,
        spec: {
          tag: 'Tranched',
          values: [{ tranches: s.tranches.map((t, i) => ({ amount: amounts[i], ts: BigInt(t.ts) })) }],
        },
      };
    }
    case 'recurring': {
      const count = BigInt(s.count);
      const per = total / count;
      if (per <= 0n) throw new RangeError(`Amount too small for this schedule — ${s.count} periods`);
      const deposited = per * count;
      return {
        deposited,
        adjustment: deposited - total,
        spec: {
          tag: 'Recurring',
          values: [
            {
              amount_per_period: per,
              period_secs: BigInt(s.periodSecs),
              count: s.count,
              first_ts: BigInt(s.firstTs),
            },
          ],
        },
      };
    }
  }
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd frontend && npx vitest run src/lib/create/schedule.test.ts 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3`
Expected: all schedule tests PASS; typecheck clean. (If `hourglass/lockup` type import fails to resolve, confirm `sdk/dist/lockup.d.ts` exists; run `cd ../sdk && npm run build` once.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/create/schedule.ts frontend/src/lib/create/schedule.test.ts
git commit -m "feat(create): schedule model — template/absolute conversion, validation, buildSpec"
```

---

### Task 2: Storage adapter and templates

**Files:**
- Create: `frontend/src/lib/create/storage.ts`
- Create: `frontend/src/lib/create/templates.ts`
- Test: `frontend/src/lib/create/templates.test.ts`

**Interfaces:**
- Consumes: `ScheduleTemplate` (Task 1).
- Produces: `StorageLike`, `safeStorage(kind)`, `readJson`, `writeJson`, `memoryStorage()`; `Template`, `TEMPLATES_KEY`, `MAX_USER_TEMPLATES`, `MAX_TEMPLATE_NAME`, `BUILT_IN_TEMPLATES`, `isTemplate`, `loadUserTemplates(storage)`, `saveUserTemplate(storage, t)`, `renameUserTemplate(storage, id, name)`, `deleteUserTemplate(storage, id)`, `newTemplateId()`, `findTemplate(user, id)`, `SaveResult`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/create/templates.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/create/templates.test.ts 2>&1 | tail -6`
Expected: FAIL — cannot find module `./storage` / `./templates`.

- [ ] **Step 3: Implement `storage.ts`**

```ts
// frontend/src/lib/create/storage.ts
//
// Minimal storage abstraction so pure modules can be tested with an in-memory
// store, and so a browser with blocked storage (private mode, quota) degrades
// to "read-only presets" instead of throwing into the UI.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Returns the browser storage if it is usable, else `null`. Never throws. */
export function safeStorage(kind: 'local' | 'session'): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__hourglass_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readJson<T>(storage: StorageLike | null, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}
```

- [ ] **Step 4: Implement `templates.ts`**

```ts
// frontend/src/lib/create/templates.ts
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
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd frontend && npx vitest run src/lib/create/templates.test.ts 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/create/storage.ts frontend/src/lib/create/templates.ts frontend/src/lib/create/templates.test.ts
git commit -m "feat(create): built-in presets and localStorage user templates"
```

---

### Task 3: Batch rows — parsing, validation, summary

**Files:**
- Create: `frontend/src/lib/create/rows.ts`
- Test: `frontend/src/lib/create/rows.test.ts`

**Interfaces:**
- Consumes: `isStellarAddress`, `parseXlmToStroops`, `formatStroops` (`@/lib/format`); `Schedule`, `BuiltSpec`, `buildSpec` (Task 1).
- Produces: `MAX_ROWS_PER_RUN = 500`, `RowInput`, `RowIssue`, `RowIssueCode`, `ValidatedRow`, `Skipped`, `parseRows(text, startId, existingCount?)`, `validateRows(rows, ctx)`, `rowsSummary(rows)`, `hasRowErrors(rows)`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/create/rows.test.ts
import { describe, expect, it } from 'vitest';
import { MAX_ROWS_PER_RUN, hasRowErrors, parseRows, rowsSummary, validateRows, type RowInput } from './rows';
import type { Schedule } from './schedule';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const G2 = 'GAWIFBYR7ATAATABJT5XT5PI3PQAUK4ZZF4EODQCWKINA3PTV43NWWAA';
const G3 = 'GAFD2RMEQCGQ2BRXPFVECOUT3AT7UIZWPMSJRZFFHH5CI2TTTGKAQNNQ';
const NOW = 1_800_000_000;
const recurring: Schedule = { shape: 'recurring', firstTs: NOW + 900, periodSecs: 86_400, count: 12 };
const linear: Schedule = { shape: 'linear', startTs: NOW + 900, cliffTs: NOW + 900, endTs: NOW + 90_000, unlockAtStartBps: 0, unlockAtCliffBps: 0 };

describe('parseRows', () => {
  it('accepts comma, semicolon, tab and whitespace separators and strips quotes', () => {
    const text = [`${G1},10`, `${G2};2.5`, `${G3}\t3`, `"${G1}"   4`].join('\n');
    const { rows, skipped } = parseRows(text, 1);
    expect(skipped).toEqual([]);
    expect(rows.map((r) => [r.id, r.recipient, r.amount, r.source, r.line])).toEqual([
      ['r1', G1, '10', 'import', 1],
      ['r2', G2, '2.5', 'import', 2],
      ['r3', G3, '3', 'import', 3],
      ['r4', G1, '4', 'import', 4],
    ]);
  });
  it('skips a header line, comments, blanks, and lines without an amount; ignores extra columns', () => {
    const text = `recipient,amount,name\r\n\r\n# payroll\n${G1},10,Alice\n${G2}\n${G3},,Bob\n`;
    const { rows, skipped } = parseRows(text, 5);
    expect(rows.map((r) => [r.id, r.recipient, r.amount])).toEqual([['r5', G1, '10']]);
    expect(skipped).toEqual([
      { line: 1, reason: 'header' },
      { line: 5, reason: 'missing_amount' },
      { line: 6, reason: 'missing_amount' },
    ]);
  });
  it('keeps a bad address on a non-first line as a row (validation flags it later)', () => {
    const { rows } = parseRows(`${G1},1\nnot-an-address,2`, 1);
    expect(rows).toHaveLength(2);
  });
  it('stops at the run limit and reports the remainder', () => {
    const lines = Array.from({ length: 12 }, () => `${G1},1`).join('\n');
    const { rows, skipped } = parseRows(lines, 1, MAX_ROWS_PER_RUN - 10);
    expect(rows).toHaveLength(10);
    expect(skipped).toEqual([{ line: 11, reason: 'limit' }, { line: 12, reason: 'limit' }]);
  });
});

describe('validateRows', () => {
  const row = (id: string, recipient: string, amount: string): RowInput => ({ id, recipient, amount, source: 'manual' });
  it('flags invalid addresses and amounts', () => {
    const out = validateRows(
      [row('a', 'bad', '1'), row('b', G1, 'abc'), row('c', G1, '0'), row('d', G1, '-1'), row('e', G1, '1,000'), row('f', G1, '1.12345678')],
      { sender: null, schedule: linear },
    );
    expect(out.map((r) => r.issues.map((i) => i.code))).toEqual([
      ['invalid_address'], ['invalid_amount'], ['amount_not_positive'], ['amount_not_positive'], ['invalid_amount'], ['invalid_amount'],
    ]);
    expect(out[0].total).toBe(1_0000000n);
    expect(out[0].built).toBeDefined();
    expect(out[1].total).toBeUndefined();
  });
  it('warns on duplicates and self-streams, infos on rounding, errors when too small', () => {
    const out = validateRows(
      // 120 and 12 XLM divide evenly by count=12, so no rounding info on a/b
      [row('a', G1, '120'), row('b', G1, '12'), row('c', G2, '0.0000025'), row('d', G3, '0.0000005')],
      { sender: G1, schedule: recurring },
    );
    expect(out[0].issues.map((i) => [i.level, i.code])).toEqual([[ 'warning', 'duplicate_recipient'], ['warning', 'self_recipient']]);
    expect(out[1].issues.map((i) => i.code)).toEqual(['duplicate_recipient', 'self_recipient']);
    expect(out[2].issues.map((i) => [i.level, i.code])).toEqual([['info', 'rounding_adjusted']]);
    expect(out[2].built?.adjustment).toBe(-1n); // 25 stroops → 2 per period × 12 = 24
    expect(out[3].issues.map((i) => [i.level, i.code])).toEqual([['error', 'amount_too_small']]);
    expect(out[3].built).toBeUndefined();
  });
  it('skips spec building when the schedule is null', () => {
    const out = validateRows([row('a', G1, '1')], { sender: null, schedule: null });
    expect(out[0].issues).toEqual([]);
    expect(out[0].total).toBe(1_0000000n);
    expect(out[0].built).toBeUndefined();
  });
});

describe('rowsSummary / hasRowErrors', () => {
  it('totals deposited amounts and adjustments', () => {
    const rows = validateRows(
      [
        { id: 'a', recipient: G1, amount: '120', source: 'manual' },
        { id: 'b', recipient: G2, amount: '0.0000025', source: 'manual' },
        { id: 'c', recipient: 'bad', amount: '1', source: 'manual' },
        { id: 'd', recipient: G3, amount: '12', source: 'manual' },
      ],
      { sender: G3, schedule: recurring },
    );
    const s = rowsSummary(rows);
    expect(s.count).toBe(4);
    expect(s.valid).toBe(3);
    expect(s.errors).toBe(1);
    expect(s.warnings).toBe(1);
    expect(s.total).toBe(1_200_000_000n + 24n + 120_000_000n); // b: 25 stroops deposited as 24 (12 × 2)
    expect(s.adjustment).toBe(-1n);
    expect(hasRowErrors(rows)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/create/rows.test.ts 2>&1 | tail -6`
Expected: FAIL — cannot find module `./rows`.

- [ ] **Step 3: Implement `rows.ts`**

```ts
// frontend/src/lib/create/rows.ts
//
// Batch recipient rows: parsing pasted/uploaded text into rows, validating
// rows against the current schedule, and summarising them for the UI.

import { formatStroops, isStellarAddress, parseXlmToStroops } from '@/lib/format';
import { buildSpec, type BuiltSpec, type Schedule } from './schedule';

export const MAX_ROWS_PER_RUN = 500;

export type RowInput = {
  id: string;
  recipient: string;
  amount: string;
  source: 'manual' | 'import';
  /** 1-based line number in the imported text (import rows only). */
  line?: number;
};

export type RowIssueCode =
  | 'invalid_address'
  | 'invalid_amount'
  | 'amount_not_positive'
  | 'amount_too_small'
  | 'duplicate_recipient'
  | 'self_recipient'
  | 'rounding_adjusted';

export type RowIssue = { level: 'error' | 'warning' | 'info'; code: RowIssueCode; message: string };

export type ValidatedRow = RowInput & {
  issues: RowIssue[];
  /** Parsed requested amount in stroops (when parseable and > 0). */
  total?: bigint;
  /** Built spec for the current schedule (when the schedule is valid and the amount fits). */
  built?: BuiltSpec;
};

export type Skipped = { line: number; reason: 'header' | 'missing_amount' | 'limit' };

function splitFields(line: string): string[] {
  let parts: string[];
  if (line.includes(',')) parts = line.split(',');
  else if (line.includes(';')) parts = line.split(';');
  else if (line.includes('\t')) parts = line.split('\t');
  else parts = line.split(/\s+/);
  return parts.map((p) => p.trim().replace(/^"(.*)"$/, '$1').trim());
}

/**
 * Parse `recipient, amount` lines. Ids are `r<startId>`, `r<startId+1>`, …
 * `existingCount` is the number of rows already in the table (for the cap).
 */
export function parseRows(
  text: string,
  startId: number,
  existingCount = 0,
): { rows: RowInput[]; skipped: Skipped[] } {
  const rows: RowInput[] = [];
  const skipped: Skipped[] = [];
  const lines = text.split(/\r\n|\n/);
  let nextId = startId;
  let firstKept = true;
  let total = existingCount;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const fields = splitFields(line);
    if (firstKept) {
      firstKept = false;
      if (!isStellarAddress(fields[0] ?? '')) {
        skipped.push({ line: lineNo, reason: 'header' });
        continue;
      }
    }
    if (fields.length < 2 || fields[1] === '') {
      skipped.push({ line: lineNo, reason: 'missing_amount' });
      continue;
    }
    if (total >= MAX_ROWS_PER_RUN) {
      skipped.push({ line: lineNo, reason: 'limit' });
      continue;
    }
    rows.push({ id: `r${nextId++}`, recipient: fields[0], amount: fields[1], source: 'import', line: lineNo });
    total++;
  }
  return { rows, skipped };
}

const err = (code: RowIssueCode, message: string): RowIssue => ({ level: 'error', code, message });
const warn = (code: RowIssueCode, message: string): RowIssue => ({ level: 'warning', code, message });

export function validateRows(
  rows: RowInput[],
  ctx: { sender: string | null; schedule: Schedule | null },
): ValidatedRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = r.recipient.trim();
    if (isStellarAddress(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    const issues: RowIssue[] = [];
    const recipient = r.recipient.trim();
    const amountStr = r.amount.trim();
    let total: bigint | undefined;
    let built: BuiltSpec | undefined;

    if (!isStellarAddress(recipient)) issues.push(err('invalid_address', 'Not a valid G… Stellar address.'));

    if (/\.\d{8,}/.test(amountStr)) {
      issues.push(err('invalid_amount', 'Not a valid amount (use up to 7 decimals, no separators).'));
    } else {
      try {
        const parsed = parseXlmToStroops(amountStr);
        if (parsed <= 0n) issues.push(err('amount_not_positive', 'Amount must be greater than 0.'));
        else total = parsed;
      } catch {
        issues.push(err('invalid_amount', 'Not a valid amount (use up to 7 decimals, no separators).'));
      }
    }

    if (total !== undefined && ctx.schedule) {
      try {
        built = buildSpec(ctx.schedule, total);
        if (built.adjustment < 0n) {
          issues.push({
            level: 'info',
            code: 'rounding_adjusted',
            message: `Adjusted ${formatStroops(built.adjustment)} to fit equal periods.`,
          });
        }
      } catch (e) {
        issues.push(err('amount_too_small', (e as Error).message));
        built = undefined;
      }
    }

    if (isStellarAddress(recipient) && (counts.get(recipient) ?? 0) > 1) {
      issues.push(warn('duplicate_recipient', 'This recipient appears more than once.'));
    }
    if (ctx.sender && recipient === ctx.sender) {
      issues.push(warn('self_recipient', 'You are streaming to yourself.'));
    }
    return { ...r, issues, total, built };
  });
}

export function hasRowErrors(rows: ValidatedRow[]): boolean {
  return rows.some((r) => r.issues.some((i) => i.level === 'error'));
}

export function rowsSummary(rows: ValidatedRow[]): {
  count: number;
  valid: number;
  errors: number;
  warnings: number;
  total: bigint;
  adjustment: bigint;
} {
  let valid = 0;
  let errors = 0;
  let warnings = 0;
  let total = 0n;
  let adjustment = 0n;
  for (const r of rows) {
    const hasErr = r.issues.some((i) => i.level === 'error');
    if (hasErr) errors++;
    else valid++;
    if (r.issues.some((i) => i.level === 'warning')) warnings++;
    if (r.built) {
      total += r.built.deposited;
      adjustment += r.built.adjustment;
    } else if (!hasErr && r.total !== undefined) {
      total += r.total;
    }
  }
  return { count: rows.length, valid, errors, warnings, total, adjustment };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd frontend && npx vitest run src/lib/create/rows.test.ts 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/create/rows.ts frontend/src/lib/create/rows.test.ts
git commit -m "feat(create): batch row parsing (CSV/paste), validation and summary"
```

---

### Task 4: Transaction error classification

**Files:**
- Create: `frontend/src/lib/create/errors.ts`
- Test: `frontend/src/lib/create/errors.test.ts`

**Interfaces:**
- Produces: `ClassifiedError`, `CONTRACT_ERRORS`, `classifyTxError(e)`, `describeError(err)`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/create/errors.test.ts
import { describe, expect, it } from 'vitest';
import { CONTRACT_ERRORS, classifyTxError, describeError } from './errors';

// Real strings are appended in Task 15 (captured on testnet); these mirror the
// stellar-sdk contract client's known message shapes.
describe('classifyTxError', () => {
  it('extracts contract error codes from simulation failures', () => {
    const e = new Error('Transaction simulation failed: "HostError: Error(Contract, #18)\n\nEvent log (newest first): ..."');
    expect(classifyTxError(e)).toEqual({ kind: 'contract', code: 18, name: 'StartInPast', message: CONTRACT_ERRORS[18].message });
    expect(classifyTxError(new Error('Error(Contract, #20)'))).toMatchObject({ kind: 'contract', code: 20, name: 'BatchTooLarge' });
    expect(classifyTxError(new Error('Error(Contract, #999)'))).toMatchObject({ kind: 'contract', code: 999, name: 'Unknown', message: 'Contract error #999 (Unknown)' });
  });
  it('detects a rejected signature', () => {
    for (const m of ['User rejected the request', 'Transaction rejected by user', 'User declined access', 'cancelled by user']) {
      expect(classifyTxError(new Error(m)).kind).toBe('rejected');
    }
  });
  it('detects resource / size failures from simulation and send', () => {
    expect(classifyTxError(new Error('Transaction simulation failed: "HostError: Error(Budget, ExceededLimit)"')).kind).toBe('resource');
    expect(classifyTxError(new Error('Sending the transaction to the network failed!\n{"status":"ERROR","errorResult":{"_switch":{"name":"txSorobanInvalid","value":-16}}}')).kind).toBe('resource');
    expect(classifyTxError(new Error('transaction submission failed: TxSorobanInvalid')).kind).toBe('resource');
    expect(classifyTxError(new Error('resource limit exceeded')).kind).toBe('resource');
  });
  it('contract errors win over resource words in the same message', () => {
    expect(classifyTxError(new Error('Error(Contract, #10) ... ExceededLimit')).kind).toBe('contract');
  });
  it('falls back to network with a trimmed message', () => {
    const c = classifyTxError(new Error('  Failed to fetch  '));
    expect(c).toEqual({ kind: 'network', message: 'Failed to fetch' });
    expect(classifyTxError('plain string')).toEqual({ kind: 'network', message: 'plain string' });
    expect(classifyTxError(undefined)).toEqual({ kind: 'network', message: 'Unknown error' });
    const long = classifyTxError(new Error('x'.repeat(300)));
    expect(long.message.length).toBe(200);
  });
  it('reads nested sdk fields when present', () => {
    const e = Object.assign(new Error('Transaction simulation failed'), { simulation: { error: 'HostError: Error(Contract, #13)' } });
    expect(classifyTxError(e)).toMatchObject({ kind: 'contract', code: 13 });
  });
  it('describeError renders a one-line human message', () => {
    expect(describeError({ kind: 'rejected', message: 'x' })).toBe('Signature rejected in the wallet.');
    expect(describeError({ kind: 'contract', code: 18, name: 'StartInPast', message: CONTRACT_ERRORS[18].message })).toBe(CONTRACT_ERRORS[18].message);
    expect(describeError({ kind: 'resource', message: 'x' })).toMatch(/too large/);
    expect(describeError({ kind: 'network', message: 'boom' })).toBe('boom');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/create/errors.test.ts 2>&1 | tail -6`
Expected: FAIL — cannot find module `./errors`.

- [ ] **Step 3: Implement `errors.ts`**

```ts
// frontend/src/lib/create/errors.ts
//
// Turn whatever the wallet / stellar-sdk / RPC throws into one of four kinds
// the create flow can act on. Order matters: a contract code is the most
// specific signal, then a wallet rejection, then resource/size failures.

export type ClassifiedError =
  | { kind: 'rejected'; message: string }
  | { kind: 'resource'; message: string }
  | { kind: 'contract'; code: number; name: string; message: string }
  | { kind: 'network'; message: string };

export const CONTRACT_ERRORS: Record<number, { name: string; message: string }> = {
  1: { name: 'InvalidCall', message: 'The contract rejected the call.' },
  10: { name: 'ZeroDeposit', message: 'Every amount must be greater than zero.' },
  11: { name: 'StartAfterEnd', message: 'End must be after start.' },
  12: { name: 'CliffOutOfRange', message: 'Cliff must be between start and end.' },
  13: { name: 'UnlocksExceedDeposit', message: 'Unlocks exceed the deposit.' },
  14: { name: 'NoTranches', message: 'Add at least one tranche.' },
  15: { name: 'TranchesNotAscending', message: 'Tranche times must increase.' },
  16: { name: 'TrancheSumMismatch', message: 'Tranche amounts do not add up.' },
  17: { name: 'TooManyTranches', message: 'Too many tranches (max 100).' },
  18: { name: 'StartInPast', message: 'The start time is now in the past. Shift the schedule and retry.' },
  19: { name: 'EmptyBatch', message: 'The batch is empty.' },
  20: { name: 'BatchTooLarge', message: 'Too many rows in one transaction (max 100).' },
  21: { name: 'InvalidPeriod', message: 'Period must be at least 1 second.' },
  22: { name: 'InvalidCount', message: 'Count must be at least 1.' },
  30: { name: 'StreamNotFound', message: 'Stream not found.' },
  31: { name: 'NotSender', message: 'Only the sender can do this.' },
  32: { name: 'NotRecipient', message: 'Only the recipient can do this.' },
  33: { name: 'NotCancelable', message: 'This stream is not cancelable.' },
  34: { name: 'NotTransferable', message: 'This stream is not transferable.' },
  35: { name: 'AlreadyCanceled', message: 'This stream was already canceled.' },
  36: { name: 'AlreadyDepleted', message: 'This stream is already depleted.' },
  37: { name: 'InvalidStatus', message: 'The stream is in the wrong state for this action.' },
  50: { name: 'InsufficientWithdrawable', message: 'Not enough withdrawable balance.' },
  51: { name: 'ZeroWithdraw', message: 'Nothing to withdraw.' },
  70: { name: 'NotAdmin', message: 'Admin only.' },
  71: { name: 'OracleStale', message: 'The price oracle is stale.' },
  72: { name: 'InvalidOraclePrice', message: 'The price oracle returned an invalid price.' },
  73: { name: 'UnknownOp', message: 'Unknown operation.' },
  90: { name: 'Overflow', message: 'Arithmetic overflow.' },
};

const REJECTED_RE = /user (rejected|declined|denied)|rejected by user|cancell?ed by user|User declined|declined the request/i;
const RESOURCE_RE =
  /ExceededLimit|exceeds? (the )?(resource|size|budget)|resource limit|TxSorobanInvalid|txSorobanInvalid|TX_SOROBAN_INVALID|too large|exceeds the maximum/i;
const CONTRACT_RE = /Error\(Contract, #(\d+)\)/;

function collectText(e: unknown): string {
  if (e === undefined || e === null) return '';
  if (typeof e === 'string') return e;
  const o = e as { message?: unknown; simulation?: { error?: unknown }; sendTransactionResponse?: { errorResult?: unknown } };
  const parts: string[] = [];
  if (typeof o.message === 'string') parts.push(o.message);
  if (o.simulation && typeof o.simulation.error === 'string') parts.push(o.simulation.error);
  if (o.sendTransactionResponse?.errorResult !== undefined) {
    try {
      parts.push(JSON.stringify(o.sendTransactionResponse.errorResult));
    } catch {
      /* ignore */
    }
  }
  if (parts.length === 0) parts.push(String(e));
  return parts.join('\n');
}

export function classifyTxError(e: unknown): ClassifiedError {
  const text = collectText(e);
  const contract = CONTRACT_RE.exec(text);
  if (contract) {
    const code = Number(contract[1]);
    const known = CONTRACT_ERRORS[code];
    return {
      kind: 'contract',
      code,
      name: known?.name ?? 'Unknown',
      message: known?.message ?? `Contract error #${code} (Unknown)`,
    };
  }
  if (REJECTED_RE.test(text)) return { kind: 'rejected', message: text.trim().slice(0, 200) };
  if (RESOURCE_RE.test(text)) return { kind: 'resource', message: text.trim().slice(0, 200) };
  const trimmed = text.trim();
  return { kind: 'network', message: (trimmed || 'Unknown error').slice(0, 200) };
}

export function describeError(err: ClassifiedError): string {
  switch (err.kind) {
    case 'rejected':
      return 'Signature rejected in the wallet.';
    case 'resource':
      return 'This transaction is too large for the network limits.';
    case 'contract':
      return err.message;
    case 'network':
      return err.message;
  }
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd frontend && npx vitest run src/lib/create/errors.test.ts 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/create/errors.ts frontend/src/lib/create/errors.test.ts
git commit -m "feat(create): classify wallet/sdk/contract errors for the create flow"
```

---

### Task 5: Batch plan — chunks, reducer, stored-run loading

**Files:**
- Create: `frontend/src/lib/create/batchPlan.ts`
- Test: `frontend/src/lib/create/batchPlan.test.ts`

**Interfaces:**
- Consumes: `ClassifiedError` (Task 4), `ValidatedRow`, `MAX_ROWS_PER_RUN` (Task 3), `Schedule`, `shiftSchedule` (Task 1), `readJson`, `StorageLike` (Task 2).
- Produces: `DEFAULT_CHUNK_ROWS`, `CONTRACT_MAX_BATCH_ROWS`, `BATCH_RUN_KEY`, `INTERRUPTED_ERROR`, `ChunkStatus`, `Chunk`, `RunPhase`, `PauseReason`, `BatchRun`, `RunAction`, `planRun(input)`, `runReducer(run, action)`, `nextChunk(run)`, `runProgress(run)`, `isBatchRun(x)`, `loadStoredRun(storage)`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/create/batchPlan.test.ts
import { describe, expect, it } from 'vitest';
import {
  BATCH_RUN_KEY,
  DEFAULT_CHUNK_ROWS,
  INTERRUPTED_ERROR,
  loadStoredRun,
  nextChunk,
  planRun,
  runProgress,
  runReducer,
  type BatchRun,
} from './batchPlan';
import { validateRows } from './rows';
import { scheduleStart, type Schedule } from './schedule';
import { memoryStorage } from './storage';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const G2 = 'GAWIFBYR7ATAATABJT5XT5PI3PQAUK4ZZF4EODQCWKINA3PTV43NWWAA';
const NOW = 1_800_000_000;
const schedule: Schedule = { shape: 'recurring', firstTs: NOW + 900, periodSecs: 86_400, count: 12 };

function rows(n: number) {
  return validateRows(
    Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, recipient: i % 2 ? G2 : G1, amount: '12', source: 'manual' as const })),
    { sender: null, schedule },
  );
}
function run(n: number, chunkRows?: number): BatchRun {
  return planRun({ sender: G1, token: 'CTOKEN', cancelable: true, transferable: false, schedule, rows: rows(n), chunkRows, nowMs: NOW * 1000 });
}

describe('planRun', () => {
  it('chunks 45 rows into 20/20/5 with the default chunk size', () => {
    const r = run(45);
    expect(DEFAULT_CHUNK_ROWS).toBe(20);
    expect(r.chunks.map((c) => c.rowIds.length)).toEqual([20, 20, 5]);
    expect(r.chunks.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(r.chunks.every((c) => c.status === 'pending' && c.attempts === 0 && c.schedule === schedule)).toBe(true);
    expect(r.id).toBe(`run_${NOW * 1000}`);
    expect(r.createdAt).toBe(NOW);
    expect(r.phase).toBe('running');
    expect(r.rows.r1).toEqual({ recipient: G1, total: '120000000' });
  });
  it('clamps chunkRows to 1..100 and skips rows without a built spec', () => {
    expect(run(5, 0).chunks.map((c) => c.rowIds.length)).toEqual([1, 1, 1, 1, 1]);
    expect(run(150, 1000).chunks.map((c) => c.rowIds.length)).toEqual([100, 50]);
    const bad = validateRows([{ id: 'x', recipient: 'bad', amount: '1', source: 'manual' }], { sender: null, schedule });
    const r = planRun({ sender: G1, token: 'C', cancelable: true, transferable: true, schedule, rows: [...rows(2), ...bad], nowMs: 1 });
    expect(Object.keys(r.rows)).toEqual(['r1', 'r2']);
    expect(r.chunks[0].rowIds).toEqual(['r1', 'r2']);
  });
});

describe('runReducer', () => {
  it('chunk_done marks done and completes the run when every chunk is done', () => {
    let r = run(25);
    r = runReducer(r, { type: 'chunk_status', index: 0, status: 'signing' });
    expect(r.chunks[0].status).toBe('signing');
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'aa', streamIds: [1, 2] });
    expect(r.chunks[0]).toMatchObject({ status: 'done', txHash: 'aa', streamIds: [1, 2] });
    expect(r.phase).toBe('running');
    r = runReducer(r, { type: 'chunk_done', index: 1, txHash: 'bb', streamIds: [3] });
    expect(r.phase).toBe('completed');
    expect(runProgress(r)).toEqual({ done: 2, total: 2, streams: 3 });
  });
  it('chunk_failed pauses with the reason and counts attempts', () => {
    let r = run(3);
    r = runReducer(r, { type: 'chunk_failed', index: 0, error: { kind: 'rejected', message: 'x' }, pause: 'rejected' });
    expect(r.phase).toBe('paused');
    expect(r.pauseReason).toBe('rejected');
    expect(r.chunks[0]).toMatchObject({ status: 'failed', attempts: 1, error: { kind: 'rejected' } });
    r = runReducer(r, { type: 'resume' });
    expect(r.phase).toBe('running');
    expect(r.pauseReason).toBeUndefined();
    expect(nextChunk(r)?.index).toBe(0);
  });
  it('split_chunk halves a chunk, resets it, and renumbers', () => {
    let r = run(45);
    r = runReducer(r, { type: 'chunk_failed', index: 1, error: { kind: 'resource', message: 'x' }, pause: 'failed' });
    r = runReducer(r, { type: 'split_chunk', index: 1 });
    expect(r.chunks.map((c) => c.rowIds.length)).toEqual([20, 10, 10, 5]);
    expect(r.chunks.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(r.chunks[1]).toMatchObject({ status: 'pending', attempts: 0 });
    expect(r.chunks[1].error).toBeUndefined();
    expect(r.chunks[1].rowIds).toEqual(['r21', 'r22', 'r23', 'r24', 'r25', 'r26', 'r27', 'r28', 'r29', 'r30']);
    // odd sizes: ceil / floor
    r = runReducer(r, { type: 'split_chunk', index: 3 });
    expect(r.chunks.map((c) => c.rowIds.length)).toEqual([20, 10, 10, 3, 2]);
  });
  it('split_chunk refuses 1-row and done chunks', () => {
    let r = run(1);
    expect(runReducer(r, { type: 'split_chunk', index: 0 })).toBe(r);
    r = run(4);
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [1, 2, 3, 4] });
    expect(runReducer(r, { type: 'split_chunk', index: 0 })).toBe(r);
  });
  it('shift_remaining shifts only non-done chunks and resumes', () => {
    let r = run(45);
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [] });
    r = runReducer(r, { type: 'chunk_failed', index: 1, error: { kind: 'contract', code: 18, name: 'StartInPast', message: 'm' }, pause: 'start_in_past' });
    r = runReducer(r, { type: 'shift_remaining', seconds: 900 });
    expect(r.phase).toBe('running');
    expect(scheduleStart(r.chunks[0].schedule)).toBe(NOW + 900);
    expect(scheduleStart(r.chunks[1].schedule)).toBe(NOW + 1800);
    expect(scheduleStart(r.chunks[2].schedule)).toBe(NOW + 1800);
    expect(r.chunks[1]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(r.chunks[1].error).toBeUndefined();
  });
  it('pause only affects a running run; abort and complete set phases', () => {
    let r = run(2);
    r = runReducer(r, { type: 'pause' });
    expect(r).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    expect(runReducer(r, { type: 'pause' })).toBe(r);
    expect(runReducer(r, { type: 'abort' }).phase).toBe('aborted');
    expect(runReducer(r, { type: 'complete' }).phase).toBe('completed');
  });
  it('nextChunk returns the first non-done chunk or null', () => {
    let r = run(45);
    expect(nextChunk(r)?.index).toBe(0);
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [] });
    expect(nextChunk(r)?.index).toBe(1);
    r = runReducer(r, { type: 'chunk_done', index: 1, txHash: 'h', streamIds: [] });
    r = runReducer(r, { type: 'chunk_done', index: 2, txHash: 'h', streamIds: [] });
    expect(nextChunk(r)).toBeNull();
  });
});

describe('loadStoredRun', () => {
  it('returns null for missing/invalid/aborted runs', () => {
    const s = memoryStorage();
    expect(loadStoredRun(null)).toBeNull();
    expect(loadStoredRun(s)).toBeNull();
    s.setItem(BATCH_RUN_KEY, '{"nope":1}');
    expect(loadStoredRun(s)).toBeNull();
    s.setItem(BATCH_RUN_KEY, JSON.stringify(runReducer(run(2), { type: 'abort' })));
    expect(loadStoredRun(s)).toBeNull();
  });
  it('normalises an interrupted run: running → paused, in-flight chunks reset', () => {
    const s = memoryStorage();
    let r = run(45);
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [1] });
    r = runReducer(r, { type: 'chunk_status', index: 1, status: 'signing' });
    r = runReducer(r, { type: 'chunk_status', index: 2, status: 'simulating' });
    s.setItem(BATCH_RUN_KEY, JSON.stringify(r));
    const loaded = loadStoredRun(s)!;
    expect(loaded.phase).toBe('paused');
    expect(loaded.pauseReason).toBe('failed');
    expect(loaded.chunks[0].status).toBe('done');
    expect(loaded.chunks[1]).toMatchObject({ status: 'failed', error: INTERRUPTED_ERROR });
    expect(loaded.chunks[2].status).toBe('pending');
  });
  it('keeps completed and paused runs as they are', () => {
    const s = memoryStorage();
    const paused = runReducer(run(2), { type: 'chunk_failed', index: 0, error: { kind: 'rejected', message: 'x' }, pause: 'rejected' });
    s.setItem(BATCH_RUN_KEY, JSON.stringify(paused));
    expect(loadStoredRun(s)).toEqual(paused);
    const done = runReducer(run(1), { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [1] });
    s.setItem(BATCH_RUN_KEY, JSON.stringify(done));
    expect(loadStoredRun(s)?.phase).toBe('completed');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/create/batchPlan.test.ts 2>&1 | tail -6`
Expected: FAIL — cannot find module `./batchPlan`.

- [ ] **Step 3: Implement `batchPlan.ts`**

```ts
// frontend/src/lib/create/batchPlan.ts
//
// A batch run = the rows to create + the chunks (one create_batch transaction
// each) + a phase. `runReducer` is the only way state changes; the runner
// (Task 6) drives it and the hook (Task 13) persists it. Everything here is
// JSON-safe (amounts are decimal strings) so a run survives a page reload.

import type { ClassifiedError } from './errors';
import { MAX_ROWS_PER_RUN, type ValidatedRow } from './rows';
import { shiftSchedule, type Schedule } from './schedule';
import { readJson, type StorageLike } from './storage';

export { MAX_ROWS_PER_RUN };
export const DEFAULT_CHUNK_ROWS = 20;
export const CONTRACT_MAX_BATCH_ROWS = 100;
export const BATCH_RUN_KEY = 'hourglass:batchRun:v1';

export const INTERRUPTED_ERROR: ClassifiedError = {
  kind: 'network',
  message: 'Interrupted — check the explorer before retrying',
};

export type ChunkStatus = 'pending' | 'simulating' | 'signing' | 'submitting' | 'done' | 'failed';
export type RunPhase = 'running' | 'paused' | 'completed' | 'aborted';
export type PauseReason = 'rejected' | 'failed' | 'start_in_past' | 'user';

export type Chunk = {
  index: number;
  rowIds: string[];
  /** Schedule used for this chunk; shifted per chunk when the user shifts remaining rows. */
  schedule: Schedule;
  status: ChunkStatus;
  txHash?: string;
  streamIds?: number[];
  error?: ClassifiedError;
  attempts: number;
};

export type BatchRun = {
  id: string;
  createdAt: number;
  sender: string;
  token: string;
  cancelable: boolean;
  transferable: boolean;
  /** rowId → recipient + deposited stroops (decimal string). */
  rows: Record<string, { recipient: string; total: string }>;
  chunks: Chunk[];
  phase: RunPhase;
  pauseReason?: PauseReason;
};

export type RunAction =
  | { type: 'chunk_status'; index: number; status: ChunkStatus }
  | { type: 'chunk_done'; index: number; txHash: string; streamIds: number[] }
  | { type: 'chunk_failed'; index: number; error: ClassifiedError; pause: PauseReason }
  | { type: 'split_chunk'; index: number }
  | { type: 'shift_remaining'; seconds: number }
  | { type: 'resume' }
  | { type: 'pause' }
  | { type: 'abort' }
  | { type: 'complete' };

export function planRun(input: {
  sender: string;
  token: string;
  cancelable: boolean;
  transferable: boolean;
  schedule: Schedule;
  rows: ValidatedRow[];
  chunkRows?: number;
  nowMs: number;
}): BatchRun {
  const chunkRows = Math.min(CONTRACT_MAX_BATCH_ROWS, Math.max(1, input.chunkRows ?? DEFAULT_CHUNK_ROWS));
  const rows: BatchRun['rows'] = {};
  const ids: string[] = [];
  for (const r of input.rows) {
    if (!r.built) continue;
    // Store the post-adjustment deposit so re-building the spec is exact.
    rows[r.id] = { recipient: r.recipient.trim(), total: r.built.deposited.toString() };
    ids.push(r.id);
  }
  const chunks: Chunk[] = [];
  for (let i = 0; i < ids.length; i += chunkRows) {
    chunks.push({
      index: chunks.length,
      rowIds: ids.slice(i, i + chunkRows),
      schedule: input.schedule,
      status: 'pending',
      attempts: 0,
    });
  }
  return {
    id: `run_${input.nowMs}`,
    createdAt: Math.floor(input.nowMs / 1000),
    sender: input.sender,
    token: input.token,
    cancelable: input.cancelable,
    transferable: input.transferable,
    rows,
    chunks,
    phase: 'running',
  };
}

function updateChunk(run: BatchRun, index: number, patch: (c: Chunk) => Chunk): Chunk[] {
  return run.chunks.map((c) => (c.index === index ? patch(c) : c));
}

export function runReducer(run: BatchRun, a: RunAction): BatchRun {
  switch (a.type) {
    case 'chunk_status':
      return { ...run, chunks: updateChunk(run, a.index, (c) => ({ ...c, status: a.status })) };
    case 'chunk_done': {
      const chunks = updateChunk(run, a.index, (c) => ({
        ...c,
        status: 'done',
        txHash: a.txHash,
        streamIds: a.streamIds,
        error: undefined,
      }));
      const allDone = chunks.every((c) => c.status === 'done');
      return allDone ? { ...run, chunks, phase: 'completed', pauseReason: undefined } : { ...run, chunks };
    }
    case 'chunk_failed':
      return {
        ...run,
        phase: 'paused',
        pauseReason: a.pause,
        chunks: updateChunk(run, a.index, (c) => ({ ...c, status: 'failed', error: a.error, attempts: c.attempts + 1 })),
      };
    case 'split_chunk': {
      const i = run.chunks.findIndex((c) => c.index === a.index);
      if (i === -1) return run;
      const c = run.chunks[i];
      if (c.status === 'done' || c.rowIds.length < 2) return run;
      const half = Math.ceil(c.rowIds.length / 2);
      const first: Chunk = { ...c, rowIds: c.rowIds.slice(0, half), status: 'pending', attempts: 0, error: undefined };
      const second: Chunk = { ...c, rowIds: c.rowIds.slice(half), status: 'pending', attempts: 0, error: undefined };
      const chunks = [...run.chunks.slice(0, i), first, second, ...run.chunks.slice(i + 1)].map((x, idx) => ({
        ...x,
        index: idx,
      }));
      return { ...run, chunks };
    }
    case 'shift_remaining':
      return {
        ...run,
        phase: 'running',
        pauseReason: undefined,
        chunks: run.chunks.map((c) =>
          c.status === 'done'
            ? c
            : { ...c, schedule: shiftSchedule(c.schedule, a.seconds), status: 'pending', error: undefined },
        ),
      };
    case 'resume':
      return { ...run, phase: 'running', pauseReason: undefined };
    case 'pause':
      return run.phase === 'running' ? { ...run, phase: 'paused', pauseReason: 'user' } : run;
    case 'abort':
      return { ...run, phase: 'aborted' };
    case 'complete':
      return { ...run, phase: 'completed', pauseReason: undefined };
  }
}

export function nextChunk(run: BatchRun): Chunk | null {
  return run.chunks.find((c) => c.status !== 'done') ?? null;
}

export function runProgress(run: BatchRun): { done: number; total: number; streams: number } {
  let done = 0;
  let streams = 0;
  for (const c of run.chunks) {
    if (c.status === 'done') done++;
    streams += c.streamIds?.length ?? 0;
  }
  return { done, total: run.chunks.length, streams };
}

const PHASES: RunPhase[] = ['running', 'paused', 'completed', 'aborted'];
const STATUSES: ChunkStatus[] = ['pending', 'simulating', 'signing', 'submitting', 'done', 'failed'];

export function isBatchRun(x: unknown): x is BatchRun {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.sender === 'string' &&
    typeof o.token === 'string' &&
    typeof o.rows === 'object' &&
    o.rows !== null &&
    PHASES.includes(o.phase as RunPhase) &&
    Array.isArray(o.chunks) &&
    o.chunks.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        Array.isArray((c as Chunk).rowIds) &&
        STATUSES.includes((c as Chunk).status) &&
        typeof (c as Chunk).schedule === 'object',
    )
  );
}

/**
 * Read the persisted run. Aborted / unreadable → null. A run that was
 * `running` when the tab closed becomes `paused`; a chunk caught mid-signature
 * becomes `failed` with `INTERRUPTED_ERROR` so the UI asks the user to check
 * the explorer before retrying; a chunk that was only simulating goes back to
 * `pending`.
 */
export function loadStoredRun(storage: StorageLike | null): BatchRun | null {
  const raw = readJson<unknown>(storage, BATCH_RUN_KEY);
  if (!isBatchRun(raw)) return null;
  if (raw.phase === 'aborted') return null;
  if (raw.phase === 'completed') return raw;
  const chunks = raw.chunks.map((c): Chunk => {
    if (c.status === 'simulating') return { ...c, status: 'pending' };
    if (c.status === 'signing' || c.status === 'submitting') return { ...c, status: 'failed', error: INTERRUPTED_ERROR };
    return c;
  });
  return {
    ...raw,
    chunks,
    phase: 'paused',
    pauseReason: raw.phase === 'running' ? 'failed' : raw.pauseReason,
  };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd frontend && npx vitest run src/lib/create/batchPlan.test.ts 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/create/batchPlan.ts frontend/src/lib/create/batchPlan.test.ts
git commit -m "feat(create): batch run planning, reducer and stored-run recovery"
```

---

### Task 6: Batch runner

**Files:**
- Create: `frontend/src/lib/create/runner.ts`
- Test: `frontend/src/lib/create/runner.test.ts`

**Interfaces:**
- Consumes: `BatchRun`, `Chunk`, `RunAction`, `PauseReason`, `nextChunk` (Task 5), `classifyTxError`, `ClassifiedError` (Task 4).
- Produces: `PreparedTx` (opaque `unknown`), `RunnerDeps`, `runBatch(deps, signal)`, `pauseReasonFor(err)`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/create/runner.test.ts
import { describe, expect, it } from 'vitest';
import { planRun, runReducer, type BatchRun, type Chunk, type RunAction } from './batchPlan';
import { validateRows } from './rows';
import { scheduleStart, type Schedule } from './schedule';
import { pauseReasonFor, runBatch, type RunnerDeps } from './runner';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const NOW = 1_800_000_000;
const schedule: Schedule = { shape: 'linear', startTs: NOW + 900, cliffTs: NOW + 900, endTs: NOW + 90_000, unlockAtStartBps: 0, unlockAtCliffBps: 0 };

function makeRun(n: number, chunkRows = 2): BatchRun {
  const rows = validateRows(
    Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, recipient: G1, amount: '1', source: 'manual' as const })),
    { sender: null, schedule },
  );
  return planRun({ sender: G1, token: 'C', cancelable: true, transferable: true, schedule, rows, chunkRows, nowMs: 1 });
}

type Harness = {
  deps: RunnerDeps;
  run: () => BatchRun;
  builds: Chunk[];
  sends: number;
  persisted: number;
  actions: RunAction[];
};

function harness(
  initial: BatchRun,
  opts: {
    buildError?: (chunk: Chunk, attempt: number) => unknown;
    sendError?: (chunk: Chunk, attempt: number) => unknown;
    onBuild?: (h: Harness) => void;
  } = {},
): Harness {
  let run = initial;
  const h: Harness = { builds: [], sends: 0, persisted: 0, actions: [], run: () => run, deps: undefined as never };
  const attempts = new Map<string, number>();
  h.deps = {
    buildChunk: async (_run, chunk) => {
      h.builds.push(chunk);
      const key = chunk.rowIds.join(',');
      const n = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, n);
      const err = opts.buildError?.(chunk, n);
      if (err) throw err;
      opts.onBuild?.(h);
      return { chunk };
    },
    sendChunk: async (tx) => {
      const chunk = (tx as { chunk: Chunk }).chunk;
      h.sends++;
      const err = opts.sendError?.(chunk, chunk.attempts + 1);
      if (err) throw err;
      return { txHash: `hash${chunk.index}`, streamIds: chunk.rowIds.map((_, i) => chunk.index * 100 + i) };
    },
    dispatch: (a) => {
      h.actions.push(a);
      run = runReducer(run, a);
    },
    getRun: () => run,
    persist: () => {
      h.persisted++;
    },
  };
  return h;
}

describe('runBatch', () => {
  it('runs every chunk to completion and persists after each transition', async () => {
    const h = harness(makeRun(5)); // 2/2/1
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(r.phase).toBe('completed');
    expect(r.chunks.map((c) => c.status)).toEqual(['done', 'done', 'done']);
    expect(r.chunks.map((c) => c.txHash)).toEqual(['hash0', 'hash1', 'hash2']);
    expect(r.chunks[1].streamIds).toEqual([100, 101]);
    expect(h.builds).toHaveLength(3);
    expect(h.sends).toBe(3);
    expect(h.persisted).toBe(h.actions.length);
    expect(h.actions.map((a) => a.type)).toEqual([
      'chunk_status', 'chunk_status', 'chunk_done',
      'chunk_status', 'chunk_status', 'chunk_done',
      'chunk_status', 'chunk_status', 'chunk_done',
    ]);
  });
  it('splits a chunk that does not fit and continues', async () => {
    const h = harness(makeRun(4, 4), {
      buildError: (chunk) => (chunk.rowIds.length === 4 ? new Error('Transaction simulation failed: "HostError: Error(Budget, ExceededLimit)"') : undefined),
    });
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(r.phase).toBe('completed');
    expect(r.chunks.map((c) => c.rowIds.length)).toEqual([2, 2]);
    expect(h.actions.filter((a) => a.type === 'split_chunk')).toHaveLength(1);
    expect(h.sends).toBe(2);
  });
  it('fails a 1-row chunk that does not fit and pauses', async () => {
    const h = harness(makeRun(1, 1), { buildError: () => new Error('txSorobanInvalid') });
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(r.phase).toBe('paused');
    expect(r.pauseReason).toBe('failed');
    expect(r.chunks[0]).toMatchObject({ status: 'failed', attempts: 1, error: { kind: 'resource' } });
    expect(h.sends).toBe(0);
  });
  it('pauses on a rejected signature and resumes from the same chunk', async () => {
    let reject = true;
    const h = harness(makeRun(3), { sendError: (chunk) => (chunk.index === 0 && reject ? new Error('User rejected the request') : undefined) });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run()).toMatchObject({ phase: 'paused', pauseReason: 'rejected' });
    expect(h.run().chunks[0]).toMatchObject({ status: 'failed', attempts: 1 });
    reject = false;
    h.deps.dispatch({ type: 'resume' });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run().phase).toBe('completed');
    expect(h.sends).toBe(3); // chunk 0 twice, chunk 1 once
  });
  it('pauses with start_in_past on contract #18, then shift + rerun completes', async () => {
    let past = true;
    const h = harness(makeRun(2, 1), {
      sendError: () => (past ? new Error('Transaction simulation failed: "HostError: Error(Contract, #18)"') : undefined),
    });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run().pauseReason).toBe('start_in_past');
    past = false;
    h.deps.dispatch({ type: 'shift_remaining', seconds: 900 });
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(r.phase).toBe('completed');
    expect(r.chunks.every((c) => scheduleStart(c.schedule) === NOW + 1800)).toBe(true);
  });
  it('does nothing when aborted or not running', async () => {
    const ac = new AbortController();
    ac.abort();
    const h = harness(makeRun(2));
    await runBatch(h.deps, ac.signal);
    expect(h.builds).toHaveLength(0);
    const h2 = harness(runReducer(makeRun(2), { type: 'pause' }));
    await runBatch(h2.deps, new AbortController().signal);
    expect(h2.builds).toHaveLength(0);
  });
  it('a pause requested during simulation returns the chunk to pending without sending', async () => {
    const h = harness(makeRun(2, 1), { onBuild: (hh) => hh.deps.dispatch({ type: 'pause' }) });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.sends).toBe(0);
    expect(h.run().chunks[0].status).toBe('pending');
    expect(h.run().phase).toBe('paused');
  });
  it('pauseReasonFor maps error kinds', () => {
    expect(pauseReasonFor({ kind: 'rejected', message: '' })).toBe('rejected');
    expect(pauseReasonFor({ kind: 'contract', code: 18, name: 'StartInPast', message: '' })).toBe('start_in_past');
    expect(pauseReasonFor({ kind: 'contract', code: 10, name: 'ZeroDeposit', message: '' })).toBe('failed');
    expect(pauseReasonFor({ kind: 'network', message: '' })).toBe('failed');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/create/runner.test.ts 2>&1 | tail -6`
Expected: FAIL — cannot find module `./runner`.

- [ ] **Step 3: Implement `runner.ts`**

```ts
// frontend/src/lib/create/runner.ts
//
// Drives a BatchRun chunk by chunk: simulate (build) → sign+send → record.
// Pure with respect to the world: everything effectful is injected through
// `RunnerDeps`, and state only changes through `dispatch`. `dispatch` MUST be
// synchronous (update a ref, not React state) so `getRun()` sees the change.

import { nextChunk, type BatchRun, type Chunk, type PauseReason, type RunAction } from './batchPlan';
import { classifyTxError, type ClassifiedError } from './errors';

/** Opaque prepared transaction handed from `buildChunk` to `sendChunk`. */
export type PreparedTx = unknown;

export type RunnerDeps = {
  /** Simulate the chunk's create_batch; throws on simulation failure. */
  buildChunk: (run: BatchRun, chunk: Chunk) => Promise<PreparedTx>;
  /** Sign and send; resolves with the tx hash and created stream ids. */
  sendChunk: (tx: PreparedTx) => Promise<{ txHash: string; streamIds: number[] }>;
  dispatch: (a: RunAction) => void;
  getRun: () => BatchRun;
  persist: (run: BatchRun) => void;
};

export function pauseReasonFor(err: ClassifiedError): PauseReason {
  if (err.kind === 'rejected') return 'rejected';
  if (err.kind === 'contract' && err.code === 18) return 'start_in_past';
  return 'failed';
}

export async function runBatch(deps: RunnerDeps, signal: AbortSignal): Promise<void> {
  const step = (a: RunAction) => {
    deps.dispatch(a);
    deps.persist(deps.getRun());
  };

  while (!signal.aborted) {
    const run = deps.getRun();
    if (run.phase !== 'running') return;
    const chunk = nextChunk(run);
    if (!chunk) {
      step({ type: 'complete' });
      return;
    }

    step({ type: 'chunk_status', index: chunk.index, status: 'simulating' });
    let tx: PreparedTx;
    try {
      tx = await deps.buildChunk(deps.getRun(), chunk);
    } catch (e) {
      const err = classifyTxError(e);
      if (err.kind === 'resource' && chunk.rowIds.length > 1) {
        step({ type: 'split_chunk', index: chunk.index });
        continue;
      }
      step({ type: 'chunk_failed', index: chunk.index, error: err, pause: pauseReasonFor(err) });
      return;
    }

    // The user may have paused (or the page unmounted) while we simulated.
    if (signal.aborted || deps.getRun().phase !== 'running') {
      step({ type: 'chunk_status', index: chunk.index, status: 'pending' });
      return;
    }

    step({ type: 'chunk_status', index: chunk.index, status: 'signing' });
    try {
      const { txHash, streamIds } = await deps.sendChunk(tx);
      step({ type: 'chunk_done', index: chunk.index, txHash, streamIds });
    } catch (e) {
      const err = classifyTxError(e);
      step({ type: 'chunk_failed', index: chunk.index, error: err, pause: pauseReasonFor(err) });
      return;
    }
  }
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd frontend && npx vitest run src/lib/create/runner.test.ts 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/create/runner.ts frontend/src/lib/create/runner.test.ts
git commit -m "feat(create): chunked batch runner with adaptive split, pause and resume"
```

---

### Task 7: SDK wrappers, submit layer, balance pre-flight, explorer links

**Files:**
- Modify: `frontend/src/lib/sdk.ts` (imports at lines 9–13; `LockupClient` interface lines 20–61)
- Modify: `frontend/src/lib/deployments.ts` (`DeploymentJson` type + `DEPLOYMENT` const)
- Create: `frontend/src/lib/explorer.ts`
- Create: `frontend/src/lib/create/submit.ts`
- Create: `frontend/src/lib/create/balance.ts`
- Test: `frontend/src/lib/create/submit.test.ts`, `frontend/src/lib/create/balance.test.ts`

**Interfaces:**
- Consumes: `buildSpec`, `Schedule`, `BuiltSpec` (Task 1); `TokenInfo` (`@/lib/tokens`); `parseXlmToStroops`.
- Produces: `LockupClient.create_tranched / create_recurring / create_batch`; type re-exports `CreateRow, CreateSpec, LinearParams, TranchedParams, RecurringParams, Tranche` from `@/lib/sdk`; `DEPLOYMENT.horizonUrl`; `explorerBase()`, `txUrl(hash)`, `accountUrl(address)`; `toCreateRow`, `submitSingle`, `prepareBatch`, `sendPrepared`, `txHashOf`; `fetchTokenBalance`, `FEE_RESERVE_STROOPS`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/create/submit.test.ts
import { describe, expect, it } from 'vitest';
import type { LockupClient } from '@/lib/sdk';
import type { Schedule } from './schedule';
import { prepareBatch, sendPrepared, submitSingle, toCreateRow, txHashOf } from './submit';
import { buildSpec } from './schedule';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const G2 = 'GAWIFBYR7ATAATABJT5XT5PI3PQAUK4ZZF4EODQCWKINA3PTV43NWWAA';
const NOW = 1_800_000_000;
const linear: Schedule = { shape: 'linear', startTs: NOW + 900, cliffTs: NOW + 1000, endTs: NOW + 90_000, unlockAtStartBps: 1000, unlockAtCliffBps: 0 };
const tranched: Schedule = { shape: 'tranched', startTs: NOW + 900, tranches: [{ ts: NOW + 1000, bps: 5000 }, { ts: NOW + 2000, bps: 5000 }] };
const recurring: Schedule = { shape: 'recurring', firstTs: NOW + 900, periodSecs: 60, count: 4 };

function fakeLockup(result: unknown, hash = 'deadbeef') {
  const calls: Array<{ method: string; args: unknown }> = [];
  const tx = { signAndSend: async () => ({ result, sendTransactionResponse: { hash } }) };
  const mk = (method: string) => async (args: unknown) => {
    calls.push({ method, args });
    return tx;
  };
  const client = {
    create_linear: mk('create_linear'),
    create_tranched: mk('create_tranched'),
    create_recurring: mk('create_recurring'),
    create_batch: mk('create_batch'),
  } as unknown as LockupClient;
  return { client, calls, tx };
}

describe('submitSingle', () => {
  it('dispatches linear', async () => {
    const { client, calls } = fakeLockup(7);
    const out = await submitSingle(client, { sender: G1, recipient: G2, token: 'C', schedule: linear, total: 100n, cancelable: true, transferable: false });
    expect(out).toEqual({ streamId: 7, txHash: 'deadbeef' });
    expect(calls).toEqual([{
      method: 'create_linear',
      args: {
        sender: G1, recipient: G2, token: 'C', is_cancelable: true, is_transferable: false,
        deposited: 100n, start_ts: BigInt(NOW + 900), cliff_ts: BigInt(NOW + 1000), end_ts: BigInt(NOW + 90_000), unlock_at_start: 10n, unlock_at_cliff: 0n,
      },
    }]);
  });
  it('dispatches tranched and recurring', async () => {
    const t = fakeLockup(8);
    await submitSingle(t.client, { sender: G1, recipient: G2, token: 'C', schedule: tranched, total: 100n, cancelable: true, transferable: true });
    expect(t.calls[0].method).toBe('create_tranched');
    expect((t.calls[0].args as { tranches: unknown }).tranches).toEqual([{ amount: 50n, ts: BigInt(NOW + 1000) }, { amount: 50n, ts: BigInt(NOW + 2000) }]);
    const r = fakeLockup(9);
    await submitSingle(r.client, { sender: G1, recipient: G2, token: 'C', schedule: recurring, total: 100n, cancelable: false, transferable: true });
    expect(r.calls[0]).toEqual({
      method: 'create_recurring',
      args: { sender: G1, recipient: G2, token: 'C', is_cancelable: false, is_transferable: true, amount_per_period: 25n, period_secs: 60n, count: 4, first_ts: BigInt(NOW + 900) },
    });
  });
});

describe('prepareBatch / sendPrepared / toCreateRow', () => {
  it('builds one CreateRow per row with the shared flags and schedule', async () => {
    const { client, calls, tx } = fakeLockup([11, 12]);
    const prepared = await prepareBatch(client, {
      sender: G1, token: 'C', schedule: recurring, cancelable: true, transferable: false,
      rows: [{ recipient: G2, total: 100n }, { recipient: G1, total: 40n }],
    });
    expect(prepared).toBe(tx);
    expect(calls[0].method).toBe('create_batch');
    const args = calls[0].args as { sender: string; token: string; rows: unknown[] };
    expect(args.sender).toBe(G1);
    expect(args.rows).toEqual([
      toCreateRow(G2, buildSpec(recurring, 100n), { cancelable: true, transferable: false }),
      toCreateRow(G1, buildSpec(recurring, 40n), { cancelable: true, transferable: false }),
    ]);
    expect((args.rows[0] as { spec: { tag: string } }).spec.tag).toBe('Recurring');
    expect(await sendPrepared(prepared)).toEqual({ txHash: 'deadbeef', streamIds: [11, 12] });
  });
  it('txHashOf falls back to getTransactionResponse.txHash then empty', () => {
    expect(txHashOf({ sendTransactionResponse: { hash: 'a' } })).toBe('a');
    expect(txHashOf({ getTransactionResponse: { txHash: 'b' } })).toBe('b');
    expect(txHashOf({})).toBe('');
  });
});
```

```ts
// frontend/src/lib/create/balance.test.ts
import { describe, expect, it } from 'vitest';
import type { TokenInfo } from '@/lib/tokens';
import { FEE_RESERVE_STROOPS, fetchTokenBalance } from './balance';

const xlm: TokenInfo = { id: 'CNATIVE', symbol: 'XLM', name: 'XLM', decimals: 7, glyphColor: '', description: '' };
const usdc: TokenInfo = { id: 'CUSDC', symbol: 'USDC', name: 'USDC', decimals: 7, issuer: 'GISSUER', glyphColor: '', description: '' };
const custom: TokenInfo = { id: 'CCUSTOM', symbol: 'ZZZ', name: 'zzz', decimals: 7, glyphColor: '', description: '' };

function fakeFetch(status: number, body: unknown) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const account = {
  balances: [
    { asset_type: 'native', balance: '980.5' },
    { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER', balance: '12.25' },
  ],
};

describe('fetchTokenBalance', () => {
  it('reads native and issued balances in stroops', async () => {
    const f = fakeFetch(200, account);
    expect(await fetchTokenBalance('https://horizon.test/', 'GACC', xlm, f.fn)).toBe(9_805_000_000n);
    expect(await fetchTokenBalance('https://horizon.test', 'GACC', usdc, f.fn)).toBe(122_500_000n);
    expect(f.calls).toEqual(['https://horizon.test/accounts/GACC', 'https://horizon.test/accounts/GACC']);
  });
  it('returns null when the asset is missing, the token has no issuer, the request fails, or horizon is unset', async () => {
    const f = fakeFetch(200, { balances: [{ asset_type: 'native', balance: '1' }] });
    expect(await fetchTokenBalance('https://h', 'GACC', usdc, f.fn)).toBeNull();
    expect(await fetchTokenBalance('https://h', 'GACC', custom, f.fn)).toBeNull();
    expect(await fetchTokenBalance('https://h', 'GACC', xlm, fakeFetch(404, {}).fn)).toBeNull();
    expect(await fetchTokenBalance('', 'GACC', xlm, f.fn)).toBeNull();
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await fetchTokenBalance('https://h', 'GACC', xlm, boom)).toBeNull();
  });
  it('exposes the 5 XLM fee reserve', () => {
    expect(FEE_RESERVE_STROOPS).toBe(50_000_000n);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/create/submit.test.ts src/lib/create/balance.test.ts 2>&1 | tail -6`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Extend `sdk.ts`**

Replace the import block (lines 9–13) with:

```ts
import { lockup as lockupSdk } from 'hourglass';
import type { CreateRow, Stream, StreamStatus } from 'hourglass/lockup';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import { DEPLOYMENT } from './deployments';
import { signTransaction } from './wallet';

export type { CreateRow, CreateSpec, LinearParams, TranchedParams, RecurringParams, Tranche } from 'hourglass/lockup';
```

Add these three members to `LockupClient` directly after `create_linear(...)` (keep `create_linear` unchanged):

```ts
  create_tranched(args: {
    sender: string;
    recipient: string;
    token: string;
    tranches: Array<{ amount: bigint; ts: bigint }>;
    is_cancelable: boolean;
    is_transferable: boolean;
  }): Promise<AssembledTransaction<number>>;
  create_recurring(args: {
    sender: string;
    recipient: string;
    token: string;
    amount_per_period: bigint;
    period_secs: bigint;
    count: number;
    first_ts: bigint;
    is_cancelable: boolean;
    is_transferable: boolean;
  }): Promise<AssembledTransaction<number>>;
  create_batch(args: {
    sender: string;
    token: string;
    rows: CreateRow[];
  }): Promise<AssembledTransaction<number[]>>;
```

- [ ] **Step 4: Add `horizonUrl` to `deployments.ts`**

In `DeploymentJson` add `horizon_url?: string;` after `network_passphrase`. In `DEPLOYMENT` add `horizonUrl: d.horizon_url ?? '',` after `networkPassphrase`.

- [ ] **Step 5: Create `explorer.ts`**

```ts
// frontend/src/lib/explorer.ts
import { DEPLOYMENT } from './deployments';

export function explorerBase(): string | null {
  if (DEPLOYMENT.network === 'mainnet' || DEPLOYMENT.network === 'public') return 'https://stellar.expert/explorer/public';
  if (DEPLOYMENT.network === 'testnet') return 'https://stellar.expert/explorer/testnet';
  return null;
}

export function txUrl(hash: string): string | null {
  const b = explorerBase();
  return b && hash ? `${b}/tx/${hash}` : null;
}

export function accountUrl(address: string): string | null {
  const b = explorerBase();
  return b && address ? `${b}/account/${address}` : null;
}
```

- [ ] **Step 6: Create `submit.ts`**

```ts
// frontend/src/lib/create/submit.ts
//
// The only place that talks to the lockup client for creation. Single mode
// calls the shape-specific method; batch mode prepares/sends create_batch.

import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import type { CreateRow, CreateSpec, LockupClient } from '@/lib/sdk';
import { buildSpec, type BuiltSpec, type Schedule } from './schedule';

type Flags = { cancelable: boolean; transferable: boolean };

export function toCreateRow(recipient: string, built: BuiltSpec, flags: Flags): CreateRow {
  return { recipient, is_cancelable: flags.cancelable, is_transferable: flags.transferable, spec: built.spec };
}

export function txHashOf(sent: {
  sendTransactionResponse?: { hash: string };
  getTransactionResponse?: { txHash?: string };
}): string {
  return sent.sendTransactionResponse?.hash ?? sent.getTransactionResponse?.txHash ?? '';
}

export async function submitSingle(
  lockup: LockupClient,
  args: { sender: string; recipient: string; token: string; schedule: Schedule; total: bigint } & Flags,
): Promise<{ streamId: number; txHash: string }> {
  const built = buildSpec(args.schedule, args.total);
  const common = {
    sender: args.sender,
    recipient: args.recipient,
    token: args.token,
    is_cancelable: args.cancelable,
    is_transferable: args.transferable,
  };
  const tx = await createTx(lockup, common, built.spec);
  const sent = await tx.signAndSend();
  return { streamId: sent.result, txHash: txHashOf(sent) };
}

type Common = { sender: string; recipient: string; token: string; is_cancelable: boolean; is_transferable: boolean };

function createTx(lockup: LockupClient, common: Common, spec: CreateSpec): Promise<AssembledTransaction<number>> {
  switch (spec.tag) {
    case 'Linear': {
      const p = spec.values[0];
      return lockup.create_linear({
        ...common,
        deposited: p.deposited,
        start_ts: p.start_ts,
        cliff_ts: p.cliff_ts,
        end_ts: p.end_ts,
        unlock_at_start: p.unlock_at_start,
        unlock_at_cliff: p.unlock_at_cliff,
      });
    }
    case 'Tranched':
      return lockup.create_tranched({ ...common, tranches: [...spec.values[0].tranches] });
    case 'Recurring': {
      const p = spec.values[0];
      return lockup.create_recurring({
        ...common,
        amount_per_period: p.amount_per_period,
        period_secs: p.period_secs,
        count: p.count,
        first_ts: p.first_ts,
      });
    }
  }
}

export async function prepareBatch(
  lockup: LockupClient,
  args: { sender: string; token: string; schedule: Schedule; rows: Array<{ recipient: string; total: bigint }> } & Flags,
): Promise<AssembledTransaction<number[]>> {
  const flags = { cancelable: args.cancelable, transferable: args.transferable };
  const rows = args.rows.map((r) => toCreateRow(r.recipient, buildSpec(args.schedule, r.total), flags));
  return lockup.create_batch({ sender: args.sender, token: args.token, rows });
}

export async function sendPrepared(
  tx: AssembledTransaction<number[]>,
): Promise<{ txHash: string; streamIds: number[] }> {
  const sent = await tx.signAndSend();
  return { txHash: txHashOf(sent), streamIds: [...sent.result] };
}
```

- [ ] **Step 7: Create `balance.ts`**

```ts
// frontend/src/lib/create/balance.ts
//
// Pre-flight balance lookup through Horizon (classic balances cover XLM and
// the classic-asset-backed SACs we list). Any failure → null (non-blocking).

import { parseXlmToStroops } from '@/lib/format';
import type { TokenInfo } from '@/lib/tokens';

/** Below this much remaining XLM we warn about fees and reserves (5 XLM). */
export const FEE_RESERVE_STROOPS = 50_000_000n;

type HorizonBalance = { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string };

export async function fetchTokenBalance(
  horizonUrl: string,
  account: string,
  token: TokenInfo,
  fetchFn: typeof fetch = fetch,
): Promise<bigint | null> {
  if (!horizonUrl) return null;
  const isNative = token.symbol === 'XLM' && !token.issuer;
  if (!isNative && !token.issuer) return null;
  try {
    const res = await fetchFn(`${horizonUrl.replace(/\/$/, '')}/accounts/${account}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { balances?: HorizonBalance[] };
    const b = (json.balances ?? []).find((x) =>
      isNative ? x.asset_type === 'native' : x.asset_code === token.symbol && x.asset_issuer === token.issuer,
    );
    return b ? parseXlmToStroops(b.balance) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `cd frontend && npx vitest run src/lib/create 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3`
Expected: all create tests PASS, typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/sdk.ts frontend/src/lib/deployments.ts frontend/src/lib/explorer.ts frontend/src/lib/create/submit.ts frontend/src/lib/create/submit.test.ts frontend/src/lib/create/balance.ts frontend/src/lib/create/balance.test.ts
git commit -m "feat(create): typed create_tranched/recurring/batch, submit layer, balance pre-flight, explorer links"
```

---

### Task 8: Form state reducer and parsing

**Files:**
- Create: `frontend/src/lib/create/formState.ts`
- Test: `frontend/src/lib/create/formState.test.ts`

**Interfaces:**
- Consumes: `datetimeLocalToUnix`, `unixToDatetimeLocal` (`@/lib/format`); Task 1 (`Schedule`, `Shape`, `Mode`, `resolveSchedule`, `clampScheduleStart`, `alignToMinute`, `validateSchedule`, `scheduleStart`, `BPS_DENOM`); Task 2 (`Template`); Task 3 (`parseRows`, `RowInput`, `Skipped`); `TokenInfo`.
- Produces: `TrancheField`, `PeriodUnit`, `FormState`, `FormAction` (incl. `apply_template`, `set_token`, `set_shape`, `set_linear`, `set_tranched_start`, `add_tranche`, `update_tranche`, `remove_tranche`, `split_tranches_evenly`, `set_recurring`, `set_flag`, `set_mode`, `set_single`, `add_row`, `update_row`, `remove_row`, `clear_rows`, `import_rows`, `template_saved`, `clear_template`), `initialFormState(nowSec, tokens)`, `formReducer`, `parseForm(state, nowSec)` → `{ schedule: Schedule | null; valid: boolean; errors: Record<string, string> }`, `currentStartField(state)`, `bpsToPct`, `pctToBps`.

Note: `parseForm` returns the parsed schedule even when validation fails (`valid: false`) so the preview can still draw it; callers must pass `valid ? schedule : null` to `validateRows`/submission. This refines spec §11 (`schedule: Schedule | null` alone).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/create/formState.test.ts 2>&1 | tail -6`
Expected: FAIL — cannot find module `./formState`.

- [ ] **Step 3: Implement `formState.ts`**

```ts
// frontend/src/lib/create/formState.ts
//
// The create form as a reducer over plain strings (what the inputs hold) plus
// `parseForm`, which turns those strings into a `Schedule` and field errors.
// The page owns a `useReducer(formReducer, …)`; components dispatch actions.

import { datetimeLocalToUnix, unixToDatetimeLocal } from '@/lib/format';
import type { TokenInfo } from '@/lib/tokens';
import { parseRows, type RowInput, type Skipped } from './rows';
import {
  BPS_DENOM,
  alignToMinute,
  clampScheduleStart,
  resolveSchedule,
  validateSchedule,
  type Mode,
  type Schedule,
  type Shape,
} from './schedule';
import type { Template } from './templates';

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
  | { type: 'clear_rows' }
  | { type: 'import_rows'; text: string }
  | { type: 'template_saved'; templateId: string }
  | { type: 'clear_template' };

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
  const start = ceilMinute(nowSec + 900);
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
      const sch = alignToMinute(clampScheduleStart(resolveSchedule(t.schedule, a.nowSec), a.nowSec, s.mode));
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
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd frontend && npx vitest run src/lib/create/formState.test.ts 2>&1 | tail -8 && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean. (`unixToDatetimeLocal` uses the local timezone; both directions use it, so tests are timezone-independent.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/create/formState.ts frontend/src/lib/create/formState.test.ts
git commit -m "feat(create): form state reducer and schedule parsing for all shapes"
```

---

### Task 9: Shared `ConfirmDialog` (extracted from the stream page)

**Files:**
- Create: `frontend/src/components/ConfirmDialog.tsx`
- Modify: `frontend/src/app/stream/[id]/page.tsx` (two `<Modal …>` usages around lines 1318–1382; local `function Modal` at lines 1461–1480; imports at the top)

**Interfaces:**
- Produces: `ConfirmDialog` with props `{ open: boolean; onDismiss: () => void; title?: string; kicker?: string; danger?: boolean; busy?: boolean; confirmLabel?: string; cancelLabel?: string; onConfirm?: () => void; children?: ReactNode }`. When `onConfirm` is omitted no footer is rendered (children carry their own buttons — the stream page's existing bodies).

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/ConfirmDialog.tsx
'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onDismiss: () => void;
  title?: string;
  kicker?: string;
  danger?: boolean;
  /** While true, Esc / backdrop clicks are ignored and buttons are disabled. */
  busy?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When provided, a Cancel / Confirm footer is rendered. */
  onConfirm?: () => void;
  children?: ReactNode;
};

export default function ConfirmDialog({
  open,
  onDismiss,
  title,
  kicker,
  danger = false,
  busy = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, busy, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm"
      onClick={busy ? undefined : onDismiss}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'confirm-dialog-title' : undefined}
        className="max-w-[440px] w-full mx-6 bg-midnight border border-stroke p-8 rounded-sm outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {kicker && <p className={`eyebrow mb-3 ${danger ? 'text-warning' : 'text-cream-dim'}`}>· {kicker}</p>}
        {title && (
          <h3 id="confirm-dialog-title" className="headline-roman text-2xl text-cream mb-4">
            {title}
          </h3>
        )}
        {children}
        {onConfirm && (
          <div className="flex gap-3 justify-end mt-8">
            <button
              type="button"
              onClick={onDismiss}
              disabled={busy}
              className="text-[11px] uppercase tracking-[0.18em] px-5 py-2 border border-stroke text-cream-dim hover:text-cream hover:border-cream-dim transition-colors rounded-sm disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={
                'text-[11px] uppercase tracking-[0.18em] px-5 py-2 border rounded-sm transition-colors disabled:opacity-50 ' +
                (danger
                  ? 'border-warning text-warning hover:bg-warning/10'
                  : 'border-sand bg-sand text-night hover:bg-sand-bright hover:border-sand-bright')
              }
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Migrate the stream page**

In `frontend/src/app/stream/[id]/page.tsx`:
1. Add `import ConfirmDialog from '@/components/ConfirmDialog';` next to the other component imports.
2. Replace `<Modal onDismiss={() => setRenounceModal(false)}>` with `<ConfirmDialog open onDismiss={() => setRenounceModal(false)}>` and its closing `</Modal>` with `</ConfirmDialog>`; same for the transfer modal (`setTransferModal`). Keep the children unchanged.
3. Delete the local `function Modal({ children, onDismiss }: …) { … }` definition entirely.

Run: `cd frontend && grep -n "Modal" "src/app/stream/[id]/page.tsx" | grep -v "renounceModal\|transferModal\|ConfirmDialog"` → expected no output.

- [ ] **Step 3: Typecheck and test**

Run: `cd frontend && npm run typecheck 2>&1 | tail -3 && npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ConfirmDialog.tsx "frontend/src/app/stream/[id]/page.tsx"
git commit -m "refactor(ui): extract ConfirmDialog from the stream page"
```

---

### Task 10: Create-page building blocks — fields, TokenPicker, templates hook, TemplateBar, ShapeTabs, ScheduleFields

**Files:**
- Create: `frontend/src/components/create/fields.tsx`
- Create: `frontend/src/components/create/TokenPicker.tsx` (moved from `frontend/src/app/create/page.tsx` lines 456–609, verbatim except imports)
- Create: `frontend/src/lib/create/useTemplates.ts`
- Create: `frontend/src/components/create/TemplateBar.tsx`
- Create: `frontend/src/components/create/ShapeTabs.tsx`
- Create: `frontend/src/components/create/ScheduleFields.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2, 8 (`FormState`, `FormAction`, `Template`, `Shape`); `Toggle` component; `TokenInfo`.
- Produces: `bareInputClass`, `primaryButtonClass`, `secondaryButtonClass`, `Field`, `AmountInput`, `PctInput`, `ToggleRow`, `SubmittingDots`, `NoDeploymentWarning`, `CopyButton`; `TokenPicker` (same props as before: `{ tokens, selectedId, onSelect }`); `useTemplates()` → `{ builtIn, user, canSave, save, rename, remove }`; `TemplateBar`, `ShapeTabs`, `ScheduleFields` (props below).

- [ ] **Step 1: `fields.tsx`**

```tsx
// frontend/src/components/create/fields.tsx
'use client';

import { useState, type ReactNode } from 'react';
import Toggle from '@/components/Toggle';

export const bareInputClass =
  'w-full bg-transparent border-0 border-b border-stroke px-0 py-2 text-cream ' +
  'placeholder:text-cream-dim/60 outline-none focus:border-sand transition-colors';

export const primaryButtonClass =
  'w-full flex items-center justify-center gap-3 bg-sand text-night px-7 py-4 ' +
  'text-[11px] uppercase tracking-[0.18em] font-medium rounded-none border border-sand ' +
  'hover:bg-sand-bright hover:border-sand-bright disabled:opacity-50 disabled:cursor-not-allowed ' +
  'disabled:hover:bg-sand disabled:hover:border-sand transition-colors duration-200';

export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 text-sand px-5 py-2 text-[11px] uppercase tracking-[0.18em] ' +
  'font-medium rounded-none border border-sand/60 hover:border-sand hover:text-sand-bright hover:bg-sand/5 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200';

export const ghostButtonClass =
  'inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim ' +
  'hover:text-sand-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-cream-dim block mb-3">{label}</span>
      {children}
      {error ? (
        <span className="block mt-2 text-xs text-danger">{error}</span>
      ) : (
        hint && <span className="block mt-2 text-xs text-cream-dim/80">{hint}</span>
      )}
    </label>
  );
}

export function AmountInput({
  value,
  onChange,
  symbol,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  symbol: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-stroke focus-within:border-sand transition-colors">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent border-0 px-0 py-2 text-cream outline-none font-mono"
        spellCheck={false}
        autoComplete="off"
      />
      <span className="font-mono text-xs text-cream-dim uppercase tracking-[0.18em]">{symbol}</span>
    </div>
  );
}

export function PctInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-stroke focus-within:border-sand transition-colors">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent border-0 px-0 py-2 text-cream outline-none font-mono"
        spellCheck={false}
        autoComplete="off"
      />
      <span className="font-mono text-xs text-cream-dim">%</span>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-5 py-4 border-t border-stroke/60 cursor-pointer select-none group">
      <Toggle checked={value} onChange={onChange} ariaLabel={label} />
      <div className="flex-1 min-w-0">
        <span className="eyebrow text-cream block group-hover:text-sand-bright transition-colors">{label}</span>
        {hint && <span className="block mt-1 text-xs text-cream-dim/80 leading-snug">{hint}</span>}
      </div>
      <span
        className={
          'font-mono text-[11px] uppercase tracking-[0.18em] shrink-0 ' + (value ? 'text-sand-bright' : 'text-cream-dim')
        }
      >
        {value ? 'On' : 'Off'}
      </span>
    </label>
  );
}

export function SubmittingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="size-[5px] bg-night rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="size-[5px] bg-night rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="size-[5px] bg-night rounded-full animate-bounce" />
    </span>
  );
}

export function NoDeploymentWarning() {
  return (
    <div className="mt-10 border border-warning/40 bg-warning/5 px-5 py-4">
      <p className="eyebrow text-warning mb-2">· No on-chain deployment</p>
      <p className="text-sm text-cream-muted leading-relaxed">
        The build placeholder is empty. Run <span className="font-mono text-cream">./scripts/quickstart-up.sh</span> then{' '}
        <span className="font-mono text-cream">./scripts/deploy-local.sh</span> from the repo root, then restart the dev
        server.
      </p>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim hover:text-sand-bright transition-colors"
      aria-label="Copy"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}
```

- [ ] **Step 2: `TokenPicker.tsx`**

Create `frontend/src/components/create/TokenPicker.tsx` with `'use client';`, imports `import { useState } from 'react'; import type { TokenInfo } from '@/lib/tokens'; import { CopyButton, bareInputClass } from './fields';`, then paste the `CONTRACT_ID_RE`, `isContractId` and `function TokenPicker(…)` code from `frontend/src/app/create/page.tsx` lines 456–609 unchanged and make it `export default function TokenPicker`. Do not edit `page.tsx` yet (Task 14 replaces it wholesale).

- [ ] **Step 3: `useTemplates.ts`**

```ts
// frontend/src/lib/create/useTemplates.ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { safeStorage } from './storage';
import {
  BUILT_IN_TEMPLATES,
  deleteUserTemplate,
  loadUserTemplates,
  newTemplateId,
  renameUserTemplate,
  saveUserTemplate,
  type SaveResult,
  type Template,
} from './templates';

export type TemplateDraft = Omit<Template, 'id' | 'builtIn' | 'createdAt'> & { id?: string };

export function useTemplates() {
  const storage = useMemo(() => safeStorage('local'), []);
  // Loaded after mount so server and client render the same first frame.
  const [user, setUser] = useState<Template[]>([]);
  const refresh = useCallback(() => setUser(loadUserTemplates(storage)), [storage]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    (draft: TemplateDraft, nowSec: number): SaveResult => {
      const res = saveUserTemplate(storage, { ...draft, id: draft.id ?? newTemplateId(), builtIn: false, createdAt: nowSec });
      if (res.ok) refresh();
      return res;
    },
    [storage, refresh],
  );
  const rename = useCallback(
    (id: string, name: string): SaveResult => {
      const res = renameUserTemplate(storage, id, name);
      if (res.ok) refresh();
      return res;
    },
    [storage, refresh],
  );
  const remove = useCallback(
    (id: string): boolean => {
      const ok = deleteUserTemplate(storage, id);
      if (ok) refresh();
      return ok;
    },
    [storage, refresh],
  );

  return { builtIn: BUILT_IN_TEMPLATES, user, canSave: storage !== null, save, rename, remove };
}
```

- [ ] **Step 4: `TemplateBar.tsx`**

```tsx
// frontend/src/components/create/TemplateBar.tsx
'use client';

import { useState } from 'react';
import type { Template } from '@/lib/create/templates';
import { ghostButtonClass } from './fields';

type Props = {
  builtIn: readonly Template[];
  user: Template[];
  selectedId: string | null;
  dirty: boolean;
  canSave: boolean;
  onApply: (id: string) => void;
  onClear: () => void;
  /** Save the current form as a new template with this name. */
  onSaveNew: (name: string) => string | null; // returns an error message or null
  /** Overwrite the selected user template's schedule/flags with the current form. */
  onUpdate: () => string | null;
  onRename: (id: string, name: string) => string | null;
  onDelete: (id: string) => void;
};

export default function TemplateBar({ builtIn, user, selectedId, dirty, canSave, onApply, onClear, onSaveNew, onUpdate, onRename, onDelete }: Props) {
  const [prompt, setPrompt] = useState<null | 'save' | 'rename'>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selected = selectedId ? (builtIn.find((t) => t.id === selectedId) ?? user.find((t) => t.id === selectedId)) : undefined;
  const selectedIsUser = !!selected && !selected.builtIn;
  const label = selected ? (dirty ? `Custom (based on ${selected.name})` : selected.name) : 'Custom';

  function openPrompt(kind: 'save' | 'rename') {
    setPrompt(kind);
    setName(kind === 'rename' && selected ? selected.name : '');
    setError(null);
  }
  function submitPrompt() {
    const err = prompt === 'rename' && selected ? onRename(selected.id, name) : onSaveNew(name);
    if (err) {
      setError(err);
      return;
    }
    setPrompt(null);
    setName('');
  }

  return (
    <div className="border border-stroke bg-night/40 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow text-cream-dim">· Template</span>
        <select
          value={selected && !dirty ? selected.id : ''}
          onChange={(e) => (e.target.value ? onApply(e.target.value) : onClear())}
          aria-label="Template"
          className="bg-transparent border-b border-stroke text-cream font-mono text-xs py-1 outline-none focus:border-sand min-w-[220px]"
        >
          <option value="">{selected ? label : 'Custom'}</option>
          <optgroup label="Presets">
            {builtIn.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
          {user.length > 0 && (
            <optgroup label="Your templates">
              {user.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="flex flex-wrap items-center gap-4 ml-auto">
          {selectedIsUser && dirty && (
            <button type="button" className={ghostButtonClass} disabled={!canSave} onClick={() => setError(onUpdate())}>
              Update “{selected?.name}”
            </button>
          )}
          <button
            type="button"
            className={ghostButtonClass}
            disabled={!canSave}
            title={canSave ? undefined : 'Storage is unavailable in this browser'}
            onClick={() => openPrompt('save')}
          >
            Save as template
          </button>
          {selectedIsUser && (
            <>
              <button type="button" className={ghostButtonClass} disabled={!canSave} onClick={() => openPrompt('rename')}>
                Rename
              </button>
              <button type="button" className={ghostButtonClass} disabled={!canSave} onClick={() => selected && onDelete(selected.id)}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {prompt && (
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitPrompt();
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Template name"
            autoFocus
            className="flex-1 min-w-[180px] bg-transparent border-b border-stroke text-cream font-mono text-xs py-1 outline-none focus:border-sand"
          />
          <button type="submit" className={ghostButtonClass}>
            {prompt === 'rename' ? 'Rename' : 'Save'}
          </button>
          <button type="button" className={ghostButtonClass} onClick={() => setPrompt(null)}>
            Cancel
          </button>
        </form>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: `ShapeTabs.tsx`**

```tsx
// frontend/src/components/create/ShapeTabs.tsx
'use client';

import type { Shape } from '@/lib/create/schedule';

const TABS: Array<{ id: Shape; label: string; hint: string }> = [
  { id: 'linear', label: 'Linear', hint: 'Continuous release, optional cliff and unlocks.' },
  { id: 'tranched', label: 'Tranched', hint: 'Discrete unlocks at fixed times.' },
  { id: 'recurring', label: 'Recurring', hint: 'Equal amounts every period.' },
];

export default function ShapeTabs({ shape, onChange }: { shape: Shape; onChange: (s: Shape) => void }) {
  return (
    <div>
      <div role="tablist" aria-label="Stream shape" className="flex gap-2 flex-wrap">
        {TABS.map((t) => {
          const active = t.id === shape;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={
                'px-4 py-2 rounded-none border font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ' +
                (active ? 'border-sand bg-sand/10 text-sand-bright' : 'border-stroke text-cream hover:border-stroke-2')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-cream-dim/80">{TABS.find((t) => t.id === shape)?.hint}</p>
    </div>
  );
}
```

- [ ] **Step 6: `ScheduleFields.tsx`**

```tsx
// frontend/src/components/create/ScheduleFields.tsx
'use client';

import type { Dispatch } from 'react';
import type { FormAction, FormState } from '@/lib/create/formState';
import { Field, PctInput, bareInputClass, ghostButtonClass } from './fields';

type Props = { state: FormState; errors: Record<string, string>; dispatch: Dispatch<FormAction> };

export default function ScheduleFields({ state, errors, dispatch }: Props) {
  switch (state.shape) {
    case 'linear':
      return <LinearFields state={state} errors={errors} dispatch={dispatch} />;
    case 'tranched':
      return <TranchedFields state={state} errors={errors} dispatch={dispatch} />;
    case 'recurring':
      return <RecurringFields state={state} errors={errors} dispatch={dispatch} />;
  }
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className={bareInputClass + ' font-mono'} />;
}

function LinearFields({ state, errors, dispatch }: Props) {
  const l = state.linear;
  const set = (patch: Partial<FormState['linear']>) => dispatch({ type: 'set_linear', patch });
  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-3 gap-x-6 gap-y-8">
        <Field label="Start" error={errors.start}>
          <DateInput value={l.start} onChange={(v) => set({ start: v, ...(l.hasCliff ? {} : { cliff: v }) })} />
        </Field>
        <Field label="Cliff" hint={l.hasCliff ? undefined : 'No cliff — vesting starts immediately.'} error={errors.cliff}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-cream-dim">
              <input type="checkbox" checked={l.hasCliff} onChange={(e) => set({ hasCliff: e.target.checked, cliff: e.target.checked ? l.cliff : l.start })} />
              Use a cliff
            </label>
            {l.hasCliff && <DateInput value={l.cliff} onChange={(v) => set({ cliff: v })} />}
          </div>
        </Field>
        <Field label="End" error={errors.end}>
          <DateInput value={l.end} onChange={(v) => set({ end: v })} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-8">
        <Field label="Unlock at start" hint="Share of the total released the instant the stream begins." error={errors.unlockAtStartPct ?? errors.unlocks}>
          <PctInput value={l.unlockAtStartPct} onChange={(v) => set({ unlockAtStartPct: v })} />
        </Field>
        <Field label="Unlock at cliff" hint="Share of the total released when the cliff lands." error={errors.unlockAtCliffPct}>
          <PctInput value={l.unlockAtCliffPct} onChange={(v) => set({ unlockAtCliffPct: v })} />
        </Field>
      </div>
    </div>
  );
}

function TranchedFields({ state, errors, dispatch }: Props) {
  const t = state.tranched;
  return (
    <div className="space-y-8">
      <Field label="Start" hint="Reference time; tranche offsets count from here." error={errors.start}>
        <DateInput value={t.start} onChange={(v) => dispatch({ type: 'set_tranched_start', start: v })} />
      </Field>
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="eyebrow text-cream-dim">Tranches ({t.tranches.length})</span>
          <div className="flex gap-4">
            <button type="button" className={ghostButtonClass} onClick={() => dispatch({ type: 'split_tranches_evenly' })} disabled={t.tranches.length === 0}>
              Split evenly
            </button>
            <button type="button" className={ghostButtonClass} onClick={() => dispatch({ type: 'add_tranche' })} disabled={t.tranches.length >= 100}>
              + Tranche
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] font-mono text-xs">
            <thead className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">
              <tr>
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">After start</th>
                <th className="text-left py-2 pr-3">Unit</th>
                <th className="text-left py-2 pr-3">Share</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {t.tranches.map((tr, i) => {
                const err = errors[`tranche.${tr.id}`];
                return (
                  <tr key={tr.id} className={'border-t border-stroke/60 align-top ' + (err ? 'bg-danger/5' : '')}>
                    <td className="py-2 pr-3 text-cream-dim">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <input type="text" inputMode="decimal" value={tr.offsetValue} onChange={(e) => dispatch({ type: 'update_tranche', id: tr.id, patch: { offsetValue: e.target.value } })} className={bareInputClass + ' w-24'} />
                    </td>
                    <td className="py-2 pr-3">
                      <select value={tr.offsetUnit} onChange={(e) => dispatch({ type: 'update_tranche', id: tr.id, patch: { offsetUnit: e.target.value as 'hours' | 'days' } })} className="bg-transparent border-b border-stroke text-cream py-2 outline-none">
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="w-24">
                        <PctInput value={tr.pct} onChange={(v) => dispatch({ type: 'update_tranche', id: tr.id, patch: { pct: v } })} />
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" className={ghostButtonClass} onClick={() => dispatch({ type: 'remove_tranche', id: tr.id })} aria-label={`Remove tranche ${i + 1}`}>
                        remove
                      </button>
                      {err && <p className="text-[10px] text-danger normal-case tracking-normal mt-1">{err}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {errors.tranches && <p className="mt-2 text-xs text-danger">{errors.tranches}</p>}
      </div>
    </div>
  );
}

function RecurringFields({ state, errors, dispatch }: Props) {
  const r = state.recurring;
  const set = (patch: Partial<FormState['recurring']>) => dispatch({ type: 'set_recurring', patch });
  return (
    <div className="grid sm:grid-cols-3 gap-x-6 gap-y-8">
      <Field label="First unlock" error={errors.start}>
        <DateInput value={r.first} onChange={(v) => set({ first: v })} />
      </Field>
      <Field label="Every" error={errors.period}>
        <div className="flex gap-3 items-baseline border-b border-stroke focus-within:border-sand">
          <input type="text" inputMode="decimal" value={r.periodValue} onChange={(e) => set({ periodValue: e.target.value })} className="flex-1 bg-transparent border-0 px-0 py-2 text-cream outline-none font-mono w-20" />
          <select value={r.periodUnit} onChange={(e) => set({ periodUnit: e.target.value as FormState['recurring']['periodUnit'] })} className="bg-transparent text-cream font-mono text-xs py-2 outline-none">
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
            <option value="weeks">weeks</option>
          </select>
        </div>
      </Field>
      <Field label="Count" hint="Number of unlocks (1–1000)." error={errors.count}>
        <input type="text" inputMode="numeric" value={r.count} onChange={(e) => set({ count: e.target.value })} className={bareInputClass + ' font-mono'} />
      </Field>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck and commit**

Run: `cd frontend && npm run typecheck 2>&1 | tail -3`
Expected: clean (the new components are not yet imported by any page; that is fine).

```bash
git add frontend/src/components/create/fields.tsx frontend/src/components/create/TokenPicker.tsx frontend/src/lib/create/useTemplates.ts frontend/src/components/create/TemplateBar.tsx frontend/src/components/create/ShapeTabs.tsx frontend/src/components/create/ScheduleFields.tsx
git commit -m "feat(create): field primitives, TokenPicker, templates hook, TemplateBar, ShapeTabs, ScheduleFields"
```

---

### Task 11: Recipients — single/batch section, batch table, CSV import

**Files:**
- Create: `frontend/src/components/create/BatchTable.tsx`
- Create: `frontend/src/components/create/CsvImport.tsx`
- Create: `frontend/src/components/create/RecipientsSection.tsx`

**Interfaces:**
- Consumes: `ValidatedRow`, `rowsSummary`, `MAX_ROWS_PER_RUN` (Task 3); `FormState`, `FormAction` (Task 8); `formatStroops`; fields (Task 10).
- Produces: `RecipientsSection` props `{ state, dispatch, validated: ValidatedRow[], symbol: string }`; `BatchTable` props `{ rows: ValidatedRow[], symbol, onUpdate, onRemove, onAdd, onClear }`; `CsvImport` props `{ onImport(text), lastImport }`.

- [ ] **Step 1: `BatchTable.tsx`**

```tsx
// frontend/src/components/create/BatchTable.tsx
'use client';

import { formatStroops } from '@/lib/format';
import type { RowIssue, ValidatedRow } from '@/lib/create/rows';
import { bareInputClass, ghostButtonClass } from './fields';

type Props = {
  rows: ValidatedRow[];
  symbol: string;
  onUpdate: (id: string, patch: { recipient?: string; amount?: string }) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onClear: () => void;
};

function worst(issues: RowIssue[]): RowIssue['level'] | null {
  if (issues.some((i) => i.level === 'error')) return 'error';
  if (issues.some((i) => i.level === 'warning')) return 'warning';
  if (issues.length) return 'info';
  return null;
}

const LEVEL_CLASS: Record<RowIssue['level'], string> = {
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-cream-dim',
};
const LEVEL_GLYPH: Record<RowIssue['level'], string> = { error: '✗', warning: '!', info: 'i' };

function derived(row: ValidatedRow, symbol: string): string {
  if (!row.built) return '—';
  const spec = row.built.spec;
  switch (spec.tag) {
    case 'Linear': {
      const p = spec.values[0];
      const up = p.unlock_at_start + p.unlock_at_cliff;
      return up > 0n ? `${formatStroops(up)} ${symbol} unlocked up front` : 'continuous';
    }
    case 'Tranched': {
      const t = spec.values[0].tranches;
      return `${t.length} tranches, first ${formatStroops(t[0].amount)} ${symbol}`;
    }
    case 'Recurring': {
      const p = spec.values[0];
      return `${formatStroops(p.amount_per_period)} ${symbol} × ${p.count}`;
    }
  }
}

export default function BatchTable({ rows, symbol, onUpdate, onRemove, onAdd, onClear }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow text-cream-dim">Rows ({rows.length})</span>
        <div className="flex gap-4">
          <button type="button" className={ghostButtonClass} onClick={onAdd}>
            + Row
          </button>
          <button type="button" className={ghostButtonClass} onClick={onClear} disabled={rows.length === 0}>
            Clear all
          </button>
        </div>
      </div>
      <div className="overflow-x-auto border border-stroke">
        <table className="w-full min-w-[720px] font-mono text-xs">
          <thead className="text-cream-dim uppercase tracking-[0.12em] text-[10px] bg-night/40">
            <tr>
              <th className="text-left py-2 px-3 w-10">#</th>
              <th className="text-left py-2 px-3">Recipient</th>
              <th className="text-left py-2 px-3 w-40">Amount ({symbol})</th>
              <th className="text-left py-2 px-3">Schedule</th>
              <th className="py-2 px-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 px-3 text-center text-cream-dim">
                  No rows yet — add one or paste a list below.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const level = worst(r.issues);
              return (
                <tr key={r.id} className={'border-t border-stroke/60 align-top ' + (level === 'error' ? 'bg-danger/5' : '')}>
                  <td className="py-2 px-3 text-cream-dim">
                    {level ? (
                      <span className={LEVEL_CLASS[level]} title={r.issues.map((x) => x.message).join(' ')}>
                        {LEVEL_GLYPH[level]}
                      </span>
                    ) : (
                      <span className="text-success">✓</span>
                    )}{' '}
                    {i + 1}
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={r.recipient}
                      onChange={(e) => onUpdate(r.id, { recipient: e.target.value })}
                      placeholder="G…"
                      spellCheck={false}
                      autoComplete="off"
                      className={bareInputClass + ' min-w-[360px]'}
                      aria-label={`Recipient ${i + 1}`}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => onUpdate(r.id, { amount: e.target.value })}
                      className={bareInputClass}
                      aria-label={`Amount ${i + 1}`}
                    />
                  </td>
                  <td className="py-2 px-3 text-cream-dim">
                    <div>{derived(r, symbol)}</div>
                    {r.issues.map((x) => (
                      <div key={x.code} className={'text-[10px] mt-1 ' + LEVEL_CLASS[x.level]}>
                        {x.message}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button type="button" className={ghostButtonClass} onClick={() => onRemove(r.id)} aria-label={`Remove row ${i + 1}`}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `CsvImport.tsx`**

```tsx
// frontend/src/components/create/CsvImport.tsx
'use client';

import { useState } from 'react';
import type { Skipped } from '@/lib/create/rows';
import { ghostButtonClass } from './fields';

type Props = {
  onImport: (text: string) => void;
  lastImport?: { added: number; skipped: Skipped[] };
};

const REASON: Record<Skipped['reason'], string> = {
  header: 'header row',
  missing_amount: 'no amount',
  limit: 'over the 500-row limit',
};

export default function CsvImport({ onImport, lastImport }: Props) {
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  function importText() {
    if (!text.trim()) return;
    onImport(text);
    setText('');
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    try {
      const content = await file.text();
      onImport(content);
    } catch {
      setFileError('Could not read that file.');
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="eyebrow text-cream-dim block mb-2">Paste rows</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={'GABC…,100\nGDEF…,250.5\n# one recipient per line: address, amount'}
          spellCheck={false}
          className="w-full bg-night/40 border border-stroke px-3 py-2 font-mono text-xs text-cream placeholder:text-cream-dim/50 outline-none focus:border-sand"
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={ghostButtonClass} onClick={importText} disabled={!text.trim()}>
          Add rows
        </button>
        <label className={ghostButtonClass + ' cursor-pointer'}>
          Upload .csv
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <span className="text-[10px] text-cream-dim/70">Separators: comma, semicolon, tab or spaces. Extra columns are ignored.</span>
      </div>
      {fileError && <p className="text-xs text-danger">{fileError}</p>}
      {lastImport && (
        <p className="text-xs text-cream-dim">
          Added {lastImport.added} row{lastImport.added === 1 ? '' : 's'}
          {lastImport.skipped.length > 0 && (
            <>
              {' '}· skipped {lastImport.skipped.length}:{' '}
              {lastImport.skipped.slice(0, 8).map((s) => `line ${s.line} (${REASON[s.reason]})`).join(', ')}
              {lastImport.skipped.length > 8 ? ', …' : ''}
            </>
          )}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `RecipientsSection.tsx`**

```tsx
// frontend/src/components/create/RecipientsSection.tsx
'use client';

import type { Dispatch } from 'react';
import type { FormAction, FormState } from '@/lib/create/formState';
import { MAX_ROWS_PER_RUN, rowsSummary, type ValidatedRow } from '@/lib/create/rows';
import { formatStroops } from '@/lib/format';
import BatchTable from './BatchTable';
import CsvImport from './CsvImport';
import { AmountInput, Field, bareInputClass } from './fields';

type Props = {
  state: FormState;
  dispatch: Dispatch<FormAction>;
  validated: ValidatedRow[];
  symbol: string;
  singleErrors: { recipient?: string; amount?: string };
};

export default function RecipientsSection({ state, dispatch, validated, symbol, singleErrors }: Props) {
  const summary = rowsSummary(validated);
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Recipients mode">
        {(['single', 'batch'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={state.mode === m}
            onClick={() => dispatch({ type: 'set_mode', mode: m })}
            className={
              'px-4 py-2 rounded-none border font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ' +
              (state.mode === m ? 'border-sand bg-sand/10 text-sand-bright' : 'border-stroke text-cream hover:border-stroke-2')
            }
          >
            {m === 'single' ? 'Single recipient' : 'Batch'}
          </button>
        ))}
      </div>

      {state.mode === 'single' ? (
        <div className="grid sm:grid-cols-[1fr_200px] gap-x-6 gap-y-8">
          <Field label="Recipient address" hint="56-character Stellar account public key (G…)." error={singleErrors.recipient}>
            <input
              type="text"
              value={state.single.recipient}
              onChange={(e) => dispatch({ type: 'set_single', patch: { recipient: e.target.value } })}
              placeholder="GABCD…"
              className={bareInputClass + ' font-mono'}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Total amount" hint="What the recipient receives in full." error={singleErrors.amount}>
            <AmountInput value={state.single.amount} onChange={(v) => dispatch({ type: 'set_single', patch: { amount: v } })} symbol={symbol} />
          </Field>
        </div>
      ) : (
        <div className="space-y-8">
          <BatchTable
            rows={validated}
            symbol={symbol}
            onUpdate={(id, patch) => dispatch({ type: 'update_row', id, patch })}
            onRemove={(id) => dispatch({ type: 'remove_row', id })}
            onAdd={() => dispatch({ type: 'add_row' })}
            onClear={() => dispatch({ type: 'clear_rows' })}
          />
          <CsvImport onImport={(text) => dispatch({ type: 'import_rows', text })} lastImport={state.batch.lastImport} />
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs border-t border-stroke pt-4">
            <div>
              <dt className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">Rows</dt>
              <dd className="text-cream">
                {summary.count} / {MAX_ROWS_PER_RUN}
              </dd>
            </div>
            <div>
              <dt className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">Total</dt>
              <dd className="text-sand-bright">
                {formatStroops(summary.total)} {symbol}
                {summary.adjustment < 0n && <span className="block text-[10px] text-cream-dim">adjusted {formatStroops(summary.adjustment)}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">Errors</dt>
              <dd className={summary.errors ? 'text-danger' : 'text-cream'}>{summary.errors}</dd>
            </div>
            <div>
              <dt className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">Warnings</dt>
              <dd className={summary.warnings ? 'text-warning' : 'text-cream'}>{summary.warnings}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `cd frontend && npm run typecheck 2>&1 | tail -3`
Expected: clean.

```bash
git add frontend/src/components/create/BatchTable.tsx frontend/src/components/create/CsvImport.tsx frontend/src/components/create/RecipientsSection.tsx
git commit -m "feat(create): recipients section with batch table and CSV import"
```

---

### Task 12: `CreatePreview` for all shapes and batch totals

**Files:**
- Modify: `frontend/src/components/CreatePreview.tsx` (rewrite; keep the file name and default export so the page import stays `@/components/CreatePreview`)

**Interfaces:**
- Consumes: `Schedule`, `buildSpec`, `scheduleStart`, `scheduleEnd` (Task 1); `formatStroops`, `formatDuration`, `truncAddress`.
- Produces: `CreatePreview` props `{ schedule: Schedule | null; total: bigint | null; recipients: number; recipient?: string; symbol: string; glyphColor?: string; cancelable: boolean; transferable: boolean }`.

- [ ] **Step 1: Rewrite the component**

```tsx
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
  return (
    <div className="space-y-6">
      <EmissionSketch schedule={schedule} total={total} symbol={symbol} recipients={recipients} />
      <SpecSheet schedule={schedule} total={total} recipients={recipients} recipient={recipient} symbol={symbol} glyphColor={glyphColor} cancelable={cancelable} transferable={transferable} />
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

function EmissionSketch({ schedule, total, symbol, recipients }: { schedule: Schedule | null; total: bigint | null; symbol: string; recipients: number }) {
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

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

function SpecSheet({ schedule, total, recipients, recipient, symbol, glyphColor, cancelable, transferable }: Omit<Props, 'glyphColor'> & { glyphColor: string }) {
  const nowSec = Math.floor(Date.now() / 1000);
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
          rows.push({ label: 'Linear rate', value: `${(Number(remaining) / vestingDur / 1e7).toFixed(7)} ${symbol} / sec`, accent: 'text-cream-muted' });
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
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck 2>&1 | tail -6`
Expected: exactly one error — `src/app/create/page.tsx` still passes the old `parsed` prop. That page is replaced in Task 14; to keep this task green, temporarily change that call site in `page.tsx` to `<CreatePreview schedule={null} total={null} recipients={1} recipient={recipient} symbol={symbol} glyphColor={selectedToken?.glyphColor} cancelable={cancelable} transferable={transferable} />` and re-run: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CreatePreview.tsx frontend/src/app/create/page.tsx
git commit -m "feat(create): preview sketch and spec sheet for linear, tranched and recurring"
```

---

### Task 13: Batch runner hook and execution UI

**Files:**
- Create: `frontend/src/lib/create/useBatchRunner.ts`
- Create: `frontend/src/components/create/BatchProgress.tsx`
- Create: `frontend/src/components/create/CreateResult.tsx`
- Create: `frontend/src/components/create/ResumeBanner.tsx`

**Interfaces:**
- Consumes: Task 5 (`BatchRun`, `RunAction`, `runReducer`, `loadStoredRun`, `runProgress`, `BATCH_RUN_KEY`), Task 6 (`runBatch`), Task 7 (`prepareBatch`, `sendPrepared`, `LockupClient`, `txUrl`, `accountUrl`), Task 2 (`safeStorage`, `writeJson`), Task 4 (`describeError`).
- Produces: `useBatchRunner(getLockup)` → `{ run, stored, busy, persisted, start, resume, pause, shift, abort, load, discard }`; `BatchProgress` props `{ run, busy, persisted, onPause, onContinue, onShift, onAbort }`; `CreateResult` props `{ run, onReset }`; `ResumeBanner` props `{ run, onResume, onDiscard }`.

- [ ] **Step 1: `useBatchRunner.ts`**

```ts
// frontend/src/lib/create/useBatchRunner.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import type { LockupClient } from '@/lib/sdk';
import { BATCH_RUN_KEY, loadStoredRun, runReducer, type BatchRun, type RunAction } from './batchPlan';
import { runBatch } from './runner';
import { safeStorage, writeJson } from './storage';
import { prepareBatch, sendPrepared } from './submit';

/**
 * Owns the live BatchRun: a ref (so the runner's synchronous `dispatch` and
 * `getRun` agree), mirrored into React state for rendering, and persisted to
 * sessionStorage after every transition.
 */
export function useBatchRunner(getLockup: () => LockupClient | null) {
  const storage = useMemo(() => safeStorage('session'), []);
  const [run, setRun] = useState<BatchRun | null>(null);
  /** An unfinished run found in storage at mount (drives the ResumeBanner). */
  const [stored, setStored] = useState<BatchRun | null>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef<BatchRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setStored(loadStoredRun(storage));
  }, [storage]);

  const persist = useCallback(
    (r: BatchRun) => {
      writeJson(storage, BATCH_RUN_KEY, r);
    },
    [storage],
  );

  const dispatch = useCallback((a: RunAction) => {
    if (!runRef.current) return;
    runRef.current = runReducer(runRef.current, a);
    setRun(runRef.current);
  }, []);

  const loop = useCallback(async () => {
    const lockup = getLockup();
    if (!lockup || !runRef.current) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    try {
      await runBatch(
        {
          buildChunk: (r, chunk) =>
            prepareBatch(lockup, {
              sender: r.sender,
              token: r.token,
              schedule: chunk.schedule,
              cancelable: r.cancelable,
              transferable: r.transferable,
              rows: chunk.rowIds.map((id) => ({ recipient: r.rows[id].recipient, total: BigInt(r.rows[id].total) })),
            }),
          sendChunk: (tx) => sendPrepared(tx as AssembledTransaction<number[]>),
          dispatch,
          getRun: () => runRef.current as BatchRun,
          persist,
        },
        ac.signal,
      );
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  }, [getLockup, dispatch, persist]);

  const sync = useCallback(() => {
    if (runRef.current) persist(runRef.current);
  }, [persist]);

  const start = useCallback(
    (initial: BatchRun) => {
      runRef.current = initial;
      setRun(initial);
      setStored(null);
      persist(initial);
      void loop();
    },
    [loop, persist],
  );
  const resume = useCallback(() => {
    dispatch({ type: 'resume' });
    sync();
    void loop();
  }, [dispatch, sync, loop]);
  const pause = useCallback(() => {
    dispatch({ type: 'pause' });
    sync();
  }, [dispatch, sync]);
  const shift = useCallback(
    (seconds: number) => {
      dispatch({ type: 'shift_remaining', seconds });
      sync();
      void loop();
    },
    [dispatch, sync, loop],
  );
  const abort = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'abort' });
    sync();
  }, [dispatch, sync]);
  /** Take over a stored run (from the ResumeBanner); stays paused until `resume`. */
  const load = useCallback(
    (r: BatchRun) => {
      runRef.current = r;
      setRun(r);
      setStored(null);
      persist(r);
    },
    [persist],
  );
  const discard = useCallback(() => {
    abortRef.current?.abort();
    runRef.current = null;
    setRun(null);
    setStored(null);
    storage?.removeItem(BATCH_RUN_KEY);
  }, [storage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { run, stored, busy, persisted: storage !== null, start, resume, pause, shift, abort, load, discard };
}
```

- [ ] **Step 2: `BatchProgress.tsx`**

```tsx
// frontend/src/components/create/BatchProgress.tsx
'use client';

import { describeError } from '@/lib/create/errors';
import { runProgress, type BatchRun, type Chunk } from '@/lib/create/batchPlan';
import { accountUrl, txUrl } from '@/lib/explorer';
import { ghostButtonClass, secondaryButtonClass } from './fields';

type Props = {
  run: BatchRun;
  busy: boolean;
  persisted: boolean;
  onPause: () => void;
  onContinue: () => void;
  onShift: () => void;
  onAbort: () => void;
};

const STATUS_LABEL: Record<Chunk['status'], string> = {
  pending: 'waiting',
  simulating: 'simulating…',
  signing: 'sign in your wallet',
  submitting: 'submitting…',
  done: 'done',
  failed: 'failed',
};

function stepText(run: BatchRun): string {
  const p = runProgress(run);
  const active = run.chunks.find((c) => c.status === 'simulating' || c.status === 'signing' || c.status === 'submitting');
  if (run.phase === 'running' && active) {
    return `Transaction ${active.index + 1} of ${p.total} — ${active.rowIds.length} streams — ${STATUS_LABEL[active.status]}`;
  }
  if (run.phase === 'paused') {
    switch (run.pauseReason) {
      case 'rejected':
        return 'Signature rejected. Nothing was sent for this transaction.';
      case 'start_in_past':
        return 'The start time has passed while signing. Shift the remaining rows and continue.';
      case 'user':
        return 'Paused. Continue when you are ready.';
      default:
        return 'A transaction failed. Retry or stop.';
    }
  }
  return `${p.done} of ${p.total} transactions done — ${p.streams} streams created.`;
}

export default function BatchProgress({ run, busy, persisted, onPause, onContinue, onShift, onAbort }: Props) {
  const p = runProgress(run);
  const failed = run.chunks.find((c) => c.status === 'failed');
  const interrupted = failed?.error?.message.startsWith('Interrupted');
  const explorerAccount = accountUrl(run.sender);
  const shiftedCount = run.chunks.filter((c) => c.status !== 'done').reduce((n, c) => n + c.rowIds.length, 0);

  return (
    <section className="mt-10 space-y-8" aria-label="Batch progress">
      <div>
        <p className="eyebrow text-cream-dim mb-2">· Creating {Object.keys(run.rows).length} streams</p>
        <p className="font-mono text-sm text-cream" aria-live="polite">
          {stepText(run)}
        </p>
        {!persisted && <p className="mt-2 text-xs text-warning">Progress will not survive a page reload in this browser.</p>}
        <p className="mt-2 text-xs text-cream-dim/80">Each transaction is signed separately. Streams created by a signed transaction are final.</p>
      </div>

      <ol className="border border-stroke divide-y divide-stroke/60 font-mono text-xs">
        {run.chunks.map((c) => {
          const link = c.txHash ? txUrl(c.txHash) : null;
          return (
            <li key={c.index} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="text-cream-dim w-8">#{c.index + 1}</span>
              <span className="text-cream w-28">{c.rowIds.length} streams</span>
              <span
                className={
                  'w-40 ' +
                  (c.status === 'done' ? 'text-success' : c.status === 'failed' ? 'text-danger' : c.status === 'pending' ? 'text-cream-dim' : 'text-sand-bright')
                }
              >
                {STATUS_LABEL[c.status]}
              </span>
              {c.streamIds && c.streamIds.length > 0 && (
                <span className="text-cream-dim">
                  ids {c.streamIds[0]}–{c.streamIds[c.streamIds.length - 1]}
                </span>
              )}
              {c.txHash &&
                (link ? (
                  <a href={link} target="_blank" rel="noreferrer" className="text-sand hover:text-sand-bright underline-offset-2 hover:underline">
                    tx {c.txHash.slice(0, 8)}…
                  </a>
                ) : (
                  <span className="text-cream-dim">tx {c.txHash.slice(0, 8)}…</span>
                ))}
              {c.status === 'failed' && c.error && <span className="basis-full text-danger">{describeError(c.error)}</span>}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-4">
        {run.phase === 'running' && (
          <button type="button" className={secondaryButtonClass} onClick={onPause} disabled={!busy}>
            Pause after this transaction
          </button>
        )}
        {run.phase === 'paused' && run.pauseReason === 'start_in_past' && (
          <button type="button" className={secondaryButtonClass} onClick={onShift}>
            Shift {shiftedCount} remaining rows by +15 min and continue
          </button>
        )}
        {run.phase === 'paused' && run.pauseReason !== 'start_in_past' && (
          <button type="button" className={secondaryButtonClass} onClick={onContinue}>
            {run.pauseReason === 'user' ? 'Continue' : 'Retry'}
          </button>
        )}
        {run.phase !== 'completed' && (
          <button type="button" className={ghostButtonClass} onClick={onAbort}>
            Stop here ({p.done} done)
          </button>
        )}
      </div>

      {interrupted && (
        <p className="text-xs text-warning">
          This transaction may have been sent before the page closed. Check the sender account on the explorer
          {explorerAccount && (
            <>
              {' '}
              (
              <a href={explorerAccount} target="_blank" rel="noreferrer" className="underline">
                open
              </a>
              )
            </>
          )}{' '}
          before retrying, or the streams could be created twice.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: `CreateResult.tsx`**

```tsx
// frontend/src/components/create/CreateResult.tsx
'use client';

import Link from 'next/link';
import { runProgress, type BatchRun } from '@/lib/create/batchPlan';
import { txUrl } from '@/lib/explorer';
import { primaryButtonClass, secondaryButtonClass } from './fields';

export default function CreateResult({ run, onReset }: { run: BatchRun; onReset: () => void }) {
  const p = runProgress(run);
  const aborted = run.phase === 'aborted';
  const remaining = Object.keys(run.rows).length - p.streams;
  return (
    <section className="mt-10 space-y-8" aria-label="Batch result">
      <div>
        <p className={`eyebrow mb-2 ${aborted ? 'text-warning' : 'text-success'}`}>· {aborted ? 'Stopped' : 'Done'}</p>
        <p className="font-mono text-sm text-cream">
          {p.streams} streams created in {p.done} transaction{p.done === 1 ? '' : 's'}.
          {aborted && remaining > 0 && ` ${remaining} rows were not created.`}
        </p>
      </div>
      <ol className="border border-stroke divide-y divide-stroke/60 font-mono text-xs">
        {run.chunks
          .filter((c) => c.status === 'done')
          .map((c) => {
            const link = c.txHash ? txUrl(c.txHash) : null;
            return (
              <li key={c.index} className="px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-cream-dim">#{c.index + 1}</span>
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="text-sand hover:text-sand-bright underline-offset-2 hover:underline">
                      tx {c.txHash?.slice(0, 12)}…
                    </a>
                  ) : (
                    <span className="text-cream-dim">tx {c.txHash?.slice(0, 12) || '—'}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(c.streamIds ?? []).map((id) => (
                    <Link key={id} href={`/stream/${id}`} className="border border-stroke px-2 py-1 text-cream hover:border-sand hover:text-sand-bright transition-colors">
                      #{id}
                    </Link>
                  ))}
                </div>
              </li>
            );
          })}
      </ol>
      <div className="flex flex-wrap gap-4">
        <Link href="/dashboard" className={primaryButtonClass + ' sm:w-auto'}>
          Go to dashboard →
        </Link>
        <button type="button" className={secondaryButtonClass} onClick={onReset}>
          Create another
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `ResumeBanner.tsx`**

```tsx
// frontend/src/components/create/ResumeBanner.tsx
'use client';

import { runProgress, type BatchRun } from '@/lib/create/batchPlan';
import { ghostButtonClass, secondaryButtonClass } from './fields';

export default function ResumeBanner({ run, onResume, onDiscard }: { run: BatchRun; onResume: () => void; onDiscard: () => void }) {
  const p = runProgress(run);
  const when = new Date(run.createdAt * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const left = p.total - p.done;
  return (
    <div className="mt-10 border border-warning/40 bg-warning/5 px-5 py-4 space-y-3">
      <p className="eyebrow text-warning">· Unfinished batch</p>
      <p className="text-sm text-cream-muted leading-relaxed">
        {run.phase === 'completed'
          ? `A batch from ${when} finished (${p.streams} streams).`
          : `A batch from ${when} is unfinished — ${left} of ${p.total} transaction${p.total === 1 ? '' : 's'} left (${p.streams} streams created so far).`}
      </p>
      <div className="flex flex-wrap gap-4">
        <button type="button" className={secondaryButtonClass} onClick={onResume}>
          {run.phase === 'completed' ? 'Show result' : 'Resume'}
        </button>
        <button type="button" className={ghostButtonClass} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `cd frontend && npm run typecheck 2>&1 | tail -3`
Expected: clean.

```bash
git add frontend/src/lib/create/useBatchRunner.ts frontend/src/components/create/BatchProgress.tsx frontend/src/components/create/CreateResult.tsx frontend/src/components/create/ResumeBanner.tsx
git commit -m "feat(create): batch runner hook, progress, result and resume UI"
```

---

### Task 14: Compose the new `/create` page

**Files:**
- Modify: `frontend/src/app/create/page.tsx` (replace the whole file)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Replace `page.tsx`**

```tsx
// frontend/src/app/create/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-context';
import { useToast } from '@/lib/toast';
import { makeLockup } from '@/lib/sdk';
import { DEPLOYMENT, hasDeployment } from '@/lib/deployments';
import { TOKENS, findToken } from '@/lib/tokens';
import { formatStroops, isStellarAddress, parseXlmToStroops, truncAddress } from '@/lib/format';
import { formReducer, initialFormState, parseForm } from '@/lib/create/formState';
import { hasRowErrors, rowsSummary, validateRows } from '@/lib/create/rows';
import { deriveTemplate } from '@/lib/create/schedule';
import { findTemplate } from '@/lib/create/templates';
import { useTemplates } from '@/lib/create/useTemplates';
import { DEFAULT_CHUNK_ROWS, planRun } from '@/lib/create/batchPlan';
import { useBatchRunner } from '@/lib/create/useBatchRunner';
import { submitSingle } from '@/lib/create/submit';
import { classifyTxError, describeError } from '@/lib/create/errors';
import { FEE_RESERVE_STROOPS, fetchTokenBalance } from '@/lib/create/balance';
import ConfirmDialog from '@/components/ConfirmDialog';
import CreatePreview from '@/components/CreatePreview';
import BatchProgress from '@/components/create/BatchProgress';
import CreateResult from '@/components/create/CreateResult';
import RecipientsSection from '@/components/create/RecipientsSection';
import ResumeBanner from '@/components/create/ResumeBanner';
import ScheduleFields from '@/components/create/ScheduleFields';
import ShapeTabs from '@/components/create/ShapeTabs';
import TemplateBar from '@/components/create/TemplateBar';
import TokenPicker from '@/components/create/TokenPicker';
import { Field, NoDeploymentWarning, SubmittingDots, ToggleRow, primaryButtonClass } from '@/components/create/fields';

const nowSec = () => Math.floor(Date.now() / 1000);

export default function CreateStreamPage() {
  const router = useRouter();
  const { address, connect } = useWallet();
  const toast = useToast();
  const templates = useTemplates();

  const [state, dispatch] = useReducer(formReducer, undefined, () => initialFormState(nowSec(), TOKENS));
  // Re-validate the start margin every 30 s so a form left open does not submit a stale start.
  const [tick, setTick] = useState(nowSec);
  useEffect(() => {
    const id = setInterval(() => setTick(nowSec()), 30_000);
    return () => clearInterval(id);
  }, []);

  const parsed = useMemo(() => parseForm(state, tick), [state, tick]);
  const schedule = parsed.valid ? parsed.schedule : null;
  const selectedToken = findToken(state.token);
  const symbol = selectedToken?.symbol ?? 'TOKEN';

  const validated = useMemo(
    () => (state.mode === 'batch' ? validateRows(state.batch.rows, { sender: address, schedule }) : []),
    [state.mode, state.batch.rows, address, schedule],
  );
  const summary = useMemo(() => rowsSummary(validated), [validated]);
  const batchTxs = Math.ceil(validated.filter((r) => r.built).length / DEFAULT_CHUNK_ROWS);

  const singleTotal = useMemo(() => {
    try {
      const v = parseXlmToStroops(state.single.amount);
      return v > 0n && !/\.\d{8,}/.test(state.single.amount) ? v : null;
    } catch {
      return null;
    }
  }, [state.single.amount]);
  const singleErrors = {
    recipient: state.single.recipient && !isStellarAddress(state.single.recipient) ? 'Recipient must be a valid G… Stellar address.' : undefined,
    amount: state.single.amount && singleTotal === null ? 'Enter an amount greater than 0 (up to 7 decimals).' : undefined,
  };

  const getLockup = useCallback(() => (address ? makeLockup(address) : null), [address]);
  const runner = useBatchRunner(getLockup);

  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { total: bigint; rows: number; txs: number; note: string | null }>(null);

  /* ---------------- templates ---------------- */
  const knownTokens = useMemo(() => TOKENS.map((t) => t.id), []);
  function applyTemplate(id: string) {
    const t = findTemplate(templates.user, id);
    if (t) dispatch({ type: 'apply_template', template: t, nowSec: nowSec(), knownTokens });
  }
  function draft(name: string, id?: string) {
    if (!parsed.schedule) return null;
    return {
      id,
      name,
      schedule: deriveTemplate(parsed.schedule, nowSec()),
      token: selectedToken ? state.token : undefined,
      cancelable: state.cancelable,
      transferable: state.transferable,
    };
  }
  function saveNewTemplate(name: string): string | null {
    const d = draft(name);
    if (!d) return 'Fix the schedule before saving it as a template.';
    const r = templates.save(d, nowSec());
    if (!r.ok) return r.reason;
    dispatch({ type: 'template_saved', templateId: r.template.id });
    toast.push({ kicker: 'Template saved', message: r.template.name });
    return null;
  }
  function updateSelectedTemplate(): string | null {
    const cur = state.templateId ? findTemplate(templates.user, state.templateId) : undefined;
    if (!cur || cur.builtIn) return 'Select one of your templates first.';
    const d = draft(cur.name, cur.id);
    if (!d) return 'Fix the schedule before saving it as a template.';
    const r = templates.save(d, nowSec());
    if (!r.ok) return r.reason;
    dispatch({ type: 'template_saved', templateId: cur.id });
    return null;
  }
  function renameTemplate(id: string, name: string): string | null {
    const r = templates.rename(id, name);
    return r.ok ? null : r.reason;
  }
  function deleteTemplate(id: string) {
    if (templates.remove(id) && state.templateId === id) dispatch({ type: 'clear_template' });
  }

  /* ---------------- guards shared by both modes ---------------- */
  function guard(): boolean {
    setError(null);
    if (!hasDeployment()) {
      setError('No on-chain deployment found. Run ./scripts/deploy-local.sh first.');
      return false;
    }
    if (!address) {
      setError('Connect a wallet first.');
      return false;
    }
    if (!schedule) {
      setError(Object.values(parsed.errors)[0] ?? 'Fix the schedule first.');
      return false;
    }
    if (!state.token) {
      setError('Select a token.');
      return false;
    }
    return true;
  }

  /* ---------------- single ---------------- */
  async function onSubmitSingle() {
    if (!guard() || !address || !schedule) return;
    const recipient = state.single.recipient.trim();
    if (!isStellarAddress(recipient)) {
      setError('Recipient must be a valid G… Stellar address.');
      return;
    }
    if (singleTotal === null) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setSubmitting(true);
    try {
      const { streamId } = await submitSingle(makeLockup(address), {
        sender: address,
        recipient,
        token: state.token,
        schedule,
        total: singleTotal,
        cancelable: state.cancelable,
        transferable: state.transferable,
      });
      toast.push({
        kicker: `Stream #${streamId} / created`,
        message: `${formatStroops(singleTotal)} ${symbol} streaming to ${truncAddress(recipient)}.`,
      });
      router.push(`/stream/${streamId}`);
    } catch (e) {
      console.error(e);
      setError(describeError(classifyTxError(e)));
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- batch ---------------- */
  async function onPreflightBatch() {
    if (!guard() || !address) return;
    if (validated.length === 0) {
      setError('Add at least one row.');
      return;
    }
    if (hasRowErrors(validated)) {
      setError('Fix the rows marked ✗ first.');
      return;
    }
    setChecking(true);
    try {
      const balance = selectedToken ? await fetchTokenBalance(DEPLOYMENT.horizonUrl, address, selectedToken) : null;
      if (balance !== null && summary.total > balance) {
        setError(`Insufficient balance: need ${formatStroops(summary.total)} ${symbol}, have ${formatStroops(balance)} ${symbol}.`);
        return;
      }
      let note: string | null = null;
      if (balance === null) note = 'Could not verify your balance.';
      else if (selectedToken?.symbol === 'XLM' && balance - summary.total < FEE_RESERVE_STROOPS) {
        note = 'Less than 5 XLM would remain for fees and reserves.';
      }
      setConfirm({ total: summary.total, rows: validated.length, txs: batchTxs, note });
    } finally {
      setChecking(false);
    }
  }
  function onConfirmBatch() {
    if (!address || !schedule) return;
    const run = planRun({
      sender: address,
      token: state.token,
      cancelable: state.cancelable,
      transferable: state.transferable,
      schedule,
      rows: validated,
      nowMs: Date.now(),
    });
    setConfirm(null);
    runner.start(run);
  }

  const run = runner.run;
  const batchDisabled = validated.length === 0 || hasRowErrors(validated) || !schedule || checking;

  return (
    <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24 pt-10 sm:pt-16 md:pt-24 xl:pt-28">
      <div className="grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px] 2xl:grid-cols-[1fr_560px] gap-x-8 lg:gap-x-10 xl:gap-x-16 2xl:gap-x-20 gap-y-10 items-start">
        <div className="max-w-[720px] xl:max-w-[860px] 2xl:max-w-[1000px]">
          <p className="eyebrow mb-6 sm:mb-8 xl:text-[0.78rem] 2xl:text-[0.85rem]">
            <span className="text-sand">·</span> <span className="ml-1">Create</span>{' '}
            <span className="mx-2 text-stroke-2">/</span> {state.mode === 'batch' ? 'Batch' : 'Stream'}
          </p>
          <h1 className="headline text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-[7rem] 2xl:text-[8.5rem] text-cream">
            Define the
            <br />
            <span className="text-sand-bright">schedule.</span>
          </h1>
          <p className="mt-6 sm:mt-8 xl:mt-10 max-w-[540px] xl:max-w-[640px] 2xl:max-w-[720px] text-base sm:text-lg xl:text-xl 2xl:text-2xl leading-relaxed text-cream-muted">
            Lock a SEP-41 asset and release it on a precise vesting curve — to one recipient or to a whole list.
          </p>

          {!hasDeployment() && <NoDeploymentWarning />}

          {runner.stored && !run && (
            <ResumeBanner run={runner.stored} onResume={() => runner.load(runner.stored as NonNullable<typeof runner.stored>)} onDiscard={runner.discard} />
          )}

          {run ? (
            run.phase === 'completed' || run.phase === 'aborted' ? (
              <CreateResult run={run} onReset={runner.discard} />
            ) : (
              <BatchProgress
                run={run}
                busy={runner.busy}
                persisted={runner.persisted}
                onPause={runner.pause}
                onContinue={runner.resume}
                onShift={() => runner.shift(900)}
                onAbort={runner.abort}
              />
            )
          ) : (
            <form
              className="mt-10 sm:mt-16 space-y-10 sm:space-y-12"
              onSubmit={(e) => {
                e.preventDefault();
                if (state.mode === 'single') void onSubmitSingle();
                else void onPreflightBatch();
              }}
              noValidate
            >
              <TemplateBar
                builtIn={templates.builtIn}
                user={templates.user}
                selectedId={state.templateId}
                dirty={state.templateDirty}
                canSave={templates.canSave}
                onApply={applyTemplate}
                onClear={() => dispatch({ type: 'clear_template' })}
                onSaveNew={saveNewTemplate}
                onUpdate={updateSelectedTemplate}
                onRename={renameTemplate}
                onDelete={deleteTemplate}
              />

              <Field label="Token">
                <TokenPicker tokens={TOKENS} selectedId={state.token} onSelect={(id) => dispatch({ type: 'set_token', token: id })} />
              </Field>

              <div>
                <span className="eyebrow text-cream-dim block mb-3">Shape</span>
                <ShapeTabs shape={state.shape} onChange={(shape) => dispatch({ type: 'set_shape', shape })} />
              </div>

              <ScheduleFields state={state} errors={parsed.errors} dispatch={dispatch} />

              <div>
                <span className="eyebrow text-cream-dim block mb-3">Recipients</span>
                <RecipientsSection state={state} dispatch={dispatch} validated={validated} symbol={symbol} singleErrors={singleErrors} />
              </div>

              <div className="space-y-6">
                <ToggleRow
                  label="Cancelable"
                  hint="Sender can cancel and reclaim unstreamed funds. Can be renounced later."
                  value={state.cancelable}
                  onChange={(v) => dispatch({ type: 'set_flag', flag: 'cancelable', value: v })}
                />
                <ToggleRow
                  label="Transferable"
                  hint="Recipient can transfer the NFT receipt to a new owner."
                  value={state.transferable}
                  onChange={(v) => dispatch({ type: 'set_flag', flag: 'transferable', value: v })}
                />
              </div>

              {error && <p className="font-mono text-xs text-danger border-l-2 border-danger pl-4 py-2">{error}</p>}

              {address ? (
                <button
                  type="submit"
                  disabled={submitting || (state.mode === 'single' ? !schedule : batchDisabled)}
                  className={primaryButtonClass}
                >
                  {submitting || checking ? (
                    <span className="flex items-center gap-2">
                      <SubmittingDots /> {checking ? 'Checking…' : 'Submitting…'}
                    </span>
                  ) : state.mode === 'single' ? (
                    <>
                      Sign and create stream <span className="text-base leading-none">→</span>
                    </>
                  ) : (
                    <>
                      Create {summary.valid} stream{summary.valid === 1 ? '' : 's'} in {batchTxs} transaction{batchTxs === 1 ? '' : 's'}{' '}
                      <span className="text-base leading-none">→</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={connect}
                  className="w-full flex items-center justify-center gap-3 text-sand px-7 py-4 text-[11px] uppercase tracking-[0.18em] font-medium rounded-none border border-sand/60 hover:border-sand hover:text-sand-bright hover:bg-sand/5 transition-colors duration-200"
                >
                  Connect wallet to continue <span className="text-base leading-none">→</span>
                </button>
              )}
            </form>
          )}
        </div>

        <aside className="hidden md:block md:sticky md:top-32">
          <p className="eyebrow text-cream-dim mb-4">· Preview</p>
          <CreatePreview
            schedule={parsed.schedule}
            total={state.mode === 'single' ? singleTotal : summary.total > 0n ? summary.total : null}
            recipients={state.mode === 'single' ? 1 : validated.length}
            recipient={state.mode === 'single' ? state.single.recipient : undefined}
            symbol={symbol}
            glyphColor={selectedToken?.glyphColor}
            cancelable={state.cancelable}
            transferable={state.transferable}
          />
          <p className="mt-5 text-[11px] text-cream-dim/80 leading-relaxed">
            Curve sketch + spec sheet update live as you edit. Recipients will see exactly this schedule on-chain.
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onDismiss={() => setConfirm(null)}
        onConfirm={onConfirmBatch}
        kicker="Confirm batch"
        title={`Create ${confirm?.rows ?? 0} streams?`}
        confirmLabel={`Sign ${confirm?.txs ?? 0} transaction${(confirm?.txs ?? 0) === 1 ? '' : 's'}`}
      >
        {confirm && (
          <div className="space-y-3 text-sm text-cream-muted leading-relaxed">
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 font-mono text-xs">
              <dt className="text-cream-dim">token</dt>
              <dd className="text-cream">{symbol}</dd>
              <dt className="text-cream-dim">shape</dt>
              <dd className="text-cream">{state.shape}</dd>
              <dt className="text-cream-dim">recipients</dt>
              <dd className="text-cream">{confirm.rows}</dd>
              <dt className="text-cream-dim">total</dt>
              <dd className="text-sand-bright">
                {formatStroops(confirm.total)} {symbol}
                {summary.adjustment < 0n && <span className="text-cream-dim"> (adjusted {formatStroops(summary.adjustment)})</span>}
              </dd>
              <dt className="text-cream-dim">transactions</dt>
              <dd className="text-cream">{confirm.txs}</dd>
            </dl>
            {confirm.note && <p className="text-warning text-xs">{confirm.note}</p>}
            <p className="text-xs">Each transaction is signed separately; streams created by a signed transaction are final.</p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, tests, production build**

Run: `cd frontend && npm run typecheck 2>&1 | tail -3 && npm test 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | tail -15`
Expected: typecheck clean; all tests pass; `next build` succeeds (the `/create` route compiles; warnings about `Date.now()` in client components are acceptable).

- [ ] **Step 3: Dev smoke (no wallet needed)**

Run: `cd frontend && (npm run dev > /tmp/hg-dev.log 2>&1 &) && sleep 8 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/create && curl -s http://localhost:3000/create | grep -o "Define the" | head -1; pkill -f "next dev" || true`
Expected: `200` and `Define the`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/create/page.tsx
git commit -m "feat(create): unified create page — shapes, single/batch recipients, templates, chunked signing"
```

---

### Task 15: Real error vectors, evidence doc, README updates

**Files:**
- Create: `frontend/scripts/capture-create-errors.ts`
- Modify: `frontend/src/lib/create/errors.test.ts` (append real vectors), `frontend/src/lib/create/errors.ts` (only if a captured message does not classify as expected)
- Create: `docs/evidence/2026-09-create-flow-testnet.md`
- Modify: `frontend/README.md` (new "Create flow" section after "Layout"), `README.md` (status line)

- [ ] **Step 1: Capture script (simulation only — no signing, no secrets)**

```ts
// frontend/scripts/capture-create-errors.ts
//
// Prints the raw error strings the stellar-sdk contract client produces on
// testnet for two create-flow failure modes, using simulation only (no
// signature, no secret key). Run: `npx tsx scripts/capture-create-errors.ts`
import { readFileSync } from 'node:fs';
import { lockup } from 'hourglass';

type Dep = { lockup: string; network_passphrase: string; rpc_url: string; deployer: string; native_token: string };
const dep = JSON.parse(readFileSync(new URL('../../deployments/testnet.json', import.meta.url), 'utf8')) as Dep;

type Methods = {
  create_linear(args: Record<string, unknown>): Promise<unknown>;
  create_batch(args: Record<string, unknown>): Promise<unknown>;
};
const client = new lockup.Client({
  contractId: dep.lockup,
  networkPassphrase: dep.network_passphrase,
  rpcUrl: dep.rpc_url,
  publicKey: dep.deployer,
}) as unknown as Methods;

const now = BigInt(Math.floor(Date.now() / 1000));

async function attempt(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`${label}: simulation OK`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${label}: ${JSON.stringify(msg.slice(0, 600))}`);
  }
}

await attempt('start_in_past (#18)', () =>
  client.create_linear({
    sender: dep.deployer,
    recipient: dep.deployer,
    token: dep.native_token,
    deposited: 10_000_000n,
    start_ts: now - 100n,
    cliff_ts: now - 100n,
    end_ts: now + 1000n,
    unlock_at_start: 0n,
    unlock_at_cliff: 0n,
    is_cancelable: true,
    is_transferable: true,
  }),
);

await attempt('batch 100 rows', () =>
  client.create_batch({
    sender: dep.deployer,
    token: dep.native_token,
    rows: Array.from({ length: 100 }, () => ({
      recipient: dep.deployer,
      is_cancelable: true,
      is_transferable: true,
      spec: {
        tag: 'Linear',
        values: [{ start_ts: now + 900n, cliff_ts: now + 900n, end_ts: now + 90_000n, deposited: 1_000_000n, unlock_at_start: 0n, unlock_at_cliff: 0n }],
      },
    })),
  }),
);
```

Run: `cd frontend && npx tsx scripts/capture-create-errors.ts 2>&1 | tail -6`
Expected: two lines. The first contains `Error(Contract, #18)`. The second is either `simulation OK` (size limits only bite at send, as the smoke probe showed with `TxSorobanInvalid`) or a simulation failure mentioning a limit.

- [ ] **Step 2: Pin the captured strings as test vectors**

Append to `frontend/src/lib/create/errors.test.ts` a `describe('captured on testnet 2026-09-…', …)` block with one `it` per captured line, asserting `classifyTxError(new Error(<exact captured string>))` yields `{ kind: 'contract', code: 18 }` for the first and, for the second, `kind: 'resource'` if it failed. If the second failed and does **not** classify as `resource`, extend `RESOURCE_RE` in `errors.ts` with the distinguishing phrase from the real message (keep existing alternatives) and re-run. Run: `cd frontend && npx vitest run src/lib/create/errors.test.ts 2>&1 | tail -4` → PASS.

- [ ] **Step 3: Evidence document**

Write `docs/evidence/2026-09-create-flow-testnet.md`:

```markdown
# Create flow v2 — testnet evidence

Lockup: `CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL` (v0.2.1, testnet). Branch `feat/create-flow-v2`.

## Automated (simulation only, no signing)

`npx tsx scripts/capture-create-errors.ts` on <date>:

```
<paste the two output lines verbatim>
```

Both strings are pinned in `frontend/src/lib/create/errors.test.ts`.

## Unit tests

`npm test` on <date>: <N> test files, <M> tests, all passing. `npm run typecheck` clean. `npm run build` OK.

## Manual walkthrough (requires a Freighter wallet on testnet)

To be run by the maintainer; add screenshots under `docs/evidence/img/` named as below and fill in the ids/hashes.

| # | Scenario | Steps | Expected | Screenshot | Result |
|---|---|---|---|---|---|
| 1 | Single linear from preset | Template "1 year · 3-month cliff", XLM, recipient, 10 XLM, Sign | redirected to `/stream/<id>`, cliff shown | `01-linear.png` | id: |
| 2 | Single tranched | Template "Quarterly tranches × 4", 4 XLM | 4 tranches of 1 XLM on the stream page | `02-tranched.png` | id: |
| 3 | Single recurring | Template "Daily drip × 30", 3 XLM | recurring, 0.1 XLM × 30 | `03-recurring.png` | id: |
| 4 | Batch 45 rows, CSV paste | Batch mode, paste 45 `G…,0.1` lines incl. 1 duplicate + 1 bad address; fix the bad row inline; Create | confirm dialog says 3 transactions; progress shows 20/20/5; result lists 45 ids | `04-batch.png` | tx hashes: |
| 5 | Reject + reload + resume | Start a 2-transaction batch, reject the 2nd signature, reload the page, Resume, sign | banner "1 of 2 transactions left"; after resume both done, no duplicates on the dashboard | `05-resume.png` | tx hashes: |
| 6 | Dashboard / API | `/dashboard` and `GET /api/streams?address=<sender>&role=sender` | all created streams visible | `06-dashboard.png` | count: |
```

- [ ] **Step 4: README updates**

In `frontend/README.md`, after the `## Layout` section, add:

```markdown
## Create flow

`/create` builds Linear, Tranched and Recurring streams for one recipient or a list (batch).

- **Templates:** 7 built-in presets plus your own, saved in `localStorage['hourglass:templates:v1']` (max 50). A template stores a *relative* schedule (offsets in seconds, percentages in basis points), token, and flags; applying it resolves the schedule against "now" and shifts it so the start is at least 2 min (single) / 15 min (batch) ahead.
- **Amounts** are always the total a recipient receives. Recurring amounts are floored to equal periods; the adjustment is shown per row and in the summary.
- **Batch:** rows come from the table or from pasted / uploaded `recipient, amount` lines (comma, semicolon, tab or space separated; header and `#` lines skipped). Max 500 rows per run. Rows are chunked 20 per `create_batch` transaction (contract cap 100); a chunk that does not fit is split in half automatically. Each transaction is signed separately; progress is kept in `sessionStorage['hourglass:batchRun:v1']` so a reload offers to resume. A pre-flight Horizon balance check blocks runs that exceed the balance.
- **Logic lives in** `src/lib/create/` (pure, unit-tested); UI in `src/components/create/`.
```

In `README.md` (repo root) change the status line to mention: "batch/recurring create UI + templates (frontend) — in review on `feat/create-flow-v2`" and keep the rest.

- [ ] **Step 5: Final checks and commit**

Run: `cd frontend && npm test 2>&1 | grep -E "Test Files|Tests " && npm run typecheck 2>&1 | tail -2`
Expected: all green.

```bash
git add frontend/scripts/capture-create-errors.ts frontend/src/lib/create/errors.test.ts frontend/src/lib/create/errors.ts docs/evidence/2026-09-create-flow-testnet.md frontend/README.md README.md
git commit -m "docs(create): testnet error vectors, evidence checklist, README for the create flow"
```

---

## Self-review notes (plan author)

- **Spec coverage:** §4 → Task 1; §5 → Tasks 2, 10 (TemplateBar/useTemplates), 14 (save/update/rename/delete wiring); §6 → Tasks 3, 11; §7 → Tasks 5, 6, 13, 14 (pre-flight + confirm); §8 → Task 7; §9 → Tasks 4, 15; §10 → Tasks 9–14; §11 → Task 8; §12 edge cases → margin re-tick (Task 14 `tick`), storage-unavailable (Tasks 2, 10, 13), interrupted-run explorer link (Task 13), 1-row resource failure copy (Task 13 via `describeError`), StartInPast shift (Tasks 5, 6, 13); §13 → tests in Tasks 1–8, evidence in Task 15.
- **Deviations from the spec, deliberate:** `parseForm` returns `{ schedule, valid, errors }` (spec: `{ schedule | null, errors }`) so the preview can draw an invalid-but-parseable schedule; `MAX_ROWS_PER_RUN` is defined in `rows.ts` and re-exported from `batchPlan.ts` to avoid an import cycle; the runner's `sendChunk` is wired to `sendPrepared` and `buildChunk` to `prepareBatch` inside the hook (Task 13) rather than in the page; `ScheduleFields` validates tranche times ≥ start (a rule implied by relative offsets).
- **Type consistency checks done:** `RunnerDeps.dispatch/getRun/persist` (Task 6) ↔ `useBatchRunner` (Task 13); `ValidatedRow.built.deposited` used by `planRun` (Task 5) and `rowsSummary` (Task 3); `Template` shape in Tasks 2, 8 (`apply_template`), 10 (`TemplateBar`, `useTemplates.save` draft), 14; `CreatePreview` props (Task 12) ↔ Task 14 call site; `FormAction` names used by Tasks 10, 11, 14 all exist in Task 8 (`clear_template` included).
