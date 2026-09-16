# Hourglass — Frontend

Next.js 16 + TypeScript + Tailwind v4 + Turbopack. Consumes the local
`hourglass` SDK (installed as `file:../sdk`).

## Run

```bash
cd frontend
npm install
npm run dev
npm test
```

Opens at http://localhost:3000.

## End-to-end with the local contracts

```bash
../scripts/quickstart-up.sh
../scripts/deploy-local.sh
```

The frontend reads `../deployments/local.json` for contract IDs (consumed in
Stage 2 — the landing page in this Stage 1 build is purely presentational).

## Stack

- **Next.js 16** (App Router, Turbopack)
- **Tailwind v4** via `@tailwindcss/postcss`, tokens declared in
  `src/app/globals.css` under `@theme inline { ... }`
- **Fonts:** Fraunces (display, variable, with `opsz` + `SOFT` axes), Geist
  Sans (body), Geist Mono (numerals & addresses) — all via `next/font/google`
- **Stellar SDK** `@stellar/stellar-sdk@^13`
- **Wallets:** `@creit.tech/stellar-wallets-kit` (wired up in Stage 2)
- **Animation:** `motion` (used sparingly)
- **Local SDK:** `hourglass` from `../sdk` (typed Soroban bindings)

## Layout

```
src/
  app/
    layout.tsx      # root layout, font wiring, header (wordmark + connect), footer
    page.tsx        # landing page — three editorial stanzas
    globals.css     # design tokens + Tailwind theme + film-grain overlay + keyframes
  components/
    HourglassIcon.tsx   # animated SVG hourglass, fill prop 0..1
    Constellation.tsx   # faint Orion-belt accent for the hero corner
    Wordmark.tsx        # small hourglass + "Hourglass" italic wordmark
    WalletButton.tsx    # stub button for Stage 1; wires in Stage 2
```

## Create flow

`/create` builds Linear, Tranched and Recurring streams for one recipient or a list (batch).

- **Templates:** 7 built-in presets plus your own, saved in `localStorage['hourglass:templates:v1']` (max 50). A template stores a *relative* schedule (offsets in seconds, percentages in basis points), token, and flags; applying it resolves the schedule against "now" and shifts it so the start is at least 2 min (single) / 15 min (batch) ahead.
- **Amounts** are always the total a recipient receives. Recurring amounts are floored to equal periods; the adjustment is shown per row and in the summary.
- **Batch:** rows come from the table or from pasted / uploaded `recipient, amount` lines (comma, semicolon, tab or space separated; header and `#` lines skipped). Max 500 rows per run. Rows are chunked 20 per `create_batch` transaction (contract cap 100); a chunk that does not fit is split in half automatically. Each transaction is signed separately; progress is kept in `sessionStorage['hourglass:batchRun:v1']` so a reload offers to resume. A pre-flight Horizon balance check blocks runs that exceed the balance.
- **Logic lives in** `src/lib/create/` (pure, unit-tested); UI in `src/components/create/`.

## Design system

The Celestial Almanac palette. Treat sand as a brass accent — use it
sparingly. Cream is the primary text; never pure white. Strokes are deep
cosmic navy. Sharp corners only — `rounded-none` or `rounded-sm` at most.

| Token            | Hex       | Purpose                          |
| ---------------- | --------- | -------------------------------- |
| `--night`        | `#0a0e1a` | page background                  |
| `--midnight`     | `#101729` | card surfaces                    |
| `--stroke`       | `#2a3552` | hairline borders                 |
| `--sand`         | `#e8b76b` | primary accent                   |
| `--cream`        | `#f5ebd9` | primary text                     |
| `--cream-muted`  | `#b9b2a3` | secondary text                   |
| `--cream-dim`    | `#8a92aa` | tertiary labels                  |

These are wired into Tailwind as `bg-night`, `text-cream`, `border-stroke`, etc.

## Stage roadmap

- **Stage 1** (this build): scaffold, design system, landing page.
- **Stage 2**: wallet kit wiring, `/create` flow, `/stream/[id]` page,
  contract reads/writes via the SDK.
- **Stage 3**: Mongo-backed indexer + `/dashboard` for connected wallet.

## Indexer (Mongo)

