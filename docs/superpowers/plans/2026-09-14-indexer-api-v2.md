# Indexer + API v2 (search, filtering, wallet history) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Node + MongoDB indexer lossless and self-healing (cursor-paged event ingestion, chain reconcile) and give the frontend a query API with search, filtering, sorting, cursor pagination, wallet-wide transaction history, per-wallet stats and a token list — all backed by a shared, tested TypeScript vesting-math module.

**Architecture:** The indexer logic moves out of `frontend/scripts/indexer.ts` into small modules under `frontend/src/lib/indexer/` (`events`, `chain`, `store`, `ingest`, `reconcile`) with injected RPC/chain/store dependencies so the paging loop and reconcile are unit-testable against in-memory fakes; the script becomes a thin runner. API routes are rewritten on pure query builders in `frontend/src/lib/api/` plus `frontend/src/lib/streaming.ts` (vesting math + status, mirroring `contracts/shared/src/math.rs`). `actions` documents gain a `participants` array so wallet history is one indexed query.

**Tech Stack:** TypeScript 5, Next.js 16 (App Router, `runtime = 'nodejs'` routes), MongoDB 7 via `mongodb` ^7, `@stellar/stellar-sdk` ^15 (`rpc.Server.getEvents` cursor mode), the local `hourglass` SDK (`lockup.Client`), `tsx` for the runner, **vitest** (new devDependency) for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-14-indexer-api-v2-design.md`

## Global Constraints

- Branch `feat/indexer-api-v2` (stacked on `feat/batch-recurring`). No contract, SDK or `deployments/` changes in this plan.
- Only `frontend/**` and `docker-compose.yml` (two env defaults) change, plus the spec/README docs named in Task 12.
- Vesting math semantics are exactly spec 2026-05-23 §7 and spec 2026-09-10 §6: integer division floors; Recurring `A·min(N, ⌊(t−F)/P⌋+1)`; status precedence DEPLETED > CANCELED > PENDING/STREAMING/SETTLED.
- Status strings are the existing `StreamStatusTag` values: `'PENDING' | 'STREAMING' | 'SETTLED' | 'CANCELED' | 'DEPLETED'`.
- Amounts (i128) are decimal strings in documents and API responses; use `BigInt` for arithmetic; never `Number` on amounts.
- API list responses: `{ …, next_cursor: string | null, now: number }`; `limit` 1–100 (default 50; legacy `sender=`/`recipient=` callers default to 100); invalid parameter → `400 { error }`; database unreachable → `503` with the existing empty payload shape.
- Cursors are opaque `base64url(JSON)`; a malformed cursor is a 400.
- Legacy query parameters on `/api/streams` (`sender`, `recipient`, `status=active|inactive`) keep working unchanged.
- `ActionDoc.participants: string[]` = unique of the stream's `sender`, `recipient` (at event time) and the action's `actor`, `to`, `new_owner` when present.
- Indexer env: `INDEXER_POLL_MS` (default 3000), `INDEXER_RECONCILE_MS` (default 600000), `INDEXER_MAX_PAGES` (default 20), `PAGE_LIMIT` 100, startup buffer 100 ledgers, reconcile view-call concurrency 5.
- Modules under `frontend/src/lib/indexer/**` and `frontend/scripts/indexer.ts` use **relative imports** (the runner executes under `tsx`); API routes may use the `@/` alias.
- Every task: `cd frontend && npm test` (vitest) and `npm run typecheck` green before committing. Task 12 additionally runs `npm run build`.
- Commit messages: Conventional Commits with scope `frontend` (or `indexer`/`api` where clearer), body ending with:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01WH2kMjAMbi5EMFENHLWZVx`
- Never `git add -A`; never commit `frontend/src/lib/deployment.json`, `.next/`, `node_modules/`, `contracts/*/test_snapshots/**`, or `*.log`.

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `frontend/package.json`, `frontend/vitest.config.ts` | vitest devDependency, `npm test`, `@` alias for tests | modify / create |
| `frontend/src/lib/streaming.ts` (+ `.test.ts`) | `streamedAmount`, `withdrawableNow`, `deriveStatus` | create |
| `frontend/src/app/dashboard/page.tsx` | use `deriveStatus` from `lib/streaming` (behaviour-identical) | modify |
| `frontend/src/lib/api/params.ts` (+ `.test.ts`) | `ParamError`, `optAddress`, `optEnum`, `optEnumList`, `optInt` | create |
| `frontend/src/lib/api/cursor.ts` (+ `.test.ts`) | `encodeCursor`, `decodeCursor` + guards | create |
| `frontend/src/lib/api/streamsQuery.ts` (+ `.test.ts`) | `buildStreamsQuery`, `nextStreamsCursor` | create |
| `frontend/src/lib/api/historyQuery.ts` (+ `.test.ts`) | `buildHistoryQuery`, `nextHistoryCursor` | create |
| `frontend/src/lib/db.ts` | `ActionDoc.participants`, `StreamDoc.source`, optional provenance, new indexes | modify |
| `frontend/src/lib/indexer/store.ts` | `IndexerStore` interface, `MongoIndexerStore` (+ `backfillParticipants`) | create |
| `frontend/src/lib/indexer/testing.ts` | `MemoryIndexerStore`, `FakeChain` for tests | create |
| `frontend/src/lib/indexer/events.ts` (+ `.test.ts`) | `ParsedEvent`, `parseEvent` (moved) | create |
| `frontend/src/lib/indexer/chain.ts` (+ `.test.ts`) | `ChainReader`, `mapStream` (moved), `makeChainReader` | create |
| `frontend/src/lib/indexer/ingest.ts` (+ `.test.ts`) | `participantsFor`, `handleEvent`, `fetchAndIngest` | create |
| `frontend/src/lib/indexer/reconcile.ts` (+ `.test.ts`) | `reconcile` | create |
| `frontend/scripts/indexer.ts` | runner: env, wiring, loop, signals | rewrite |
| `docker-compose.yml` | `INDEXER_RECONCILE_MS`, `INDEXER_MAX_PAGES` on the indexer service | modify |
| `frontend/src/app/api/streams/route.ts` | rewritten on `streamsQuery` + `streaming` | rewrite |
| `frontend/src/app/api/streams/[id]/route.ts` | action pagination | modify |
| `frontend/src/app/api/history/route.ts` | new | create |
| `frontend/src/app/api/tokens/route.ts` | new | create |
| `frontend/src/app/api/stats/route.ts` | `address` mode | modify |
| `frontend/README.md`, spec §9 note | docs | modify |

---

### Task 1: vitest + shared vesting math (`lib/streaming.ts`)

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/lib/streaming.ts`
- Create: `frontend/src/lib/streaming.test.ts`
- Modify: `frontend/src/app/dashboard/page.tsx` (replace local `deriveStatus`)

**Interfaces:**
- Produces: `type StreamStatus`, `type StreamTerms`, `streamedAmount(t: StreamTerms, now: number): bigint`, `withdrawableNow(t, now): bigint`, `deriveStatus(t, now): StreamStatus`.

- [ ] **Step 1: Add vitest**

Run: `cd frontend && npm install --save-dev vitest@^3`
Then add to `package.json` `"scripts"`: `"test": "vitest run"` (keep the others). Create `frontend/vitest.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

Run: `npm test` → "No test files found" is fine at this point (exit code may be 1 — that is expected until Step 2).

- [ ] **Step 2: Write the failing math tests**

Create `frontend/src/lib/streaming.test.ts` (vectors copied from `contracts/shared/src/math.rs` and `types.rs` tests):

```ts
import { describe, expect, it } from 'vitest';
import {
  deriveStatus,
  streamedAmount,
  withdrawableNow,
  type StreamTerms,
} from './streaming';

const base = {
  withdrawn: '0',
  refunded: '0',
  was_canceled: false,
  is_depleted: false,
};

function linear(over: Partial<StreamTerms> = {}): StreamTerms {
  return {
    ...base,
    model: 'Linear',
    start_ts: 1_000,
    end_ts: 4_000,
    cliff_ts: 2_000,
    deposited: '1000000',
    unlock_at_start: '0',
    unlock_at_cliff: '0',
    ...over,
  };
}

function tranched(): StreamTerms {
  return {
    ...base,
    model: 'Tranched',
    start_ts: 1_000,
    end_ts: 3_000,
    deposited: '600',
    tranches: [
      { amount: '100', ts: 1_000 },
      { amount: '200', ts: 2_000 },
      { amount: '300', ts: 3_000 },
    ],
  };
}

function recurring(count = 12): StreamTerms {
  return {
    ...base,
    model: 'Recurring',
    start_ts: 1_000,
    end_ts: 1_000 + (count - 1) * 100,
    deposited: String(1_000 * count),
    first_ts: 1_000,
    period_secs: 100,
    count,
    amount_per_period: '1000',
  };
}

describe('streamedAmount — Linear', () => {
  it('is zero before start', () => {
    expect(streamedAmount(linear(), 500)).toBe(0n);
  });
  it('returns only unlock_at_start before the cliff', () => {
    expect(streamedAmount(linear({ unlock_at_start: '100000' }), 1_500)).toBe(100_000n);
  });
  it('adds the cliff lump at the cliff', () => {
    expect(
      streamedAmount(linear({ unlock_at_start: '100000', unlock_at_cliff: '50000' }), 2_000),
    ).toBe(150_000n);
  });
  it('interpolates linearly between cliff and end', () => {
    expect(streamedAmount(linear(), 3_000)).toBe(500_000n);
  });
  it('is the deposit at and after end', () => {
    expect(streamedAmount(linear(), 4_000)).toBe(1_000_000n);
    expect(
      streamedAmount(linear({ unlock_at_start: '100000', unlock_at_cliff: '50000' }), 99_999),
    ).toBe(1_000_000n);
  });
  it('treats cliff == start as no cliff', () => {
    expect(streamedAmount(linear({ cliff_ts: 1_000, end_ts: 3_000 }), 2_000)).toBe(500_000n);
  });
  it('floors the division', () => {
    // base 1e6 over span 2000; at elapsed 1 → 500 exactly, at elapsed 3 → 1500
    expect(streamedAmount(linear(), 2_001)).toBe(500n);
    expect(streamedAmount(linear(), 2_003)).toBe(1_500n);
  });
});

describe('streamedAmount — Tranched', () => {
  it('is zero before the first tranche', () => {
    expect(streamedAmount(tranched(), 500)).toBe(0n);
  });
  it('unlocks a tranche at its timestamp', () => {
    expect(streamedAmount(tranched(), 1_000)).toBe(100n);
  });
  it('accumulates through tranches', () => {
    expect(streamedAmount(tranched(), 2_500)).toBe(300n);
  });
  it('is the full sum after the last tranche', () => {
    expect(streamedAmount(tranched(), 99_999)).toBe(600n);
  });
});

describe('streamedAmount — Recurring', () => {
  it('is zero before first_ts', () => {
    expect(streamedAmount(recurring(), 999)).toBe(0n);
  });
  it('unlocks one period at first_ts and stays flat until the next boundary', () => {
    expect(streamedAmount(recurring(), 1_000)).toBe(1_000n);
    expect(streamedAmount(recurring(), 1_099)).toBe(1_000n);
    expect(streamedAmount(recurring(), 1_100)).toBe(2_000n);
    expect(streamedAmount(recurring(), 1_250)).toBe(3_000n);
  });
  it('caps at count', () => {
    expect(streamedAmount(recurring(), 2_100)).toBe(12_000n);
    expect(streamedAmount(recurring(), 99_999)).toBe(12_000n);
  });
  it('handles count == 1', () => {
    expect(streamedAmount(recurring(1), 1_000)).toBe(1_000n);
    expect(streamedAmount(recurring(1), 2_000)).toBe(1_000n);
  });
  it('is monotonic', () => {
    let prev = 0n;
    for (let t = 0; t < 3_000; t += 7) {
      const cur = streamedAmount(recurring(), t);
      expect(cur >= prev).toBe(true);
      prev = cur;
    }
  });
});

describe('withdrawableNow', () => {
  it('subtracts withdrawn and never goes negative', () => {
    expect(withdrawableNow(linear({ withdrawn: '200000' }), 3_000)).toBe(300_000n);
    expect(withdrawableNow(linear({ withdrawn: '999999' }), 1_500)).toBe(0n);
  });
});

describe('deriveStatus', () => {
  it('follows the on-chain precedence', () => {
    expect(deriveStatus(linear(), 500)).toBe('PENDING');
    expect(deriveStatus(linear(), 1_000)).toBe('STREAMING');
    expect(deriveStatus(linear(), 3_999)).toBe('STREAMING');
    expect(deriveStatus(linear(), 4_000)).toBe('SETTLED');
    expect(deriveStatus(linear({ was_canceled: true }), 500)).toBe('CANCELED');
    expect(deriveStatus(linear({ was_canceled: true, is_depleted: true }), 500)).toBe('DEPLETED');
  });
  it('a single-period recurring stream is SETTLED at first_ts', () => {
    expect(deriveStatus(recurring(1), 1_000)).toBe('SETTLED');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./streaming`.

- [ ] **Step 4: Implement `lib/streaming.ts`**

```ts
// Vesting math shared by API routes and the UI. Mirrors
// contracts/shared/src/math.rs exactly (integer division floors).

import type { StreamDoc } from './db';

export type StreamStatus =
  | 'PENDING'
  | 'STREAMING'
  | 'SETTLED'
  | 'CANCELED'
  | 'DEPLETED';

export type StreamTerms = Pick<
  StreamDoc,
  | 'model'
  | 'start_ts'
  | 'end_ts'
  | 'deposited'
  | 'withdrawn'
  | 'refunded'
  | 'was_canceled'
  | 'is_depleted'
  | 'cliff_ts'
  | 'unlock_at_start'
  | 'unlock_at_cliff'
  | 'tranches'
  | 'first_ts'
  | 'period_secs'
  | 'count'
  | 'amount_per_period'
>;

function big(v: string | undefined): bigint {
  return BigInt(v ?? '0');
}

/** Cumulative amount vested at `now` (unix seconds). */
export function streamedAmount(t: StreamTerms, now: number): bigint {
  const deposited = big(t.deposited);
  switch (t.model) {
    case 'Linear': {
      const start = t.start_ts;
      const cliff = t.cliff_ts ?? t.start_ts;
      const end = t.end_ts;
      const us = big(t.unlock_at_start);
      const uc = big(t.unlock_at_cliff);
      if (now < start) return 0n;
      if (now < cliff) return us;
      if (now >= end) return deposited;
      const base = deposited - us - uc;
      const elapsed = BigInt(now - cliff);
      const span = BigInt(end - cliff);
      return us + uc + (base * elapsed) / span;
    }
    case 'Tranched': {
      let acc = 0n;
      for (const tr of t.tranches ?? []) {
        if (tr.ts > now) break;
        acc += big(tr.amount);
      }
      return acc;
    }
    case 'Recurring': {
      const first = t.first_ts ?? t.start_ts;
      const period = t.period_secs ?? 0;
      const count = t.count ?? 0;
      if (now < first || period <= 0 || count <= 0) return 0n;
      const elapsedPeriods = Math.floor((now - first) / period);
      const unlocked = Math.min(elapsedPeriods + 1, count);
      return big(t.amount_per_period) * BigInt(unlocked);
    }
  }
}

