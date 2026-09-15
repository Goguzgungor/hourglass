# Hourglass — Batch Creation + Recurring Streams (Lockup v0.2)

**Status**: Approved design — 2026-09-10
**Author**: brainstorming session, 2026-09-10
**Parent spec**: `2026-05-23-hourglass-design.md` (Phase 0 MVP)
**Governing scope**: Stellar Instaward SOW ("Vestellar"), Deliverable 2 — *batch stream creation* and *recurring vesting streams*. Sub-project 1 of 5 in the phase-2 breakdown (1 contracts → 2 indexer/API → 3 frontend → 4 treasury prep → 5 beta ops + docs).

---

## 1. Summary

Extend the immutable `lockup` contract with two capabilities and redeploy it to testnet:

1. **Recurring streams** — a new first-class `StreamShape::Recurring` for "N equal unlocks every P seconds, funded upfront" (payroll, monthly grants). O(1) math, four storage fields, no cap on the number of periods.
2. **Batch creation** — `create_batch(sender, token, rows)` creates up to 100 streams of mixed shapes in one transaction with one signature and one token transfer. All-or-nothing.

Existing entry points (`create_linear`, `create_tranched`, lifecycle ops, NFT surface) keep their exact signatures. The comptroller is untouched and reused.

## 2. Goals

- Sender creates many streams (mixed linear / tranched / recurring, one token) in a single signed transaction.
- "Every month for 12 months" is expressible without hand-building 12 tranches and is recognisable as *recurring* by the indexer and UI.
- No change to the security model: single `sender.require_auth()`, no nested auth trees, no new admin powers, no new contract.
- Existing 73 tests keep passing; every new path is covered by in-process `Env` tests and a testnet smoke run that produces tx hashes (SOW evidence).

## 3. Non-Goals (this sub-project)

- Batch / recurring **create UI** in the frontend → sub-project 3.
- Search, filtering, history, templates → sub-projects 2–3.
- Treasury hook on the lockup → sub-project 4 (note: that will likely require one more lockup redeploy; accepted).
- Auto-renewing / pull-per-period streams (Sablier *Flow* model), sender-sponsored fees, approve-spender withdraws, `#[contractevent]` migration, raising `MAX_TRANCHES`.
- Per-row tokens in a batch (one token per `create_batch` call; callers split by token).

## 4. Decision: extend `lockup` (not a periphery contract)

Two approaches were weighed once a testnet redeploy was accepted as acceptable:

| | A — periphery `batch` contract | **B — extend `lockup` (chosen)** |
|---|---|---|
| Token transfers per batch | N (one per nested create) | **1** (sum, then single `transfer`) |
| Auth | nested tree: batch → lockup → SAC, N sub-invocations | **flat**: one `require_auth` on the sender |
| Recurring representation | generated tranches, capped at `MAX_TRANCHES = 100` | **native shape**, no cap, 4 fields, O(1) math |
| Multisig / custom-account senders | must sign a deep auth tree | same as today |
| Lockup redeploy | not needed | **needed** (new testnet address) |
| New build/deploy steps | third wasm, build order, extra binding package | none |

B is simpler, cheaper per stream, and safer for the foundation/multisig senders the protocol targets. "Immutable lockup" means *not upgradeable*; redeploying a new instance pre-mainnet does not violate it.

## 5. Data Model (`contracts/shared/src/types.rs`)