The indexer is a long-running Node script (`scripts/indexer.ts`) that keeps
MongoDB in sync with the lockup contract. The `/dashboard` page and the
`/api/streams*`, `/api/history`, `/api/stats`, `/api/tokens` routes read from
this index, NOT the chain directly — so they render instantly and survive
transient RPC hiccups. It combines two mechanisms:

- **Cursor-paged event ingestion** (`src/lib/indexer/ingest.ts`). Each tick
  pages through `getEvents` (up to `INDEXER_MAX_PAGES` pages of up to 100
  events) starting from the persisted cursor, applying every event
  idempotently (`handleEvent`, deduped by the unique `(tx_hash, log_index)`
  index on `actions`) and saving the resulting `{ cursor, ledger }` after
  every page — so a crash between pages resumes exactly where it stopped,
  with no gap and no double-count. On first boot (no cursor yet) it starts
  100 ledgers behind the latest, to absorb ledger-close jitter. If the RPC
  rejects our position because the node pruned history past it, the indexer
  resets to `{ cursor: null, ledger: latest - 100 }` and schedules an
  immediate reconcile, since events in the gap were certainly missed. The
  public RPC answers both a stale `startLedger` and a stale `cursor` with
  the same JSON-RPC error — code `-32600`, message `startLedger must be
  within the ledger range: 4556625 - 4677584` — which is what the retention
  check matches (along with the older `oldest ledger` / `invalid cursor`
  phrasings). Anything else rethrows and is logged as `tick failed`.
- **Reconcile — chain-truth reconciliation via NFT enumeration**
  (`src/lib/indexer/reconcile.ts`), run once at startup (self-healing after
  any downtime) and every `INDEXER_RECONCILE_MS`, plus on demand after a
  retention reset. It walks the lockup's Enumerable-NFT extension
  (`total_supply` + `get_token_id(i)` for every live token) to get the exact
  set of currently-live stream ids, upserts any that are missing or stale in
  Mongo (a doc reconcile inserted is tagged `source: 'reconcile'`; a later
  `created` event still fills in `created_tx`/`created_ledger` and flips
  `source` to `'event'`, but a refresh of an event-ingested doc never
  rewrites its `source`), and marks streams that disappeared from the
  enumeration (after a defensive re-check) as depleted. This is what makes
  the index lossless even across missed events, restarts, or gaps beyond RPC
  retention. Reconcile scheduling is independent of ingestion: a tick whose
  `fetchAndIngest` throws is logged and the periodic/reset reconcile still
  runs, so an RPC that rejects every `getEvents` call cannot also starve the
  self-healing path.

  **Catch-up caveat.** An action materialized live carries the stream's
  `participants` as of the moment the indexer fetched the stream — normally
  the same block, but after a long outage a `withdrawn` action replayed
  behind a later `transferred` records the *current* recipient rather than
  the one at the time. `backfillParticipants()` (run at startup) is the
  authoritative reconstruction: it recomputes each action's recipient at its
  own `(ts, log_index)` from the stream's transfer history.

Uses the existing local Mongo container (`id-mongodb-1` at
`localhost:27017`) by default. Override with `MONGODB_URL` / `MONGODB_DB`
env vars. Indexer-specific env vars (all optional):

| Env var | Default | Meaning |
| --- | --- | --- |
| `INDEXER_POLL_MS` | `3000` | delay between ingestion ticks |
| `INDEXER_RECONCILE_MS` | `600000` | delay between periodic reconcile passes |
| `INDEXER_MAX_PAGES` | `20` | max `getEvents` pages fetched per ingestion tick |

```bash
# 1. Make sure quickstart + contracts are up
../scripts/quickstart-up.sh
../scripts/deploy-local.sh

# 2. Make sure Mongo is running (it usually is)
docker ps | grep mongo

# 3. Run the indexer in one terminal
cd frontend
npm run indexer

# 4. Run the frontend in another terminal
npm run dev
```

Visit http://localhost:3000/dashboard — once you create a stream via
`/create`, the indexer will pick it up within a few seconds and the dashboard
will populate.

### Collections

- `streams` — one document per stream id, refreshed from the contract on
  every event (or by reconcile) so deposited / withdrawn / refunded are
  always current; carries `source: 'event' | 'reconcile'` for provenance.
