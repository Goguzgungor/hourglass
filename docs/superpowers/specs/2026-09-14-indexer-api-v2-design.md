# Hourglass — Indexer + API v2 (search, filtering, wallet history)

**Status**: Approved design — 2026-09-14
**Author**: brainstorming session, 2026-09-14
**Parent specs**: `2026-05-23-hourglass-design.md` (§12 dashboard, §13 indexer), `2026-09-10-batch-recurring-streams-design.md` (lockup v0.2)
**Governing scope**: Stellar Instaward SOW ("Vestellar"), Deliverable 2 — *stream search and filtering*, *enhanced transaction history*, *better stream organization*. Sub-project 2 of 5 (1 contracts ✓ → **2 indexer/API** → 3 frontend → 4 treasury prep → 5 beta ops + docs).
**Branch**: `feat/indexer-api-v2`, stacked on `feat/batch-recurring` (PR #1) until that merges.

---

## 1. Summary

Make the custom Node + MongoDB indexer robust enough for a public beta and give the frontend a query API that supports search, filtering, sorting, pagination, per-wallet transaction history and per-wallet statistics.

Three problems drive this:

1. **Lost events.** The indexer fetches one page of ≤100 events per tick and then jumps its cursor to `latestLedger + 1`. A 30-row `create_batch` emits 30+ events in one ledger, so events are silently skipped today.
2. **No recovery.** Testnet RPC retains roughly 24 hours of events; after a restart or an outage, streams created in the gap never appear. There is no way to rebuild from chain.
3. **No query surface.** `/api/streams` filters only on exact sender/recipient and a coarse active/inactive flag; there is no pagination, no token/model/status filter, no text search, no wallet-wide history, no per-wallet stats.

Decision (brainstorm 2026-09-14): extend the existing indexer and Next.js API routes (approach A). Mercury/SubQuery (spec §13's original plan) and a minimal fix were rejected — the former does not fit the sprint, the latter leaves the SOW's history deliverable unmet. Stream **templates** were decided to live in the frontend (built-in presets + localStorage) and are sub-project 3's concern; they need no backend.

## 2. Goals

- Every lockup event is ingested exactly once, regardless of how many arrive per ledger or per tick.
- After any restart or RPC retention gap, the `streams` collection converges to on-chain truth without manual intervention.
- One query API serves the dashboard's list, filters, search, sorting and pagination; a wallet-wide history feed; per-wallet aggregates; and a token list.
- Vesting math exists once in TypeScript, mirroring `contracts/shared/src/math.rs`, and is unit-tested against the same vectors.
- Pure logic (parsing, paging, reconcile, query building, cursors, math) is unit-tested with `vitest`; persistence stays thin.
- The current dashboard keeps working unchanged (legacy query parameters preserved) until sub-project 3 replaces it.

## 3. Non-Goals

- Dashboard/UI changes, template storage, CSV import (sub-project 3).
- Mercury Retroshades / SubQuery / GraphQL.
- Backfilling **events** older than the RPC retention window (stream *state* is recovered; the audit trail for that window is best-effort and documented).
- Authentication, rate limiting, multi-contract indexing in one database, reorg handling (Soroban finality makes reorgs a non-issue at this depth).
- Contract changes.

## 4. Architecture

```
                     ┌──────────────────────────────────────────────┐
 Soroban RPC ──────▶ │ indexer runner  (frontend/scripts/indexer.ts) │
  getEvents (cursor) │   ├─ lib/indexer/ingest.ts   fetch pages →    │
  get_stream         │   │     parse → handleEvent → save cursor     │
  total_supply       │   ├─ lib/indexer/reconcile.ts  chain ⇄ mongo  │
  get_token_id       │   └─ lib/indexer/chain.ts    view-call wrapper │
                     └───────────────┬──────────────────────────────┘
                                     ▼
                              MongoDB (hourglass_v2)
                     streams · actions(+participants) · meta
                                     ▲
                     ┌───────────────┴──────────────────────────────┐
                     │ Next.js API routes (frontend/src/app/api/**) │
                     │   /streams  /streams/[id]  /history  /stats  │
                     │   /tokens        ← lib/api/*  lib/streaming  │
                     └──────────────────────────────────────────────┘
```

`frontend/src/lib/streaming.ts` (vesting math, status derivation) is shared by the API routes and, from sub-project 3 on, the UI.

## 5. Indexer ingestion — cursor paging

State in `meta`:

```ts
{ _id: 'events_cursor', value: { cursor: string | null, ledger: number } }
```

Tick algorithm (`lib/indexer/ingest.ts`, RPC client injected):

```
state = loadCursorState()                      // first boot: { cursor: null, ledger: latest - 100 }
for page in 1..=INDEXER_MAX_PAGES (default 20):
    req = state.cursor
        ? { cursor: state.cursor, filters, limit: PAGE_LIMIT }
        : { startLedger: state.ledger, filters, limit: PAGE_LIMIT }
    res = rpc.getEvents(req)
    for e in res.events: handleEvent(parseEvent(e))     // idempotent (tx_hash, log_index)
    state = { cursor: res.cursor, ledger: res.latestLedger }
    saveCursorState(state)
    if res.events.length < PAGE_LIMIT: break            // caught up
```

- The response `cursor` is always persisted, so a crash between pages resumes exactly where it stopped; duplicates are absorbed by the unique `(tx_hash, log_index)` index.
- A retention error (`start is before oldest ledger` or a rejected cursor) resets the state to `{ cursor: null, ledger: latest - STARTUP_BUFFER_LEDGERS }` **and schedules an immediate reconcile** (§6), because events were certainly missed.
- `filters` stay `[{ type: 'contract', contractIds: [LOCKUP] }]` in both modes.

## 6. Reconcile — converge Mongo to chain

`lib/indexer/reconcile.ts`, run once at startup (after indexes) and every `INDEXER_RECONCILE_MS` (default 600 000 ms), and on demand after a retention reset. Concurrency for view calls: 5.

1. **Enumerate live streams.** `n = total_supply()`; `liveIds = { get_token_id(i) | i in 0..n }`. (The lockup embeds OpenZeppelin's Enumerable NFT extension; every un-burned stream has exactly one NFT with `token_id == stream_id`.)
2. **Upsert missing / not-yet-depleted.** For each `id ∈ liveIds` where Mongo has no doc, or the doc is not `is_depleted`: `get_stream(id)` → upsert the materialized fields (same mapping as the `created` handler). A canceled stream is NOT terminal — withdrawals (and `withdraw_max_and_transfer`) stay legal until it is depleted — so only `is_depleted` excludes a doc from refresh. Docs discovered this way get `source: 'reconcile'`; `created_tx`/`created_ledger` stay unset and `created_at` defaults to `start_ts` when unknown (a schedule time, not a ledger time). If the stream's `created` event is ingested later, its provenance is written with `$set` (a stream has exactly one `created` event, so it is authoritative).
3. **Mark burned — after verification.** For each Mongo doc with `_id ∉ liveIds` and `!is_depleted`, call `get_stream(id)` first: the enumeration (`total_supply` + `get_token_id(i)`) is not an atomic snapshot, and a burn mid-scan can hide a still-live id. A record → refresh it as in step 2; `null` → set `is_depleted = true, updated_at = now` (the NFT was burned; the on-chain record is gone). Without the check a false depletion would be sticky, because depleted docs are never refreshed.
4. Persist `meta.last_reconcile = { at, live: n, upserted, depleted }` for the health log.

Cost: `n + 1 + (non-terminal count)` view simulations per cycle — fine for the beta's scale (hundreds of streams); the interval is tunable.

## 7. Data model

### `actions` (changed)

```ts
interface ActionDoc {
  stream_id: number;
  action: 'created' | 'withdrawn' | 'canceled' | 'renounced' | 'transferred' | 'burned';
  ts: number; ledger: number; tx_hash: string; log_index: number;
  amount?: string; actor?: string; to?: string; new_owner?: string;
  sender_refund?: string; recipient_balance?: string;
  participants: string[];   // NEW — unique of stream.sender, stream.recipient (at event time),
                            //       actor, to, new_owner; enables one-query wallet history
}
```

`participants` is filled from the freshly fetched stream (or the existing Mongo doc for `burned`). On startup, actions lacking the field are backfilled from their stream doc (one pass; the `hourglass_v2` database is small).

### `streams` (unchanged fields; new optional `source: 'event' | 'reconcile'`)

### Indexes (`ensureIndexes`, idempotent)

| Collection | Index | Serves |
|---|---|---|
| streams | `{ sender: 1, created_at: -1 }`, `{ recipient: 1, created_at: -1 }` | address + role lists |
| streams | `{ token: 1 }`, `{ model: 1 }`, `{ end_ts: 1 }`, `{ created_at: -1, _id: -1 }` | filters, sorts, cursor |
| actions | `{ participants: 1, ts: -1, log_index: -1 }` (multikey) | wallet history |
| actions | `{ actor: 1, ts: -1 }` | `mine=1` history |
| actions | existing unique `{ tx_hash: 1, log_index: 1 }`, `{ stream_id: 1, ts: -1 }` | idempotency, per-stream log |

## 8. Shared vesting math — `frontend/src/lib/streaming.ts`

```ts
type StreamTerms = Pick<StreamDoc, 'model' | 'start_ts' | 'end_ts' | 'deposited' | 'withdrawn' | 'refunded'
  | 'was_canceled' | 'is_depleted' | 'cliff_ts' | 'unlock_at_start' | 'unlock_at_cliff' | 'tranches'
  | 'first_ts' | 'period_secs' | 'count' | 'amount_per_period'>;

streamedAmount(t: StreamTerms, nowSec: number): bigint     // Linear / Tranched / Recurring, mirrors math.rs
withdrawableNow(t, nowSec): bigint                          // max(0, streamed - withdrawn)
deriveStatus(t, nowSec): 'PENDING'|'STREAMING'|'SETTLED'|'CANCELED'|'DEPLETED'  // moved from dashboard
```

Semantics are exactly spec 2026-05-23 §7 and spec 2026-09-10 §6 (integer division floors; Recurring `A·min(N, ⌊(t−F)/P⌋+1)`). The dashboard's local `deriveStatus` is replaced by this module (behaviour-identical).

## 9. API

All routes: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`; invalid parameters → `400 { error }`; database unreachable → `503 { error, ...empty payload }` (existing pattern). Every list response includes `now` (server unix seconds) so clients can render time-dependent values consistently.

### `GET /api/streams`

| Param | Values | Notes |
|---|---|---|
| `address` | `G…` | with `role` |
| `role` | `sender` \| `recipient` \| `any` (default) | `any` → `$or` on both fields |
| `status` | comma list of `pending,streaming,settled,canceled,depleted`; legacy `active` / `inactive` still accepted | time-dependent members are plain range comparisons against the server's `now` (indexable) |
| `token` | `C…` | exact |
| `model` | `Linear` \| `Tranched` \| `Recurring` | exact |
| `q` | text | all digits → `_id` exact; starts with `G` → sender/recipient prefix; starts with `C` → token prefix; otherwise ignored (never a full-collection regex) |
| `sort` / `order` | `created_at` (default) \| `start_ts` \| `end_ts`; `desc` (default) \| `asc` | tie-break on `_id` |
| `limit` | 1–100 (default 50) | |
| `cursor` | opaque | base64url of `{ k: <sort value>, id: <_id> }` from the previous page |
| legacy `sender=` / `recipient=` | | mapped to `address` + `role`; kept until sub-project 3 |

Response: `{ streams: (StreamDoc & { status, withdrawable_now: string })[], next_cursor: string | null, now }`.

### `GET /api/history`

`address` (required), `mine=1` (only `actor == address`), `stream_id` (optional narrowing), `limit` (≤100, default 50), `cursor` (base64url of `{ ts, log_index, id }`). Query: `{ participants: address }` (or `{ actor: address }`), sort `ts desc, log_index desc, _id desc`. Each item carries `stream: { id, model, token, sender, recipient, deposited }` resolved with one `$in` query per page.

Response: `{ items, next_cursor, now }`.

### `GET /api/stats`

Without `address`: current global shape (`total, active, inactive, locked`) — unchanged.
With `address`:

```ts
{
  now,
  counts: { sending: number, receiving: number, by_status: Record<Status, number> },
  by_token: Array<{ token: string, sent_deposited: string, sent_locked: string,
                    received_withdrawn: string, received_withdrawable_now: string }>
}
```
Amounts are decimal strings (BigInt-safe), computed in the route from the wallet's streams using `lib/streaming.ts`.

### `GET /api/tokens`

`{ tokens: Array<{ token: string, streams: number }> }` — distinct tokens across `streams` (for the filter dropdown).

### `GET /api/streams/[id]`

Unchanged shape plus action pagination: `limit` (≤100, default 50), `cursor`, response gains `next_cursor`.

## 10. File structure

```
frontend/
  scripts/indexer.ts                 runner only: config/env, loop, signals, logging
  src/lib/indexer/
    events.ts                        parseEvent (moved), KNOWN_ACTIONS
    ingest.ts                        fetchAndIngest(rpc, store, state) — paging loop + handleEvent
    reconcile.ts                     reconcile(chain, store, now)
    chain.ts                         ChainReader { getStream, totalSupply, getTokenId } over the SDK client
    store.ts                         thin Mongo adapters + IndexerStore interface (fakeable in tests)
    *.test.ts                        vitest
  src/lib/streaming.ts (+ .test.ts)  vesting math + status
  src/lib/api/
    params.ts                        address/enum/int validation helpers
    cursor.ts                        encode/decode opaque cursors
    streamsQuery.ts                  filter + sort builder (pure)
    historyQuery.ts                  filter + cursor builder (pure)
    *.test.ts
  src/app/api/streams/route.ts       rewritten on lib/api
  src/app/api/streams/[id]/route.ts  + pagination
  src/app/api/history/route.ts       new
  src/app/api/stats/route.ts         + address mode
  src/app/api/tokens/route.ts        new
  src/lib/db.ts                      ActionDoc.participants, StreamDoc.source, new indexes
  package.json                       vitest devDependency, "test": "vitest run"
docker-compose.yml                   INDEXER_RECONCILE_MS, INDEXER_MAX_PAGES (defaults documented)
```

## 11. Testing

- **Unit (vitest):** `streaming.test.ts` reproduces the Rust vectors (linear cliff/unlocks, tranched steps, recurring boundaries, `count == 1`); `cursor.test.ts` round-trips and rejects tampered input; `streamsQuery.test.ts` covers every parameter incl. `q` classification and legacy mapping; `historyQuery.test.ts`; `ingest.test.ts` with a fake RPC (250 events over 3 pages → all handled once, cursor saved after each page; retention error → reset + reconcile flag); `reconcile.test.ts` with a fake chain (`live = {1,2,4}`, Mongo `{1,2,3}` → 4 upserted, 3 depleted, 1–2 refreshed only if non-terminal) over in-memory store fakes.
- **Route smoke (vitest, optional when `MONGODB_URL` is set):** insert a few docs, call the route handlers directly, assert shapes and pagination continuity.
- **Real-world check (manual, recorded in the plan):** with the indexer running against testnet, create a 30-row batch via the smoke script's probe; all 30 streams must appear after one tick, and `meta.events_cursor` must advance through multiple pages. Stop the indexer, create a stream, restart → reconcile inserts it.

## 12. Risks & Notes

- **Reconcile cost grows linearly** with live streams; at thousands of streams the interval should be raised or the enumeration cached — noted for mainnet planning.
- **Time-dependent status filters** are plain range comparisons on `start_ts`/`end_ts` against the server's `now`, so they can use the `end_ts` index; the address/role index narrows first.
- **History gaps** after retention resets are inherent; the API could later expose `meta.last_reconcile` so the UI can show "history may be incomplete before <ledger>".
- **Stacked branch:** rebase onto `main` once PR #1 merges; no contract or SDK changes here, so conflicts are unlikely.

## 13. References

- Soroban RPC `getEvents` (cursor pagination): https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents
- OpenZeppelin Stellar `NonFungibleEnumerable` (`total_supply`, `get_token_id`).
- Spec 2026-05-23 §7 (streamed-amount semantics), §12 (dashboard aggregates), §13 (indexer tables).
