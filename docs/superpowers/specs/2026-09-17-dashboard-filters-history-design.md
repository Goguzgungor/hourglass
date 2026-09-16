# Dashboard Filters, Search & Wallet History (Sub-project 3b) — Design

**Date:** 2026-09-17
**Status:** approved in brainstorming, awaiting implementation plan
**Phase:** Instaward SOW Deliverable 2 ("Advanced stream management"): stream search + filtering, improved stream management, enhanced transaction history — the read/browse half. With sub-project 3a (create flow v2, PR #3) this completes Deliverable 2. Treasury is out of the sprint ([user decision, 2026-09-16]).
**Depends on:** indexer/API v2 (merged, PR #2): `GET /api/streams`, `/api/streams/[id]`, `/api/history`, `/api/stats?address=`, `/api/tokens`.

---

## 1. Goal

Make `/dashboard` a real management surface: one filterable, searchable, sortable, paginated list of the wallet's streams (as sender and/or recipient), a wallet-wide transaction history tab, and a richer stats strip — with the whole view state carried in the URL so any screen can be shared or reloaded. Also close the known `recurringToTranches` blow-up on the stream page.

### In scope

- `/dashboard` with two tabs (**Streams**, **History**) driven by `?tab=`.
- Streams tab: filter bar (role segment, status multi-select, token, model, search box, sort field + order), single list (`StreamRow` reused, arrow shows role), "Load more" via `next_cursor`, first-page refresh with a "N new streams" banner, empty/error states.
- History tab: `/api/history?address=` feed with "Only my actions" (`mine=1`), client-side action-kind filter, rows with time / kind badge / stream link / amount / counterparty / explorer link, "Load more".
- Stats strip from `/api/stats?address=` (sending/receiving counts, status breakdown, per-token locked / withdrawable).
- URL ↔ filter state: parse, serialize (defaults omitted), validate against the API's enums (single source: constants exported from `streamsQuery.ts`).
- Stream page: `recurringToTranches` replaced by an O(1) `Recurring` variant in the view `StreamShape`; rendered unlock list capped (first 24 + "and X more").
- Move `streamedFraction` from the dashboard page into `lib/streaming.ts` (all three shapes, uses `streamedAmount`).

### Out of scope

- New API endpoints or server-side action-kind filtering (client filter over the loaded pages is enough for the beta; revisit if history pages get long).
- CSV export, notifications, bulk actions (withdraw-all etc.), column customisation.
- Component-test infrastructure; i18n; light theme.

---

## 2. Current state (main @ 1accac6)

- `frontend/src/app/dashboard/page.tsx` (437 lines, client): `ConnectedView` fetches `/api/streams?sender=` and `?recipient=` (legacy params, 100 max, no paging) plus global `/api/stats`, polls every 5 s, renders `StatsStrip`, two `Column`s of `StreamRow` (props `{ stream, nowSec, side }`), skeletons and an editorial empty state. `streamedFraction` is a local linear-only approximation.
- `frontend/src/components/TabBar.tsx`: `{ tabs: {id,label}[], active, onChange }`.
- API contract (from `frontend/src/lib/api/*`): `/api/streams` params `address`, `role` (`sender|recipient|any`), `status` (comma list of `pending|streaming|settled|canceled|depleted|active|inactive`), `token` (C…), `model` (`Linear|Tranched|Recurring`), `q` (numeric → id; `G…` → sender/recipient prefix; `C…` → token prefix), `sort` (`created_at|start_ts|end_ts`, default `created_at`), `order` (`asc|desc`, default `desc`), `cursor`, `limit` (1–100, default 50) → `{ streams: (StreamDoc & {status, withdrawable_now})[], next_cursor, now }`; 503 with `{ error }` when Mongo is unreachable. `/api/history` params `address` (required), `mine=1`, `stream_id`, `limit`, `cursor` → `{ items: (ActionDoc & { stream: {id, model, token, sender, recipient, deposited} | null })[], next_cursor, now }`. `/api/stats?address=` → `WalletStats { now, counts: { sending, receiving, by_status }, by_token: [{ token, sent_deposited, sent_locked, received_withdrawn, received_withdrawable_now }] }`. `/api/tokens` → `{ tokens: [{ token, streams }] }`.
- `ActionDoc.action ∈ created | withdrawn | canceled | renounced | transferred | burned`; optional `amount`, `actor`, `to`, `new_owner`, `sender_refund`, `recipient_balance`; `ts`, `ledger`, `tx_hash`, `log_index`, `participants`.
- Stream page (`frontend/src/app/stream/[id]/page.tsx`): view shape is `LiveCounter`'s `StreamShape` (`Linear | Tranched`); `recurringToTranches` materialises `count` tranches (unbounded; flagged in `docs/superpowers/plans/2026-09-14-lockup-v0.2-followups.md`).

---

## 3. Architecture

```
app/dashboard/page.tsx (thin)
  useDashboardFilters()   URL ⇄ DashboardFilters (useSearchParams + router.replace)
  usePagedList()          generic cursor-paged fetch (reducer from lib/dashboard/paging.ts)
  <TabBar/> <StatsStrip/> <FilterBar/> <StreamList/> | <HistoryList/>

lib/dashboard/filters.ts   pure: parseFilters, filtersToQuery, streamsApiUrl, historyApiUrl, searchKind
lib/dashboard/paging.ts    pure: pagedReducer, mergeFirstPage
lib/dashboard/history.ts   pure: toHistoryRow, filterHistoryRows, ACTION_KINDS
lib/streaming.ts           + streamedFraction (all shapes)
lib/api/streamsQuery.ts    export the enum constants (STATUSES, ROLES, MODELS, SORT_FIELDS, ORDERS)
components/dashboard/      FilterBar, RoleSegment, StatusMultiSelect, TokenSelect, ModelSelect, SearchBox,
                           SortControl, StreamList, LoadMore, NewItemsBanner, HistoryList, HistoryRow, StatsStrip
components/LiveCounter.tsx StreamShape gains a `Recurring` variant with O(1) math
```

Rules: pure modules take `now`/params as arguments and never touch React, `fetch`, `window`. Components render state and call callbacks. The page owns the hooks.

---

## 4. Filters and URL state (`lib/dashboard/filters.ts`)

```ts
export type Tab = 'streams' | 'history';
export type DashboardFilters = {
  tab: Tab;                                   // default 'streams'
  role: 'any' | 'sender' | 'recipient';       // default 'any'
  status: StatusParam[];                      // default [] (= no status filter)
  token: string | null;                       // C… or null
  model: 'Linear' | 'Tranched' | 'Recurring' | null;
  q: string;                                  // trimmed; '' = none
  sort: 'created_at' | 'start_ts' | 'end_ts'; // default 'created_at'
  order: 'asc' | 'desc';                      // default 'desc'
  mine: boolean;                              // history tab only; default false
  kinds: ActionKind[];                        // history tab only; default [] (= all)
};
export const DEFAULT_FILTERS: DashboardFilters;
export function parseFilters(sp: URLSearchParams): DashboardFilters;      // invalid values → default for that key; unknown keys ignored
export function filtersToQuery(f: DashboardFilters): URLSearchParams;     // omits defaults; status/kinds comma-joined; stable key order
export function isDefault(f: DashboardFilters, keys?: (keyof DashboardFilters)[]): boolean;
export type SearchKind = 'id' | 'account' | 'contract' | 'invalid' | 'empty';
export function searchKind(q: string): SearchKind;                        // /^\d+$/ → id; ^G → account (prefix ok); ^C → contract; else invalid
export function streamsApiUrl(address: string, f: DashboardFilters, cursor?: string | null): string;  // /api/streams?address=&role=&status=&token=&model=&q=&sort=&order=&limit=20&cursor=
export function historyApiUrl(address: string, f: DashboardFilters, cursor?: string | null): string;  // /api/history?address=&mine=1&limit=25&cursor=
```

- `q` with `searchKind === 'invalid'` is kept in the URL (so the user sees what they typed) but **no request is sent**; the list shows the hint "Search by stream id, G… account or C… token".
- `limit` is fixed: 20 streams / 25 history rows per page.
- The URL is updated with `router.replace` (no history entries per keystroke); the search box debounces 300 ms; every other control writes immediately. Changing any Streams-tab filter resets the paged list; switching tabs keeps both lists' loaded pages in memory for the session.
- `status` values are validated against `STATUSES` from `streamsQuery.ts` (exported in this sub-project, with `ROLES`, `MODELS`, `SORT_FIELDS`, `ORDERS`) so UI and API can never disagree.

---

## 5. Paging and refresh (`lib/dashboard/paging.ts`)

```ts
export type Paged<T> = { items: T[]; pending: T[]; cursor: string | null; loading: boolean; error: string | null; exhausted: boolean; key: string; newCount: number }; // pending = new first-page items held back until the user clicks the banner
export type PagedAction<T> =
  | { type: 'reset'; key: string }                                  // new filter key → empty, loading
  | { type: 'page'; key: string; items: T[]; cursor: string | null } // append (ignored if key differs)
  | { type: 'refresh'; key: string; items: T[]; cursor: string | null; idOf: (t: T) => string | number }
  | { type: 'fail'; key: string; error: string }
  | { type: 'load_more' }
  | { type: 'absorb_new' };                                          // user clicked the banner → merge new items in
export function pagedReducer<T>(s: Paged<T>, a: PagedAction<T>): Paged<T>;
export function mergeFirstPage<T>(existing: T[], fresh: T[], idOf: (t: T) => string | number): { items: T[]; newIds: (string | number)[] };
```

- `key` = `filtersToQuery(f).toString()` + tab; a response whose key no longer matches is dropped (prevents out-of-order overwrite).
- `refresh` replaces the fields of already-loaded items that appear in the fresh first page (so `withdrawn`/`status` stay live) and counts ids not yet in the list as `newCount`; the banner "N new streams — show" dispatches `absorb_new`, which prepends the held items (kept in `pending: T[]` inside the state) and resets the count. Items are never silently inserted mid-list.
- First-page refresh every 10 s while the tab is visible (`document.visibilityState`), only when `cursor` was fetched at least once and no `load_more` is in flight. The 1 s `nowSec` tick for progress bars stays.
- `usePagedList(url: string | null, key: string, idOf)` hook: fetches when `url` changes (reset), exposes `loadMore()`, `refresh()`. `url === null` (invalid search / disconnected) → idle state with no request.

---

## 6. Streams tab

- **Stats strip** (`/api/stats?address=`, refreshed with the first page): tiles "Sending N / Receiving N", "Streaming N · Pending N · Settled N · Canceled N · Depleted N" (from `by_status`), per-token rows "locked (as sender)" and "withdrawable now (as recipient)" for tokens with non-zero totals (symbol via `findToken`, else truncated contract id). Global `/api/stats` (no address) is no longer used on the dashboard.
- **FilterBar** (wraps on narrow screens): `RoleSegment` (All / Sending / Receiving), `StatusMultiSelect` (chips: pending, streaming, settled, canceled, depleted; "active"/"inactive" are accepted from the URL but not offered as chips), `TokenSelect` (options from `/api/tokens` intersected with `TOKENS` for symbols; unknown tokens shown as `C…AB12`), `ModelSelect` (Any / Linear / Tranched / Recurring), `SearchBox` (placeholder "id, G… or C…"), `SortControl` (Created / Start / End + asc/desc toggle), "Clear filters" (visible when `!isDefault`). Every control is a labelled native element or a `role="group"` of toggle buttons with `aria-pressed`.
- **List**: `StreamRow` moved to `components/dashboard/StreamRow.tsx`; `side` derived per row (`stream.sender === address ? 'sender' : 'recipient'`); progress uses `streamedFraction` from `lib/streaming.ts`; `withdrawable_now`/`status` from the API row are shown instead of being recomputed. Skeleton rows while loading; `LoadMore` button shows "Load 20 more" / "All loaded".
- **Empty states**: no streams at all → existing editorial empty state with a link to `/create`; filters active and no result → "No streams match these filters" + Clear; invalid search → hint; indexer 503 → existing offline notice with retry.

---

## 7. History tab (`lib/dashboard/history.ts`)

```ts
export const ACTION_KINDS = ['created', 'withdrawn', 'canceled', 'renounced', 'transferred', 'burned'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export type HistoryRow = {
  id: string;                     // `${tx_hash}:${log_index}`
  kind: ActionKind;
  ts: number;
  streamId: number;
  model: 'Linear' | 'Tranched' | 'Recurring' | null;
  token: string | null;
  amount: bigint | null;          // created: deposited; withdrawn: amount; canceled: sender_refund; else null
  secondary: bigint | null;       // canceled: recipient_balance (what stayed withdrawable); else null
  counterparty: string | null;    // the *other* party relative to `address` (sender/recipient/new_owner/to)
  actor: string | null;
  mine: boolean;                  // actor === address
  txHash: string;
};
export function toHistoryRow(item: HistoryItem, address: string): HistoryRow;
export function filterHistoryRows(rows: HistoryRow[], kinds: ActionKind[]): HistoryRow[];
```

- Row rendering (`HistoryRow.tsx`): left dot coloured by kind (reuse the stream page's `EVENT_DOT` palette, moved to `lib/dashboard/history.ts` as `KIND_COLOR`), kind label, `#id · Model` link to `/stream/{id}`, amount with token symbol (canceled: "refund X · Y left to recipient"), "by you" / counterparty, relative time (`formatTimestamp` on hover), explorer link via `txUrl`.
- Controls: "Only my actions" toggle (`mine`), kind chips (multi-select, client-side), "Load 25 more".
- The stream page's `EventsLog` switches to `HistoryRow` for consistent rendering (same data via `/api/streams/[id]`), keeping its timeline layout.

---

## 8. Stream page: recurring shape (follow-up closure)

- `components/LiveCounter.tsx` `StreamShape` gains `{ tag: 'Recurring'; first_ts: number; period_secs: number; count: number; amount_per_period: bigint }`; the counter's streamed amount for it is `amount_per_period * min(count, floor((now − first)/period) + 1)` when `now ≥ first`, else 0 (O(1)).
- `stream/[id]/page.tsx` maps `Recurring` directly (no `recurringToTranches`). `ScheduleTimeline` / `EmissionChart` receive at most `RENDERED_UNLOCKS = 24` synthesised points for recurring (first 24 unlocks) plus a caption "and X more unlocks every P until <end>"; tranched streams are unchanged (≤ 100 by contract).
- `lib/streaming.ts`: `streamedFraction(t: StreamTerms, now): number` = `Number(streamedAmount / deposited)` computed with bigint scaling (`streamed * 10_000n / deposited` → `/10_000`), clamped 0..1; replaces the dashboard's local helper.

---

## 9. Edge cases

- Disconnected wallet: existing `DisconnectedView`; URL filters are preserved and applied once connected.
- Wallet switch: both lists reset (key includes the address).
- Search typed as a full G address that is neither sender nor recipient of anything → empty state with the "no match" message; prefixes shorter than 4 chars still query (API does a prefix match) — acceptable.
- `status=active` in a shared URL → applied (API understands it) and shown as a read-only chip "active" until cleared.
- Cursor from a stale sort/filter combination is never reused: the cursor lives inside the `Paged` state keyed by filter key, never in the URL.
- Indexer lag: a stream created seconds ago may not be in the list yet; the create flow's result page links to `/stream/{id}` (chain-backed) so the user is not blocked.
- Very long histories: pages of 25 with client-side kind filter may show "0 of the loaded 25 match — load more"; the LoadMore button remains available.

---

## 10. Testing and evidence

vitest (node): `lib/dashboard/filters.test.ts` (parse defaults/invalid/unknown keys; serialize omits defaults and is stable; round trip; `searchKind`; URL builders incl. encoding), `lib/dashboard/paging.test.ts` (reset/page/fail/exhausted, stale-key drop, `mergeFirstPage` update-in-place + newIds, `absorb_new`), `lib/dashboard/history.test.ts` (row mapping per kind incl. counterparty/mine; kind filter), `lib/streaming.test.ts` (+ `streamedFraction` vectors for all shapes, recurring O(1) counter math). `npm run typecheck`, `npm run build`.

Manual checklist (appended to `docs/evidence/`): filter combinations, shareable URL reload, load more (≥ 21 streams: the deployer wallet has 65 on testnet), new-items banner after creating a stream in another tab, history rows for each kind, recurring stream page with count ≥ 100 renders instantly.

---

## 11. File map

Create: `frontend/src/lib/dashboard/{filters,paging,history}.ts` (+ tests), `frontend/src/lib/dashboard/{useDashboardFilters,usePagedList}.ts`, `frontend/src/components/dashboard/{FilterBar,RoleSegment,StatusMultiSelect,TokenSelect,ModelSelect,SearchBox,SortControl,StreamList,StreamRow,LoadMore,NewItemsBanner,HistoryList,HistoryRow,StatsStrip}.tsx`.
Modify: `frontend/src/app/dashboard/page.tsx` (thin), `frontend/src/lib/api/streamsQuery.ts` (export enums), `frontend/src/lib/streaming.ts` (+ `streamedFraction`), `frontend/src/components/LiveCounter.tsx` (Recurring variant), `frontend/src/app/stream/[id]/page.tsx` (Recurring mapping, capped unlocks, `HistoryRow` in `EventsLog`), `frontend/README.md` (dashboard section), `docs/superpowers/plans/2026-09-14-lockup-v0.2-followups.md` (mark `recurringToTranches` item fixed).