/** `max(0, streamed(now) - withdrawn)`. */
export function withdrawableNow(t: StreamTerms, now: number): bigint {
  const w = streamedAmount(t, now) - big(t.withdrawn);
  return w > 0n ? w : 0n;
}

/** Same precedence as `Stream::status` on-chain. */
export function deriveStatus(t: StreamTerms, now: number): StreamStatus {
  if (t.is_depleted) return 'DEPLETED';
  if (t.was_canceled) return 'CANCELED';
  if (now < t.start_ts) return 'PENDING';
  if (now >= t.end_ts) return 'SETTLED';
  return 'STREAMING';
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all `streaming.test.ts` cases pass.

- [ ] **Step 6: Point the dashboard at the shared `deriveStatus`**

In `frontend/src/app/dashboard/page.tsx` delete the local `function deriveStatus(s: StreamDoc, nowSec: number): Status { … }` (lines ~33-41) and add `import { deriveStatus } from '@/lib/streaming';` next to the other `@/lib` imports. `Status` (= `StreamStatusTag`) and `StreamStatus` have identical members, so call sites compile unchanged.

Run: `cd frontend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/lib/streaming.ts frontend/src/lib/streaming.test.ts frontend/src/app/dashboard/page.tsx
git commit -m "feat(frontend): shared vesting math module + vitest"
```

---

### Task 2: API helpers — params + cursors

**Files:**
- Create: `frontend/src/lib/api/params.ts`, `frontend/src/lib/api/params.test.ts`
- Create: `frontend/src/lib/api/cursor.ts`, `frontend/src/lib/api/cursor.test.ts`

**Interfaces:**
- Produces: `class ParamError extends Error { status = 400 }`; `optAddress(sp, name, kind: 'G' | 'C'): string | undefined`; `optEnum<T>(sp, name, allowed: readonly T[]): T | undefined`; `optEnumList<T>(sp, name, allowed): T[] | undefined`; `optInt(sp, name, o: { min: number; max: number; def: number }): number`; `encodeCursor(obj: Record<string, string | number>): string`; `decodeCursor<T>(raw: string | null, guard: (v: unknown) => v is T): T | null` (returns `null` for absent, throws `ParamError` for malformed); `isStreamsCursor`, `isHistoryCursor` guards; types `StreamsCursor = { k: number; id: number }`, `HistoryCursor = { ts: number; log_index: number; id: string }`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/api/params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ParamError, optAddress, optEnum, optEnumList, optInt } from './params';

const G = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const C = 'CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU';
const sp = (q: string) => new URLSearchParams(q);

describe('optAddress', () => {
  it('returns undefined when absent', () => {
    expect(optAddress(sp(''), 'address', 'G')).toBeUndefined();
  });
  it('accepts a valid strkey of the requested kind', () => {
    expect(optAddress(sp(`address=${G}`), 'address', 'G')).toBe(G);
    expect(optAddress(sp(`token=${C}`), 'token', 'C')).toBe(C);
  });
  it('rejects the wrong kind or garbage', () => {
    expect(() => optAddress(sp(`address=${C}`), 'address', 'G')).toThrow(ParamError);
    expect(() => optAddress(sp('address=hello'), 'address', 'G')).toThrow(ParamError);
  });
});

describe('optEnum / optEnumList', () => {
  const allowed = ['a', 'b'] as const;
  it('validates single values', () => {
    expect(optEnum(sp('x=a'), 'x', allowed)).toBe('a');
    expect(optEnum(sp(''), 'x', allowed)).toBeUndefined();
    expect(() => optEnum(sp('x=z'), 'x', allowed)).toThrow(ParamError);
  });
  it('validates comma lists and dedupes', () => {
    expect(optEnumList(sp('x=a,b,a'), 'x', allowed)).toEqual(['a', 'b']);
    expect(() => optEnumList(sp('x=a,z'), 'x', allowed)).toThrow(ParamError);
    expect(optEnumList(sp(''), 'x', allowed)).toBeUndefined();
  });
});

describe('optInt', () => {
  const o = { min: 1, max: 100, def: 50 };
  it('defaults, parses and clamps', () => {
    expect(optInt(sp(''), 'limit', o)).toBe(50);
    expect(optInt(sp('limit=7'), 'limit', o)).toBe(7);
    expect(optInt(sp('limit=500'), 'limit', o)).toBe(100);
  });
  it('rejects non-integers and values below min', () => {
    expect(() => optInt(sp('limit=abc'), 'limit', o)).toThrow(ParamError);
    expect(() => optInt(sp('limit=0'), 'limit', o)).toThrow(ParamError);
  });
});
```

`frontend/src/lib/api/cursor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  isHistoryCursor,
  isStreamsCursor,
} from './cursor';
import { ParamError } from './params';

