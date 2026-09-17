# Create Flow v2 — Shapes, Batch, Templates (Sub-project 3a) — Design

**Date:** 2026-09-15
**Status:** approved in brainstorming, awaiting implementation plan
**Phase:** Instaward SOW Deliverable 2 ("Advanced stream management"): batch stream creation, stream templates, recurring vesting streams — the user-facing half. Sub-project 3b (dashboard filters, search, wallet history) is a separate spec.
**Depends on:** lockup v0.2.1 on testnet (`CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL`), SDK bindings 0.2.0 (`sdk/`), indexer/API v2 (merged in PR #2).

---

## 1. Goal

Turn the linear-only `/create` page into one form that creates Linear, Tranched and Recurring streams for a single recipient or for a list of recipients (batch, CSV import), with reusable schedule templates (built-in presets + user templates in localStorage) and a chunked, resumable signing flow for batches.

### In scope

- Unified `/create` page: template bar, token picker, shape tabs (Linear / Tranched / Recurring), recipients section with **Single** and **Batch** modes, flags, live preview, submit.
- Batch rows: manual table editing plus CSV paste / `.csv` upload; per-row validation; warnings for duplicates and self-streams.
- Batch execution: rows split into chunks of at most 20, one `create_batch` transaction per chunk, adaptive halving when a chunk does not fit, pause / retry / resume, persistence across a page reload, final result page.
- Templates: 7 built-in presets and user templates saved in localStorage; apply / save-as / rename / delete.
- Typed SDK wrappers for `create_tranched`, `create_recurring`, `create_batch`.
- Pre-flight balance check through Horizon.
- Pure, unit-tested logic modules under `frontend/src/lib/create/`.

### Out of scope (explicitly)

- Dashboard filters / search / sort / pagination and the wallet-wide history page (sub-project 3b).
- Different schedules per row inside one batch (the contract allows it; the UI does not expose it).
- Per-token decimals (everything stays at 7, as in `format.ts` and `tokens.ts`).
- i18n (UI stays English, like the rest of the app).
- Template export / import / sharing, server-side templates.
- Component-test infrastructure (jsdom, Testing Library, Playwright).
- Fixing `recurringToTranches` on the stream detail page (tracked in the follow-ups doc, 3b).

---

## 2. Context and constraints

### Current frontend (main @ `1accac6`)

- `frontend/src/app/create/page.tsx` (760 lines) is a client component with one `useState` per field, hand-rolled validation in `onSubmit`, absolute unlock amounts, and only `create_linear`. It renders `CreatePreview` (linear-only `Parsed` prop), `TokenPicker`, `Field`, `AmountInput`, `ToggleRow`, `SpecSummary`, `NoDeploymentWarning`, all local to the file.
- `frontend/src/lib/sdk.ts` declares a hand-written `LockupClient` interface (the generated `Client` only types `fromJSON`; real methods are attached by `ContractSpec`). Only `create_linear` is declared among the create methods. Pattern: `Promise<AssembledTransaction<T>>`, i128/u64 as `bigint`.
- Wallet: `useWallet()` → `{ address, pending, connect, disconnect, sign }` (`wallet-context.tsx`), Freighter via stellar-wallets-kit. Toasts: `useToast().push({...})`.
- `DEPLOYMENT` (`deployments.ts`) exposes `rpcUrl`, `networkPassphrase`, `lockup`, `comptroller`, `nativeToken`, `hgt*`, `usdc*` but **not** `horizon_url` (present in the JSON). `TOKENS` (`tokens.ts`) has `id`, `symbol`, `issuer?`, `decimals: 7`.
- Helpers in `format.ts`: `formatStroops`, `parseXlmToStroops`, `isStellarAddress`, `datetimeLocalToUnix`, `unixToDatetimeLocal`, `formatDuration`.
- Tests: vitest, node environment, `src/**/*.test.ts` only.

### Contract rules that the UI must respect (`contracts/lockup/src/create.rs`)

| Shape | Rule | Error |
|---|---|---|
| all | deposit / amounts > 0 | `ZeroDeposit` (10) |
| all | start (linear `start_ts`, first tranche `ts`, recurring `first_ts`) ≥ ledger `now` | `StartInPast` (18) |
| Linear | `start_ts < end_ts` | `StartAfterEnd` (11) |
| Linear | `start_ts ≤ cliff_ts ≤ end_ts` | `CliffOutOfRange` (12) |
| Linear | `unlock_at_start + unlock_at_cliff ≤ deposited`, both ≥ 0 | `UnlocksExceedDeposit` (13) |
| Tranched | 1..=100 tranches, strictly ascending `ts` | `NoTranches` (14), `TranchesNotAscending` (15), `TooManyTranches` (17) |
| Recurring | `period_secs ≥ 1`, `count ≥ 1`, `deposited = amount_per_period × count` | `InvalidPeriod` (21), `InvalidCount` (22) |
| Batch | 1..=100 rows, one sender, one token, one `transfer` of the row total | `EmptyBatch` (19), `BatchTooLarge` (20) |

Practical per-transaction limit on testnet: 30 linear rows with one recipient fit, 40 did not (smoke probe). Distinct recipients and tranched rows fit fewer. Hence the default chunk of 20 and adaptive halving.

### SDK types (generated, `sdk/src/generated/lockup/src/index.ts`)

```ts
interface Tranche { amount: i128; ts: u64 }
interface LinearParams { cliff_ts: u64; deposited: i128; end_ts: u64; start_ts: u64; unlock_at_cliff: i128; unlock_at_start: i128 }
interface TranchedParams { tranches: Array<Tranche> }
interface RecurringParams { amount_per_period: i128; count: u32; first_ts: u64; period_secs: u64 }
type CreateSpec =
  | { tag: 'Linear'; values: readonly [LinearParams] }
  | { tag: 'Tranched'; values: readonly [TranchedParams] }
  | { tag: 'Recurring'; values: readonly [RecurringParams] };
interface CreateRow { is_cancelable: boolean; is_transferable: boolean; recipient: string; spec: CreateSpec }
```

---

## 3. Architecture

```
┌──────────────── app/create/page.tsx (thin) ────────────────┐
│ useReducer(formReducer)  useBatchRunner()  useTemplates()  │
│   TemplateBar · TokenPicker · ShapeTabs · ScheduleFields   │
│   RecipientsSection(Single | Batch[BatchTable, CsvImport]) │
│   FlagsRow · CreatePreview · SubmitArea | BatchProgress    │
│   CreateResult · ResumeBanner                              │
└───────────────┬───────────────────────────┬────────────────┘
                │ pure                       │ effects
   lib/create/schedule.ts        lib/create/submit.ts  (makeLockup, signAndSend)
   lib/create/rows.ts            lib/create/balance.ts (Horizon fetch)
   lib/create/templates.ts       lib/create/storage.ts (localStorage/sessionStorage adapters)
   lib/create/batchPlan.ts
   lib/create/formState.ts
   lib/create/errors.ts
   lib/sdk.ts (+ create_tranched / create_recurring / create_batch)
```

Rules:
- Everything under `lib/create/*` except `submit.ts`, `balance.ts`, `storage.ts` is pure (no React, no fetch, no globals, `now` passed in) and unit-tested.
- `submit.ts` / `balance.ts` take their clients as parameters so the runner can be tested with fakes.
- `storage.ts` wraps `localStorage` / `sessionStorage` behind `get/set/remove` with try/catch; unavailable storage yields `null` and disables saving, never throws into the UI.
- Components own no business rules; they call reducers and render state.

---

## 4. Schedule model

### 4.1 Types (`lib/create/schedule.ts`)

```ts
export type Shape = 'linear' | 'tranched' | 'recurring';

/** Relative schedule — what a template stores. Seconds; percentages in basis points. */
export type ScheduleTemplate =
  | { shape: 'linear'; startOffset: number; cliffOffset: number; duration: number;
      unlockAtStartBps: number; unlockAtCliffBps: number }
  | { shape: 'tranched'; startOffset: number; tranches: Array<{ offset: number; bps: number }> }
  | { shape: 'recurring'; startOffset: number; periodSecs: number; count: number };

/** Absolute schedule — what the form holds and what specs are built from. Unix seconds. */
export type Schedule =
  | { shape: 'linear'; startTs: number; cliffTs: number; endTs: number;
      unlockAtStartBps: number; unlockAtCliffBps: number }
  | { shape: 'tranched'; startTs: number; tranches: Array<{ ts: number; bps: number }> }
  | { shape: 'recurring'; firstTs: number; periodSecs: number; count: number };
```

- `startOffset` is relative to `now` at apply time; `cliffOffset`, `duration`, tranche `offset` are relative to start; `cliffOffset = 0` means "no cliff" (cliff = start).
- Tranche `bps` must sum to exactly 10000; the last tranche absorbs rounding (see 4.3).
- For recurring, `startOffset` positions `firstTs` (the first unlock).

### 4.2 Functions

```ts
export function resolveSchedule(t: ScheduleTemplate, nowSec: number): Schedule;
export function deriveTemplate(s: Schedule, nowSec: number): ScheduleTemplate; // inverse; startOffset = max(0, start − now)
export function scheduleEnd(s: Schedule): number;          // linear endTs; last tranche ts; firstTs + periodSecs*(count−1)
export function scheduleStart(s: Schedule): number;        // startTs | tranches[0].ts | firstTs
export function shiftSchedule(s: Schedule, seconds: number): Schedule; // every timestamp + seconds
export function validateSchedule(s: Schedule, nowSec: number, mode: 'single' | 'batch'): ScheduleError[];
```

`ScheduleError = { field: string; message: string }`. Rules (UI-level, stricter than the contract):

| Rule | Message |
|---|---|
| start ≥ now + 120 (single) / now + 900 (batch) | "Start must be at least 2 minutes (15 minutes for batches) from now — transactions take time to sign." |
| linear: start < end | "End must be strictly after start." |
| linear: start ≤ cliff ≤ end | "Cliff must be between start and end (inclusive)." |
| linear: unlockAtStartBps + unlockAtCliffBps ≤ 10000, each ≥ 0 | "Unlocks (start + cliff) cannot exceed 100%." |
| tranched: 1–100 tranches | "Add at least one tranche." / "At most 100 tranches." |
| tranched: strictly ascending ts | "Tranche times must be strictly increasing." |
| tranched: bps sum = 10000, each > 0 | "Tranche percentages must add up to 100%." |
| recurring: periodSecs ≥ 60 | "Period must be at least 1 minute." |
| recurring: 1 ≤ count ≤ 1000 | "Count must be between 1 and 1000." |

### 4.3 Amount semantics and spec building

The amount a user types — single field or batch row — is always **the total the recipient receives** (token units, parsed with `parseXlmToStroops`, 7 decimals).

```ts
export type BuiltSpec = { spec: CreateSpec; deposited: bigint; adjustment: bigint }; // adjustment ≤ 0, stroops
export function buildSpec(s: Schedule, total: bigint): BuiltSpec;
```

- Linear: `deposited = total`; `unlock_at_start = floor(total × unlockAtStartBps / 10000)`; same for cliff. `adjustment = 0`.
- Tranched: `amount_i = floor(total × bps_i / 10000)` for all but the last tranche; the last tranche gets `total − Σ others` so the tranche sum equals `total` exactly. `adjustment = 0`.
- Recurring: `amount_per_period = floor(total / count)`; `deposited = amount_per_period × count`; `adjustment = deposited − total` (0 or negative, always > −count stroops). The UI shows a per-row note "adjusted −0.0000004 XLM to fit 12 equal periods" and the summary total uses the adjusted deposits. Rationale: with CSV lists of hundreds of rows, forcing users to hand-fix divisibility is unworkable; the loss is negligible and visible.
- `buildSpec` throws `RangeError` whenever any on-chain amount would be ≤ 0: linear `deposited`, any single tranche amount (tiny `bps` × small total floors to 0), or recurring `amount_per_period` (total < count). `validateRows` catches it and reports `amount_too_small` ("Amount too small for this schedule — 52 periods" / "— 4 tranches") before submission.

---

## 5. Templates (`lib/create/templates.ts`)

### 5.1 Types

```ts
export type Template = {
  id: string;                  // built-in: 'linear-1y'; user: 'u_' + 12 random base36 chars
  name: string;                // ≤ 40 chars
  builtIn: boolean;
  schedule: ScheduleTemplate;
  token?: string;              // SAC contract id; undefined = keep current selection
  cancelable: boolean;
  transferable: boolean;
  createdAt: number;           // unix seconds; 0 for built-ins
};
```

### 5.2 Built-in presets (`BUILT_IN_TEMPLATES`, in this order; D = 86400)

| id | name | schedule |
|---|---|---|
| `linear-1y` | Linear · 1 year | linear, startOffset 900, cliffOffset 0, duration 365·D, 0 / 0 bps |
| `linear-1y-3m-cliff` | 1 year · 3-month cliff | linear, startOffset 900, cliffOffset 90·D, duration 365·D, 0 / 0 |
| `linear-4y-1y-cliff-25` | 4 years · 1-year cliff · 25% at cliff | linear, startOffset 900, cliffOffset 365·D, duration 1460·D, 0 / 2500 |
| `recurring-monthly-12` | Monthly × 12 | recurring, startOffset 900, periodSecs 30·D, count 12 |
| `recurring-weekly-52` | Weekly × 52 | recurring, startOffset 900, periodSecs 7·D, count 52 |
| `recurring-daily-30` | Daily drip × 30 | recurring, startOffset 900, periodSecs D, count 30 |
| `tranched-quarterly-4` | Quarterly tranches × 4 | tranched, startOffset 900, tranches (90·D, 2500), (180·D, 2500), (270·D, 2500), (360·D, 2500) |

All presets: `cancelable: true`, `transferable: true`, no `token`. The selector also offers **Custom** (no template).

### 5.3 Storage

- Key `hourglass:templates:v1`, value `{ version: 1, items: Template[] }` (user templates only).
- `loadUserTemplates(storage): Template[]` — returns `[]` on missing key, JSON error, wrong `version`, or non-array `items`; skips any item that fails `isTemplate()` (shape check on every field, `builtIn === false`).
- `saveUserTemplate(storage, t): Result` — inserts or replaces by `id`; rejects when `items.length ≥ 50` ("Template limit (50) reached — delete one first.") or when the name is empty / longer than 40 chars.
- `deleteUserTemplate(storage, id)`, `renameUserTemplate(storage, id, name)`.
- A user template is written with the same `Template` shape; built-ins are never written.

### 5.4 Behaviour in the form

- **Apply** sets shape, schedule fields (`resolveSchedule(t.schedule, now)`), token (only if `t.token` is one of `TOKENS`), flags. If the resolved start is earlier than the current mode's margin (§4.2: 120 s single, 900 s batch) the whole schedule is shifted with `shiftSchedule` so that start = now + margin — a freshly applied template never shows a "start too soon" error. `templateId = t.id`, `templateDirty = false`.
- Any later edit to shape / schedule / token / flags sets `templateDirty = true`; the selector then reads "Custom (based on <name>)". Editing recipients or amounts does not dirty the template.
- **Save as template** opens a small name prompt (inline, not `window.prompt`) and stores `deriveTemplate(currentSchedule, now)` + token + flags. Saving while a user template is selected and dirty offers "Update <name>" or "Save as new".
- **Rename / Delete** only for user templates (built-ins show no such controls).
- Storage unavailable (private mode, quota): saving controls are disabled with a tooltip; presets keep working.

---

## 6. Recipients

### 6.1 Single mode

One recipient address, one total amount. On submit the page calls the shape-specific method (`create_linear` / `create_tranched` / `create_recurring`) and navigates to `/stream/{id}` exactly as today. Single mode never uses `create_batch`.

### 6.2 Batch rows (`lib/create/rows.ts`)

```ts
export type RowInput = { id: string; recipient: string; amount: string; source: 'manual' | 'import'; line?: number };
export type RowIssue = { level: 'error' | 'warning' | 'info'; code: RowIssueCode; message: string };
export type RowIssueCode =
  | 'invalid_address' | 'invalid_amount' | 'amount_not_positive' | 'amount_too_small'
  | 'duplicate_recipient' | 'self_recipient' | 'rounding_adjusted';
export type ValidatedRow = RowInput & { issues: RowIssue[]; total?: bigint; built?: BuiltSpec };

export function parseRows(text: string, startId: number): { rows: RowInput[]; skipped: Array<{ line: number; reason: string }> };
export function validateRows(rows: RowInput[], ctx: { sender: string | null; schedule: Schedule | null }): ValidatedRow[];
export function rowsSummary(rows: ValidatedRow[]): { count: number; valid: number; errors: number; warnings: number; total: bigint; adjustment: bigint };
```

`parseRows` grammar (applies to pasted text and to uploaded `.csv` contents, read as UTF-8):
- Split on `\r\n` / `\n`. Trim each line. Skip empty lines and lines starting with `#`.
- Fields split on the first matching separator in this order: `,` `;` `\t`, else one-or-more spaces. Surrounding double quotes are stripped from fields.
- Column 1 = recipient, column 2 = amount; further columns are ignored (lets users keep a name column).
- Header detection: if the **first** kept line's first field does not match `isStellarAddress`, the line is dropped and reported in `skipped` as `header`.
- Lines with fewer than 2 fields → `skipped` with reason `missing_amount`. Everything else becomes a `RowInput` (validation happens in `validateRows`, so a bad address still lands in the table, marked).
- Hard cap: importing stops after 500 total rows (existing + imported); the remainder is reported in `skipped` with reason `limit`.

`validateRows`:
- `invalid_address` (error): `!isStellarAddress(recipient)`.
- `invalid_amount` (error): `parseXlmToStroops` throws (non-numeric, more than 7 decimals, thousands separators).
- `amount_not_positive` (error): parsed ≤ 0.
- `amount_too_small` (error): `buildSpec` cannot produce a positive deposit (recurring with total < count).
- `duplicate_recipient` (warning): same address appears in more than one row (all such rows flagged).
- `self_recipient` (warning): `recipient === sender`.
- `rounding_adjusted` (info): `built.adjustment < 0`.
- When `schedule` is null (form invalid), `built` is omitted and only address/amount checks run.

Submit is enabled only when: at least one row, zero `error` issues, schedule valid, wallet connected, token selected.

### 6.3 CSV import UI

- Textarea "Paste rows (recipient, amount per line)" with an **Add rows** button, and a file input accepting `.csv,.txt` that reads the file and feeds the same `parseRows`.
- After import: toast "Added 45 rows (1 header skipped, 2 lines ignored)". Skipped lines are listed under the textarea with their line numbers until the next import.
- On small screens the CSV textarea is shown above the table; the table scrolls horizontally (`overflow-x-auto`).

---

## 7. Batch execution (`lib/create/batchPlan.ts`)

### 7.1 Constants

```ts
export const DEFAULT_CHUNK_ROWS = 20;   // rows per create_batch transaction
export const MAX_ROWS_PER_RUN = 500;    // UI cap (25 transactions)
export const CONTRACT_MAX_BATCH_ROWS = 100;
export const BATCH_START_MARGIN_SECS = 900;
```

### 7.2 State

```ts
export type ChunkStatus = 'pending' | 'simulating' | 'signing' | 'submitting' | 'done' | 'failed';
export type Chunk = {
  index: number;
  rowIds: string[];
  schedule: Schedule;            // copied from the run at plan time; shifted per chunk if the user shifts
  status: ChunkStatus;
  txHash?: string;
  streamIds?: number[];
  error?: ClassifiedError;
  attempts: number;
};
export type BatchRun = {
  id: string;                    // 'run_' + unix ms
  createdAt: number;
  sender: string;
  token: string;
  cancelable: boolean;
  transferable: boolean;
  rows: Record<string, { recipient: string; total: string }>;  // stroops as decimal strings (JSON-safe)
  chunks: Chunk[];
  phase: 'running' | 'paused' | 'completed' | 'aborted';
  pauseReason?: 'rejected' | 'failed' | 'start_in_past' | 'user';
};
export type RunAction =
  | { type: 'chunk_status'; index: number; status: ChunkStatus }
  | { type: 'chunk_done'; index: number; txHash: string; streamIds: number[] }
  | { type: 'chunk_failed'; index: number; error: ClassifiedError; pause: BatchRun['pauseReason'] }
  | { type: 'split_chunk'; index: number }
  | { type: 'shift_remaining'; seconds: number }
  | { type: 'resume' } | { type: 'pause' } | { type: 'abort' } | { type: 'complete' };

export function planRun(input: { sender; token; cancelable; transferable; schedule: Schedule; rows: ValidatedRow[]; chunkRows?: number; nowMs: number }): BatchRun; // chunkRows defaults to DEFAULT_CHUNK_ROWS, clamped to 1..=CONTRACT_MAX_BATCH_ROWS
export function runReducer(run: BatchRun, action: RunAction): BatchRun;
export function nextChunk(run: BatchRun): Chunk | null;   // first chunk with status pending | failed
export function runProgress(run: BatchRun): { done: number; total: number; streams: number };
```

Reducer rules:
- `split_chunk` replaces chunk *i* (must be `pending`/`simulating`/`failed` and have ≥ 2 rows) with two chunks of `ceil(n/2)` and `floor(n/2)` rows, both `pending`, `attempts` reset to 0, and renumbers `index` sequentially. A chunk with 1 row cannot be split; the caller marks it failed instead.
- `shift_remaining` applies `shiftSchedule(chunk.schedule, seconds)` to every chunk not `done`, then sets `phase: 'running'`.
- `chunk_done` sets `done`, stores `txHash` and `streamIds`; if every chunk is `done` the phase becomes `completed`.
- `chunk_failed` sets `failed`, stores the error, increments `attempts`, sets `phase: 'paused'` with `pauseReason`.
- `abort` sets `phase: 'aborted'` (done chunks keep their data for the result view).

### 7.3 Runner (`lib/create/runner.ts`, effectful but dependency-injected)

```ts
export type RunnerDeps = {
  buildChunk: (run: BatchRun, chunk: Chunk) => Promise<PreparedTx>;        // simulate (throws on failure)
  sendChunk: (tx: PreparedTx) => Promise<{ txHash: string; streamIds: number[] }>; // sign + send
  dispatch: (a: RunAction) => void;
  getRun: () => BatchRun;
  persist: (run: BatchRun) => void;
};
export async function runBatch(deps: RunnerDeps, signal: AbortSignal): Promise<void>;
```

Algorithm:
1. Loop while `!signal.aborted` and `getRun().phase === 'running'`: `chunk = nextChunk(run)`; if none → `dispatch({type:'complete'})`, persist, return.
2. `chunk_status simulating`; `buildChunk`. On throw → `classifyTxError(e)`:
   - `resource` and `rowIds.length > 1` → `split_chunk`, persist, continue the loop.
   - otherwise → `chunk_failed` with `pause: 'failed'` (or `'start_in_past'` when the contract code is 18), persist, return.
3. `chunk_status signing`; `sendChunk`. On throw → classify: `rejected` → `chunk_failed(pause:'rejected')`; contract 18 → `pause:'start_in_past'`; else `pause:'failed'`. Persist, return.
4. `chunk_done`, persist, continue.

The page wires `buildChunk` to `prepareBatch` and `sendChunk` to `sendPrepared` (§8.2); tests inject fakes. `prepareBatch` maps rows → `CreateRow[]` via `buildSpec(chunk.schedule, total)` and calls `lockup.create_batch({ sender, token, rows })`; the returned `AssembledTransaction` is the `PreparedTx`. `sendPrepared` calls `tx.signAndSend()` and reads `result` (`number[]`) and `sendTransactionResponse.hash` (fallback: `tx.built?.hash().toString('hex')`).

Resume: the UI calls `dispatch({type:'resume'})` (phase → `running`) and starts `runBatch` again; `nextChunk` naturally picks the failed chunk first (retry) or the next pending one.

### 7.4 Persistence and reload

- After every dispatch the run is written to `sessionStorage['hourglass:batchRun:v1']` as JSON (`bigint` never stored; amounts are decimal strings).
- On `/create` load: if a stored run exists with phase `running`/`paused` and at least one chunk not `done`, show **ResumeBanner**: "A batch from 14:02 is unfinished — 2 of 4 transactions left (40 streams created so far). [Resume] [Discard]". Resume restores the run into the page (form hidden, progress panel shown, phase `paused` until the user clicks Continue). Discard removes the key.
- A stored run with phase `completed` is shown once as the result view and removed when the user clicks "Create another". `aborted` runs are removed on load.
- A `running` run found on load is treated as `paused` (the tab was closed mid-signature); the chunk that was `signing`/`submitting` is reset to `failed` with a synthetic `{ kind: 'network', message: 'Interrupted — check the explorer before retrying' }` and the banner links to the sender's account on stellar.expert so the user can confirm whether the transaction landed before retrying. (The indexer would show the streams within seconds; the result view links to the dashboard.)

### 7.5 Pre-flight checks (before `planRun`)

1. Wallet connected; token selected; schedule valid for `mode: 'batch'`; rows valid (no `error` issues).
2. Balance (`lib/create/balance.ts`): `fetchTokenBalance(horizonUrl, account, token: TokenInfo): Promise<bigint | null>` reads `GET {horizonUrl}/accounts/{account}`; native → `asset_type === 'native'`; issued → `asset_code === token.symbol && asset_issuer === token.issuer`; returns stroops or `null` when the asset is not on the account, the token has no issuer mapping, or the request fails. `DEPLOYMENT.horizonUrl` is added from `horizon_url`.
   - `balance !== null && total > balance` → blocking error "Insufficient balance: need 1,250 XLM, have 980 XLM."
   - native and `balance − total < 50_000_000n` (5 XLM) → warning "Less than 5 XLM would remain for fees and reserves."
   - `null` → non-blocking note "Could not verify balance."
3. Confirmation modal (shared `components/ConfirmDialog.tsx`, extracted from the stream page's local `Modal`): token, shape summary, N recipients, total (with adjustment), number of transactions, "Each transaction is signed separately; streams created by a signed transaction are final."

---

## 8. SDK and submit layer

### 8.1 `frontend/src/lib/sdk.ts` additions to `LockupClient`

```ts
create_tranched(args: { sender: string; recipient: string; token: string; tranches: Array<{ amount: bigint; ts: bigint }>;
  is_cancelable: boolean; is_transferable: boolean }): Promise<AssembledTransaction<number>>;
create_recurring(args: { sender: string; recipient: string; token: string; amount_per_period: bigint; period_secs: bigint;
  count: number; first_ts: bigint; is_cancelable: boolean; is_transferable: boolean }): Promise<AssembledTransaction<number>>;
create_batch(args: { sender: string; token: string; rows: CreateRow[] }): Promise<AssembledTransaction<number[]>>;
```

`CreateRow` / `CreateSpec` / `LinearParams` / `TranchedParams` / `RecurringParams` / `Tranche` are re-exported from `hourglass/lockup` for the app. Argument order follows the Rust signatures (§2) — the generated client takes a single args object keyed by parameter name, exactly like `create_linear` today.

### 8.2 `lib/create/submit.ts`

```ts
export function toCreateRow(recipient: string, built: BuiltSpec, flags: { cancelable: boolean; transferable: boolean }): CreateRow;
export async function submitSingle(lockup: LockupClient, args: { sender; recipient; token; schedule: Schedule; total: bigint; cancelable; transferable })
  : Promise<{ streamId: number; txHash: string }>;
export async function prepareBatch(lockup: LockupClient, args: { sender; token; rows: Array<{ recipient; total: bigint }>; schedule: Schedule; cancelable; transferable })
  : Promise<AssembledTransaction<number[]>>;
export async function sendPrepared(tx: AssembledTransaction<number[]>): Promise<{ txHash: string; streamIds: number[] }>;
```

`submitSingle` picks `create_linear` / `create_tranched` / `create_recurring` from `schedule.shape`, converting numbers to `bigint` where the contract expects i128/u64 and keeping `count` as `number` (u32).

---

## 9. Error classification (`lib/create/errors.ts`)

```ts
export type ClassifiedError =
  | { kind: 'rejected'; message: string }
  | { kind: 'resource'; message: string }
  | { kind: 'contract'; code: number; name: string; message: string }
  | { kind: 'network'; message: string };
export function classifyTxError(e: unknown): ClassifiedError;
export const CONTRACT_ERRORS: Record<number, { name: string; message: string }>;
```

Heuristics, evaluated in this order on `String(e?.message ?? e)` plus, when present, `e.simulation?.error`, `e.sendTransactionResponse?.errorResult`:
1. `contract`: regex `/Error\(Contract, #(\d+)\)/` → code. Names from the lockup `Error` enum: 1 InvalidCall, 10 ZeroDeposit, 11 StartAfterEnd, 12 CliffOutOfRange, 13 UnlocksExceedDeposit, 14 NoTranches, 15 TranchesNotAscending, 16 TrancheSumMismatch, 17 TooManyTranches, 18 StartInPast, 19 EmptyBatch, 20 BatchTooLarge, 21 InvalidPeriod, 22 InvalidCount, 30 StreamNotFound, 31 NotSender, 32 NotRecipient, 33 NotCancelable, 34 NotTransferable, 35 AlreadyCanceled, 36 AlreadyDepleted, 37 InvalidStatus, 50 InsufficientWithdrawable, 51 ZeroWithdraw, 70 NotAdmin, 71 OracleStale, 72 InvalidOraclePrice, 73 UnknownOp, 90 Overflow. Creation-relevant codes get user-facing messages (e.g. 18 → "The start time is now in the past. Shift the schedule and retry."); others → "Contract error #N (Name)".
2. `rejected`: `/user (rejected|declined|denied)|rejected by user|cancell?ed by user|User declined/i`.
3. `resource`: `/ExceededLimit|exceeds? (the )?(resource|size|budget)|resource limit|TxSorobanInvalid|txSorobanInvalid|TX_SOROBAN_INVALID|too large|exceeds the maximum/i`.
4. otherwise `network` with the trimmed original message (max 200 chars).

The implementation plan includes a testnet capture step: deliberately submit a 60-row chunk and a rejected signature, record the raw error strings, and pin them as test vectors so the regexes are checked against real messages, not guesses.

---

## 10. UI composition

Page layout keeps today's two-column structure (form left, sticky preview right on ≥ lg; stacked on mobile).

| Section / component | Content | Notes |
|---|---|---|
| `TemplateBar` | select (Custom, built-ins, "Your templates" group), Save / Save as, Rename, Delete | dirty indicator "Custom (based on X)" |
| `TokenPicker` (existing, extracted to `components/create/TokenPicker.tsx`) | XLM / HGT / USDC + custom contract id | unchanged behaviour |
| `ShapeTabs` | Linear · Tranched · Recurring | switching shapes keeps start time, resets shape-specific fields to the last values entered for that shape in this session |
| `ScheduleFields` | Linear: start, cliff toggle + cliff, end, unlock at start %, unlock at cliff %. Tranched: start, editable tranche rows (offset in days/hours + %), "+ tranche", "Split evenly" helper. Recurring: first unlock, period value + unit (minutes/hours/days/weeks), count, computed "last unlock" | datetime-local inputs as today |
| `RecipientsSection` | segmented control Single / Batch. Single: recipient + amount. Batch: `BatchTable` + `CsvImport` + summary line (rows, total, adjustment, errors, warnings) | |
| `FlagsRow` | Cancelable / Transferable toggles (existing `ToggleRow`) | |
| `CreatePreview` (generalised) | props: `schedule: Schedule | null`, `total: bigint | null`, `recipients: number`, `symbol`, `cancelable`, `transferable` | renders the emission sketch and spec sheet for all three shapes; for batch shows "× N recipients, total T" |
| `SubmitArea` | primary button ("Create stream" / "Create 45 streams in 3 transactions"), inline error, wallet connect CTA | |
| `BatchProgress` | list of chunks with status, tx hash link, ids; current step text; Pause / Continue / Retry / Shift schedule / Abort | `aria-live="polite"` on the step text |
| `CreateResult` | totals, per-transaction id groups linking to `/stream/{id}`, "Go to dashboard", "Create another" | |
| `ResumeBanner` | see §7.4 | |
| `ConfirmDialog` (shared, new `components/ConfirmDialog.tsx`) | extracted from `stream/[id]/page.tsx`'s local `Modal`; the stream page switches to it | focus trap + Esc as in `MobileNav` |

Percent inputs replace today's absolute unlock amounts (portable across templates and batch rows); the single-mode preview still shows the resulting absolute amounts.

---

## 11. Form state (`lib/create/formState.ts`)

```ts
export type FormState = {
  templateId: string | null; templateDirty: boolean;
  token: string; shape: Shape;
  linear: { start: string; hasCliff: boolean; cliff: string; end: string; unlockAtStartPct: string; unlockAtCliffPct: string };
  tranched: { start: string; tranches: Array<{ id: string; offsetValue: string; offsetUnit: 'hours' | 'days'; pct: string }> };
  recurring: { first: string; periodValue: string; periodUnit: 'minutes' | 'hours' | 'days' | 'weeks'; count: string };
  cancelable: boolean; transferable: boolean;
  mode: 'single' | 'batch';
  single: { recipient: string; amount: string };
  batch: { rows: RowInput[]; nextId: number; lastImport?: { added: number; skipped: Array<{ line: number; reason: string }> } };
};
export type FormAction = /* set_* per field, apply_template, set_shape, set_mode, add_row, update_row, remove_row, clear_rows, import_rows, ... */;
export function formReducer(s: FormState, a: FormAction): FormState;
export function initialFormState(nowSec: number, tokens: TokenInfo[]): FormState;   // linear, start now+15m, end +1h, as today
export function parseForm(s: FormState, nowSec: number): { schedule: Schedule | null; errors: Record<string, string> };
```

`parseForm` converts strings → numbers (`datetimeLocalToUnix`, percent → bps with 2-decimal precision, period value × unit) and runs `validateSchedule`. Components render `errors[field]` under inputs.

---

## 12. Edge cases

- Wallet not connected: form usable, submit replaced by "Connect wallet" (calls `connect()`).
- No deployment: existing `NoDeploymentWarning` stays.
- Shape switch with rows present: rows are kept; `validateRows` re-runs against the new schedule (rounding notes may appear or disappear).
- Chunk fails at 1 row with `resource`: marked failed, message "This row does not fit in a transaction (tranched schedules with many tranches are large). Reduce tranches or remove the row."
- `StartInPast` mid-run: pause with a "Shift remaining rows by +15 min" action; the confirmation names how many recipients get the shifted schedule.
- Clock skew: all `now` values come from `Date.now()`; the 15-minute batch margin absorbs typical skew. If the RPC rejects with 18 anyway, the shift path handles it.
- Recurring rounding: shown per row (`rounding_adjusted`) and in the summary; never silent.
- Duplicate recipients: allowed (some payrolls intentionally create two streams); warning only.
- Storage unavailable: templates read-only (presets), batch run not persisted (progress panel warns "Progress will not survive a page reload").
- Reload mid-signature: §7.4 (chunk reset to failed, explorer link before retry).
- Token custom contract id: allowed as today; balance pre-flight returns `null` (no issuer mapping) → non-blocking note.
- `count` up to 1000 keeps `recurringToTranches` on the detail page bounded until 3b fixes it properly.

---

## 13. Testing and evidence

Vitest (node environment, existing config), one test file per module:

- `schedule.test.ts`: resolve/derive round-trip for every preset; `shiftSchedule`; `buildSpec` — linear unlock floor, tranched remainder to last tranche (sum equals total for 3 random totals), recurring floor + adjustment bounds, `RangeError` when total < count; every `validateSchedule` rule (one failing vector each, single vs batch margin).
- `rows.test.ts`: separators (`,` `;` tab, spaces), quotes, header detection, comments, blank lines, extra columns, `missing_amount`, 500-row cap, ids continue from `startId`; `validateRows` issue codes incl. duplicates across manual + imported rows and `self_recipient`; `rowsSummary` totals with adjustments.
- `templates.test.ts` (fake storage object): load on missing / corrupt / wrong version / partially invalid items; save / replace / 50 limit / name length; rename; delete; built-ins never written.
- `batchPlan.test.ts`: `planRun` chunking (45 rows → 20/20/5; 1 row → 1 chunk; custom chunkRows), reducer transitions, `split_chunk` sizes and renumbering, refusal to split 1 row, `shift_remaining` only touching non-done chunks, `complete` when all done, `nextChunk` preferring the failed chunk.
- `runner.test.ts` (fake deps, in-memory run): happy path 3 chunks; resource error → split → success; 1-row resource → failed/paused; rejected → paused `rejected`; contract 18 → paused `start_in_past`, then `shift_remaining` + resume completes; abort signal stops after the current chunk; persist called after every transition.
- `errors.test.ts`: classification vectors incl. the real strings captured on testnet.
- `formState.test.ts`: `apply_template` fills fields and clears dirty; edits set dirty; shape switch keeps start; `parseForm` percent → bps, period units, error keys.
- `balance.test.ts` (fake fetch): native, issued, missing asset, HTTP error → null.

`npm run typecheck` must pass. No component tests are added (consistent with the repo).

Manual testnet walkthrough (recorded in `docs/evidence/2026-09-create-flow-testnet.md` with screenshots under `docs/evidence/img/`): single linear / tranched / recurring from presets; a 45-row CSV batch (3 transactions) with one duplicate and one invalid row fixed in the table; a run where the second signature is rejected, the page is reloaded, and the run is resumed; the streams visible on the dashboard and in `/api/streams?address=`.

---

## 14. Follow-ups (not in this spec)

- Sub-project 3b: dashboard filters / search / sort / pagination, wallet history page, O(1) Recurring rendering on the detail page.
- Per-token decimals; custom-token metadata lookup.
- Template export/import as JSON; shared templates.
- Per-row schedules or mixed shapes in one batch.
- Component tests / Playwright once the UI stabilises.

---

## 15. File map

Create:
- `frontend/src/lib/create/{schedule,templates,rows,batchPlan,runner,submit,errors,formState,balance,storage}.ts` and their `*.test.ts`.
- `frontend/src/components/create/{TemplateBar,ShapeTabs,ScheduleFields,RecipientsSection,BatchTable,CsvImport,BatchProgress,CreateResult,ResumeBanner,TokenPicker}.tsx`.
- `frontend/src/components/ConfirmDialog.tsx`.
- `docs/evidence/2026-09-create-flow-testnet.md` (+ images).

Modify:
- `frontend/src/app/create/page.tsx` (thin composition), `frontend/src/components/CreatePreview.tsx` (all shapes), `frontend/src/lib/sdk.ts` (three methods + type re-exports), `frontend/src/lib/deployments.ts` (`horizonUrl`), `frontend/src/app/stream/[id]/page.tsx` (use `ConfirmDialog`), `frontend/README.md` (create flow, templates key, batch limits), `README.md` status line.