- `actions` — append-only audit log; idempotent via a unique compound index
  on `(tx_hash, log_index)`; each action carries `participants` (unique of
  sender/recipient/actor/to/new_owner) for one-query wallet history.
- `meta` — single-doc scratch space; `events_cursor` holds `{ cursor,
  ledger }` so ingestion resumes cleanly after a restart, `last_reconcile`
  holds the last reconcile pass's `{ at, live, upserted, depleted }`.

## API

All routes: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`; invalid
parameters return `400 { error }`; a database that's unreachable returns
`503 { error, ...empty payload }`. Every list response except
`GET /api/tokens` (which has no time-dependent field) includes `now`
(server unix seconds) so clients can render time-dependent values (status,
withdrawable amount) consistently with the server.

`withdrawable_now` is `max(0, min(streamed(now), deposited − refunded) −
withdrawn)`, and `0` for a depleted stream — i.e. it is capped at the
stream's own remaining balance and never advertises the refunded portion of
a canceled stream. The on-chain `withdraw` does not yet apply that cap (see
`docs/superpowers/plans/2026-09-14-lockup-v0.2-followups.md`), so for a
canceled stream the API figure can be lower than what the contract would
currently pay out.

### `GET /api/streams`

| Param | Values | Notes |
| --- | --- | --- |
| `address` | `G…` | used together with `role` |
| `role` | `sender` \| `recipient` \| `any` (default) | `any` → `$or` on both fields |
| `status` | comma list of `pending,streaming,settled,canceled,depleted`; legacy `active` / `inactive` still accepted | time-dependent members are plain range comparisons against the server's `now` (indexable) |
| `token` | `C…` | exact match |
| `model` | `Linear` \| `Tranched` \| `Recurring` | exact match |
| `q` | text | all digits → `_id` exact; starts with `G` → sender/recipient prefix; starts with `C` → token prefix; otherwise ignored (never a full-collection regex) |
| `sort` / `order` | `created_at` (default) \| `start_ts` \| `end_ts`; `desc` (default) \| `asc` | tie-broken on `_id` |
| `limit` | 1–100 (default 50) | |
| `cursor` | opaque | base64url of `{ k: <sort value>, id: <_id> }` from the previous page |
| legacy `sender=` / `recipient=` | `G…` | dashboard v1 compatibility: each is an exact match on its own field, and passing both ANDs them (not an `$or`). Independent of `address`/`role`, which still apply on top. Their presence also raises the default `limit` to 100 |

Response: `{ streams: (StreamDoc & { status, withdrawable_now: string })[], next_cursor: string | null, now }`.

### `GET /api/streams/[id]`

Same stream shape as above, plus paginated actions.

| Param | Values | Notes |
| --- | --- | --- |
| `limit` | ≤100 (default 50) | actions per page |
| `cursor` | opaque | base64url cursor into the stream's action log; a malformed cursor is a `400` |

Response: `{ stream, actions, next_cursor: string | null, now }`.

### `GET /api/history`

| Param | Values | Notes |
| --- | --- | --- |
| `address` | `G…` | required |
| `mine` | `1` | only actions where `actor == address` |
| `stream_id` | number | optional narrowing to one stream |
| `limit` | ≤100 (default 50) | |
| `cursor` | opaque | base64url of `{ ts, log_index, id }` from the previous page |

Query is `{ participants: address }` (or `{ actor: address }` with
`mine=1`), sorted `ts desc, log_index desc, _id desc`. Each item carries
`stream: { id, model, token, sender, recipient, deposited }` resolved with
one `$in` query per page.

Response: `{ items, next_cursor: string | null, now }`.

### `GET /api/stats`

Without `address`: the existing global shape `{ total, active, inactive,
locked }`.

With `address`:

```ts
{
  now,
  counts: { sending: number, receiving: number, by_status: Record<Status, number> },
  by_token: Array<{ token: string, sent_deposited: string, sent_locked: string,
                    received_withdrawn: string, received_withdrawable_now: string }>
}
```

Amounts are decimal strings (BigInt-safe), computed from the wallet's
streams via `src/lib/streaming.ts`.

### `GET /api/tokens`

No params. Response: `{ tokens: Array<{ token: string, streams: number }> }`
— distinct tokens across `streams`, for filter dropdowns.