```rust
#[contracttype]
pub struct RecurringShape {
    pub first_ts: u64,          // timestamp of the first unlock == stream.start_ts
    pub period_secs: u64,       // > 0
    pub count: u32,             // >= 1 ; stream.end_ts = first_ts + (count - 1) * period_secs
    pub amount_per_period: i128 // > 0 ; stream.deposited = amount_per_period * count
}

#[contracttype]
pub enum StreamShape {
    Linear(LinearShape),
    Tranched(TranchedShape),
    Recurring(RecurringShape),  // NEW — appended, existing variant order unchanged
}

// ---- create parameters (used by create_batch; the single-create fns keep flat args) ----

#[contracttype]
pub struct LinearParams {
    pub deposited: i128,
    pub start_ts: u64,
    pub cliff_ts: u64,
    pub end_ts: u64,
    pub unlock_at_start: i128,
    pub unlock_at_cliff: i128,
}

#[contracttype]
pub struct TranchedParams {
    pub tranches: Vec<Tranche>,
}

#[contracttype]
pub struct RecurringParams {
    pub amount_per_period: i128,
    pub period_secs: u64,
    pub count: u32,
    pub first_ts: u64,
}

#[contracttype]
pub enum CreateSpec {
    Linear(LinearParams),
    Tranched(TranchedParams),
    Recurring(RecurringParams),
}

#[contracttype]
pub struct CreateRow {
    pub recipient: Address,
    pub spec: CreateSpec,
    pub is_cancelable: bool,
    pub is_transferable: bool,
}

pub const MAX_BATCH_ROWS: u32 = 100;
```

`Stream` itself is unchanged. `Stream::status` keeps working for Recurring because it only reads `start_ts` / `end_ts` / flags. `count == 1` yields `start_ts == end_ts`, which mirrors a single-tranche Tranched stream (Settled at `first_ts`).

## 6. Streamed-Amount Semantics — Recurring (`contracts/shared/src/math.rs`)

Let `F = first_ts`, `P = period_secs`, `N = count`, `A = amount_per_period`, `t = now`.

```
if t < F:   streamed = 0
else:       k        = min(N, (t - F) / P + 1)      // integer division floors
            streamed = A * k
```

- `k` is computed in `u64` with `saturating_add(1)` then clamped to `N`; the multiply is checked (`math::mul`).
- Properties: monotonic non-decreasing in `t`; `streamed(F) = A`; `streamed(end_ts) = streamed(∞) = A·N = deposited`; identical to a Tranched stream with `N` equal tranches at `F, F+P, …`.
- `withdrawable`, `cancel` refund (`deposited − streamed`) and `is_depleted` logic are shape-agnostic and unchanged.

The dispatcher `streamed_amount(&Stream, now)` gains a `Recurring` arm.

## 7. Contract Interface (`contracts/lockup`)

### 7.1 New entry points

```rust
/// Recurring stream: `count` unlocks of `amount_per_period`, the first at `first_ts`,
/// then every `period_secs`. Deposit = amount_per_period * count, pulled from `sender`.
pub fn create_recurring(
    env: Env,
    sender: Address,
    recipient: Address,
    token: Address,
    amount_per_period: i128,
    period_secs: u64,
    count: u32,
    first_ts: u64,
    is_cancelable: bool,
    is_transferable: bool,
) -> u32;

/// Create 1..=MAX_BATCH_ROWS streams of mixed shapes for one sender and one token
/// in a single transaction. Atomic: any invalid row reverts the whole call.
/// Returns the new stream ids in row order (they are consecutive).
pub fn create_batch(env: Env, sender: Address, token: Address, rows: Vec<CreateRow>) -> Vec<u32>;
```

`create_linear` and `create_tranched` keep their current signatures and behaviour.

### 7.2 Validation rules

| Shape | Rule | Error |
|---|---|---|
| all | `recipient` any address; flags free | — |
| Linear | as today (`deposited > 0`, `start < end`, `start ≤ cliff ≤ end`, unlocks ≥ 0 and ≤ deposit, `start ≥ now`) | 10–13, 18 |
| Tranched | as today (non-empty, ≤ `MAX_TRANCHES`, strictly ascending, amounts > 0, first ts ≥ now) | 10, 14–18 |
| Recurring | `amount_per_period > 0` | `ZeroDeposit` (10) |
| Recurring | `period_secs > 0` | `InvalidPeriod` (21) |
| Recurring | `count >= 1` | `InvalidCount` (22) |
| Recurring | `first_ts >= now` | `StartInPast` (18) |
| Recurring | `amount * count` and `first_ts + (count-1)*period` must not overflow | `Overflow` (90) |
| Batch | `rows.len() >= 1` | `EmptyBatch` (19) |
| Batch | `rows.len() <= MAX_BATCH_ROWS` | `BatchTooLarge` (20) |
| Batch | sum of row deposits must not overflow | `Overflow` (90) |