describe('cursor codec', () => {
  it('round-trips a streams cursor', () => {
    const c = encodeCursor({ k: 1_700_000_000, id: 42 });
    expect(c).not.toMatch(/[+/=]/); // base64url
    expect(decodeCursor(c, isStreamsCursor)).toEqual({ k: 1_700_000_000, id: 42 });
  });
  it('round-trips a history cursor', () => {
    const c = encodeCursor({ ts: 1, log_index: 2_000_000, id: 'a'.repeat(24) });
    expect(decodeCursor(c, isHistoryCursor)).toEqual({ ts: 1, log_index: 2_000_000, id: 'a'.repeat(24) });
  });
  it('returns null for absent cursors', () => {
    expect(decodeCursor(null, isStreamsCursor)).toBeNull();
    expect(decodeCursor('', isStreamsCursor)).toBeNull();
  });
  it('rejects garbage and wrong shapes', () => {
    expect(() => decodeCursor('not-base64-json', isStreamsCursor)).toThrow(ParamError);
    const wrong = encodeCursor({ k: 'x', id: 1 });
    expect(() => decodeCursor(wrong, isStreamsCursor)).toThrow(ParamError);
    const hist = encodeCursor({ ts: 1, log_index: 2, id: 'zz' });
    expect(() => decodeCursor(hist, isHistoryCursor)).toThrow(ParamError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./params` / `./cursor`.

- [ ] **Step 3: Implement `params.ts`**

```ts
// Small query-parameter validators for the API routes. Every failure is a
// ParamError, which routes translate into a 400.

export class ParamError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ParamError';
  }
}

const STRKEY = /^[GC][A-Z2-7]{55}$/;

export function optAddress(
  sp: URLSearchParams,
  name: string,
  kind: 'G' | 'C',
): string | undefined {
  const v = sp.get(name);
  if (v === null || v === '') return undefined;
  if (!STRKEY.test(v) || v[0] !== kind) {
    throw new ParamError(`${name} must be a ${kind}… Stellar address`);
  }
  return v;
}

export function optEnum<T extends string>(
  sp: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const v = sp.get(name);
  if (v === null || v === '') return undefined;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new ParamError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return v as T;
}

export function optEnumList<T extends string>(
  sp: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T[] | undefined {
  const v = sp.get(name);
  if (v === null || v === '') return undefined;
  const out: T[] = [];
  for (const part of v.split(',')) {
    const p = part.trim();
    if (p === '') continue;
    if (!(allowed as readonly string[]).includes(p)) {
      throw new ParamError(`${name} must be a comma list of ${allowed.join(', ')}`);
    }
    if (!out.includes(p as T)) out.push(p as T);
  }
  return out;
}

export function optInt(
  sp: URLSearchParams,
  name: string,
  o: { min: number; max: number; def: number },
): number {
  const v = sp.get(name);
  if (v === null || v === '') return o.def;
  if (!/^\d+$/.test(v)) throw new ParamError(`${name} must be an integer`);
  const n = Number.parseInt(v, 10);
  if (n < o.min) throw new ParamError(`${name} must be >= ${o.min}`);
  return Math.min(n, o.max);
}
```

- [ ] **Step 4: Implement `cursor.ts`**

```ts
// Opaque, tamper-tolerant pagination cursors: base64url(JSON). Shape is
// checked with a guard on decode; anything malformed is a 400.

import { ParamError } from './params';

export type StreamsCursor = { k: number; id: number };
export type HistoryCursor = { ts: number; log_index: number; id: string };

export function encodeCursor(obj: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

export function decodeCursor<T>(
  raw: string | null | undefined,
  guard: (v: unknown) => v is T,
): T | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new ParamError('cursor is malformed');
  }
  if (!guard(parsed)) throw new ParamError('cursor is malformed');
  return parsed;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function isStreamsCursor(v: unknown): v is StreamsCursor {
  return (
    isObj(v) &&
    typeof v.k === 'number' && Number.isFinite(v.k) &&
    typeof v.id === 'number' && Number.isInteger(v.id)
  );
}

export function isHistoryCursor(v: unknown): v is HistoryCursor {
  return (
    isObj(v) &&
    typeof v.ts === 'number' && Number.isFinite(v.ts) &&
    typeof v.log_index === 'number' && Number.isInteger(v.log_index) &&
    typeof v.id === 'string' && /^[0-9a-f]{24}$/.test(v.id)
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass; typecheck; commit**

Run: `cd frontend && npm test && npm run typecheck`
Expected: all green.

```bash
git add frontend/src/lib/api/params.ts frontend/src/lib/api/params.test.ts frontend/src/lib/api/cursor.ts frontend/src/lib/api/cursor.test.ts
git commit -m "feat(api): query-param validators and opaque cursor codec"
```

---

### Task 3: Query builders — streams + history

**Files:**
- Create: `frontend/src/lib/api/streamsQuery.ts`, `frontend/src/lib/api/streamsQuery.test.ts`
- Create: `frontend/src/lib/api/historyQuery.ts`, `frontend/src/lib/api/historyQuery.test.ts`

**Interfaces:**
- Consumes: Task 2 helpers; `StreamDoc`/`ActionDoc` from `lib/db` (`ActionDoc.participants` is added in Task 4 — this task types the field locally via `Filter<ActionDoc & { participants: string[] }>` until then).
- Produces: `type SortField = 'created_at' | 'start_ts' | 'end_ts'`; `interface StreamsQuery { filter: Filter<StreamDoc>; sort: Record<string, 1 | -1>; sortField: SortField; order: 'asc' | 'desc'; limit: number }`; `buildStreamsQuery(sp: URLSearchParams, now: number): StreamsQuery`; `nextStreamsCursor(last: Pick<StreamDoc, '_id' | SortField>, sortField: SortField): string`; `interface HistoryQuery { filter: Filter<ActionDoc>; limit: number }`; `buildHistoryQuery(sp: URLSearchParams): HistoryQuery`; `nextHistoryCursor(last: { _id: ObjectId; ts: number; log_index: number }): string`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/api/streamsQuery.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encodeCursor } from './cursor';
import { ParamError } from './params';
import { buildStreamsQuery, nextStreamsCursor } from './streamsQuery';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const G2 = 'GAFD2RMEQCGQ2BRXPFVECOUT3AT7UIZWPMSJRZFFHH5CI2TTTGKAQNNQ';
const C1 = 'CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU';
const NOW = 1_800_000_000;
const q = (s: string) => buildStreamsQuery(new URLSearchParams(s), NOW);

describe('buildStreamsQuery — defaults', () => {
  it('returns an empty filter, created_at desc, limit 50', () => {
    const r = q('');
    expect(r.filter).toEqual({});
    expect(r.sort).toEqual({ created_at: -1, _id: -1 });
    expect(r.limit).toBe(50);
  });
});

describe('address + role', () => {
  it('any → $or on sender/recipient', () => {
    expect(q(`address=${G1}`).filter).toEqual({ $or: [{ sender: G1 }, { recipient: G1 }] });
  });
  it('sender / recipient roles', () => {
    expect(q(`address=${G1}&role=sender`).filter).toEqual({ sender: G1 });
    expect(q(`address=${G1}&role=recipient`).filter).toEqual({ recipient: G1 });
  });
  it('legacy sender= / recipient= map to the same filters with default limit 100', () => {
    expect(q(`sender=${G1}`).filter).toEqual({ sender: G1 });
    expect(q(`sender=${G1}`).limit).toBe(100);
    expect(q(`sender=${G1}&recipient=${G2}`).filter).toEqual({ sender: G1, recipient: G2 });
  });
});

describe('status', () => {
  it('legacy active/inactive', () => {
    expect(q('status=active').filter).toEqual({ was_canceled: false, is_depleted: false });
    expect(q('status=inactive').filter).toEqual({ $or: [{ was_canceled: true }, { is_depleted: true }] });
  });
  it('derived statuses use plain time comparisons against now', () => {
    expect(q('status=pending').filter).toEqual({
      start_ts: { $gt: NOW }, was_canceled: false, is_depleted: false,
    });
    expect(q('status=streaming').filter).toEqual({
      start_ts: { $lte: NOW }, end_ts: { $gt: NOW }, was_canceled: false, is_depleted: false,
    });
    expect(q('status=settled').filter).toEqual({
      end_ts: { $lte: NOW }, was_canceled: false, is_depleted: false,
    });
    expect(q('status=canceled').filter).toEqual({ was_canceled: true, is_depleted: false });
    expect(q('status=depleted').filter).toEqual({ is_depleted: true });
  });
  it('a list becomes $or', () => {
    expect(q('status=canceled,depleted').filter).toEqual({
      $or: [{ was_canceled: true, is_depleted: false }, { is_depleted: true }],
    });
  });
  it('rejects unknown values', () => {
    expect(() => q('status=bogus')).toThrow(ParamError);
  });
});

describe('token, model, q', () => {
  it('exact token and model', () => {
    expect(q(`token=${C1}&model=Recurring`).filter).toEqual({ token: C1, model: 'Recurring' });
  });
  it('numeric q → _id', () => {
    expect(q('q=42').filter).toEqual({ _id: 42 });
  });
  it('G-prefix q → sender/recipient prefix, C-prefix → token prefix', () => {
    expect(q('q=GBXD').filter).toEqual({
      $or: [{ sender: { $regex: '^GBXD' } }, { recipient: { $regex: '^GBXD' } }],
    });
    expect(q('q=CCP7').filter).toEqual({ token: { $regex: '^CCP7' } });
  });
  it('anything else is ignored', () => {
    expect(q('q=hello world').filter).toEqual({});
  });
  it('combines several $or clauses with $and', () => {
    expect(q(`address=${G1}&q=GAFD`).filter).toEqual({
      $and: [
        { $or: [{ sender: G1 }, { recipient: G1 }] },
        { $or: [{ sender: { $regex: '^GAFD' } }, { recipient: { $regex: '^GAFD' } }] },
      ],
    });
  });
  it('keeps both constraints when q and token target the same field', () => {
    expect(q(`token=${C1}&q=CCP7`).filter).toEqual({
      $and: [{ token: C1 }, { token: { $regex: '^CCP7' } }],
    });
  });
  it('keeps both constraints when a legacy sender and address/role=sender collide', () => {
    expect(q(`sender=${G1}&address=${G2}&role=sender`).filter).toEqual({
      $and: [{ sender: G1 }, { sender: G2 }],
    });
  });
});

describe('sort, order, limit, cursor', () => {
  it('sort/order', () => {
    expect(q('sort=end_ts&order=asc').sort).toEqual({ end_ts: 1, _id: 1 });
    expect(() => q('sort=deposited')).toThrow(ParamError);
  });
  it('limit is clamped to 100', () => {
    expect(q('limit=500').limit).toBe(100);
  });
  it('cursor adds a keyset condition matching sort + order', () => {
    const c = encodeCursor({ k: 1_000, id: 7 });
    expect(q(`cursor=${c}`).filter).toEqual({
      $or: [{ created_at: { $lt: 1_000 } }, { created_at: 1_000, _id: { $lt: 7 } }],
    });
    expect(q(`sort=start_ts&order=asc&cursor=${c}`).filter).toEqual({
      $or: [{ start_ts: { $gt: 1_000 } }, { start_ts: 1_000, _id: { $gt: 7 } }],
    });
  });
  it('nextStreamsCursor encodes the last row', () => {
    const c = nextStreamsCursor({ _id: 9, created_at: 5, start_ts: 1, end_ts: 2 }, 'created_at');
    expect(buildStreamsQuery(new URLSearchParams(`cursor=${c}`), NOW).filter).toEqual({
      $or: [{ created_at: { $lt: 5 } }, { created_at: 5, _id: { $lt: 9 } }],
    });
  });
});
```

`frontend/src/lib/api/historyQuery.test.ts`:

```ts
import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { encodeCursor } from './cursor';
import { ParamError } from './params';
import { buildHistoryQuery, nextHistoryCursor } from './historyQuery';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const h = (s: string) => buildHistoryQuery(new URLSearchParams(s));

describe('buildHistoryQuery', () => {
  it('requires address', () => {
    expect(() => h('')).toThrow(ParamError);
  });
  it('filters on participants by default, actor with mine=1', () => {
    expect(h(`address=${G1}`).filter).toEqual({ participants: G1 });
    expect(h(`address=${G1}&mine=1`).filter).toEqual({ actor: G1 });
  });
  it('narrows by stream_id', () => {
    expect(h(`address=${G1}&stream_id=12`).filter).toEqual({ participants: G1, stream_id: 12 });
    expect(() => h(`address=${G1}&stream_id=x`)).toThrow(ParamError);
  });
  it('default limit 50, clamped to 100', () => {
    expect(h(`address=${G1}`).limit).toBe(50);
    expect(h(`address=${G1}&limit=1000`).limit).toBe(100);
  });
  it('cursor adds a keyset condition on (ts, log_index, _id) desc', () => {
    const id = new ObjectId('65a1b2c3d4e5f6a7b8c9d0e1');
    const c = encodeCursor({ ts: 100, log_index: 2_000_000, id: id.toHexString() });
    expect(h(`address=${G1}&cursor=${c}`).filter).toEqual({
      participants: G1,
      $or: [
        { ts: { $lt: 100 } },
        { ts: 100, log_index: { $lt: 2_000_000 } },
        { ts: 100, log_index: 2_000_000, _id: { $lt: id } },
      ],
    });
  });
  it('nextHistoryCursor round-trips', () => {
    const id = new ObjectId('65a1b2c3d4e5f6a7b8c9d0e1');
    const c = nextHistoryCursor({ _id: id, ts: 5, log_index: 3 });
    expect(h(`address=${G1}&cursor=${c}`).filter).toHaveProperty('$or');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./streamsQuery` / `./historyQuery`.

- [ ] **Step 3: Implement `streamsQuery.ts`**

```ts
// Pure translation of /api/streams query parameters into a Mongo filter,
// sort and limit. No I/O here — fully unit-testable.

import type { Filter } from 'mongodb';
import type { StreamDoc } from '../db';
import { decodeCursor, encodeCursor, isStreamsCursor } from './cursor';
import { optAddress, optEnum, optEnumList, optInt, ParamError } from './params';

export type SortField = 'created_at' | 'start_ts' | 'end_ts';
export type Order = 'asc' | 'desc';
const SORT_FIELDS = ['created_at', 'start_ts', 'end_ts'] as const;
const ORDERS = ['asc', 'desc'] as const;
const ROLES = ['sender', 'recipient', 'any'] as const;
const MODELS = ['Linear', 'Tranched', 'Recurring'] as const;
const STATUSES = ['pending', 'streaming', 'settled', 'canceled', 'depleted', 'active', 'inactive'] as const;
type StatusParam = (typeof STATUSES)[number];

export interface StreamsQuery {
  filter: Filter<StreamDoc>;
  sort: Record<string, 1 | -1>;
  sortField: SortField;
  order: Order;
  limit: number;
}

function statusClause(s: StatusParam, now: number): Filter<StreamDoc> {
  switch (s) {
    case 'active':
      return { was_canceled: false, is_depleted: false };
    case 'inactive':
      return { $or: [{ was_canceled: true }, { is_depleted: true }] };
    case 'pending':
      return { start_ts: { $gt: now }, was_canceled: false, is_depleted: false };
    case 'streaming':
      return { start_ts: { $lte: now }, end_ts: { $gt: now }, was_canceled: false, is_depleted: false };
    case 'settled':
      return { end_ts: { $lte: now }, was_canceled: false, is_depleted: false };
    case 'canceled':
      return { was_canceled: true, is_depleted: false };
    case 'depleted':
      return { is_depleted: true };
  }
}

function qClause(raw: string | null): Filter<StreamDoc> | null {
  if (raw === null) return null;
  const v = raw.trim();
  if (/^\d+$/.test(v)) return { _id: Number.parseInt(v, 10) };
  if (/^G[A-Z2-7]{1,55}$/.test(v)) {
    return { $or: [{ sender: { $regex: `^${v}` } }, { recipient: { $regex: `^${v}` } }] };
  }
  if (/^C[A-Z2-7]{1,55}$/.test(v)) return { token: { $regex: `^${v}` } };
  return null;
}

export function buildStreamsQuery(sp: URLSearchParams, now: number): StreamsQuery {
  const clauses: Filter<StreamDoc>[] = [];

  // Legacy exact-match parameters (dashboard v1) — keep behaviour identical.
  const legacySender = optAddress(sp, 'sender', 'G');
  const legacyRecipient = optAddress(sp, 'recipient', 'G');
  const legacy = legacySender !== undefined || legacyRecipient !== undefined;
  if (legacy) {
    const c: Filter<StreamDoc> = {};
    if (legacySender) c.sender = legacySender;
    if (legacyRecipient) c.recipient = legacyRecipient;
    clauses.push(c);
  }

  const address = optAddress(sp, 'address', 'G');
  const role = optEnum(sp, 'role', ROLES) ?? 'any';
  if (address) {
    if (role === 'sender') clauses.push({ sender: address });
    else if (role === 'recipient') clauses.push({ recipient: address });
    else clauses.push({ $or: [{ sender: address }, { recipient: address }] });
  }

  const statuses = optEnumList(sp, 'status', STATUSES);
  if (statuses && statuses.length > 0) {
    const parts = statuses.map((s) => statusClause(s, now));
    clauses.push(parts.length === 1 ? parts[0] : { $or: parts });
  }

  const token = optAddress(sp, 'token', 'C');
  if (token) clauses.push({ token });
  const model = optEnum(sp, 'model', MODELS);
  if (model) clauses.push({ model });

  const qc = qClause(sp.get('q'));
  if (qc) clauses.push(qc);

  const sortField = optEnum(sp, 'sort', SORT_FIELDS) ?? 'created_at';
  const order = optEnum(sp, 'order', ORDERS) ?? 'desc';
  const dir: 1 | -1 = order === 'asc' ? 1 : -1;

  const cursor = decodeCursor(sp.get('cursor'), isStreamsCursor);
  if (cursor) {
    const cmp = order === 'asc' ? '$gt' : '$lt';
    clauses.push({
      $or: [
        { [sortField]: { [cmp]: cursor.k } },
        { [sortField]: cursor.k, _id: { [cmp]: cursor.id } },
      ],
    } as Filter<StreamDoc>);
  }

  const limit = optInt(sp, 'limit', { min: 1, max: 100, def: legacy ? 100 : 50 });

  // Merge: plain object clauses are combined by key; $or clauses need $and.
  // Guard against a plain-clause key collision first — Object.assign would
  // silently drop an earlier constraint on the same key (e.g. an exact
  // `token=` alongside a `q=` prefix match on `token`, or a legacy
  // `sender=` alongside `address=`+`role=sender`). When two or more plain
  // clauses target the same key, every clause (plain and $or alike) becomes
  // its own $and element, in the order they were pushed, so no constraint
  // is lost.
  const isOrOnly = (c: Filter<StreamDoc>) => '$or' in c && Object.keys(c).length === 1;
  const seenKeys = new Set<string>();
  let collision = false;
  for (const c of clauses) {
    if (isOrOnly(c)) continue;
    for (const k of Object.keys(c)) {
      if (seenKeys.has(k)) {
        collision = true;
        break;
      }
      seenKeys.add(k);
    }
    if (collision) break;
  }

  let filter: Filter<StreamDoc>;
  if (collision) {
    filter = { $and: clauses } as Filter<StreamDoc>;
  } else {
    const plain: Filter<StreamDoc> = {};
    const ors: Filter<StreamDoc>[] = [];
    for (const c of clauses) {
      if (isOrOnly(c)) ors.push(c);
      else Object.assign(plain, c);
    }
    const hasPlain = Object.keys(plain).length > 0;
    if (ors.length === 0) filter = plain;
    else if (ors.length === 1 && !hasPlain) filter = ors[0];
    else if (ors.length === 1) filter = { ...plain, ...ors[0] };
    else filter = { $and: [...(hasPlain ? [plain] : []), ...ors] };
  }

  return { filter, sort: { [sortField]: dir, _id: dir }, sortField, order, limit };
}

export function nextStreamsCursor(
  last: Pick<StreamDoc, '_id' | SortField>,
  sortField: SortField,
): string {
  return encodeCursor({ k: last[sortField], id: last._id });
}
```

Note on the `status=canceled,depleted` test: two status clauses produce ONE `$or` clause (`{ $or: [..] }`), which alone yields the expected filter. The `address + q` test yields two `$or` clauses → `$and`. Run the tests; if the merge order differs from the expectations, fix the implementation, not the tests.

- [ ] **Step 4: Implement `historyQuery.ts`**

```ts
// Pure translation of /api/history parameters into a Mongo filter + limit.

import type { Filter } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { ActionDoc } from '../db';
import { decodeCursor, encodeCursor, isHistoryCursor } from './cursor';
import { optAddress, optInt, ParamError } from './params';

export interface HistoryQuery {
  filter: Filter<ActionDoc>;
  limit: number;
}

export function buildHistoryQuery(sp: URLSearchParams): HistoryQuery {
  const address = optAddress(sp, 'address', 'G');
  if (!address) throw new ParamError('address is required');

  const filter: Filter<ActionDoc> = sp.get('mine') === '1' ? { actor: address } : { participants: address };

  const streamId = sp.get('stream_id');
  if (streamId !== null && streamId !== '') {
    if (!/^\d+$/.test(streamId)) throw new ParamError('stream_id must be an integer');
    filter.stream_id = Number.parseInt(streamId, 10);
  }

  const cursor = decodeCursor(sp.get('cursor'), isHistoryCursor);
  if (cursor) {
    filter.$or = [
      { ts: { $lt: cursor.ts } },
      { ts: cursor.ts, log_index: { $lt: cursor.log_index } },
      { ts: cursor.ts, log_index: cursor.log_index, _id: { $lt: new ObjectId(cursor.id) } },
    ];
  }

  const limit = optInt(sp, 'limit', { min: 1, max: 100, def: 50 });
  return { filter, limit };
}

export function nextHistoryCursor(last: { _id: ObjectId; ts: number; log_index: number }): string {
  return encodeCursor({ ts: last.ts, log_index: last.log_index, id: last._id.toHexString() });
}
```

`ActionDoc` does not yet declare `participants` (Task 4 adds it). Until then, type the filter as `Filter<ActionDoc & { participants?: string[] }>` inside this file so it compiles; Task 4 removes the intersection.

- [ ] **Step 5: Run tests + typecheck; commit**

Run: `cd frontend && npm test && npm run typecheck`
Expected: green.

```bash
git add frontend/src/lib/api/streamsQuery.ts frontend/src/lib/api/streamsQuery.test.ts frontend/src/lib/api/historyQuery.ts frontend/src/lib/api/historyQuery.test.ts
git commit -m "feat(api): pure query builders for streams and history"
```

---

### Task 4: Document model, indexes, and the indexer store

**Files:**
- Modify: `frontend/src/lib/db.ts`
- Create: `frontend/src/lib/indexer/store.ts`
- Create: `frontend/src/lib/indexer/testing.ts` (in-memory fakes used by later tasks' tests)
- Modify: `frontend/src/lib/api/historyQuery.ts` (drop the temporary intersection type)

**Interfaces:**
- Produces (db.ts): `ActionDoc.participants: string[]`; `StreamDoc.source?: 'event' | 'reconcile'`; `StreamDoc.created_ledger?`, `created_tx?` become optional; `ensureIndexes()` creates the indexes in spec §7.
- Produces (store.ts): `interface CursorState { cursor: string | null; ledger: number }`, `interface ReconcileMeta { at: number; live: number; upserted: number; depleted: number }`, `interface StreamHead { _id: number; was_canceled: boolean; is_depleted: boolean }`, `interface IndexerStore { loadCursorState(): Promise<CursorState | null>; saveCursorState(s: CursorState): Promise<void>; getStream(id: number): Promise<StreamDoc | null>; upsertStream(id: number, set: Partial<StreamDoc>, setOnInsert?: Partial<StreamDoc>): Promise<void>; markDepleted(id: number, now: number): Promise<void>; insertAction(a: ActionDoc): Promise<void>; listStreamHeads(): Promise<StreamHead[]>; saveReconcileMeta(m: ReconcileMeta): Promise<void> }`; `class MongoIndexerStore implements IndexerStore` with an extra `backfillParticipants(): Promise<number>`.
- Produces (testing.ts): `class MemoryIndexerStore implements IndexerStore` exposing `streams: Map<number, StreamDoc>`, `actions: ActionDoc[]`, `cursorSaves: CursorState[]`, `reconcileMeta: ReconcileMeta | null`; `class FakeChain implements ChainReader` (from Task 5's interface — declare it here structurally: `{ getStream(id): Promise<StreamChain | null>; totalSupply(): Promise<number>; getTokenId(i): Promise<number> }`) constructed with `new FakeChain(streams: Map<number, StreamChain>)` where `totalSupply()` = map size and `getTokenId(i)` = the i-th key in insertion order.

- [ ] **Step 1: Update `db.ts` document types**

In `StreamDoc` change `created_ledger: number;` → `created_ledger?: number;` and `created_tx: string;` → `created_tx?: string;`, and add after `updated_at: number;`:

```ts
  /** How the doc was last materialized: from an event or from a reconcile pass. */
  source?: 'event' | 'reconcile';
```

In `ActionDoc` add after `log_index: number;`:

```ts
  /**
   * Addresses involved in this action: the stream's sender + recipient at
   * event time plus the action's actor / to / new_owner. Multikey-indexed so
   * a wallet's whole history is one query.
   */
  participants: string[];
```

Replace the body of `ensureIndexes()` with:

```ts
export async function ensureIndexes(): Promise<void> {
  const streams = await streamsCollection();
  await streams.createIndex({ sender: 1, created_at: -1 });
  await streams.createIndex({ recipient: 1, created_at: -1 });
  await streams.createIndex({ token: 1 });
  await streams.createIndex({ model: 1 });
  await streams.createIndex({ end_ts: 1 });
  await streams.createIndex({ created_at: -1, _id: -1 });
  await streams.createIndex({ contract: 1, _id: 1 });

  const actions = await actionsCollection();
  await actions.createIndex(
    { tx_hash: 1, log_index: 1 },
    { unique: true, name: 'tx_logidx_unique' },
  );
  await actions.createIndex({ stream_id: 1, ts: -1 });
  await actions.createIndex({ participants: 1, ts: -1, log_index: -1 });
  await actions.createIndex({ actor: 1, ts: -1 });
}
```

(The old single-field `{sender:1}` / `{recipient:1}` indexes can stay in existing databases; they are simply no longer declared.)

Then in `frontend/src/lib/api/historyQuery.ts` replace `Filter<ActionDoc & { participants?: string[] }>` with `Filter<ActionDoc>`.

- [ ] **Step 2: Create `store.ts`**

```ts
// Persistence boundary for the indexer. `IndexerStore` is the interface the
// ingest + reconcile logic depends on; `MongoIndexerStore` is the real one.
// Tests use `MemoryIndexerStore` from ./testing.

import {
  actionsCollection,
  metaCollection,
  streamsCollection,
  type ActionDoc,
  type StreamDoc,
} from '../db';

export interface CursorState {
  cursor: string | null;
  ledger: number;
}

export interface ReconcileMeta {
  at: number;
  live: number;
  upserted: number;
  depleted: number;
}

export interface StreamHead {
  _id: number;
  was_canceled: boolean;
  is_depleted: boolean;
}

export interface ActionKey {
  ts: number;
  log_index: number;
}

export interface TransferRef {
  ts: number;
  log_index: number;
  actor?: string;
  new_owner?: string;
}

/** Recipient of a stream at the moment of `key`, reconstructed from its transfer history. */
export function recipientAt(key: ActionKey, transfersAsc: TransferRef[], current: string): string {
  for (const t of transfersAsc) {
    if (t.ts > key.ts || (t.ts === key.ts && t.log_index > key.log_index)) return t.actor ?? current;
  }
  return current;
}

export interface IndexerStore {
  loadCursorState(): Promise<CursorState | null>;
  saveCursorState(s: CursorState): Promise<void>;
  getStream(id: number): Promise<StreamDoc | null>;
  /** Keys present in `set` take precedence; overlapping keys are dropped from `setOnInsert`. */
  upsertStream(id: number, set: Partial<StreamDoc>, setOnInsert?: Partial<StreamDoc>): Promise<void>;
  markDepleted(id: number, now: number): Promise<void>;
  /** Idempotent: duplicate (tx_hash, log_index) is silently ignored. */
  insertAction(a: ActionDoc): Promise<void>;
  listStreamHeads(): Promise<StreamHead[]>;
  saveReconcileMeta(m: ReconcileMeta): Promise<void>;
}

const CURSOR_KEY = 'events_cursor';
const RECONCILE_KEY = 'last_reconcile';

export class MongoIndexerStore implements IndexerStore {
  async loadCursorState(): Promise<CursorState | null> {
    const meta = await metaCollection();
    const doc = await meta.findOne({ _id: CURSOR_KEY });
    const v = doc?.value as Partial<CursorState> | undefined;
    if (!v || typeof v.ledger !== 'number') return null;
    return { cursor: typeof v.cursor === 'string' ? v.cursor : null, ledger: v.ledger };
  }

  async saveCursorState(s: CursorState): Promise<void> {
    const meta = await metaCollection();
    await meta.updateOne({ _id: CURSOR_KEY }, { $set: { value: s } }, { upsert: true });
  }

  async getStream(id: number): Promise<StreamDoc | null> {
    const streams = await streamsCollection();
    return streams.findOne({ _id: id });
  }

  async upsertStream(id: number, set: Partial<StreamDoc>, setOnInsert?: Partial<StreamDoc>): Promise<void> {
    const streams = await streamsCollection();
    const update: Record<string, unknown> = { $set: set };
    // Mongo rejects an update where the same field path appears in both
    // $set and $setOnInsert, so drop any keys already present in `set`.
    const onInsert = Object.fromEntries(
      Object.entries(setOnInsert ?? {}).filter(([k]) => !(k in set)),
    );
    if (Object.keys(onInsert).length > 0) update.$setOnInsert = onInsert;
    await streams.updateOne({ _id: id }, update, { upsert: true });
  }

  async markDepleted(id: number, now: number): Promise<void> {
    const streams = await streamsCollection();
    await streams.updateOne({ _id: id }, { $set: { is_depleted: true, updated_at: now } });
  }

  async insertAction(a: ActionDoc): Promise<void> {
    const actions = await actionsCollection();
    try {
      await actions.insertOne(a);
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  async listStreamHeads(): Promise<StreamHead[]> {
    const streams = await streamsCollection();
    return streams
      .find({}, { projection: { _id: 1, was_canceled: 1, is_depleted: 1 } })
      .toArray() as Promise<StreamHead[]>;
  }

  async saveReconcileMeta(m: ReconcileMeta): Promise<void> {
    const meta = await metaCollection();
    await meta.updateOne({ _id: RECONCILE_KEY }, { $set: { value: m } }, { upsert: true });
  }

  /**
   * One-time migration: fill `participants` on actions written before the
   * field existed. The recipient is reconstructed at the action's own
   * (ts, log_index) from the stream's transfer history — using the stream
   * doc's CURRENT recipient would misattribute pre-transfer actions to a
   * later owner. Returns the number of actions updated.
   */
  async backfillParticipants(): Promise<number> {
    const actions = await actionsCollection();
    const streams = await streamsCollection();
    const missing = await actions.find({ participants: { $exists: false } }).toArray();
    if (missing.length === 0) return 0;

    const streamIds = [...new Set(missing.map((a) => a.stream_id))];

    const streamDocs = await streams
      .find({ _id: { $in: streamIds } }, { projection: { sender: 1, recipient: 1 } })
      .toArray();
    const streamById = new Map(streamDocs.map((s) => [s._id, { sender: s.sender, recipient: s.recipient }]));

    const transferDocs = await actions
      .find({ stream_id: { $in: streamIds }, action: 'transferred' })
      .sort({ ts: 1, log_index: 1 })
      .toArray();
    const transfersByStream = new Map<number, TransferRef[]>();
    for (const t of transferDocs) {
      const list = transfersByStream.get(t.stream_id) ?? [];
      list.push({ ts: t.ts, log_index: t.log_index, actor: t.actor, new_owner: t.new_owner });
      transfersByStream.set(t.stream_id, list);
    }

    let n = 0;
    for (const a of missing) {
      const s = streamById.get(a.stream_id);
      const transfers = transfersByStream.get(a.stream_id) ?? [];
      const set = new Set<string>();
      if (s) {
        set.add(s.sender);
        set.add(recipientAt({ ts: a.ts, log_index: a.log_index }, transfers, s.recipient));
      }
      for (const v of [a.actor, a.to, a.new_owner]) if (v) set.add(v);
      await actions.updateOne({ _id: a._id }, { $set: { participants: [...set] } });
      n++;
    }
    return n;
  }
}
```

- [ ] **Step 3: Create `testing.ts` (fakes for later tasks)**

```ts
// In-memory fakes for unit tests. Never imported by production code.

import type { ActionDoc, StreamDoc } from '../db';
import type { CursorState, IndexerStore, ReconcileMeta, StreamHead } from './store';

export class MemoryIndexerStore implements IndexerStore {
  streams = new Map<number, StreamDoc>();
  actions: ActionDoc[] = [];
  cursor: CursorState | null = null;
  cursorSaves: CursorState[] = [];
  reconcileMeta: ReconcileMeta | null = null;

  async loadCursorState() { return this.cursor; }
  async saveCursorState(s: CursorState) { this.cursor = s; this.cursorSaves.push(s); }
  async getStream(id: number) { return this.streams.get(id) ?? null; }
  async upsertStream(id: number, set: Partial<StreamDoc>, setOnInsert?: Partial<StreamDoc>) {
    const existing = this.streams.get(id);
    // Keys present in `set` take precedence over `setOnInsert` (spread order
    // below already gives `set` the final say), mirroring Mongo semantics.
    const merged = { ...(existing ?? setOnInsert ?? {}), ...set, _id: id } as StreamDoc;
    this.streams.set(id, merged);
  }
  async markDepleted(id: number, now: number) {
    const s = this.streams.get(id);
    if (s) this.streams.set(id, { ...s, is_depleted: true, updated_at: now });
  }
  async insertAction(a: ActionDoc) {
    if (this.actions.some((x) => x.tx_hash === a.tx_hash && x.log_index === a.log_index)) return;
    this.actions.push(a);
  }
  async listStreamHeads(): Promise<StreamHead[]> {
    return [...this.streams.values()].map((s) => ({ _id: s._id, was_canceled: s.was_canceled, is_depleted: s.is_depleted }));
  }
  async saveReconcileMeta(m: ReconcileMeta) { this.reconcileMeta = m; }
}

// Minimal structural copy of Task 5's ChainReader so tests compile before/after.
export interface StreamChainLike {
  sender: string; recipient: string; token: string;
  start_ts: number; end_ts: number;
  deposited: bigint; withdrawn: bigint; refunded: bigint;
  is_cancelable: boolean; is_transferable: boolean; was_canceled: boolean; is_depleted: boolean;
  shape:
    | { tag: 'Linear'; values: readonly [{ cliff_ts: number; unlock_at_start: bigint; unlock_at_cliff: bigint }] }
    | { tag: 'Tranched'; values: readonly [{ tranches: Array<{ amount: bigint; ts: number }> }] }
    | { tag: 'Recurring'; values: readonly [{ first_ts: number; period_secs: number; count: number; amount_per_period: bigint }] };
}

export class FakeChain {
  calls = { getStream: 0, totalSupply: 0, getTokenId: 0 };
  constructor(public streams: Map<number, StreamChainLike>) {}
  async getStream(id: number) { this.calls.getStream++; return this.streams.get(id) ?? null; }
  async totalSupply() { this.calls.totalSupply++; return this.streams.size; }
  async getTokenId(index: number) { this.calls.getTokenId++; return [...this.streams.keys()][index]; }
}

export function chainStream(over: Partial<StreamChainLike> = {}): StreamChainLike {
  return {
    sender: 'GSENDER', recipient: 'GRECIP', token: 'CTOKEN',
    start_ts: 1_000, end_ts: 2_000,
    deposited: 1_000n, withdrawn: 0n, refunded: 0n,
    is_cancelable: true, is_transferable: true, was_canceled: false, is_depleted: false,
    shape: { tag: 'Linear', values: [{ cliff_ts: 1_000, unlock_at_start: 0n, unlock_at_cliff: 0n }] },
    ...over,
  };
}
```

- [ ] **Step 3b: Unit-test the `recipientAt` helper**

Create `frontend/src/lib/indexer/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { recipientAt } from './store';

const transfers = [
  { ts: 100, log_index: 1, actor: 'R1', new_owner: 'R2' },
  { ts: 200, log_index: 1, actor: 'R2', new_owner: 'R3' },
];

describe('recipientAt', () => {
  it('uses the previous owner of the first transfer after the action', () => {
    expect(recipientAt({ ts: 50, log_index: 0 }, transfers, 'R3')).toBe('R1');
    expect(recipientAt({ ts: 150, log_index: 0 }, transfers, 'R3')).toBe('R2');
  });
  it('falls back to the current recipient after the last transfer', () => {
    expect(recipientAt({ ts: 250, log_index: 0 }, transfers, 'R3')).toBe('R3');
    expect(recipientAt({ ts: 250, log_index: 0 }, [], 'R9')).toBe('R9');
  });
  it('orders by log_index within the same ledger timestamp', () => {
    expect(recipientAt({ ts: 100, log_index: 0 }, transfers, 'R3')).toBe('R1');
    expect(recipientAt({ ts: 100, log_index: 1 }, transfers, 'R3')).toBe('R2');
  });
});
```

Run: `npx vitest run src/lib/indexer/store.test.ts` → 3/3.

- [ ] **Step 4: Typecheck, run tests, commit**

`scripts/indexer.ts` still compiles (it builds `ActionDoc` without `participants` → typecheck error). Add `participants: []` to the `actionDoc` literal in `handleEvent` (it is rewritten in Task 6 anyway) so the tree stays green.

Run: `cd frontend && npm run typecheck && npm test`
Expected: green.

```bash
git add frontend/src/lib/db.ts frontend/src/lib/indexer/store.ts frontend/src/lib/indexer/testing.ts frontend/src/lib/api/historyQuery.ts frontend/scripts/indexer.ts
git commit -m "feat(indexer): participants on actions, new indexes, IndexerStore boundary"
```

---

### Task 5: `events.ts` + `chain.ts` (parse + chain reader)

**Files:**
- Create: `frontend/src/lib/indexer/events.ts`, `frontend/src/lib/indexer/events.test.ts`
- Create: `frontend/src/lib/indexer/chain.ts`, `frontend/src/lib/indexer/chain.test.ts`

**Interfaces:**
- Produces (events.ts): `type ActionName = ActionDoc['action']`; `interface ParsedEvent { action: ActionName; streamId: number; topics: unknown[]; data: unknown; ledger: number; tx_hash: string; log_index: number; ts: number }`; `parseEvent(e: Api.EventResponse): ParsedEvent | null` (verbatim move from `scripts/indexer.ts`).
- Produces (chain.ts): `interface StreamChain` (the SDK `Stream` shape used by the old indexer, with the three shape variants); `interface ChainReader { getStream(id: number): Promise<StreamChain | null>; totalSupply(): Promise<number>; getTokenId(index: number): Promise<number> }`; `mapStream(s: StreamChain): Partial<StreamDoc>` (the field mapping from the old `fetchStreamFromChain`, now pure); `makeChainReader(d: { lockup: string; networkPassphrase: string; rpcUrl: string; deployer: string }): ChainReader`.

- [ ] **Step 1: Write the failing tests**

`events.test.ts`:

```ts
import { Keypair, nativeToScVal, xdr, type rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { parseEvent } from './events';

const addr = Keypair.random().publicKey();
const sym = (s: string) => nativeToScVal(s, { type: 'symbol' });

function ev(topic: xdr.ScVal[], value: xdr.ScVal, over: Partial<rpc.Api.EventResponse> = {}): rpc.Api.EventResponse {
  return {
    id: '0001',
    type: 'contract',
    ledger: 4_671_200,
    ledgerClosedAt: '2026-09-14T10:15:00Z',
    contractId: undefined,
    topic,
    value,
    txHash: 'ab'.repeat(32),
    transactionIndex: 3,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    ...over,
  } as unknown as rpc.Api.EventResponse;
}

describe('parseEvent', () => {
  it('parses a withdrawn event with (amount, caller) data', () => {
    const value = xdr.ScVal.scvVec([
      nativeToScVal(1_000n, { type: 'i128' }),
      nativeToScVal(addr, { type: 'address' }),
    ]);
    const p = parseEvent(ev([sym('stream'), sym('withdrawn'), nativeToScVal(7, { type: 'u32' }), nativeToScVal(addr, { type: 'address' })], value));
    expect(p).not.toBeNull();
    expect(p!.action).toBe('withdrawn');
    expect(p!.streamId).toBe(7);
    expect(p!.topics[3]).toBe(addr);
    expect(p!.data).toEqual([1_000n, addr]);
    expect(p!.log_index).toBe(3_000_000);
    expect(p!.ts).toBe(Math.floor(Date.parse('2026-09-14T10:15:00Z') / 1000));
  });
  it('ignores events from other domains or unknown actions', () => {
    expect(parseEvent(ev([sym('transfer'), sym('x')], nativeToScVal(0, { type: 'u32' })))).toBeNull();
    expect(parseEvent(ev([sym('stream'), sym('exploded'), nativeToScVal(1, { type: 'u32' })], nativeToScVal(0, { type: 'u32' })))).toBeNull();
  });
  it('rejects a non-integer stream id', () => {
    expect(parseEvent(ev([sym('stream'), sym('renounced'), sym('nope')], nativeToScVal(0, { type: 'u32' })))).toBeNull();
  });
});
```

`chain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapStream } from './chain';
import { chainStream } from './testing';

describe('mapStream', () => {
  it('maps Linear fields', () => {
    const d = mapStream(chainStream());
    expect(d).toMatchObject({ model: 'Linear', cliff_ts: 1_000, unlock_at_start: '0', unlock_at_cliff: '0', deposited: '1000', sender: 'GSENDER' });
  });
  it('maps Tranched fields to decimal strings', () => {
    const d = mapStream(chainStream({ shape: { tag: 'Tranched', values: [{ tranches: [{ amount: 5n, ts: 1_000 }, { amount: 7n, ts: 2_000 }] }] } }));
    expect(d).toMatchObject({ model: 'Tranched', tranches: [{ amount: '5', ts: 1_000 }, { amount: '7', ts: 2_000 }] });
  });
  it('maps Recurring fields', () => {
    const d = mapStream(chainStream({ shape: { tag: 'Recurring', values: [{ first_ts: 1_000, period_secs: 60, count: 3, amount_per_period: 10n }] } }));
    expect(d).toMatchObject({ model: 'Recurring', first_ts: 1_000, period_secs: 60, count: 3, amount_per_period: '10' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./events` / `./chain`.

- [ ] **Step 3: Create `events.ts`**

Move `ParsedEvent`, `KNOWN_ACTIONS` and `parseEvent` verbatim from `scripts/indexer.ts` (lines ~82-156) into this file; export `ParsedEvent`, `ActionName`, `parseEvent`. Imports: `import { scValToNative, type rpc, type xdr } from '@stellar/stellar-sdk'; import type { ActionDoc } from '../db';`. Use `rpc.Api.EventResponse` as the parameter type. No behaviour change.

- [ ] **Step 4: Create `chain.ts`**

```ts
// Read-only view of the lockup contract via the generated SDK client.

import { lockup as lockupSdk } from 'hourglass';
import type { StreamDoc } from '../db';

interface ShapeLinearChain { tag: 'Linear'; values: readonly [{ cliff_ts: bigint | number; unlock_at_start: bigint; unlock_at_cliff: bigint }] }
interface ShapeTranchedChain { tag: 'Tranched'; values: readonly [{ tranches: Array<{ amount: bigint; ts: bigint | number }> }] }
interface ShapeRecurringChain { tag: 'Recurring'; values: readonly [{ first_ts: bigint | number; period_secs: bigint | number; count: number; amount_per_period: bigint }] }

export interface StreamChain {
  sender: string; recipient: string; token: string;
  start_ts: bigint | number; end_ts: bigint | number;
  deposited: bigint; withdrawn: bigint; refunded: bigint;
  is_cancelable: boolean; is_transferable: boolean; was_canceled: boolean; is_depleted: boolean;
  shape: ShapeLinearChain | ShapeTranchedChain | ShapeRecurringChain;
}

export interface ChainReader {
  /** `null` when the stream record does not exist (never created, or burned). */
  getStream(id: number): Promise<StreamChain | null>;
  totalSupply(): Promise<number>;
  getTokenId(index: number): Promise<number>;
}

/** Pure mapping of an on-chain record to the materialized document fields. */
export function mapStream(s: StreamChain): Partial<StreamDoc> {
  let shapeFields: Partial<StreamDoc>;
  if (s.shape.tag === 'Linear') {
    shapeFields = {
      model: 'Linear',
      cliff_ts: Number(s.shape.values[0].cliff_ts),
      unlock_at_start: String(s.shape.values[0].unlock_at_start),
      unlock_at_cliff: String(s.shape.values[0].unlock_at_cliff),
    };
  } else if (s.shape.tag === 'Tranched') {
    shapeFields = {
      model: 'Tranched',
      tranches: s.shape.values[0].tranches.map((t) => ({ amount: String(t.amount), ts: Number(t.ts) })),
    };
  } else if (s.shape.tag === 'Recurring') {
    shapeFields = {
      model: 'Recurring',
      first_ts: Number(s.shape.values[0].first_ts),
      period_secs: Number(s.shape.values[0].period_secs),
      count: Number(s.shape.values[0].count),
      amount_per_period: String(s.shape.values[0].amount_per_period),
    };
  } else {
    throw new Error(`unknown stream shape: ${JSON.stringify(s.shape)}`);
  }
  return {
    sender: String(s.sender),
    recipient: String(s.recipient),
    token: String(s.token),
    start_ts: Number(s.start_ts),
    end_ts: Number(s.end_ts),
    deposited: String(s.deposited),
    withdrawn: String(s.withdrawn),
    refunded: String(s.refunded),
    is_cancelable: Boolean(s.is_cancelable),
    is_transferable: Boolean(s.is_transferable),
    was_canceled: Boolean(s.was_canceled),
    is_depleted: Boolean(s.is_depleted),
    ...shapeFields,
  };
}

type ViewClient = {
  get_stream(a: { stream_id: number }): Promise<{ result: unknown }>;
  total_supply(): Promise<{ result: unknown }>;
  get_token_id(a: { index: number }): Promise<{ result: unknown }>;
};

function isNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err);
  return msg.includes('StreamNotFound') || msg.includes('#30') || msg.toLowerCase().includes('not found');
}

export function makeChainReader(d: { lockup: string; networkPassphrase: string; rpcUrl: string; deployer: string }): ChainReader {
  const client = new lockupSdk.Client({
    contractId: d.lockup,
    networkPassphrase: d.networkPassphrase,
    rpcUrl: d.rpcUrl,
    publicKey: d.deployer,
    allowHttp: d.rpcUrl.startsWith('http://'),
  }) as unknown as ViewClient;
  return {
    async getStream(id) {
      try {
        const tx = await client.get_stream({ stream_id: id });
        const s = tx.result as StreamChain | undefined;
        return s && s.sender ? s : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async totalSupply() {
      return Number((await client.total_supply()).result);
    },
    async getTokenId(index) {
      return Number((await client.get_token_id({ index })).result);
    },
  };
}
```

- [ ] **Step 5: Run tests + typecheck; commit**

Run: `cd frontend && npm test && npm run typecheck`
Expected: green (the old `scripts/indexer.ts` keeps its own copies until Task 8 — duplication is temporary and removed there).

```bash
git add frontend/src/lib/indexer/events.ts frontend/src/lib/indexer/events.test.ts frontend/src/lib/indexer/chain.ts frontend/src/lib/indexer/chain.test.ts
git commit -m "feat(indexer): event parser and chain reader modules"
```

---

### Task 6: `ingest.ts` — participants, handleEvent, cursor-paged fetch

**Files:**
- Create: `frontend/src/lib/indexer/ingest.ts`, `frontend/src/lib/indexer/ingest.test.ts`

**Interfaces:**
- Consumes: `ParsedEvent` (Task 5), `ChainReader`/`mapStream` (Task 5), `IndexerStore`/`CursorState` (Task 4), `MemoryIndexerStore`/`FakeChain`/`chainStream` (Task 4 testing).
- Produces: `participantsFor(a: Pick<ActionDoc, 'actor' | 'to' | 'new_owner'>, stream: { sender: string; recipient: string } | null): string[]`; `interface EventsRpc { getEvents(req: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>; getLatestLedger(): Promise<{ sequence: number }> }`; `interface IngestOptions { contractId: string; pageLimit: number; maxPages: number; startupBufferLedgers: number }`; `interface IngestResult { pages: number; events: number; reset: boolean }`; `fetchAndIngest(rpc: EventsRpc, store: IndexerStore, opts: IngestOptions, handleRaw: (e: rpc.Api.EventResponse) => Promise<void>): Promise<IngestResult>`; `handleEvent(p: ParsedEvent, deps: { chain: ChainReader; store: IndexerStore; contractId: string; now: () => number }): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```ts
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import type { ParsedEvent } from './events';
import { fetchAndIngest, handleEvent, participantsFor } from './ingest';
import { chainStream, FakeChain, MemoryIndexerStore } from './testing';

describe('participantsFor', () => {
  it('unions stream parties with the action addresses, deduped', () => {
    expect(participantsFor({ actor: 'GA', to: 'GB' }, { sender: 'GS', recipient: 'GA' })).toEqual(['GS', 'GA', 'GB']);
    expect(participantsFor({}, null)).toEqual([]);
    expect(participantsFor({ new_owner: 'GN' }, { sender: 'GS', recipient: 'GR' })).toEqual(['GS', 'GR', 'GN']);
  });
});

function fakeRpc(total: number, pageLimit: number, latest = 5_000) {
  const calls: rpc.Api.GetEventsRequest[] = [];
  let served = 0;
  const server: {
    getEvents(req: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
    getLatestLedger(): Promise<{ sequence: number }>;
  } = {
    async getEvents(req) {
      calls.push(req);
      const n = Math.min(pageLimit, total - served);
      const events = Array.from({ length: n }, (_, i) => ({ id: String(served + i) })) as unknown as rpc.Api.EventResponse[];
      served += n;
      return { events, cursor: `c${calls.length}`, latestLedger: latest, oldestLedger: 1, latestLedgerCloseTime: 0, oldestLedgerCloseTime: 0 } as unknown as rpc.Api.GetEventsResponse;
    },
    async getLatestLedger() { return { sequence: latest }; },
  };
  return { server, calls };
}

const opts = { contractId: 'CLOCKUP', pageLimit: 100, maxPages: 20, startupBufferLedgers: 100 };

describe('fetchAndIngest', () => {
  it('pages until a short page, persisting the cursor after every page', async () => {
    const { server, calls } = fakeRpc(250, 100);
    const store = new MemoryIndexerStore();
    const seen: string[] = [];
    const r = await fetchAndIngest(server, store, opts, async (e) => { seen.push((e as { id: string }).id); });
    expect(r).toEqual({ pages: 3, events: 250, reset: false });
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
    expect(calls[0]).toMatchObject({ startLedger: 4_900, limit: 100 });
    expect(calls[1]).toMatchObject({ cursor: 'c1', limit: 100 });
    expect(calls[2]).toMatchObject({ cursor: 'c2', limit: 100 });
    expect(store.cursorSaves.map((s) => s.cursor)).toEqual(['c1', 'c2', 'c3']);
    expect(store.cursor).toEqual({ cursor: 'c3', ledger: 5_000 });
  });
  it('stops at maxPages and resumes from the saved cursor next time', async () => {
    const { server, calls } = fakeRpc(250, 100);
    const store = new MemoryIndexerStore();
    const r1 = await fetchAndIngest(server, store, { ...opts, maxPages: 2 }, async () => {});
    expect(r1.pages).toBe(2);
    const r2 = await fetchAndIngest(server, store, { ...opts, maxPages: 2 }, async () => {});
    expect(r2).toEqual({ pages: 1, events: 50, reset: false });
    expect(calls[2]).toMatchObject({ cursor: 'c2' });
  });
  it('resets to latest - buffer on a retention error and reports reset', async () => {
    const store = new MemoryIndexerStore();
    store.cursor = { cursor: 'stale', ledger: 10 };
    const server = {
      async getEvents() { throw new Error('start is before oldest ledger'); },
      async getLatestLedger() { return { sequence: 9_000 }; },
    };
    const r = await fetchAndIngest(server, store, opts, async () => {});
    expect(r).toEqual({ pages: 0, events: 0, reset: true });
    expect(store.cursor).toEqual({ cursor: null, ledger: 8_900 });
  });
  it('rethrows other errors', async () => {
    const store = new MemoryIndexerStore();
    const server = { async getEvents() { throw new Error('boom'); }, async getLatestLedger() { return { sequence: 1 }; } };
    await expect(fetchAndIngest(server, store, opts, async () => {})).rejects.toThrow('boom');
  });
});

function parsed(over: Partial<ParsedEvent>): ParsedEvent {
  return { action: 'created', streamId: 1, topics: ['stream', 'created', 1, 'GSENDER'], data: null, ledger: 100, tx_hash: 'h1', log_index: 1, ts: 1_500, ...over };
}

describe('handleEvent', () => {
  const now = () => 2_000;
  it('created: materializes the stream with provenance and writes the action with participants', async () => {
    const chain = new FakeChain(new Map([[1, chainStream()]]));
    const store = new MemoryIndexerStore();
    await handleEvent(parsed({}), { chain, store, contractId: 'CLOCKUP', now });
    const s = store.streams.get(1)!;
    expect(s).toMatchObject({ _id: 1, sender: 'GSENDER', recipient: 'GRECIP', contract: 'CLOCKUP', created_tx: 'h1', created_ledger: 100, created_at: 1_500, source: 'event', updated_at: 2_000 });
    expect(store.actions).toHaveLength(1);
    expect(store.actions[0]).toMatchObject({ action: 'created', actor: 'GSENDER', participants: ['GSENDER', 'GRECIP'] });
  });
  it('withdrawn: refreshes the stream and records amount/actor/to', async () => {
    const chain = new FakeChain(new Map([[1, chainStream({ withdrawn: 250n })]]));
    const store = new MemoryIndexerStore();
    await handleEvent(parsed({ action: 'withdrawn', topics: ['stream', 'withdrawn', 1, 'GRECIP'], data: [250n, 'GRECIP'], tx_hash: 'h2' }), { chain, store, contractId: 'CLOCKUP', now });
    expect(store.streams.get(1)!.withdrawn).toBe('250');
    expect(store.actions[0]).toMatchObject({ action: 'withdrawn', amount: '250', actor: 'GRECIP', to: 'GRECIP', participants: ['GSENDER', 'GRECIP'] });
  });
  it('transferred: records new_owner and includes it in participants', async () => {
    const chain = new FakeChain(new Map([[1, chainStream({ recipient: 'GNEW' })]]));
    const store = new MemoryIndexerStore();
    await handleEvent(parsed({ action: 'transferred', topics: ['stream', 'transferred', 1, 'GNEW'], data: 'GRECIP', tx_hash: 'h3' }), { chain, store, contractId: 'CLOCKUP', now });
    expect(store.actions[0]).toMatchObject({ action: 'transferred', new_owner: 'GNEW', actor: 'GRECIP', participants: ['GSENDER', 'GNEW', 'GRECIP'] });
  });
  it('burned: marks the existing doc depleted without a chain read', async () => {
    const chain = new FakeChain(new Map());
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, sender: 'GSENDER', recipient: 'GRECIP', is_depleted: false } as never);
    await handleEvent(parsed({ action: 'burned', topics: ['stream', 'burned', 1], tx_hash: 'h4' }), { chain, store, contractId: 'CLOCKUP', now });
    expect(store.streams.get(1)!.is_depleted).toBe(true);
    expect(chain.calls.getStream).toBe(0);
    expect(store.actions[0]).toMatchObject({ action: 'burned', participants: ['GSENDER', 'GRECIP'] });
  });
  it('is idempotent on (tx_hash, log_index)', async () => {
    const chain = new FakeChain(new Map([[1, chainStream()]]));
    const store = new MemoryIndexerStore();
    await handleEvent(parsed({}), { chain, store, contractId: 'CLOCKUP', now });
    await handleEvent(parsed({}), { chain, store, contractId: 'CLOCKUP', now });
    expect(store.actions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./ingest`.

- [ ] **Step 3: Implement `ingest.ts`**

```ts
// Event ingestion: cursor-paged fetch from RPC and per-event materialization.
// All I/O goes through the injected `EventsRpc`, `ChainReader`, `IndexerStore`.

import type { rpc } from '@stellar/stellar-sdk';
import type { ActionDoc, StreamDoc } from '../db';
import { mapStream, type ChainReader } from './chain';
import type { ParsedEvent } from './events';
import type { CursorState, IndexerStore } from './store';

export interface EventsRpc {
  getEvents(req: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
  getLatestLedger(): Promise<{ sequence: number }>;
}

export interface IngestOptions {
  contractId: string;
  pageLimit: number;
  maxPages: number;
  startupBufferLedgers: number;
}

export interface IngestResult {
  pages: number;
  events: number;
  reset: boolean;
}

export function participantsFor(
  a: Pick<ActionDoc, 'actor' | 'to' | 'new_owner'>,
  stream: { sender: string; recipient: string } | null,
): string[] {
  const out: string[] = [];
  const push = (v: string | undefined) => { if (v && !out.includes(v)) out.push(v); };
  if (stream) { push(stream.sender); push(stream.recipient); }
  push(a.actor); push(a.to); push(a.new_owner);
  return out;
}

function isRetentionError(err: unknown): boolean {
  const msg = ((err as Error)?.message ?? String(err)).toLowerCase();
  return msg.includes('oldest') || msg.includes('cursor');
}

/**
 * Fetch every event since the saved cursor state, page by page, persisting
 * the RPC cursor after each page so a crash resumes exactly where it stopped.
 */
export async function fetchAndIngest(
  rpcServer: EventsRpc,
  store: IndexerStore,
  opts: IngestOptions,
  handleRaw: (e: rpc.Api.EventResponse) => Promise<void>,
): Promise<IngestResult> {
  let state: CursorState | null = await store.loadCursorState();
  if (!state) {
    const latest = await rpcServer.getLatestLedger();
    state = { cursor: null, ledger: Math.max(1, latest.sequence - opts.startupBufferLedgers) };
    // Not persisted yet: the first successful page saves the real RPC cursor.
  }
  const filters = [{ type: 'contract' as const, contractIds: [opts.contractId] }];
  let pages = 0;
  let events = 0;

  while (pages < opts.maxPages) {
    const req: rpc.Api.GetEventsRequest = state.cursor
      ? { filters, cursor: state.cursor, limit: opts.pageLimit }
      : { filters, startLedger: state.ledger, limit: opts.pageLimit };

    let res: rpc.Api.GetEventsResponse;
    try {
      res = await rpcServer.getEvents(req);
    } catch (err) {
      if (!isRetentionError(err)) throw err;
      const latest = await rpcServer.getLatestLedger();
      state = { cursor: null, ledger: Math.max(1, latest.sequence - opts.startupBufferLedgers) };
      await store.saveCursorState(state);
      return { pages, events, reset: true };
    }

    pages++;
    for (const e of res.events) {
      await handleRaw(e);
      events++;
    }
    state = { cursor: res.cursor, ledger: res.latestLedger };
    await store.saveCursorState(state);
    if (res.events.length < opts.pageLimit) break;
  }
  return { pages, events, reset: false };
}

/** Materialize one parsed lockup event into the store. */
export async function handleEvent(
  p: ParsedEvent,
  deps: { chain: ChainReader; store: IndexerStore; contractId: string; now: () => number },
): Promise<void> {
  const { chain, store, contractId } = deps;
  const now = deps.now();
  const action: ActionDoc = {
    stream_id: p.streamId,
    action: p.action,
    ts: p.ts,
    ledger: p.ledger,
    tx_hash: p.tx_hash,
    log_index: p.log_index,
    participants: [],
  };

  let parties: { sender: string; recipient: string } | null = null;

  const refresh = async (extra: Partial<StreamDoc> = {}, onInsert: Partial<StreamDoc> = {}) => {
    const s = await chain.getStream(p.streamId);
    if (!s) return;
    const fields = mapStream(s);
    parties = { sender: fields.sender!, recipient: fields.recipient! };
    await store.upsertStream(
      p.streamId,
      { ...fields, ...extra, contract: contractId, updated_at: now, source: 'event' },
      onInsert,
    );
  };

  switch (p.action) {
    case 'created': {
      action.actor = String(p.topics[3] ?? '');
      await refresh({}, { created_ledger: p.ledger, created_tx: p.tx_hash, created_at: p.ts });
      break;
    }
    case 'withdrawn': {
      action.to = String(p.topics[3] ?? '');
      if (Array.isArray(p.data)) {
        const [amount, caller] = p.data as [unknown, unknown];
        if (amount !== undefined) action.amount = String(amount);
        if (caller !== undefined) action.actor = String(caller);
      }
      await refresh();
      break;
    }
    case 'canceled': {
      if (Array.isArray(p.data)) {
        const [refund, balance] = p.data as [unknown, unknown];
        if (refund !== undefined) action.sender_refund = String(refund);
        if (balance !== undefined) action.recipient_balance = String(balance);
      }
      await refresh();
      break;
    }
    case 'renounced': {
      await refresh();
      break;
    }
    case 'transferred': {
      action.new_owner = String(p.topics[3] ?? '');
      if (p.data !== null && p.data !== undefined) action.actor = String(p.data);
      await refresh();
      break;
    }
    case 'burned': {
      await store.markDepleted(p.streamId, now);
      break;
    }
  }

  if (!parties) {
    const existing = await store.getStream(p.streamId);
    if (existing) parties = { sender: existing.sender, recipient: existing.recipient };
  }
  action.participants = participantsFor(action, parties);
  await store.insertAction(action);
}
```

- [ ] **Step 4: Run tests + typecheck; commit**

Run: `cd frontend && npm test && npm run typecheck`
Expected: green. If `participants` order in a test differs from the implementation's insertion order, the implementation is right and the test expectation must be corrected to match "stream sender, stream recipient, actor, to, new_owner" order — but only after confirming that order is what the code produces.

```bash
git add frontend/src/lib/indexer/ingest.ts frontend/src/lib/indexer/ingest.test.ts
git commit -m "feat(indexer): cursor-paged ingestion and participant-aware event handling"
```

---

### Task 7: `reconcile.ts`

**Files:**
- Create: `frontend/src/lib/indexer/reconcile.ts`, `frontend/src/lib/indexer/reconcile.test.ts`

**Interfaces:**
- Consumes: `ChainReader`, `mapStream` (Task 5), `IndexerStore` (Task 4), fakes (Task 4).
- Produces: `interface ReconcileOptions { contractId: string; now: () => number; concurrency: number }`; `interface ReconcileResult { live: number; upserted: number; depleted: number }`; `reconcile(chain: ChainReader, store: IndexerStore, opts: ReconcileOptions): Promise<ReconcileResult>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import { chainStream, FakeChain, MemoryIndexerStore } from './testing';

const opts = { contractId: 'CLOCKUP', now: () => 5_000, concurrency: 2 };

describe('reconcile', () => {
  it('inserts missing live streams, refreshes non-terminal ones, marks burned ones depleted', async () => {
    const chain = new FakeChain(new Map([
      [1, chainStream({ withdrawn: 10n })],   // in mongo, non-terminal → refreshed
      [2, chainStream({ was_canceled: true, is_depleted: true })], // in mongo, terminal → skipped
      [4, chainStream()],                       // missing in mongo → inserted
    ]));
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, sender: 'GSENDER', recipient: 'GRECIP', withdrawn: '0', was_canceled: false, is_depleted: false } as never);
    store.streams.set(2, { _id: 2, was_canceled: true, is_depleted: true } as never);
    store.streams.set(3, { _id: 3, was_canceled: false, is_depleted: false } as never); // burned on chain

    const r = await reconcile(chain, store, opts);
    expect(r).toEqual({ live: 3, upserted: 2, depleted: 1 });
    expect(store.streams.get(1)!.withdrawn).toBe('10');
    expect(store.streams.get(4)).toMatchObject({ _id: 4, sender: 'GSENDER', contract: 'CLOCKUP', source: 'reconcile', created_at: 1_000 });
    expect(store.streams.get(3)!.is_depleted).toBe(true);
    expect(chain.calls.getStream).toBe(2); // ids 1 and 4 only
    expect(store.reconcileMeta).toMatchObject({ at: 5_000, live: 3, upserted: 2, depleted: 1 });
  });
  it('does nothing on an empty chain and empty store', async () => {
    const r = await reconcile(new FakeChain(new Map()), new MemoryIndexerStore(), opts);
    expect(r).toEqual({ live: 0, upserted: 0, depleted: 0 });
  });
  it('keeps provenance when refreshing an existing doc', async () => {
    const chain = new FakeChain(new Map([[1, chainStream()]]));
    const store = new MemoryIndexerStore();
    store.streams.set(1, { _id: 1, created_tx: 'h1', created_ledger: 9, created_at: 900, was_canceled: false, is_depleted: false } as never);
    await reconcile(chain, store, opts);
    expect(store.streams.get(1)).toMatchObject({ created_tx: 'h1', created_ledger: 9, created_at: 900 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./reconcile`.

- [ ] **Step 3: Implement `reconcile.ts`**

```ts
// Converge the materialized `streams` collection to on-chain truth using the
// NFT enumeration (every un-burned stream has exactly one NFT, token_id == id).

import { mapStream, type ChainReader } from './chain';
import type { IndexerStore } from './store';

export interface ReconcileOptions {
  contractId: string;
  now: () => number;
  concurrency: number;
}

export interface ReconcileResult {
  live: number;
  upserted: number;
  depleted: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function reconcile(
  chain: ChainReader,
  store: IndexerStore,
  opts: ReconcileOptions,
): Promise<ReconcileResult> {
  const now = opts.now();

  // 1. Enumerate live streams via the NFT extension.
  const supply = await chain.totalSupply();
  const liveIds = await mapLimit(
    Array.from({ length: supply }, (_, i) => i),
    opts.concurrency,
    (i) => chain.getTokenId(i),
  );
  const live = new Set<number>(liveIds);

  // 2. Upsert missing or non-terminal streams.
  const heads = await store.listStreamHeads();
  const known = new Map(heads.map((h) => [h._id, h]));
  const toFetch = [...live].filter((id) => {
    const h = known.get(id);
    return !h || (!h.was_canceled && !h.is_depleted);
  });
  const results = await mapLimit(toFetch, opts.concurrency, async (id) => {
    const s = await chain.getStream(id);
    if (!s) return false;
    const fields = mapStream(s);
    await store.upsertStream(
      id,
      { ...fields, contract: opts.contractId, updated_at: now, source: 'reconcile' },
      { created_at: fields.start_ts ?? now },
    );
    return true;
  });
  const upserted = results.filter(Boolean).length;

  // 3. Streams we know but the chain no longer lists were burned.
  let depleted = 0;
  for (const h of heads) {
    if (!live.has(h._id) && !h.is_depleted) {
      await store.markDepleted(h._id, now);
      depleted++;
    }
  }

  const result = { live: live.size, upserted, depleted };
  await store.saveReconcileMeta({ at: now, ...result });
  return result;
}
```

- [ ] **Step 4: Run tests + typecheck; commit**

Run: `cd frontend && npm test && npm run typecheck`
Expected: green.

```bash
git add frontend/src/lib/indexer/reconcile.ts frontend/src/lib/indexer/reconcile.test.ts
git commit -m "feat(indexer): reconcile materialized streams from chain via NFT enumeration"
```

---

### Task 8: Runner rewrite + compose env

**Files:**
- Rewrite: `frontend/scripts/indexer.ts`
- Modify: `docker-compose.yml` (indexer service environment)

**Interfaces:**
- Consumes: `parseEvent` (Task 5), `makeChainReader` (Task 5), `MongoIndexerStore` (Task 4), `fetchAndIngest`/`handleEvent` (Task 6), `reconcile` (Task 7), `ensureIndexes` (Task 4), `DEPLOYMENT` from `../src/lib/deployments`.

- [ ] **Step 1: Rewrite `frontend/scripts/indexer.ts`**

```ts
/**
 * Hourglass indexer runner.
 *
 * Polls Soroban RPC for lockup events (cursor-paged, lossless), materializes
 * streams + actions into MongoDB, and periodically reconciles the `streams`
 * collection against the chain via the NFT enumeration so restarts and RPC
 * retention gaps self-heal. Logic lives in src/lib/indexer/*; this file only
 * wires configuration and runs the loop.
 *
 * Env: INDEXER_POLL_MS (3000) · INDEXER_RECONCILE_MS (600000) ·
 *      INDEXER_MAX_PAGES (20) · MONGODB_URL · MONGODB_DB
 */

import 'dotenv/config';
import { rpc as StellarRpc } from '@stellar/stellar-sdk';

import { ensureIndexes } from '../src/lib/db';
import { DEPLOYMENT } from '../src/lib/deployments';
import { makeChainReader } from '../src/lib/indexer/chain';
import { parseEvent } from '../src/lib/indexer/events';
import { fetchAndIngest, handleEvent } from '../src/lib/indexer/ingest';
import { reconcile } from '../src/lib/indexer/reconcile';
import { MongoIndexerStore } from '../src/lib/indexer/store';

const POLL_MS = Number(process.env.INDEXER_POLL_MS ?? 3000);
const RECONCILE_MS = Number(process.env.INDEXER_RECONCILE_MS ?? 600_000);
const MAX_PAGES = Number(process.env.INDEXER_MAX_PAGES ?? 20);
const PAGE_LIMIT = 100;
const STARTUP_BUFFER_LEDGERS = 100;
const RECONCILE_CONCURRENCY = 5;

const CONTRACT = DEPLOYMENT.lockup;
const nowSec = () => Math.floor(Date.now() / 1000);

async function main(): Promise<void> {
  if (!CONTRACT) {
    console.error('[indexer] no lockup contract id in deployment — run scripts/deploy-local.sh or deploy-testnet.sh first');
    process.exit(1);
  }
  console.log(`[indexer] starting against ${DEPLOYMENT.rpcUrl}, contract ${CONTRACT}`);

  const server = new StellarRpc.Server(DEPLOYMENT.rpcUrl, { allowHttp: DEPLOYMENT.rpcUrl.startsWith('http://') });
  const chain = makeChainReader({
    lockup: CONTRACT,
    networkPassphrase: DEPLOYMENT.networkPassphrase,
    rpcUrl: DEPLOYMENT.rpcUrl,
    deployer: DEPLOYMENT.deployer,
  });
  const store = new MongoIndexerStore();

  await ensureIndexes();
  const migrated = await store.backfillParticipants();
  if (migrated > 0) console.log(`[indexer] backfilled participants on ${migrated} action(s)`);

  const runReconcile = async (why: string) => {
    try {
      const r = await reconcile(chain, store, { contractId: CONTRACT, now: nowSec, concurrency: RECONCILE_CONCURRENCY });
      console.log(`[indexer] reconcile (${why}): live=${r.live} upserted=${r.upserted} depleted=${r.depleted}`);
    } catch (err) {
      console.error('[indexer] reconcile failed:', err);
    }
  };
  await runReconcile('startup');
  let lastReconcile = Date.now();

  let shuttingDown = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[indexer] ${sig} received — shutting down after the current tick`);
    });
  }

  while (!shuttingDown) {
    try {
      const r = await fetchAndIngest(
        server,
        store,
        { contractId: CONTRACT, pageLimit: PAGE_LIMIT, maxPages: MAX_PAGES, startupBufferLedgers: STARTUP_BUFFER_LEDGERS },
        async (e) => {
          const p = parseEvent(e);
          if (!p) return;
          console.log(`[indexer] ${p.action} stream=${p.streamId} ledger=${p.ledger} tx=${p.tx_hash.slice(0, 8)}…`);
          try {
            await handleEvent(p, { chain, store, contractId: CONTRACT, now: nowSec });
          } catch (err) {
            console.error('[indexer] error handling event:', err);
          }
        },
      );
      if (r.events > 0) console.log(`[indexer] ingested ${r.events} event(s) over ${r.pages} page(s)`);
      if (r.reset) {
        console.warn('[indexer] cursor predates RPC retention — reset; reconciling');
        await runReconcile('retention-reset');
        lastReconcile = Date.now();
      } else if (Date.now() - lastReconcile >= RECONCILE_MS) {
        await runReconcile('periodic');
        lastReconcile = Date.now();
      }
    } catch (err) {
      console.error('[indexer] tick failed:', err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log('[indexer] stopped');
  process.exit(0);
}

main().catch((err) => {
  console.error('[indexer] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Compose env**

In `docker-compose.yml`, under the `indexer` service `environment:`, add after `INDEXER_POLL_MS: "5000"`:

```yaml
      INDEXER_RECONCILE_MS: "600000"
      INDEXER_MAX_PAGES: "20"
```

- [ ] **Step 3: Typecheck + tests; smoke the runner for a few ticks (no writes to the real DB)**

Run: `cd frontend && npm run typecheck && npm test`
Expected: green.

Then a real 30-second run against testnet into a scratch database (needs a local Mongo — if `docker ps | grep -q mongo` is empty, start one: `docker run -d --name hourglass-mongo -p 27017:27017 mongo:7`):

Run: `cd frontend && MONGODB_DB=hourglass_plan_check timeout 40 npm run indexer 2>&1 | tail -25 || true`
Expected: lines `[indexer] starting against https://soroban-testnet…`, `[indexer] reconcile (startup): live=N upserted=N depleted=0` where N ≥ 40 (the v0.2 lockup's smoke + probe streams), then a quiet loop; no stack traces. Paste the tail into the report.

- [ ] **Step 4: Commit**

```bash
git add frontend/scripts/indexer.ts docker-compose.yml
git commit -m "feat(indexer): runner on the new ingest/reconcile modules; reconcile + paging env"
```

---

### Task 9: `/api/streams` rewrite + `/api/streams/[id]` pagination

**Files:**
- Rewrite: `frontend/src/app/api/streams/route.ts`
- Modify: `frontend/src/app/api/streams/[id]/route.ts`

**Interfaces:**
- Consumes: `buildStreamsQuery`, `nextStreamsCursor`, `ParamError` (Task 3), `deriveStatus`, `withdrawableNow` (Task 1), `buildHistoryQuery`-style cursor helpers (`decodeCursor`, `isHistoryCursor`, `nextHistoryCursor`).
- Produces: `GET /api/streams` → `{ streams: (StreamDoc & { status, withdrawable_now: string })[], next_cursor, now }`; `GET /api/streams/[id]?limit&cursor` → `{ stream, actions, next_cursor, now }`.

- [ ] **Step 1: Rewrite `api/streams/route.ts`**

```ts
// GET /api/streams — list/search/filter/sort/paginate the materialized streams.
// See docs/superpowers/specs/2026-09-14-indexer-api-v2-design.md §9 for params.

import { NextResponse, type NextRequest } from 'next/server';
import { streamsCollection } from '@/lib/db';
import { ParamError } from '@/lib/api/params';
import { buildStreamsQuery, nextStreamsCursor } from '@/lib/api/streamsQuery';
import { deriveStatus, withdrawableNow } from '@/lib/streaming';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const now = Math.floor(Date.now() / 1000);

  let q;
  try {
    q = buildStreamsQuery(searchParams, now);
  } catch (err) {
    if (err instanceof ParamError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const col = await streamsCollection();
    const docs = await col.find(q.filter).sort(q.sort).limit(q.limit + 1).toArray();
    const page = docs.slice(0, q.limit);
    const next_cursor = docs.length > q.limit ? nextStreamsCursor(page[page.length - 1], q.sortField) : null;
    const streams = page.map((d) => ({
      ...d,
      status: deriveStatus(d, now),
      withdrawable_now: withdrawableNow(d, now).toString(),
    }));
    return NextResponse.json({ streams, next_cursor, now });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json({ streams: [], next_cursor: null, now, error: `db unreachable: ${msg}` }, { status: 503 });
  }
}
```

- [ ] **Step 2: Rewrite `api/streams/[id]/route.ts` with action pagination**

Replace the whole file with:

```ts
// GET /api/streams/[id]?limit&cursor
//
// Returns the materialized stream document plus a page of its action log,
// newest-first, with an opaque cursor for the next page. 404 if the id isn't
// an integer or no doc exists.

import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId, type Filter } from 'mongodb';
import { actionsCollection, streamsCollection, type ActionDoc } from '@/lib/db';
import { decodeCursor, isHistoryCursor } from '@/lib/api/cursor';
import { nextHistoryCursor } from '@/lib/api/historyQuery';
import { optInt, ParamError } from '@/lib/api/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const streamId = Number.parseInt(id, 10);
  if (!Number.isFinite(streamId) || streamId < 1) {
    return NextResponse.json({ error: 'invalid stream id' }, { status: 400 });
  }

  const sp = new URL(req.url).searchParams;
  let limit: number;
  let cursor;
  try {
    limit = optInt(sp, 'limit', { min: 1, max: 100, def: 50 });
    cursor = decodeCursor(sp.get('cursor'), isHistoryCursor);
  } catch (err) {
    if (err instanceof ParamError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  const now = Math.floor(Date.now() / 1000);

  try {
    const streams = await streamsCollection();
    const actions = await actionsCollection();

    const stream = await streams.findOne({ _id: streamId });
    if (!stream) {
      return NextResponse.json({ error: 'stream not found in index' }, { status: 404 });
    }

    const filter: Filter<ActionDoc> = { stream_id: streamId };
    if (cursor) {
      filter.$or = [
        { ts: { $lt: cursor.ts } },
        { ts: cursor.ts, log_index: { $lt: cursor.log_index } },
        { ts: cursor.ts, log_index: cursor.log_index, _id: { $lt: new ObjectId(cursor.id) } },
      ];
    }
    const rows = (await actions
      .find(filter)
      .sort({ ts: -1, log_index: -1, _id: -1 })
      .limit(limit + 1)
      .toArray()) as (ActionDoc & { _id: ObjectId })[];
    const page = rows.slice(0, limit);
    const next_cursor = rows.length > limit ? nextHistoryCursor(page[page.length - 1]) : null;

    return NextResponse.json({ stream, actions: page, next_cursor, now });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json({ error: `db unreachable: ${msg}` }, { status: 503 });
  }
}
```

The stream detail page's Events tab reads `actions` from this route and ignores unknown keys, so it keeps working; sub-project 3 adds "load more" on `next_cursor`.

- [ ] **Step 3: Verify with curl against a local Mongo (requires the Task 8 scratch database)**

Run: `cd frontend && MONGODB_DB=hourglass_plan_check npm run dev -- -p 3100 > /tmp/claude-501/dev.log 2>&1 &` then after ~10 s:

```bash
curl -s 'http://localhost:3100/api/streams?limit=2' | jq '{n: (.streams|length), next_cursor, first: .streams[0] | {_id, model, status, withdrawable_now}}'
curl -s 'http://localhost:3100/api/streams?model=Recurring&status=settled,streaming' | jq '.streams | map(.model) | unique'
curl -s 'http://localhost:3100/api/streams?cursor=garbage' | jq .
curl -s "http://localhost:3100/api/streams?sender=$(jq -r .deployer ../deployments/testnet.json)" | jq '.streams | length'
curl -s 'http://localhost:3100/api/streams/2?limit=1' | jq '{model: .stream.model, actions: (.actions|length), next_cursor}'
```
Expected: page of 2 with a non-null `next_cursor`; only `["Recurring"]`; `{ "error": "cursor is malformed" }` with HTTP 400; a positive count for the legacy `sender=` call; stream 2 is `Recurring` with 1 action and a cursor if more exist. Stop the dev server afterwards (`kill %1` or `pkill -f "next dev -p 3100"`).

- [ ] **Step 4: Typecheck, tests, commit**

Run: `cd frontend && npm run typecheck && npm test`

```bash
git add frontend/src/app/api/streams/route.ts "frontend/src/app/api/streams/[id]/route.ts"
git commit -m "feat(api): search/filter/sort/cursor pagination on /api/streams; paginated stream actions"
```

---

### Task 10: `/api/history` + `/api/tokens`

**Files:**
- Create: `frontend/src/app/api/history/route.ts`
- Create: `frontend/src/app/api/tokens/route.ts`

**Interfaces:**
- Consumes: `buildHistoryQuery`, `nextHistoryCursor` (Task 3), `ParamError`.
- Produces: `GET /api/history?address&mine&stream_id&limit&cursor` → `{ items: (ActionDoc & { stream: { id, model, token, sender, recipient, deposited } | null })[], next_cursor, now }`; `GET /api/tokens` → `{ tokens: { token: string; streams: number }[] }`.

- [ ] **Step 1: `api/history/route.ts`**

```ts
// GET /api/history?address=G…[&mine=1][&stream_id=N][&limit][&cursor]
// Wallet-wide action feed: every action on streams where the address is a
// participant (or only its own actions with mine=1), newest first.

import { NextResponse, type NextRequest } from 'next/server';
import type { ObjectId } from 'mongodb';
import { actionsCollection, streamsCollection, type ActionDoc } from '@/lib/db';
import { buildHistoryQuery, nextHistoryCursor } from '@/lib/api/historyQuery';
import { ParamError } from '@/lib/api/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const now = Math.floor(Date.now() / 1000);

  let q;
  try {
    q = buildHistoryQuery(searchParams);
  } catch (err) {
    if (err instanceof ParamError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const actions = await actionsCollection();
    const streams = await streamsCollection();
    const rows = (await actions
      .find(q.filter)
      .sort({ ts: -1, log_index: -1, _id: -1 })
      .limit(q.limit + 1)
      .toArray()) as (ActionDoc & { _id: ObjectId })[];
    const page = rows.slice(0, q.limit);
    const next_cursor = rows.length > q.limit ? nextHistoryCursor(page[page.length - 1]) : null;

    const ids = [...new Set(page.map((a) => a.stream_id))];
    const docs = await streams
      .find({ _id: { $in: ids } }, { projection: { _id: 1, model: 1, token: 1, sender: 1, recipient: 1, deposited: 1 } })
      .toArray();
    const byId = new Map(docs.map((d) => [d._id, { id: d._id, model: d.model, token: d.token, sender: d.sender, recipient: d.recipient, deposited: d.deposited }]));
    const items = page.map((a) => ({ ...a, stream: byId.get(a.stream_id) ?? null }));
    return NextResponse.json({ items, next_cursor, now });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json({ items: [], next_cursor: null, now, error: `db unreachable: ${msg}` }, { status: 503 });
  }
}
```

- [ ] **Step 2: `api/tokens/route.ts`**

```ts
// GET /api/tokens — distinct tokens seen across indexed streams, most used first.

import { NextResponse } from 'next/server';
import { streamsCollection } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const col = await streamsCollection();
    const rows = await col
      .aggregate<{ _id: string; streams: number }>([
        { $group: { _id: '$token', streams: { $sum: 1 } } },
        { $sort: { streams: -1, _id: 1 } },
      ])
      .toArray();
    return NextResponse.json({ tokens: rows.map((r) => ({ token: r._id, streams: r.streams })) });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return NextResponse.json({ tokens: [], error: `db unreachable: ${msg}` }, { status: 503 });
  }
}
```

- [ ] **Step 3: Verify with curl (dev server on the scratch DB as in Task 9)**

```bash
D=$(jq -r .deployer ../deployments/testnet.json)
curl -s "http://localhost:3100/api/history?address=$D&limit=3" | jq '{n: (.items|length), first: .items[0] | {action, stream_id, ts, participants, stream}, next_cursor}'
curl -s "http://localhost:3100/api/history?address=$D&mine=1&limit=2" | jq '.items | map(.actor) | unique'
curl -s 'http://localhost:3100/api/history' | jq .
curl -s 'http://localhost:3100/api/tokens' | jq .
```
Expected: 3 items each with `participants` containing the deployer and a `stream` summary; `mine=1` returns only the deployer as actor; missing address → 400 `address is required`; tokens lists the XLM SAC with a count.

- [ ] **Step 4: Typecheck, tests, commit**

```bash
git add frontend/src/app/api/history/route.ts frontend/src/app/api/tokens/route.ts
git commit -m "feat(api): wallet history feed and token list endpoints"
```

---

### Task 11: `/api/stats` per-wallet mode

**Files:**
- Modify: `frontend/src/app/api/stats/route.ts`
- Create: `frontend/src/lib/api/walletStats.ts`, `frontend/src/lib/api/walletStats.test.ts`

**Interfaces:**
- Consumes: `deriveStatus`, `withdrawableNow` (Task 1), `optAddress`/`ParamError` (Task 2).
- Produces: `walletStats(address: string, streams: StreamDoc[], now: number): WalletStats` where `interface WalletStats { now: number; counts: { sending: number; receiving: number; by_status: Record<StreamStatus, number> }; by_token: Array<{ token: string; sent_deposited: string; sent_locked: string; received_withdrawn: string; received_withdrawable_now: string }> }`; `GET /api/stats?address=` → `WalletStats`; without `address` the existing global payload.

- [ ] **Step 1: Write the failing test**

`walletStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StreamDoc } from '../db';
import { walletStats } from './walletStats';

const ME = 'GME';
function doc(over: Partial<StreamDoc>): StreamDoc {
  return {
    _id: 1, contract: 'C', sender: 'GX', recipient: 'GY', token: 'CXLM', model: 'Linear',
    start_ts: 1_000, end_ts: 2_000, cliff_ts: 1_000, unlock_at_start: '0', unlock_at_cliff: '0',
    deposited: '1000', withdrawn: '0', refunded: '0',
    is_cancelable: true, is_transferable: true, was_canceled: false, is_depleted: false,
    created_at: 900, updated_at: 900, ...over,
  } as StreamDoc;
}

describe('walletStats', () => {
  it('splits sent vs received and sums per token', () => {
    const streams = [
      doc({ _id: 1, sender: ME, deposited: '1000', withdrawn: '200', refunded: '0' }),          // sent, STREAMING @1500
      doc({ _id: 2, sender: ME, token: 'CUSD', deposited: '500', was_canceled: true, refunded: '300', withdrawn: '200' }), // sent, CANCELED
      doc({ _id: 3, recipient: ME, deposited: '1000', withdrawn: '100' }),                      // received, withdrawable 400 @1500
      doc({ _id: 4, recipient: ME, sender: ME, deposited: '10', end_ts: 1_200 }),               // both roles, SETTLED
    ];
    const s = walletStats(ME, streams, 1_500);
    expect(s.counts).toEqual({ sending: 3, receiving: 2, by_status: { PENDING: 0, STREAMING: 2, SETTLED: 1, CANCELED: 1, DEPLETED: 0 } });
    const xlm = s.by_token.find((t) => t.token === 'CXLM')!;
    expect(xlm).toEqual({ token: 'CXLM', sent_deposited: '1010', sent_locked: '810', received_withdrawn: '100', received_withdrawable_now: '410' });
    const usd = s.by_token.find((t) => t.token === 'CUSD')!;
    expect(usd).toEqual({ token: 'CUSD', sent_deposited: '500', sent_locked: '0', received_withdrawn: '0', received_withdrawable_now: '0' });
  });
});
```

Arithmetic at now = 1500: stream 1 (sent, STREAMING) locked 1000−200−0 = 800; stream 2 (sent, CANCELED, CUSD) locked 500−200−300 = 0; stream 3 (received) streamed 500 − withdrawn 100 → withdrawable 400; stream 4 (both roles, SETTLED at 1200) deposited 10, locked 10, withdrawable 10. CXLM: sent_deposited 1000+10 = 1010, sent_locked 800+10 = 810, received_withdrawn 100+0 = 100, received_withdrawable_now 400+10 = 410. Counts: sending 3 (1, 2, 4), receiving 2 (3, 4); STREAMING 2, CANCELED 1, SETTLED 1.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./walletStats`.

- [ ] **Step 3: Implement `walletStats.ts`**

```ts
// Per-wallet aggregates over the wallet's streams. Pure; the route fetches.

import type { StreamDoc } from '../db';
import { deriveStatus, withdrawableNow, type StreamStatus } from '../streaming';

export interface TokenTotals {
  token: string;
  sent_deposited: string;
  sent_locked: string;
  received_withdrawn: string;
  received_withdrawable_now: string;
}

export interface WalletStats {
  now: number;
  counts: { sending: number; receiving: number; by_status: Record<StreamStatus, number> };
  by_token: TokenTotals[];
}

export function walletStats(address: string, streams: StreamDoc[], now: number): WalletStats {
  const by_status: Record<StreamStatus, number> = { PENDING: 0, STREAMING: 0, SETTLED: 0, CANCELED: 0, DEPLETED: 0 };
  let sending = 0;
  let receiving = 0;
  const totals = new Map<string, { sd: bigint; sl: bigint; rw: bigint; rwn: bigint }>();
  const bucket = (token: string) => {
    let t = totals.get(token);
    if (!t) { t = { sd: 0n, sl: 0n, rw: 0n, rwn: 0n }; totals.set(token, t); }
    return t;
  };

  for (const s of streams) {
    by_status[deriveStatus(s, now)]++;
    const t = bucket(s.token);
    if (s.sender === address) {
      sending++;
      t.sd += BigInt(s.deposited);
      const locked = BigInt(s.deposited) - BigInt(s.withdrawn) - BigInt(s.refunded);
      if (locked > 0n) t.sl += locked;
    }
    if (s.recipient === address) {
      receiving++;
      t.rw += BigInt(s.withdrawn);
      t.rwn += withdrawableNow(s, now);
    }
  }

  const by_token = [...totals.entries()]
    .map(([token, t]) => ({
      token,
      sent_deposited: t.sd.toString(),
      sent_locked: t.sl.toString(),
      received_withdrawn: t.rw.toString(),
      received_withdrawable_now: t.rwn.toString(),
    }))
    .sort((a, b) => a.token.localeCompare(b.token));

  return { now, counts: { sending, receiving, by_status }, by_token };
}
```

- [ ] **Step 4: Wire the route**

In `api/stats/route.ts` change the signature to `GET(req: NextRequest)`, and before the existing global code add:

```ts
  const sp = new URL(req.url).searchParams;
  let address: string | undefined;
  try {
    address = optAddress(sp, 'address', 'G');
  } catch (err) {
    if (err instanceof ParamError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  if (address) {
    const now = Math.floor(Date.now() / 1000);
    try {
      const col = await streamsCollection();
      const docs = await col.find({ $or: [{ sender: address }, { recipient: address }] }).toArray();
      return NextResponse.json(walletStats(address, docs, now));
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      return NextResponse.json({ error: `db unreachable: ${msg}` }, { status: 503 });
    }
  }
```

Imports: `import { type NextRequest } from 'next/server'; import { optAddress, ParamError } from '@/lib/api/params'; import { walletStats } from '@/lib/api/walletStats';`.

- [ ] **Step 5: Tests, typecheck, curl, commit**

Run: `cd frontend && npm test && npm run typecheck`, then with the dev server on the scratch DB:
```bash
curl -s "http://localhost:3100/api/stats?address=$(jq -r .deployer ../deployments/testnet.json)" | jq '{counts, tokens: (.by_token|length)}'
curl -s 'http://localhost:3100/api/stats' | jq 'keys'
```
Expected: counts with `sending` ≥ 40, one or more tokens; the global call still returns `["active","inactive","locked","total"]`.

```bash
git add frontend/src/app/api/stats/route.ts frontend/src/lib/api/walletStats.ts frontend/src/lib/api/walletStats.test.ts
git commit -m "feat(api): per-wallet stats"
```

---

### Task 12: Real-world verification, docs, final sweep

**Files:**
- Modify: `frontend/README.md` (indexer + API sections)
- Modify: `docs/superpowers/specs/2026-09-14-indexer-api-v2-design.md` (§9 note: time-dependent statuses use plain comparisons, not `$expr`)

- [ ] **Step 1: Lossless-ingestion check against testnet**

With a local Mongo running and a FRESH scratch database name:
1. Terminal A: `cd frontend && MONGODB_DB=hourglass_e2e npm run indexer 2>&1 | tee /tmp/claude-501/indexer-e2e.log` — wait for `reconcile (startup)`.
2. Terminal B (repo root): `PROBE_BATCH=1 ./scripts/smoke-testnet.sh 2>&1 | tail -15` (≈3 min; creates 5 streams + probe batches of 10/20/30 rows).
3. When the smoke prints `SMOKE PASSED`, wait one more poll interval, then:
   ```bash
   mongosh --quiet hourglass_e2e --eval 'db.streams.countDocuments({created_tx:{$exists:true}})'
   mongosh --quiet hourglass_e2e --eval 'db.actions.countDocuments({action:"created"})'
   mongosh --quiet hourglass_e2e --eval 'db.meta.findOne({_id:"events_cursor"})'
   grep -c "ingested" /tmp/claude-501/indexer-e2e.log
   ```
   Expected: the number of `created` actions and the number of streams carrying `created_tx` (only events set it) both equal the streams the smoke created in this run (5 + 10 + 20 + 30 = 65); at least one `ingested N event(s) over P page(s)` line with `P ≥ 2` (the 30-row batch alone exceeds one page when combined with the probe's other events in the same window). If `mongosh` is not installed, use `docker exec <mongo-container> mongosh …`.
4. Restart check: stop the indexer (Ctrl-C), create one more stream with the CLI (`stellar contract invoke … create_linear …` as in the smoke script), start the indexer again with the same DB → the startup reconcile line shows `upserted ≥ 1` and the stream appears with `source: "reconcile"`.
Record all outputs in the task report.

- [ ] **Step 2: Docs**

`frontend/README.md`: in the "Indexer (Mongo)" section replace the description with the new behaviour (cursor-paged ingestion, startup + periodic reconcile via NFT enumeration, env vars `INDEXER_POLL_MS`, `INDEXER_RECONCILE_MS`, `INDEXER_MAX_PAGES`) and add an "API" section listing the five routes with their parameters and response shapes (copy spec §9 tables). Add `npm test` to the Run section.

Spec §9: change "time-dependent members evaluated with `$expr` against `now`" to "time-dependent members are plain range comparisons against the server's `now` (indexable)".

- [ ] **Step 3: Final sweep**

```bash
cd frontend && npm test && npm run typecheck && npm run build && cd ..
git status --short
```
Expected: all green; status clean (the scratch Mongo databases are outside the repo).

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md docs/superpowers/specs/2026-09-14-indexer-api-v2-design.md
git commit -m "docs(frontend): indexer v2 behaviour, env vars, and API reference"
```

---

## Out of scope (next sub-projects)

- **Sub-project 3 (frontend):** dashboard filters/search/sort UI on `/api/streams`, history view on `/api/history`, per-wallet stat tiles on `/api/stats?address`, token filter from `/api/tokens`, batch + recurring create UI, templates (presets + localStorage).
- **Sub-project 4:** treasury prep. **Sub-project 5:** beta ops + docs.