New `Error` variants (appended to the create-time block; existing discriminants untouched):

```rust
EmptyBatch = 19,
BatchTooLarge = 20,
InvalidPeriod = 21,
InvalidCount = 22,
```

### 7.3 Internal structure (`create.rs` refactor)

```
build_stream(env, sender, token, recipient, spec, cancelable, transferable) -> Stream
    // pure: validates, derives start_ts / end_ts / deposited, returns the record.
    // NO storage writes, NO transfers, NO events.

persist(env, stream) -> u32
    // next_id → save_stream → nft::mint(recipient, id) → events::stream_created

create_linear / create_tranched / create_recurring:
    sender.require_auth()
    let s = build_stream(...)                      // validate
    token.transfer(sender → contract, s.deposited) // pull
    persist(s)

create_batch:
    sender.require_auth()
    check 1..=MAX_BATCH_ROWS
    streams = rows.map(build_stream)               // validate EVERY row before any side effect
    total   = checked sum of streams[i].deposited
    token.transfer(sender → contract, total)       // exactly one transfer
    ids     = streams.map(persist)                 // ids are consecutive
    ids
```

Soroban executes a contract invocation atomically, so a panic in any row (validation, overflow, transfer failure, mint failure) discards all state changes and the transfer.

### 7.4 Practical batch size

`MAX_BATCH_ROWS = 100` is a sanity cap for a clear error. The real bound is the per-transaction resource budget (instructions, ledger-entry writes, write bytes): each row writes one `Stream` entry plus NFT bookkeeping entries. The testnet smoke run records the largest batch that fits; the SDK/frontend (sub-project 3) chunks at that size. This spec does not hard-code it.

## 8. Events

No new event types. `create_batch` emits the existing per-stream event for every row:

| Topics | Data |
|---|---|
| `("stream", "created", stream_id, sender)` | `(recipient, token, deposited)` |

Batch membership is recoverable off-chain: every stream in a batch shares `created_tx`, which the indexer already stores. `create_recurring` also emits the standard `created` event; the shape is read back via `get_stream` (as the indexer does today).

## 9. Downstream Touches (kept minimal — enough that the deployed stack does not break)

| Component | Change |
|---|---|
| `sdk/` | `npm run regen` regenerates bindings from the new wasm; `CreateRow`, `CreateSpec`, `RecurringShape` etc. appear automatically. Version bump `0.1.0 → 0.2.0`. |
| `frontend/scripts/indexer.ts` | `fetchStreamFromChain` maps the `Recurring` shape → `model: 'Recurring'`, `first_ts`, `period_secs`, `count`, `amount_per_period`. |
| `frontend/src/lib/db.ts` | `StreamDoc.model` union adds `'Recurring'`; the four optional fields above. |
| `frontend/src/app/stream/[id]/page.tsx` | `shapeLabel` returns `'RECURRING'`; a helper `recurringToTranches(shape): Tranche[]` feeds the existing tranched code paths (timeline, emission chart, spec panel) so a Recurring stream renders instead of crashing. No create UI. |
| `frontend/src/app/dashboard/page.tsx` | model label handles `'Recurring'` (one-line). |
| `deployments/testnet.json` | new `lockup` id, `deployed_at`; all other keys preserved. |
| `docker-compose.yml` | `MONGODB_DB: hourglass_v2` — fresh index for the new contract (see §10). |
| `README.md`, `contract-technical-reference.md` | new entry points, Recurring math, error codes, new testnet address. |

## 10. Deployment Plan

1. `scripts/build.sh` — unchanged (comptroller → lockup).
2. `scripts/deploy-testnet.sh` — new behaviour: if `deployments/testnet.json` already has a `comptroller` and `REUSE_COMPTROLLER` is not `0`, skip the comptroller deploy and reuse it. Deploy only the lockup. Write `testnet.json` by **merging** into the existing file with `jq` (today the heredoc overwrite drops `hgt_*` / `usdc_*` keys).
3. `scripts/smoke-testnet.sh` — extend: `create_recurring` (e.g. 3 × 1 XLM every 60 s) → `create_batch` with three rows (linear, recurring, tranched) → assert ids are consecutive → wait one period → `withdraw_max` on the recurring stream → print tx hashes. Exit non-zero on any mismatch.
4. `sdk`: `npm run regen && npm run build`.
5. Indexer DB reset: because `streams._id == stream_id`, ids from the old contract instance collide with the new one. Point the indexer and API at a fresh database (`hourglass_v2`). Old testnet data is disposable.
6. Push to `main` → Dokploy rebuilds frontend + indexer with the new `deployment.json` baked in. Verify `/dashboard` and `/stream/<id>` for the smoke-created streams.

Rollback: the old lockup instance keeps running on-chain; restoring `deployments/testnet.json` and `MONGODB_DB` from git returns the app to it.

## 11. Testing

All in-process via `soroban_sdk::Env` unless stated. TDD: each test lands before the code that makes it pass.

**`contracts/shared` (unit)**
- `streamed_amount_recurring`: before `F` → 0; at `F` → `A`; mid-period → unchanged until boundary; at `F + (N-1)P` → `A·N`; far future → `A·N`; `count == 1`; monotonic sweep; `A·N` overflow → `Overflow`.
- Dispatcher: Recurring arm; `withdrawable_amount` subtracts `withdrawn`.
- `Stream::status` for a Recurring record (Pending / Streaming / Settled).

**`contracts/lockup/src/tests/recurring.rs`**
- Happy path: derived `start_ts`, `end_ts`, `deposited`; token balances (sender −A·N, contract +A·N); NFT minted to recipient; one `created` event.
- Errors: `ZeroDeposit`, `InvalidPeriod`, `InvalidCount`, `StartInPast`, `Overflow` (huge `amount × count`, and `first_ts + (count-1)·period` overflow).
- Lifecycle: after `k` periods `withdraw_max` pays `A·k`; `cancel` mid-way refunds `deposited − A·k`, recipient balance stays withdrawable; renounce; burn after depletion.

**`contracts/lockup/src/tests/batch.rs`**
- Mixed batch (linear + recurring + tranched): returned ids are consecutive and equal `[next, next+1, next+2]`; every `get_stream` matches its row; each recipient owns its NFT; sender balance decreases by the total exactly once; contract balance increases by the total; three `created` events.
- Atomicity: third row invalid (e.g. `StartInPast`) → the call panics with that error, `NextStreamId` unchanged, no `Stream` entries, balances unchanged, `total_supply` unchanged.
- `EmptyBatch` on `[]`; `BatchTooLarge` on 101 rows; `Overflow` when deposits sum past `i128::MAX`.
- Single-row batch equals the corresponding single create (same stored record).

**`contracts/lockup/src/tests/invariants.rs`** — extend the existing conservation / monotonicity checks to Recurring streams.

**Regression** — the existing 73 tests pass unchanged after the `create.rs` refactor.

**Testnet smoke** — `scripts/smoke-testnet.sh` as in §10 step 3; its output (tx hashes, stream ids) is attached to the SOW evidence.

## 12. Risks & Notes

- **Redeploy orphans testnet streams.** Accepted by the product owner. Communicate to beta testers; the old contract stays live for anyone who wants to withdraw from old streams via CLI/Stellar Expert.
- **Resource budget per batch** is empirical; the contract cap (100) will exceed what fits in one tx for tranched rows with many tranches. The SDK/frontend chunk size (sub-project 3) comes from the smoke run.
- **Enum ordering.** `Recurring` is appended to `StreamShape`; `Error` discriminants are only appended. Existing bindings that pattern-match on `Linear | Tranched` must add a third arm (done in §9).
- **Sub-project 4 (treasury)** may need another lockup change. Pre-mainnet that is acceptable; do not pre-build a hook here.

## 13. References

- SOW: Stellar Instaward — Vestellar, Deliverable 2 (batch stream creation, recurring vesting streams).
- Sablier *BatchLockup* periphery (public docs) — semantics mirrored: one sender, one token, atomic, ids returned.
- Parent spec §7 (streamed-amount semantics), §8 (lifecycle), §11 (events), §14.6 (multisig senders).
