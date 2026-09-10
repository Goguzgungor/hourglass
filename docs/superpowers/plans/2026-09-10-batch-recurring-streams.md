# Batch Creation + Recurring Streams (Lockup v0.2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native `Recurring` stream shape and an atomic `create_batch` entry point to the `lockup` contract, redeploy it to Stellar testnet (reusing the existing comptroller), regenerate the SDK, and keep the deployed indexer + frontend working with the new shape.

**Architecture:** `contracts/shared` gains the `RecurringShape` variant, its O(1) streamed-amount math, and the `CreateSpec` / `CreateRow` request types. `contracts/lockup/src/create.rs` is refactored into a pure `build_stream` (validate + derive) and a side-effecting `persist` (id, save, mint, event); the three single-create entry points and `create_batch` all use them. Batch = validate every row → one token transfer of the sum → persist rows in order. No new events. Downstream: SDK bindings regenerated, indexer/db map the new shape, stream page renders Recurring through the existing tranched view path.

**Tech Stack:** Rust stable (1.95), `soroban-sdk = "=25.3.1"`, `stellar-tokens = "=0.7.1"`, `stellar-cli` 26.0.0, `jq` 1.7, Node 22 / TypeScript 5 (SDK + Next.js 16 frontend), MongoDB 7.

**Spec:** `docs/superpowers/specs/2026-09-10-batch-recurring-streams-design.md`

## Global Constraints

- `soroban-sdk = "=25.3.1"`, `stellar-tokens = "=0.7.1"` — do not change (workspace `Cargo.toml`).
- `StreamShape::Recurring` is **appended** after `Tranched`; existing variant order unchanged.
- New `Error` discriminants are exactly `EmptyBatch = 19`, `BatchTooLarge = 20`, `InvalidPeriod = 21`, `InvalidCount = 22`; existing discriminants unchanged.
- `create_linear` and `create_tranched` keep their exact current signatures and argument order.
- `pub const MAX_BATCH_ROWS: u32 = 100;` in `contracts/shared/src/types.rs`.
- One token transfer per `create_batch` call; all rows validated before that transfer.
- No new event types: every created stream emits the existing `("stream","created", id, sender)` event.
- Comptroller is **reused** on testnet (`REUSE_COMPTROLLER` defaults on); only the lockup is redeployed.
- Indexer database name becomes `hourglass_v2` in `docker-compose.yml` (both `frontend` and `indexer` services).
- Build order: comptroller wasm before lockup (`scripts/build.sh` enforces; `cargo test` needs `target/wasm32v1-none/release/hourglass_comptroller.wasm` present — run `cargo build --target wasm32v1-none --release -p hourglass-comptroller` once if it is missing).
- Commit messages follow Conventional Commits with scopes `shared`, `lockup`, `sdk`, `frontend`, `deploy`, `docs`; append the session's attribution trailer.
- Run every `cargo` command from the repo root `/Users/midex/Documents/hourglass`.

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `contracts/shared/src/types.rs` | `RecurringShape`, `StreamShape::Recurring`, `LinearParams`, `TranchedParams`, `RecurringParams`, `CreateSpec`, `CreateRow`, `MAX_BATCH_ROWS` | modify |
| `contracts/shared/src/errors.rs` | four new `Error` variants (19–22) | modify |
| `contracts/shared/src/math.rs` | `streamed_amount_recurring` + dispatcher arm + tests | modify |
| `contracts/shared/src/lib.rs` | re-exports of the new types | modify |
| `contracts/lockup/src/create.rs` | `build_stream`, `persist`, `pull_deposit`; `create_linear`, `create_tranched`, `create_recurring`, `create_batch` | rewrite |
| `contracts/lockup/src/tests/recurring.rs` | recurring create/lifecycle tests | create |
| `contracts/lockup/src/tests/batch.rs` | batch tests (mixed rows, atomicity, limits) | create |
| `contracts/lockup/src/tests/invariants.rs` | monotonicity for Recurring, conservation across a batch | modify |
| `contracts/lockup/src/tests/mod.rs` | register the two new test modules | modify |
| `Cargo.toml`, `sdk/package.json` | version `0.2.0` | modify |
| `sdk/src/generated/**` | regenerated bindings (tracked) | regenerate |
| `frontend/src/lib/db.ts` | `StreamDoc` gains `'Recurring'` model + 4 fields | modify |
| `frontend/scripts/indexer.ts` | map the Recurring shape from `get_stream` | modify |
| `frontend/src/app/stream/[id]/page.tsx` | `shapeLabel`, `viewShape` helper, Recurring rendering via tranched path | modify |
| `frontend/src/app/dashboard/page.tsx` | model badge + amount line for Recurring | modify |
| `scripts/deploy-testnet.sh` | reuse comptroller, jq-merge `deployments/testnet.json` | rewrite |
| `scripts/smoke-testnet.sh` | add recurring + batch flow, log tx hashes | rewrite |
| `deployments/testnet.json` | new lockup id (written by the deploy script) | regenerate |
| `docker-compose.yml` | `MONGODB_DB: hourglass_v2` | modify |
| `README.md`, `contract-technical-reference.md` | v0.2 docs | modify |

---

### Task 1: Shared crate — `RecurringShape`, errors, and streamed-amount math

**Files:**
- Modify: `contracts/shared/src/types.rs`
- Modify: `contracts/shared/src/errors.rs`
- Modify: `contracts/shared/src/math.rs`
- Modify: `contracts/shared/src/lib.rs`

**Interfaces:**
- Produces: `RecurringShape { first_ts: u64, period_secs: u64, count: u32, amount_per_period: i128 }`, `StreamShape::Recurring(RecurringShape)`, `Error::{EmptyBatch, BatchTooLarge, InvalidPeriod, InvalidCount}`, `math::streamed_amount_recurring(amount_per_period: i128, first_ts: u64, period_secs: u64, count: u32, now: u64) -> Result<i128, Error>`.

- [ ] **Step 1: Write the failing math tests**

Append to the end of `contracts/shared/src/math.rs`:

```rust
#[cfg(test)]
mod recurring_tests {
    use super::*;

    const A: i128 = 1_000; // amount per period
    const F: u64 = 1_000; // first unlock
    const P: u64 = 100; // period
    const N: u32 = 12; // count → last unlock at F + 11*P = 2_100

    #[test]
    fn zero_before_first_unlock() {
        assert_eq!(streamed_amount_recurring(A, F, P, N, 999).unwrap(), 0);
    }

    #[test]
    fn one_period_at_first_ts() {
        assert_eq!(streamed_amount_recurring(A, F, P, N, 1_000).unwrap(), A);
    }

    #[test]
    fn flat_until_next_boundary_then_steps() {
        assert_eq!(streamed_amount_recurring(A, F, P, N, 1_099).unwrap(), A);
        assert_eq!(streamed_amount_recurring(A, F, P, N, 1_100).unwrap(), 2 * A);
        assert_eq!(streamed_amount_recurring(A, F, P, N, 1_250).unwrap(), 3 * A);
    }

    #[test]
    fn full_at_last_unlock() {
        assert_eq!(
            streamed_amount_recurring(A, F, P, N, 2_100).unwrap(),
            A * N as i128
        );
    }

    #[test]
    fn full_far_after_last_unlock() {
        assert_eq!(
            streamed_amount_recurring(A, F, P, N, 99_999).unwrap(),
            A * N as i128
        );
    }

    #[test]
    fn single_period_is_full_at_first_ts() {
        assert_eq!(streamed_amount_recurring(A, F, P, 1, F).unwrap(), A);
        assert_eq!(streamed_amount_recurring(A, F, P, 1, F + 10 * P).unwrap(), A);
    }

    #[test]
    fn zero_period_is_error_once_started() {
        assert!(matches!(
            streamed_amount_recurring(A, F, 0, N, F),
            Err(Error::InvalidPeriod)
        ));
    }

    #[test]
    fn overflow_on_huge_amount() {
        assert!(matches!(
            streamed_amount_recurring(i128::MAX, F, P, 2, F + P),
            Err(Error::Overflow)
        ));
    }

    #[test]
    fn monotonic_non_decreasing() {
        let mut prev = 0i128;
        for t in (0..3_000u64).step_by(7) {
            let cur = streamed_amount_recurring(A, F, P, N, t).unwrap();
            assert!(cur >= prev, "decreased at t={}: prev={}, cur={}", t, prev, cur);
            prev = cur;
        }
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail to compile**

Run: `cargo test -p hourglass-shared recurring_tests`
Expected: compile error `cannot find function `streamed_amount_recurring`` and `no variant named `InvalidPeriod``.

- [ ] **Step 3: Add the error variants**

In `contracts/shared/src/errors.rs`, directly after the line `StartInPast = 18,` insert:

```rust
    /// Batch must contain at least one row.
    EmptyBatch = 19,
    /// Batch row count exceeds `MAX_BATCH_ROWS`.
    BatchTooLarge = 20,
    /// `period_secs` must be > 0.
    InvalidPeriod = 21,
    /// `count` must be >= 1.
    InvalidCount = 22,
```

- [ ] **Step 4: Add the shape type and enum variant**

In `contracts/shared/src/types.rs`, directly after the `TranchedShape` struct insert:

```rust
/// N equal unlocks of `amount_per_period`, the first at `first_ts`, then every
/// `period_secs`. `stream.start_ts == first_ts`,
/// `stream.end_ts == first_ts + (count - 1) * period_secs`,
/// `stream.deposited == amount_per_period * count`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RecurringShape {
    pub first_ts: u64,
    pub period_secs: u64,
    pub count: u32,
    pub amount_per_period: i128,
}
```

and change the `StreamShape` enum to:

```rust
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StreamShape {
    Linear(LinearShape),
    Tranched(TranchedShape),
    Recurring(RecurringShape),
}
```

- [ ] **Step 5: Add the math function and dispatcher arm**

In `contracts/shared/src/math.rs`, directly before the line `/// Dispatcher: pulls the right shape branch and computes streamed amount.` insert:

```rust
/// Cumulative streamed amount for a Recurring stream: `count` equal unlocks of
/// `amount_per_period`, the first at `first_ts`, then every `period_secs`.
///
///   - before first_ts → 0
///   - otherwise       → amount_per_period * min(count, (now - first_ts) / period_secs + 1)
pub fn streamed_amount_recurring(
    amount_per_period: i128,
    first_ts: u64,
    period_secs: u64,
    count: u32,
    now: u64,
) -> Result<i128, Error> {
    if now < first_ts {
        return Ok(0);
    }
    if period_secs == 0 {
        return Err(Error::InvalidPeriod);
    }
    let elapsed_periods = (now - first_ts) / period_secs;
    let unlocked = elapsed_periods.saturating_add(1).min(count as u64);
    mul(amount_per_period, unlocked as i128)
}
```

Then in `streamed_amount(stream, now)` add the third match arm after the `Tranched` arm:

```rust
        StreamShape::Recurring(r) => streamed_amount_recurring(
            r.amount_per_period,
            r.first_ts,
            r.period_secs,
            r.count,
            now,
        ),
```

- [ ] **Step 6: Re-export the new type**

In `contracts/shared/src/lib.rs` change the `pub use types::{...}` line to:

```rust
pub use types::{
    LinearShape, OpKind, RecurringShape, Stream, StreamShape, StreamStatus, Tranche,
    TranchedShape, MAX_TRANCHES,
};
```

- [ ] **Step 7: Run the shared tests**

Run: `cargo test -p hourglass-shared`
Expected: all pass, including the 9 new `recurring_tests`.

- [ ] **Step 8: Add a status + dispatcher test for a Recurring record**

In `contracts/shared/src/types.rs`, inside the existing `mod tests` block, append:

```rust
    #[test]
    fn status_for_recurring_uses_start_and_end() {
        let env = Env::default();
        let mut s = stream(&env);
        s.start_ts = 1_000;
        s.end_ts = 1_000 + 11 * 100;
        s.deposited = 12_000;
        s.shape = StreamShape::Recurring(RecurringShape {
            first_ts: 1_000,
            period_secs: 100,
            count: 12,
            amount_per_period: 1_000,
        });
        assert_eq!(s.status(999), StreamStatus::Pending);
        assert_eq!(s.status(1_000), StreamStatus::Streaming);
        assert_eq!(s.status(2_099), StreamStatus::Streaming);
        assert_eq!(s.status(2_100), StreamStatus::Settled);
        // withdrawable goes through the dispatcher
        assert_eq!(s.withdrawable(1_250), 3_000);
    }
```

Run: `cargo test -p hourglass-shared`
Expected: all pass.

- [ ] **Step 9: Make sure the lockup crate still compiles and passes (it matches on `StreamShape` nowhere outside `math`, so it should)**

Run: `cargo build --target wasm32v1-none --release -p hourglass-comptroller && cargo test --workspace`
Expected: all existing tests pass (73 before this task + the 10 new shared tests).

- [ ] **Step 10: Commit**

```bash
git add contracts/shared
git commit -m "feat(shared): add Recurring stream shape, math, and batch error variants"
```

---

### Task 2: Lockup — batch request types and `create.rs` refactor (no behaviour change)

**Files:**
- Modify: `contracts/shared/src/types.rs`
- Modify: `contracts/shared/src/lib.rs`
- Rewrite: `contracts/lockup/src/create.rs`

**Interfaces:**
- Consumes: `RecurringShape`, `Error` variants from Task 1.
- Produces (shared): `LinearParams`, `TranchedParams`, `RecurringParams`, `CreateSpec::{Linear, Tranched, Recurring}`, `CreateRow { recipient, spec, is_cancelable, is_transferable }`, `MAX_BATCH_ROWS`.
- Produces (lockup, crate-private): `build_stream(env: &Env, sender: &Address, token: &Address, recipient: &Address, spec: &CreateSpec, is_cancelable: bool, is_transferable: bool) -> Stream`, `persist(env: &Env, stream: &Stream) -> u32`, `pull_deposit(env: &Env, token: &Address, sender: &Address, amount: i128)`.

- [ ] **Step 1: Add the request types**

In `contracts/shared/src/types.rs`, directly after `pub const MAX_TRANCHES: u32 = 100;` insert:

```rust
/// Maximum rows accepted by `create_batch`. A sanity cap that yields a clear
/// error; the real bound is the per-transaction resource budget.
pub const MAX_BATCH_ROWS: u32 = 100;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LinearParams {
    pub deposited: i128,
    pub start_ts: u64,
    pub cliff_ts: u64,
    pub end_ts: u64,
    pub unlock_at_start: i128,
    pub unlock_at_cliff: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TranchedParams {
    pub tranches: Vec<Tranche>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RecurringParams {
    pub amount_per_period: i128,
    pub period_secs: u64,
    pub count: u32,
    pub first_ts: u64,
}

/// Shape-specific create parameters (no recipient / flags).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CreateSpec {
    Linear(LinearParams),
    Tranched(TranchedParams),
    Recurring(RecurringParams),
}

/// One row of a `create_batch` call.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CreateRow {
    pub recipient: Address,
    pub spec: CreateSpec,
    pub is_cancelable: bool,
    pub is_transferable: bool,
}
```

In `contracts/shared/src/lib.rs` change the `pub use types::{...}` to:

```rust
pub use types::{
    CreateRow, CreateSpec, LinearParams, LinearShape, OpKind, RecurringParams, RecurringShape,
    Stream, StreamShape, StreamStatus, Tranche, TranchedParams, TranchedShape, MAX_BATCH_ROWS,
    MAX_TRANCHES,
};
```

- [ ] **Step 2: Rewrite `contracts/lockup/src/create.rs`**

Replace the whole file with:

```rust
use crate::{events, next_id, nft, save_stream, Lockup, LockupArgs, LockupClient};
use hourglass_shared::{
    CreateSpec, Error, LinearParams, LinearShape, RecurringParams, RecurringShape, Stream,
    StreamShape, Tranche, TranchedParams, TranchedShape, MAX_TRANCHES,
};
use soroban_sdk::{contractimpl, panic_with_error, token, Address, Env, Vec};

// ------------------------------------------------------------------------
// Pure helpers (no storage, no transfers, no events)
// ------------------------------------------------------------------------

/// Validate a create request and build the `Stream` record. Panics with the
/// matching `Error` on invalid input. Pure: safe to call for every row of a
/// batch before any state is touched.
pub(crate) fn build_stream(
    env: &Env,
    sender: &Address,
    token: &Address,
    recipient: &Address,
    spec: &CreateSpec,
    is_cancelable: bool,
    is_transferable: bool,
) -> Stream {
    let now = env.ledger().timestamp();
    let (start_ts, end_ts, deposited, shape) = match spec {
        CreateSpec::Linear(p) => validate_linear(env, p, now),
        CreateSpec::Tranched(p) => validate_tranched(env, p, now),
        CreateSpec::Recurring(p) => validate_recurring(env, p, now),
    };
    Stream {
        sender: sender.clone(),
        recipient: recipient.clone(),
        token: token.clone(),
        start_ts,
        end_ts,
        is_cancelable,
        is_transferable,
        was_canceled: false,
        is_depleted: false,
        deposited,
        withdrawn: 0,
        refunded: 0,
        shape,
    }
}

/// Returns `(start_ts, end_ts, deposited, shape)`.
fn validate_linear(env: &Env, p: &LinearParams, now: u64) -> (u64, u64, i128, StreamShape) {
    if p.deposited <= 0 {
        panic_with_error!(env, Error::ZeroDeposit);
    }
    if !(p.start_ts < p.end_ts) {
        panic_with_error!(env, Error::StartAfterEnd);
    }
    if !(p.start_ts <= p.cliff_ts && p.cliff_ts <= p.end_ts) {
        panic_with_error!(env, Error::CliffOutOfRange);
    }
    if p.unlock_at_start < 0 || p.unlock_at_cliff < 0 {
        panic_with_error!(env, Error::UnlocksExceedDeposit);
    }
    let unlock_sum = p
        .unlock_at_start
        .checked_add(p.unlock_at_cliff)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    if unlock_sum > p.deposited {
        panic_with_error!(env, Error::UnlocksExceedDeposit);
    }
    if p.start_ts < now {
        panic_with_error!(env, Error::StartInPast);
    }
    (
        p.start_ts,
        p.end_ts,
        p.deposited,
        StreamShape::Linear(LinearShape {
            cliff_ts: p.cliff_ts,
            unlock_at_start: p.unlock_at_start,
            unlock_at_cliff: p.unlock_at_cliff,
        }),
    )
}

/// Returns `(start_ts, end_ts, deposited, shape)`.
fn validate_tranched(env: &Env, p: &TranchedParams, now: u64) -> (u64, u64, i128, StreamShape) {
    let tranches: &Vec<Tranche> = &p.tranches;
    if tranches.is_empty() {
        panic_with_error!(env, Error::NoTranches);
    }
    if tranches.len() > MAX_TRANCHES {
        panic_with_error!(env, Error::TooManyTranches);
    }
    let mut last_ts: u64 = 0;
    let mut sum: i128 = 0;
    for (i, t) in tranches.iter().enumerate() {
        if t.amount <= 0 {
            panic_with_error!(env, Error::ZeroDeposit);
        }
        if i > 0 && t.ts <= last_ts {
            panic_with_error!(env, Error::TranchesNotAscending);
        }
        last_ts = t.ts;
        sum = sum
            .checked_add(t.amount)
            .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    }
    let start_ts = tranches.first().unwrap().ts;
    let end_ts = tranches.last().unwrap().ts;
    if start_ts < now {
        panic_with_error!(env, Error::StartInPast);
    }
    (
        start_ts,
        end_ts,
        sum,
        StreamShape::Tranched(TranchedShape {
            tranches: tranches.clone(),
        }),
    )
}

/// Returns `(start_ts, end_ts, deposited, shape)`.
fn validate_recurring(
    env: &Env,
    p: &RecurringParams,
    now: u64,
) -> (u64, u64, i128, StreamShape) {
    if p.amount_per_period <= 0 {
        panic_with_error!(env, Error::ZeroDeposit);
    }
    if p.period_secs == 0 {
        panic_with_error!(env, Error::InvalidPeriod);
    }
    if p.count == 0 {
        panic_with_error!(env, Error::InvalidCount);
    }
    if p.first_ts < now {
        panic_with_error!(env, Error::StartInPast);
    }
    let deposited = p
        .amount_per_period
        .checked_mul(p.count as i128)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    let span = ((p.count - 1) as u64)
        .checked_mul(p.period_secs)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    let end_ts = p
        .first_ts
        .checked_add(span)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    (
        p.first_ts,
        end_ts,
        deposited,
        StreamShape::Recurring(RecurringShape {
            first_ts: p.first_ts,
            period_secs: p.period_secs,
            count: p.count,
            amount_per_period: p.amount_per_period,
        }),
    )
}

// ------------------------------------------------------------------------
// Side-effecting helpers
// ------------------------------------------------------------------------

/// Pull `amount` of `token` from `sender` into this contract.
pub(crate) fn pull_deposit(env: &Env, token: &Address, sender: &Address, amount: i128) {
    let client = token::Client::new(env, token);
    client.transfer(sender, &env.current_contract_address(), &amount);
}

/// Allocate an id, persist the record, mint the NFT receipt to the recipient
/// and emit `created`. Returns the new stream id.
pub(crate) fn persist(env: &Env, stream: &Stream) -> u32 {
    let id = next_id(env);
    save_stream(env, id, stream);
    nft::mint(env, &stream.recipient, id);
    events::stream_created(env, id, stream);
    id
}

// ------------------------------------------------------------------------
// Entry points
// ------------------------------------------------------------------------

#[contractimpl]
impl Lockup {
    pub fn create_linear(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        deposited: i128,
        start_ts: u64,
        cliff_ts: u64,
        end_ts: u64,
        unlock_at_start: i128,
        unlock_at_cliff: i128,
        is_cancelable: bool,
        is_transferable: bool,
    ) -> u32 {
        sender.require_auth();
        let spec = CreateSpec::Linear(LinearParams {
            deposited,
            start_ts,
            cliff_ts,
            end_ts,
            unlock_at_start,
            unlock_at_cliff,
        });
        let stream = build_stream(
            &env,
            &sender,
            &token,
            &recipient,
            &spec,
            is_cancelable,
            is_transferable,
        );
        pull_deposit(&env, &token, &sender, stream.deposited);
        persist(&env, &stream)
    }
}

#[contractimpl]
impl Lockup {
    pub fn create_tranched(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        tranches: Vec<Tranche>,
        is_cancelable: bool,
        is_transferable: bool,
    ) -> u32 {
        sender.require_auth();
        let spec = CreateSpec::Tranched(TranchedParams { tranches });
        let stream = build_stream(
            &env,
            &sender,
            &token,
            &recipient,
            &spec,
            is_cancelable,
            is_transferable,
        );
        pull_deposit(&env, &token, &sender, stream.deposited);
        persist(&env, &stream)
    }
}
```

- [ ] **Step 3: Run the full suite — behaviour must be unchanged**

Run: `cargo test --workspace`
Expected: every existing test passes (same count as after Task 1). If a linear/tranched test fails, the validation order in `validate_linear` / `validate_tranched` differs from the original — compare against `git show HEAD:contracts/lockup/src/create.rs`.

- [ ] **Step 4: Format and lint**

Run: `cargo fmt --all && cargo clippy --workspace --all-targets`
Expected: fmt makes no further changes on a second run; clippy prints no *new* warnings for `create.rs`.

- [ ] **Step 5: Commit**

```bash
git add contracts/shared contracts/lockup/src/create.rs
git commit -m "refactor(lockup): split create into build_stream + persist; add CreateSpec/CreateRow types"
```

---

### Task 3: Lockup — `create_recurring` entry point

**Files:**
- Modify: `contracts/lockup/src/create.rs`
- Create: `contracts/lockup/src/tests/recurring.rs`
- Modify: `contracts/lockup/src/tests/mod.rs`
- Modify: `contracts/lockup/src/tests/invariants.rs`

**Interfaces:**
- Consumes: `build_stream`, `pull_deposit`, `persist` (Task 2); `RecurringParams`, `CreateSpec` (Task 2); `Error::{InvalidPeriod, InvalidCount}` (Task 1).
- Produces: contract entry `create_recurring(sender: Address, recipient: Address, token: Address, amount_per_period: i128, period_secs: u64, count: u32, first_ts: u64, is_cancelable: bool, is_transferable: bool) -> u32` (client methods `create_recurring` / `try_create_recurring`).

- [ ] **Step 1: Register the test module**

In `contracts/lockup/src/tests/mod.rs` add `mod recurring;` after `mod linear;` (keep alphabetical order):

```rust
#![cfg(test)]

mod batch;
mod burn;
mod cancel;
mod common;
mod invariants;
mod linear;
mod recurring;
mod tranched;
mod transfer;
mod withdraw;
```

(`mod batch;` is declared now too; create an empty placeholder file `contracts/lockup/src/tests/batch.rs` containing only the comment `// Filled in Task 4.` so the crate compiles. Task 4 replaces it.)

- [ ] **Step 2: Write the failing recurring tests**

Create `contracts/lockup/src/tests/recurring.rs`:

```rust
use super::common::{setup, Fixture};
use hourglass_shared::{Error, RecurringShape, StreamShape, StreamStatus};
use soroban_sdk::testutils::Ledger as _;

const AMOUNT: i128 = 1_000;
const PERIOD: u64 = 100;
const COUNT: u32 = 12;
const SENDER_START_BALANCE: i128 = 1_000_000_000_000;

fn create(f: &Fixture<'_>, first_ts: u64) -> u32 {
    f.lockup.create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &PERIOD,
        &COUNT,
        &first_ts,
        &true,
        &true,
    )
}

#[test]
fn create_recurring_derives_fields_and_pulls_deposit() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;

    let id = create(&f, first);
    assert_eq!(id, 1);

    let total = AMOUNT * COUNT as i128; // 12_000
    assert_eq!(f.token_client.balance(&f.sender), SENDER_START_BALANCE - total);
    assert_eq!(f.token_client.balance(&f.lockup_addr), total);

    let s = f.lockup.get_stream(&id);
    assert_eq!(s.sender, f.sender);
    assert_eq!(s.recipient, f.recipient);
    assert_eq!(s.token, f.token);
    assert_eq!(s.start_ts, first);
    assert_eq!(s.end_ts, first + (COUNT as u64 - 1) * PERIOD);
    assert_eq!(s.deposited, total);
    assert_eq!(s.withdrawn, 0);
    assert_eq!(s.refunded, 0);
    assert!(s.is_cancelable);
    assert!(s.is_transferable);
    assert_eq!(
        s.shape,
        StreamShape::Recurring(RecurringShape {
            first_ts: first,
            period_secs: PERIOD,
            count: COUNT,
            amount_per_period: AMOUNT,
        })
    );

    // NFT receipt minted to the recipient.
    assert_eq!(f.lockup.owner_of(&id), f.recipient);
    assert_eq!(f.lockup.total_supply(), 1);
}

#[test]
fn create_recurring_rejects_zero_amount() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &0i128,
        &PERIOD,
        &COUNT,
        &(now + 100),
        &true,
        &true,
    );
    assert!(matches!(res, Err(Ok(Error::ZeroDeposit))));
}

#[test]
fn create_recurring_rejects_zero_period() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &0u64,
        &COUNT,
        &(now + 100),
        &true,
        &true,
    );
    assert!(matches!(res, Err(Ok(Error::InvalidPeriod))));
}

#[test]
fn create_recurring_rejects_zero_count() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &PERIOD,
        &0u32,
        &(now + 100),
        &true,
        &true,
    );
    assert!(matches!(res, Err(Ok(Error::InvalidCount))));
}

#[test]
fn create_recurring_rejects_first_ts_in_past() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &PERIOD,
        &COUNT,
        &(now - 1),
        &true,
        &true,
    );
    assert!(matches!(res, Err(Ok(Error::StartInPast))));
}

#[test]
fn create_recurring_rejects_amount_overflow() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &i128::MAX,
        &PERIOD,
        &2u32,
        &(now + 100),
        &true,
        &true,
    );
    assert!(matches!(res, Err(Ok(Error::Overflow))));
}

#[test]
fn create_recurring_rejects_end_ts_overflow() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &u64::MAX,
        &3u32,
        &(now + 100),
        &true,
        &true,
    );
    assert!(matches!(res, Err(Ok(Error::Overflow))));
}

#[test]
fn recurring_streams_in_steps() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = create(&f, first);

    f.env.ledger().set_timestamp(first - 1);
    assert_eq!(f.lockup.streamed_amount(&id), 0);
    assert_eq!(f.lockup.status(&id), StreamStatus::Pending);

    f.env.ledger().set_timestamp(first);
    assert_eq!(f.lockup.streamed_amount(&id), AMOUNT);
    assert_eq!(f.lockup.status(&id), StreamStatus::Streaming);

    f.env.ledger().set_timestamp(first + 250);
    assert_eq!(f.lockup.streamed_amount(&id), 3 * AMOUNT);

    f.env.ledger().set_timestamp(first + (COUNT as u64 - 1) * PERIOD);
    assert_eq!(f.lockup.streamed_amount(&id), AMOUNT * COUNT as i128);
    assert_eq!(f.lockup.status(&id), StreamStatus::Settled);
}

#[test]
fn recurring_withdraw_after_k_periods() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = create(&f, first);

    // 4 full periods elapsed after the first unlock → 5 unlocks available.
    f.env.ledger().set_timestamp(first + 4 * PERIOD + 1);
    f.lockup.withdraw_max(&id, &f.recipient);

    assert_eq!(f.token_client.balance(&f.recipient), 5 * AMOUNT);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 5 * AMOUNT);
    assert!(!s.is_depleted);
}

#[test]
fn recurring_cancel_refunds_unvested_periods() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = create(&f, first);
    let total = AMOUNT * COUNT as i128;

    f.env.ledger().set_timestamp(first + 4 * PERIOD + 1); // 5 unlocked
    let sender_before = f.token_client.balance(&f.sender);
    f.lockup.cancel(&id);

    let s = f.lockup.get_stream(&id);
    assert!(s.was_canceled);
    assert_eq!(s.refunded, total - 5 * AMOUNT);
    assert_eq!(
        f.token_client.balance(&f.sender),
        sender_before + (total - 5 * AMOUNT)
    );

    // Recipient still collects the 5 unlocked periods, which depletes the stream.
    f.lockup.withdraw_max(&id, &f.recipient);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 5 * AMOUNT);
    assert!(s.is_depleted);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
}

#[test]
fn recurring_single_period_settles_at_first_ts() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = f.lockup.create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &PERIOD,
        &1u32,
        &first,
        &true,
        &true,
    );
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.start_ts, first);
    assert_eq!(s.end_ts, first);
    assert_eq!(s.deposited, AMOUNT);

    f.env.ledger().set_timestamp(first);
    assert_eq!(f.lockup.status(&id), StreamStatus::Settled);
    assert_eq!(f.lockup.streamed_amount(&id), AMOUNT);
}

#[test]
fn recurring_renounce_blocks_cancel() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = create(&f, now + 100);
    f.lockup.renounce(&id);
    assert!(!f.lockup.get_stream(&id).is_cancelable);
    assert!(matches!(
        f.lockup.try_cancel(&id),
        Err(Ok(Error::NotCancelable))
    ));
}

#[test]
fn recurring_burn_after_depletion() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = create(&f, first);
    f.env.ledger().set_timestamp(first + 100_000);
    f.lockup.withdraw_max(&id, &f.recipient);
    f.lockup.burn(&id);
    assert!(matches!(
        f.lockup.try_get_stream(&id),
        Err(Ok(Error::StreamNotFound))
    ));
}
```

- [ ] **Step 3: Add the monotonicity invariant**

Append to `contracts/lockup/src/tests/invariants.rs`:

```rust
#[test]
fn streamed_amount_monotonic_recurring() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &100u64,
        &12u32,
        &(now + 100),
        &true,
        &true,
    );
    let mut prev = 0i128;
    for t in (0..2_500u64).step_by(7) {
        f.env.ledger().set_timestamp(now + t);
        let cur = f.lockup.streamed_amount(&id);
        assert!(cur >= prev, "decrease at t={}", t);
        prev = cur;
    }
    assert_eq!(prev, 12_000);
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cargo test -p hourglass-lockup recurring`
Expected: compile error `no method named `create_recurring`` on `LockupClient`.

- [ ] **Step 5: Implement `create_recurring`**

Append to `contracts/lockup/src/create.rs`:

```rust
#[contractimpl]
impl Lockup {
    /// Recurring stream: `count` unlocks of `amount_per_period`, the first at
    /// `first_ts`, then every `period_secs`. Deposit = amount_per_period * count.
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
    ) -> u32 {
        sender.require_auth();
        let spec = CreateSpec::Recurring(RecurringParams {
            amount_per_period,
            period_secs,
            count,
            first_ts,
        });
        let stream = build_stream(
            &env,
            &sender,
            &token,
            &recipient,
            &spec,
            is_cancelable,
            is_transferable,
        );
        pull_deposit(&env, &token, &sender, stream.deposited);
        persist(&env, &stream)
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cargo test -p hourglass-lockup recurring && cargo test --workspace`
Expected: 12 tests in `tests::recurring` + `streamed_amount_monotonic_recurring` pass; whole workspace green.

- [ ] **Step 7: Commit**

```bash
cargo fmt --all
git add contracts/lockup
git commit -m "feat(lockup): add create_recurring entry point with lifecycle tests"
```

---

### Task 4: Lockup — atomic `create_batch`

**Files:**
- Modify: `contracts/lockup/src/create.rs`
- Rewrite: `contracts/lockup/src/tests/batch.rs`
- Modify: `contracts/lockup/src/tests/invariants.rs`

**Interfaces:**
- Consumes: `build_stream`, `pull_deposit`, `persist`, `CreateRow`, `CreateSpec`, `MAX_BATCH_ROWS`, `Error::{EmptyBatch, BatchTooLarge}`.
- Produces: contract entry `create_batch(sender: Address, token: Address, rows: Vec<CreateRow>) -> Vec<u32>` (client methods `create_batch` / `try_create_batch`).

- [ ] **Step 1: Write the failing batch tests**

Replace `contracts/lockup/src/tests/batch.rs` with:

```rust
use super::common::{setup, Fixture};
use hourglass_shared::{
    CreateRow, CreateSpec, Error, LinearParams, RecurringParams, StreamShape, Tranche,
    TranchedParams, MAX_BATCH_ROWS,
};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    vec,
    xdr::{ContractEventBody, ScVal},
    Address, Vec,
};

const SENDER_START_BALANCE: i128 = 1_000_000_000_000;
const LINEAR_DEPOSIT: i128 = 1_000_000;
const RECURRING_TOTAL: i128 = 12 * 1_000;
const TRANCHED_TOTAL: i128 = 100 + 200 + 300;

fn linear_row(recipient: &Address, now: u64) -> CreateRow {
    CreateRow {
        recipient: recipient.clone(),
        spec: CreateSpec::Linear(LinearParams {
            deposited: LINEAR_DEPOSIT,
            start_ts: now + 100,
            cliff_ts: now + 200,
            end_ts: now + 1_100,
            unlock_at_start: 0,
            unlock_at_cliff: 0,
        }),
        is_cancelable: true,
        is_transferable: true,
    }
}

fn recurring_row(recipient: &Address, now: u64) -> CreateRow {
    CreateRow {
        recipient: recipient.clone(),
        spec: CreateSpec::Recurring(RecurringParams {
            amount_per_period: 1_000,
            period_secs: 100,
            count: 12,
            first_ts: now + 100,
        }),
        is_cancelable: true,
        is_transferable: false,
    }
}

fn tranched_row(f: &Fixture<'_>, recipient: &Address, now: u64) -> CreateRow {
    CreateRow {
        recipient: recipient.clone(),
        spec: CreateSpec::Tranched(TranchedParams {
            tranches: vec![
                &f.env,
                Tranche {
                    amount: 100,
                    ts: now + 100,
                },
                Tranche {
                    amount: 200,
                    ts: now + 200,
                },
                Tranche {
                    amount: 300,
                    ts: now + 300,
                },
            ],
        }),
        is_cancelable: false,
        is_transferable: true,
    }
}

/// Count `("stream","created",..)` events emitted by the lockup in the last
/// invocation (token transfer + NFT mint events are filtered out).
fn count_created_events(f: &Fixture<'_>) -> usize {
    f.env
        .events()
        .all()
        .filter_by_contract(&f.lockup_addr)
        .events()
        .iter()
        .filter(|e| {
            let ContractEventBody::V0(v0) = &e.body;
            matches!(
                v0.topics.get(1),
                Some(ScVal::Symbol(s)) if s.to_utf8_string_lossy() == "created"
            )
        })
        .count()
}

#[test]
fn batch_creates_mixed_rows_with_one_transfer() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let r1 = Address::generate(&f.env);
    let r2 = Address::generate(&f.env);
    let r3 = Address::generate(&f.env);
    let rows = vec![
        &f.env,
        linear_row(&r1, now),
        recurring_row(&r2, now),
        tranched_row(&f, &r3, now),
    ];

    let ids = f.lockup.create_batch(&f.sender, &f.token, &rows);
    assert_eq!(ids, vec![&f.env, 1u32, 2u32, 3u32]);

    let total = LINEAR_DEPOSIT + RECURRING_TOTAL + TRANCHED_TOTAL;
    assert_eq!(f.token_client.balance(&f.sender), SENDER_START_BALANCE - total);
    assert_eq!(f.token_client.balance(&f.lockup_addr), total);

    let s1 = f.lockup.get_stream(&1);
    assert_eq!(s1.recipient, r1);
    assert_eq!(s1.deposited, LINEAR_DEPOSIT);
    assert!(matches!(s1.shape, StreamShape::Linear(_)));
    assert!(s1.is_cancelable && s1.is_transferable);

    let s2 = f.lockup.get_stream(&2);
    assert_eq!(s2.recipient, r2);
    assert_eq!(s2.deposited, RECURRING_TOTAL);
    assert!(matches!(s2.shape, StreamShape::Recurring(_)));
    assert!(s2.is_cancelable && !s2.is_transferable);

    let s3 = f.lockup.get_stream(&3);
    assert_eq!(s3.recipient, r3);
    assert_eq!(s3.deposited, TRANCHED_TOTAL);
    assert!(matches!(s3.shape, StreamShape::Tranched(_)));
    assert!(!s3.is_cancelable && s3.is_transferable);

    assert_eq!(f.lockup.owner_of(&1), r1);
    assert_eq!(f.lockup.owner_of(&2), r2);
    assert_eq!(f.lockup.owner_of(&3), r3);
    assert_eq!(f.lockup.total_supply(), 3);

    assert_eq!(count_created_events(&f), 3);
}

#[test]
fn batch_ids_continue_from_existing_counter() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    assert_eq!(first, 1);

    let rows = vec![
        &f.env,
        linear_row(&f.recipient, now),
        recurring_row(&f.recipient, now),
    ];
    let ids = f.lockup.create_batch(&f.sender, &f.token, &rows);
    assert_eq!(ids, vec![&f.env, 2u32, 3u32]);
}

#[test]
fn batch_is_atomic_when_a_row_is_invalid() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let mut bad = linear_row(&f.recipient, now);
    bad.spec = CreateSpec::Linear(LinearParams {
        deposited: 1_000,
        start_ts: now - 1, // StartInPast
        cliff_ts: now,
        end_ts: now + 1_000,
        unlock_at_start: 0,
        unlock_at_cliff: 0,
    });
    let rows = vec![
        &f.env,
        linear_row(&f.recipient, now),
        recurring_row(&f.recipient, now),
        bad,
    ];

    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert!(matches!(res, Err(Ok(Error::StartInPast))));

    // Nothing happened.
    assert_eq!(f.token_client.balance(&f.sender), SENDER_START_BALANCE);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
    assert_eq!(f.lockup.total_supply(), 0);
    assert!(matches!(
        f.lockup.try_get_stream(&1),
        Err(Ok(Error::StreamNotFound))
    ));

    // The id counter was not consumed.
    let ok_rows = vec![&f.env, linear_row(&f.recipient, now)];
    let ids = f.lockup.create_batch(&f.sender, &f.token, &ok_rows);
    assert_eq!(ids, vec![&f.env, 1u32]);
}

#[test]
fn batch_is_atomic_when_sender_balance_is_insufficient() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    // Two rows whose sum exceeds the sender's balance, each individually valid.
    let mut big = linear_row(&f.recipient, now);
    big.spec = CreateSpec::Linear(LinearParams {
        deposited: SENDER_START_BALANCE,
        start_ts: now + 100,
        cliff_ts: now + 100,
        end_ts: now + 1_100,
        unlock_at_start: 0,
        unlock_at_cliff: 0,
    });
    let rows = vec![&f.env, big, linear_row(&f.recipient, now)];

    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert!(res.is_err());

    assert_eq!(f.token_client.balance(&f.sender), SENDER_START_BALANCE);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
    assert_eq!(f.lockup.total_supply(), 0);
    assert!(matches!(
        f.lockup.try_get_stream(&1),
        Err(Ok(Error::StreamNotFound))
    ));
}

#[test]
fn batch_rejects_empty() {
    let f = setup();
    let rows: Vec<CreateRow> = Vec::new(&f.env);
    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert!(matches!(res, Err(Ok(Error::EmptyBatch))));
}

#[test]
fn batch_rejects_more_than_max_rows() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let mut rows: Vec<CreateRow> = Vec::new(&f.env);
    for _ in 0..(MAX_BATCH_ROWS + 1) {
        rows.push_back(linear_row(&f.recipient, now));
    }
    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert!(matches!(res, Err(Ok(Error::BatchTooLarge))));
}

#[test]
fn batch_rejects_deposit_sum_overflow() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let mut huge = linear_row(&f.recipient, now);
    huge.spec = CreateSpec::Linear(LinearParams {
        deposited: i128::MAX,
        start_ts: now + 100,
        cliff_ts: now + 100,
        end_ts: now + 1_100,
        unlock_at_start: 0,
        unlock_at_cliff: 0,
    });
    let rows = vec![&f.env, huge, linear_row(&f.recipient, now)];
    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert!(matches!(res, Err(Ok(Error::Overflow))));
    assert_eq!(f.token_client.balance(&f.sender), SENDER_START_BALANCE);
}

#[test]
fn single_row_batch_matches_single_create() {
    let f = setup();
    let now = f.env.ledger().timestamp();

    let via_batch = f.lockup.create_batch(
        &f.sender,
        &f.token,
        &vec![&f.env, linear_row(&f.recipient, now)],
    );
    let via_single = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &LINEAR_DEPOSIT,
        &(now + 100),
        &(now + 200),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    assert_eq!(via_batch, vec![&f.env, 1u32]);
    assert_eq!(via_single, 2);
    assert_eq!(f.lockup.get_stream(&1), f.lockup.get_stream(&2));
}
```

If `to_utf8_string_lossy` is not available on `ScSymbol` in this build, replace that predicate with `core::str::from_utf8(s.0.as_slice()) == Ok("created")`.

- [ ] **Step 2: Add the multi-stream conservation invariant**

Append to `contracts/lockup/src/tests/invariants.rs` (add `use hourglass_shared::{CreateRow, CreateSpec, LinearParams, RecurringParams};` to the imports at the top of the file):

```rust
/// Σ deposited == Σ withdrawn + Σ refunded + contract balance across a batch,
/// after a cancel on one stream and a withdraw on another.
#[test]
fn asset_conservation_across_batch() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let rows = vec![
        &f.env,
        CreateRow {
            recipient: f.recipient.clone(),
            spec: CreateSpec::Linear(LinearParams {
                deposited: 1_000_000,
                start_ts: now + 100,
                cliff_ts: now + 100,
                end_ts: now + 1_100,
                unlock_at_start: 0,
                unlock_at_cliff: 0,
            }),
            is_cancelable: true,
            is_transferable: true,
        },
        CreateRow {
            recipient: f.recipient.clone(),
            spec: CreateSpec::Recurring(RecurringParams {
                amount_per_period: 1_000,
                period_secs: 100,
                count: 12,
                first_ts: now + 100,
            }),
            is_cancelable: true,
            is_transferable: true,
        },
    ];
    let ids = f.lockup.create_batch(&f.sender, &f.token, &rows);

    f.env.ledger().set_timestamp(now + 700);
    f.lockup.cancel(&ids.get(0).unwrap());
    f.lockup.withdraw_max(&ids.get(1).unwrap(), &f.recipient);

    let mut deposited = 0i128;
    let mut withdrawn = 0i128;
    let mut refunded = 0i128;
    for id in ids.iter() {
        let s = f.lockup.get_stream(&id);
        deposited += s.deposited;
        withdrawn += s.withdrawn;
        refunded += s.refunded;
    }
    let in_contract = f.token_client.balance(&f.lockup_addr);
    assert_eq!(deposited, withdrawn + refunded + in_contract);
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cargo test -p hourglass-lockup batch`
Expected: compile error `no method named `create_batch`` on `LockupClient`.

- [ ] **Step 4: Implement `create_batch`**

Append to `contracts/lockup/src/create.rs` (also add `CreateRow` and `MAX_BATCH_ROWS` to the `hourglass_shared` import list at the top of the file):

```rust
#[contractimpl]
impl Lockup {
    /// Create 1..=MAX_BATCH_ROWS streams of mixed shapes for one sender and one
    /// token in a single transaction. Every row is validated before any state
    /// changes; the deposits are pulled with ONE token transfer; ids are
    /// consecutive and returned in row order. Any failure reverts everything.
    pub fn create_batch(env: Env, sender: Address, token: Address, rows: Vec<CreateRow>) -> Vec<u32> {
        sender.require_auth();
        if rows.is_empty() {
            panic_with_error!(&env, Error::EmptyBatch);
        }
        if rows.len() > MAX_BATCH_ROWS {
            panic_with_error!(&env, Error::BatchTooLarge);
        }

        // Phase 1 — validate every row, build the records, sum the deposits.
        let mut streams: Vec<Stream> = Vec::new(&env);
        let mut total: i128 = 0;
        for row in rows.iter() {
            let s = build_stream(
                &env,
                &sender,
                &token,
                &row.recipient,
                &row.spec,
                row.is_cancelable,
                row.is_transferable,
            );
            total = total
                .checked_add(s.deposited)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
            streams.push_back(s);
        }

        // Phase 2 — exactly one transfer for the whole batch.
        pull_deposit(&env, &token, &sender, total);

        // Phase 3 — persist in row order (ids are consecutive).
        let mut ids: Vec<u32> = Vec::new(&env);
        for s in streams.iter() {
            ids.push_back(persist(&env, &s));
        }
        ids
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cargo test -p hourglass-lockup batch && cargo test --workspace`
Expected: 8 tests in `tests::batch` + `asset_conservation_across_batch` pass; workspace green.

- [ ] **Step 6: Format, lint, commit**

```bash
cargo fmt --all && cargo clippy --workspace --all-targets
git add contracts/lockup
git commit -m "feat(lockup): add atomic create_batch (mixed shapes, single transfer)"
```

---

### Task 5: Build wasm, regenerate the SDK, bump versions

**Files:**
- Modify: `Cargo.toml` (workspace version), `sdk/package.json`
- Regenerate: `sdk/src/generated/lockup/src/index.ts`, `sdk/src/generated/comptroller/src/index.ts`

**Interfaces:**
- Produces: `hourglass` npm package `0.2.0` whose `lockup.Client` exposes `create_recurring`, `create_batch`, and types `CreateRow`, `CreateSpec`, `RecurringShape`, `RecurringParams`, `LinearParams`, `TranchedParams`; `StreamShape` union gains `{ tag: "Recurring", values: readonly [RecurringShape] }`.

- [ ] **Step 1: Bump versions**

In `Cargo.toml` change `version = "0.1.0"` (under `[workspace.package]`) to `version = "0.2.0"`. In `sdk/package.json` change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 2: Build optimized wasm**

Run: `./scripts/build.sh`
Expected: ends with a listing of `dist/hourglass_comptroller.optimized.wasm` and `dist/hourglass_lockup.optimized.wasm`; no errors.

- [ ] **Step 3: Regenerate + build the SDK**

Run: `cd sdk && npm run regen && npm run build && cd ..`
Expected: "Regenerated bindings into sdk/src/generated/" then `tsc` exits 0.

- [ ] **Step 4: Verify the new surface is in the bindings**

Run:
```bash
grep -c "create_batch\|create_recurring" sdk/src/generated/lockup/src/index.ts
grep -n 'tag: "Recurring"' sdk/src/generated/lockup/src/index.ts
grep -n "export interface CreateRow" sdk/src/generated/lockup/src/index.ts
```
Expected: first count ≥ 4; the other two greps each print at least one line.

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml sdk/package.json sdk/src/generated
git commit -m "feat(sdk): regenerate bindings for lockup v0.2 (create_batch, create_recurring)"
```

---

### Task 6: Indexer + DB document — map the Recurring shape

**Files:**
- Modify: `frontend/src/lib/db.ts:66-94` (`StreamDoc`)
- Modify: `frontend/scripts/indexer.ts:180-235` (chain shape types + `fetchStreamFromChain`)

**Interfaces:**
- Consumes: regenerated `hourglass` package (Task 5).
- Produces: `StreamDoc.model: 'Linear' | 'Tranched' | 'Recurring'` and optional `first_ts: number`, `period_secs: number`, `count: number`, `amount_per_period: string` (decimal string, like other i128 fields).

- [ ] **Step 1: Refresh the frontend's copy of the SDK**

Run: `cd frontend && node scripts/sync-deployment.mjs && cd ..`
Expected: prints that it copied `deployments/testnet.json` and materialised `sdk/dist` into `node_modules/hourglass`.

- [ ] **Step 2: Extend `StreamDoc`**

In `frontend/src/lib/db.ts` change the `model` line and add the Recurring fields:

```ts
  model: 'Linear' | 'Tranched' | 'Recurring';
  start_ts: number;
  end_ts: number;
  // Linear-only:
  cliff_ts?: number;
  unlock_at_start?: string;
  unlock_at_cliff?: string;
  // Tranched-only:
  tranches?: TrancheTerms[];
  // Recurring-only:
  first_ts?: number;
  period_secs?: number;
  count?: number;
  amount_per_period?: string;
```

- [ ] **Step 3: Map the shape in the indexer**

In `frontend/scripts/indexer.ts`, after the `ShapeTranchedChain` interface add:

```ts
interface ShapeRecurringChain {
  tag: 'Recurring';
  values: readonly [{
    first_ts: bigint | number;
    period_secs: bigint | number;
    count: number;
    amount_per_period: bigint;
  }];
}
```

Change the `shape` field of `StreamChain` to:

```ts
  shape: ShapeLinearChain | ShapeTranchedChain | ShapeRecurringChain;
```

Replace the `shapeFields` expression inside `fetchStreamFromChain` with:

```ts
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
        tranches: s.shape.values[0].tranches.map((t) => ({
          amount: String(t.amount),
          ts: Number(t.ts),
        })),
      };
    } else {
      shapeFields = {
        model: 'Recurring',
        first_ts: Number(s.shape.values[0].first_ts),
        period_secs: Number(s.shape.values[0].period_secs),
        count: Number(s.shape.values[0].count),
        amount_per_period: String(s.shape.values[0].amount_per_period),
      };
    }
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run typecheck && cd ..`
Expected: exits 0. (`tsconfig.json` includes `**/*.ts`, so `scripts/indexer.ts` is covered.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/db.ts frontend/scripts/indexer.ts
git commit -m "feat(frontend): index Recurring stream shape"
```

---

### Task 7: Frontend — render Recurring streams (no create UI yet)

**Files:**
- Modify: `frontend/src/app/stream/[id]/page.tsx` (`shapeLabel` at :46, shape usages at :386-418, :683-697, :841-869, :873-897, :1105)
- Modify: `frontend/src/app/dashboard/page.tsx:329`, `:366`

**Interfaces:**
- Consumes: `Stream` type from `hourglass/lockup` with the `Recurring` variant; `StreamDoc.model` from Task 6.
- Produces: `viewShape(s: Stream): ViewShape` where `ViewShape` is the `StreamShape` type exported by `@/components/LiveCounter` (Linear or Tranched); Recurring is expanded to equal tranches.

- [ ] **Step 1: Replace `shapeLabel` and add the view-model helpers**

In `frontend/src/app/stream/[id]/page.tsx`, replace the `shapeLabel` function (lines 46-48) with:

```ts
type ShapeLabel = 'LINEAR' | 'TRANCHED' | 'RECURRING';

function shapeLabel(s: Stream): ShapeLabel {
  if (s.shape.tag === 'Linear') return 'LINEAR';
  if (s.shape.tag === 'Tranched') return 'TRANCHED';
  return 'RECURRING';
}

function shapeTitle(s: Stream): string {
  const l = shapeLabel(s);
  return l === 'LINEAR' ? 'Linear' : l === 'RECURRING' ? 'Recurring' : 'Tranched';
}

/** Expand a Recurring shape into equal tranches for the tranched view paths. */
function recurringToTranches(r: {
  first_ts: bigint | number;
  period_secs: bigint | number;
  count: number;
  amount_per_period: bigint;
}): Array<{ amount: bigint; ts: number }> {
  const first = Number(r.first_ts);
  const period = Number(r.period_secs);
  const amount = BigInt(r.amount_per_period);
  return Array.from({ length: Number(r.count) }, (_, i) => ({
    amount,
    ts: first + i * period,
  }));
}

/**
 * View-model shape consumed by CelestialDial / LiveCounter / EmissionChart.
 * Recurring streams are presented as Tranched (their math is identical).
 */
function viewShape(s: Stream): ViewShape {
  if (s.shape.tag === 'Linear') {
    return {
      tag: 'Linear',
      cliff_ts: Number(s.shape.values[0].cliff_ts),
      unlock_at_start: BigInt(s.shape.values[0].unlock_at_start),
      unlock_at_cliff: BigInt(s.shape.values[0].unlock_at_cliff),
    };
  }
  if (s.shape.tag === 'Tranched') {
    return {
      tag: 'Tranched',
      tranches: s.shape.values[0].tranches.map((t) => ({
        amount: BigInt(t.amount),
        ts: Number(t.ts),
      })),
    };
  }
  return { tag: 'Tranched', tranches: recurringToTranches(s.shape.values[0]) };
}
```

and add this import next to the other component imports:

```ts
import type { StreamShape as ViewShape } from '@/components/LiveCounter';
```

- [ ] **Step 2: Compute the view shape once in the detail component**

Inside the component that declares `const startTs = Number(stream.start_ts);` (around line 383), add directly after `const duration = ...;`:

```ts
  const vshape = useMemo(() => viewShape(stream), [stream]);
```

- [ ] **Step 3: Use `vshape` where the page branches on the raw shape**

Make these four replacements:

1. `CelestialDial` (around :683-697): replace the whole `shape={ stream.shape.tag === 'Linear' ? {...} : {...} }` prop with `shape={vshape}`.

2. Tranche list (around :841): change the guard `{stream.shape.tag === 'Tranched' && (` to `{vshape.tag === 'Tranched' && (`; change `{stream.shape.values[0].tranches.map((t, i) => (` to `{vshape.tranches.map((t, i) => (`; change the eyebrow text `Tranches` to `{stream.shape.tag === 'Recurring' ? 'Unlocks' : 'Tranches'}`; inside the list, `formatStroops(BigInt(t.amount))` becomes `formatStroops(t.amount)` and `formatTimestamp(Number(t.ts))` becomes `formatTimestamp(t.ts)`.

3. `EmissionChart` (around :873-897): replace the props `model=…`, `unlock_at_start=…`, `unlock_at_cliff=…`, `tranches=…` with:

```tsx
                  model={vshape.tag}
                  unlock_at_start={vshape.tag === 'Linear' ? vshape.unlock_at_start : 0n}
                  unlock_at_cliff={vshape.tag === 'Linear' ? vshape.unlock_at_cliff : 0n}
                  tranches={vshape.tag === 'Tranched' ? vshape.tranches : []}
```

4. Shape `AttributePill` (around :1105): replace `{shapeLabel(stream) === 'LINEAR' ? 'Linear' : 'Tranched'}` with `{shapeTitle(stream)}`.

- [ ] **Step 4: Dashboard row**

In `frontend/src/app/dashboard/page.tsx`:

- line 329: `const modelBadge = stream.model === 'Linear' ? 'LINEAR' : 'TRANCHED';` → `const modelBadge = stream.model.toUpperCase();`
- line 366: `{stream.model === 'Linear' ? (` → `{stream.model !== 'Tranched' ? (` (Recurring shows its deposited amount like Linear).

- [ ] **Step 5: Typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build && cd ..`
Expected: both exit 0. If `npm run build` complains about a missing `deployment.json`, run `node scripts/sync-deployment.mjs` first.

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/stream/[id]/page.tsx" frontend/src/app/dashboard/page.tsx
git commit -m "feat(frontend): render Recurring streams on stream detail and dashboard"
```

---

### Task 8: Deploy + smoke scripts

**Files:**
- Rewrite: `scripts/deploy-testnet.sh`
- Rewrite: `scripts/smoke-testnet.sh`

**Interfaces:**
- Consumes: `dist/hourglass_lockup.optimized.wasm` (Task 5), stellar-cli identity `hourglass-user`, `deployments/testnet.json` keys `comptroller`, `hgt_token`, `usdc_token`, …
- Produces: `deployments/testnet.json` with new `lockup`, `previous_lockup`, `deployed_at`, all other keys preserved; `smoke-testnet-<epoch>.log` (git-ignored via `*.log`) with tx hashes.

- [ ] **Step 1: Rewrite `scripts/deploy-testnet.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK_NAME="testnet"
RPC_URL="https://soroban-testnet.stellar.org:443"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
HORIZON_URL="https://horizon-testnet.stellar.org"
IDENTITY="${IDENTITY:-hourglass-user}"
DEPLOYMENT="deployments/testnet.json"
# Set REUSE_COMPTROLLER=0 to force a fresh comptroller deploy.
REUSE_COMPTROLLER="${REUSE_COMPTROLLER:-1}"

command -v jq >/dev/null || { echo "ERROR: jq is required"; exit 1; }

# Ensure network exists in stellar-cli config (idempotent)
if ! stellar network ls 2>/dev/null | grep -q "^${NETWORK_NAME}\b"; then
    stellar network add "$NETWORK_NAME" \
        --rpc-url "$RPC_URL" \
        --network-passphrase "$NETWORK_PASSPHRASE"
fi

if ! stellar keys ls 2>/dev/null | grep -q "^${IDENTITY}\b"; then
    echo "ERROR: identity '$IDENTITY' is not configured in stellar-cli."
    echo "Import it first (e.g. stellar keys add $IDENTITY --secret-key ...)."
    exit 1
fi

ADMIN="$(stellar keys address "$IDENTITY")"
echo "==> Using identity '$IDENTITY' -> $ADMIN"

# Friendbot — only attempts if account doesn't exist yet
STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${HORIZON_URL}/accounts/${ADMIN}")"
if [ "$STATUS" != "200" ]; then
    echo "==> Funding $ADMIN via Friendbot"
    for i in $(seq 1 6); do
        FB_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "https://friendbot.stellar.org/?addr=${ADMIN}")"
        if [ "$FB_STATUS" = "200" ] || [ "$FB_STATUS" = "400" ]; then
            break
        fi
        echo "    friendbot returned $FB_STATUS, retrying in 10s..."
        sleep 10
    done
    sleep 5
    for i in $(seq 1 6); do
        STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${HORIZON_URL}/accounts/${ADMIN}")"
        if [ "$STATUS" = "200" ]; then
            break
        fi
        echo "    horizon still 404, waiting 5s..."
        sleep 5
    done
fi

# Build artifacts (idempotent)
"$ROOT/scripts/build.sh"

# Native XLM SAC on testnet
NATIVE_WRAPPED="$(stellar contract id asset \
    --network "$NETWORK_NAME" \
    --asset native)"
echo "Native XLM SAC: $NATIVE_WRAPPED"

# ---- Comptroller: reuse the deployed one unless told otherwise ----
EXISTING_COMPTROLLER=""
PREVIOUS_LOCKUP=""
if [ -f "$DEPLOYMENT" ]; then
    EXISTING_COMPTROLLER="$(jq -r '.comptroller // empty' "$DEPLOYMENT")"
    PREVIOUS_LOCKUP="$(jq -r '.lockup // empty' "$DEPLOYMENT")"
fi

if [ "$REUSE_COMPTROLLER" != "0" ] && [ -n "$EXISTING_COMPTROLLER" ]; then
    COMPTROLLER_ID="$EXISTING_COMPTROLLER"
    echo "==> Reusing comptroller $COMPTROLLER_ID"
else
    # Sentinel oracle = admin for Phase 0 (fees default to 0)
    ORACLE_SENTINEL="$ADMIN"
    echo "==> Deploying comptroller"
    COMPTROLLER_ID="$(stellar contract deploy \
        --network "$NETWORK_NAME" \
        --source "$IDENTITY" \
        --wasm dist/hourglass_comptroller.optimized.wasm \
        -- \
        --admin "$ADMIN" \
        --fee_collector "$ADMIN" \
        --oracle "$ORACLE_SENTINEL" \
        --max_staleness_secs 3600)"
    echo "Comptroller: $COMPTROLLER_ID"
fi

echo "==> Deploying lockup"
LOCKUP_ID="$(stellar contract deploy \
    --network "$NETWORK_NAME" \
    --source "$IDENTITY" \
    --wasm dist/hourglass_lockup.optimized.wasm \
    -- \
    --admin "$ADMIN" \
    --comptroller "$COMPTROLLER_ID" \
    --native_token "$NATIVE_WRAPPED")"
echo "Lockup: $LOCKUP_ID"

# ---- Merge into deployments/testnet.json (preserve hgt_*/usdc_* etc.) ----
mkdir -p deployments
if [ -f "$DEPLOYMENT" ]; then BASE="$(cat "$DEPLOYMENT")"; else BASE='{}'; fi
TMP="$(mktemp)"
echo "$BASE" | jq \
    --arg network "$NETWORK_NAME" \
    --arg rpc_url "$RPC_URL" \
    --arg passphrase "$NETWORK_PASSPHRASE" \
    --arg horizon "$HORIZON_URL" \
    --arg deployed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg deployer "$ADMIN" \
    --arg comptroller "$COMPTROLLER_ID" \
    --arg lockup "$LOCKUP_ID" \
    --arg previous_lockup "$PREVIOUS_LOCKUP" \
    --arg native "$NATIVE_WRAPPED" \
    '. + {
        network: $network,
        rpc_url: $rpc_url,
        network_passphrase: $passphrase,
        horizon_url: $horizon,
        deployed_at: $deployed_at,
        deployer: $deployer,
        comptroller: $comptroller,
        lockup: $lockup,
        native_token: $native
    } + (if $previous_lockup != "" and $previous_lockup != $lockup then {previous_lockup: $previous_lockup} else {} end)' \
    > "$TMP"
mv "$TMP" "$DEPLOYMENT"

echo "==> Wrote $DEPLOYMENT"
cat "$DEPLOYMENT"
```

- [ ] **Step 2: Rewrite `scripts/smoke-testnet.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-testnet}"
DEPLOYMENT="deployments/${NETWORK}.json"
HORIZON_URL="https://horizon-testnet.stellar.org"
LOG="smoke-testnet-$(date +%s).log"

if [ ! -f "$DEPLOYMENT" ]; then
    echo "Missing $DEPLOYMENT — run scripts/deploy-testnet.sh first."
    exit 1
fi

LOCKUP="$(jq -r .lockup "$DEPLOYMENT")"
TOKEN="${TOKEN:-$(jq -r .native_token "$DEPLOYMENT")}"
SENDER="$(stellar keys address hourglass-user)"
echo "Network:   $NETWORK"
echo "Lockup:    $LOCKUP"
echo "Token:     $TOKEN"
echo "Sender:    $SENDER"
echo "Log:       $LOG"

# invoke <source-identity> <fn> [args...] — prints the return value on stdout,
# appends all CLI chatter (incl. tx hashes) to $LOG.
invoke() {
    local source="$1"; shift
    stellar contract invoke \
        --network "$NETWORK" \
        --source "$source" \
        --id "$LOCKUP" \
        -- "$@" 2>>"$LOG"
}

fund() {
    local addr="$1"
    for i in $(seq 1 6); do
        FB_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "https://friendbot.stellar.org/?addr=${addr}")"
        if [ "$FB_STATUS" = "200" ] || [ "$FB_STATUS" = "400" ]; then
            break
        fi
        echo "    friendbot $FB_STATUS, retrying in 10s..."
        sleep 10
    done
}

strip_num() { echo "$1" | tr -d '" ' ; }

# ---------------------------------------------------------------- recipients
RECIPIENT_KEY="hgt-smoke-recipient-$(date +%s)"
stellar keys generate "$RECIPIENT_KEY" --network "$NETWORK" 2>>"$LOG"
RECIPIENT="$(stellar keys address "$RECIPIENT_KEY")"
echo "Recipient: $RECIPIENT ($RECIPIENT_KEY)"
echo "==> Funding recipient via Friendbot"
fund "$RECIPIENT"
sleep 5

NOW="$(date +%s)"

# ---------------------------------------------------------------- 1. linear
START="$((NOW + 15))"
CLIFF="$((START + 30))"
END="$((START + 600))"
echo "==> create_linear (10 XLM over 10 minutes, 30s cliff)"
LINEAR_ID="$(strip_num "$(invoke hourglass-user create_linear \
    --sender "$SENDER" --recipient "$RECIPIENT" --token "$TOKEN" \
    --deposited 100000000 --start_ts "$START" --cliff_ts "$CLIFF" --end_ts "$END" \
    --unlock_at_start 0 --unlock_at_cliff 1000000 \
    --is_cancelable true --is_transferable true)")"
echo "Linear stream id: $LINEAR_ID"

# ---------------------------------------------------------------- 2. recurring
FIRST="$((NOW + 20))"
echo "==> create_recurring (3 x 1 XLM, every 60s, first at +20s)"
RECURRING_ID="$(strip_num "$(invoke hourglass-user create_recurring \
    --sender "$SENDER" --recipient "$RECIPIENT" --token "$TOKEN" \
    --amount_per_period 10000000 --period_secs 60 --count 3 --first_ts "$FIRST" \
    --is_cancelable true --is_transferable true)")"
echo "Recurring stream id: $RECURRING_ID"
invoke hourglass-user get_stream --stream_id "$RECURRING_ID" | jq -c '{start_ts, end_ts, deposited, shape}'

# ---------------------------------------------------------------- 3. batch
BSTART="$((NOW + 60))"
ROWS="$(jq -nc \
    --arg r "$RECIPIENT" \
    --argjson s "$BSTART" \
    '[
      { recipient: $r, is_cancelable: true,  is_transferable: true,
        spec: { Linear: { deposited: "20000000", start_ts: $s, cliff_ts: $s, end_ts: ($s + 600),
                          unlock_at_start: "0", unlock_at_cliff: "0" } } },
      { recipient: $r, is_cancelable: true,  is_transferable: false,
        spec: { Recurring: { amount_per_period: "5000000", period_secs: 60, count: 2, first_ts: $s } } },
      { recipient: $r, is_cancelable: false, is_transferable: true,
        spec: { Tranched: { tranches: [ { amount: "1000000", ts: $s }, { amount: "2000000", ts: ($s + 120) } ] } } }
    ]')"
echo "==> create_batch (linear + recurring + tranched, one tx)"
BATCH_IDS="$(invoke hourglass-user create_batch --sender "$SENDER" --token "$TOKEN" --rows "$ROWS")"
echo "Batch ids: $BATCH_IDS"
B0="$(echo "$BATCH_IDS" | jq -r '.[0]')"
B1="$(echo "$BATCH_IDS" | jq -r '.[1]')"
B2="$(echo "$BATCH_IDS" | jq -r '.[2]')"
if [ "$B1" != "$((B0 + 1))" ] || [ "$B2" != "$((B0 + 2))" ]; then
    echo "ERROR: batch ids are not consecutive: $BATCH_IDS"
    exit 1
fi
if [ "$B0" != "$((RECURRING_ID + 1))" ]; then
    echo "ERROR: expected first batch id $((RECURRING_ID + 1)), got $B0"
    exit 1
fi

# ---------------------------------------------------------------- 4. withdraw
echo "==> Waiting for the linear cliff and the first recurring unlock"
sleep 50

WITHDRAWABLE="$(strip_num "$(invoke "$RECIPIENT_KEY" withdrawable_amount --stream_id "$LINEAR_ID")")"
echo "Linear withdrawable: $WITHDRAWABLE stroops"
if ! [[ "$WITHDRAWABLE" =~ ^[0-9]+$ ]] || [ "$WITHDRAWABLE" -lt 1 ]; then
    echo "ERROR: expected linear withdrawable > 0, got '$WITHDRAWABLE'"
    exit 1
fi
invoke "$RECIPIENT_KEY" withdraw_max --stream_id "$LINEAR_ID" --to "$RECIPIENT" >/dev/null

REC_WITHDRAWABLE="$(strip_num "$(invoke "$RECIPIENT_KEY" withdrawable_amount --stream_id "$RECURRING_ID")")"
echo "Recurring withdrawable: $REC_WITHDRAWABLE stroops"
if ! [[ "$REC_WITHDRAWABLE" =~ ^[0-9]+$ ]] || [ "$REC_WITHDRAWABLE" -lt 10000000 ]; then
    echo "ERROR: expected recurring withdrawable >= 10000000 (one period), got '$REC_WITHDRAWABLE'"
    exit 1
fi
invoke "$RECIPIENT_KEY" withdraw_max --stream_id "$RECURRING_ID" --to "$RECIPIENT" >/dev/null
REC_STATE="$(invoke hourglass-user get_stream --stream_id "$RECURRING_ID")"
echo "Recurring after withdraw: $(echo "$REC_STATE" | jq -c '{deposited, withdrawn}')"
REC_WITHDRAWN="$(echo "$REC_STATE" | jq -r '.withdrawn' | tr -d '"')"
if [ "$REC_WITHDRAWN" -lt 10000000 ]; then
    echo "ERROR: recurring withdrawn should be >= 10000000, got $REC_WITHDRAWN"
    exit 1
fi

echo ""
echo "==> Recipient native XLM balance:"
curl -s "${HORIZON_URL}/accounts/${RECIPIENT}" \
    | jq -r '.balances[] | select(.asset_type=="native") | .balance'

# ---------------------------------------------------------------- 5. batch-size probe (optional)
# PROBE_BATCH=1 tries growing linear batches and reports the largest that fits
# the per-tx resource budget. Creates real (tiny) streams to the recipient.
if [ "${PROBE_BATCH:-0}" = "1" ]; then
    PSTART="$(( $(date +%s) + 120 ))"
    LARGEST=0
    for n in 10 20 30 40 50; do
        PROWS="$(jq -nc --arg r "$RECIPIENT" --argjson s "$PSTART" --argjson n "$n" \
            '[range($n)] | map({ recipient: $r, is_cancelable: true, is_transferable: true,
                spec: { Linear: { deposited: "1000", start_ts: $s, cliff_ts: $s, end_ts: ($s + 600),
                                  unlock_at_start: "0", unlock_at_cliff: "0" } } })')"
        echo "==> probe: create_batch with $n rows"
        if invoke hourglass-user create_batch --sender "$SENDER" --token "$TOKEN" --rows "$PROWS" >/dev/null; then
            LARGEST="$n"
        else
            echo "    $n rows did not fit; stopping probe"
            break
        fi
    done
    echo "==> Largest linear batch that fit in one tx: $LARGEST rows"
fi

echo ""
echo "==> Transaction hashes (evidence):"
grep -oE '\b[0-9a-f]{64}\b' "$LOG" | sort -u

echo ""
echo "==> Stream ids: linear=$LINEAR_ID recurring=$RECURRING_ID batch=$BATCH_IDS"
echo "==> SMOKE PASSED ✓"
```

- [ ] **Step 3: Shell-check the scripts**

Run: `bash -n scripts/deploy-testnet.sh && bash -n scripts/smoke-testnet.sh && chmod +x scripts/*.sh`
Expected: no output (syntax OK).

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-testnet.sh scripts/smoke-testnet.sh
git commit -m "build(deploy): reuse comptroller, jq-merge testnet.json; smoke covers recurring + batch"
```

---

### Task 9: Redeploy lockup to testnet, run the smoke, reset the indexer DB name

**Files:**
- Regenerate: `deployments/testnet.json`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: Task 8 scripts, Task 5 wasm.
- Produces: new testnet lockup id in `deployments/testnet.json`; a smoke log with tx hashes.

- [ ] **Step 1: Deploy**

Run: `./scripts/deploy-testnet.sh`
Expected: prints `==> Reusing comptroller CDIXANE4HA76SPOLISKSZIWGX2FZW4BDFLGUOGRQETELLVEV6O6A3AZW`, then `Lockup: C…` (a new id), then the merged JSON.

- [ ] **Step 2: Verify the manifest**

Run: `jq '{lockup, previous_lockup, comptroller, hgt_token, usdc_token, deployed_at}' deployments/testnet.json`
Expected: `previous_lockup` = `CDKYNKWDUBGDZSTJGU6ZYEQ5BUMGIHBXXEZUMAOMQAJRSAVVFFSB3CQK`, `lockup` is different, `comptroller` unchanged, `hgt_token` and `usdc_token` are still present (non-null).

- [ ] **Step 3: Run the smoke with the batch-size probe (≈3 minutes)**

Run: `PROBE_BATCH=1 ./scripts/smoke-testnet.sh`
Expected: prints `==> Largest linear batch that fit in one tx: N rows` (N is one of 10/20/30/40/50) and ends with `==> SMOKE PASSED ✓`, preceded by a list of tx hashes and the stream ids. Keep the printed hashes, ids and N — they go into the SOW evidence and the docs task.

- [ ] **Step 4: Point the indexer at a fresh database**

In `docker-compose.yml` change both occurrences of `MONGODB_DB: hourglass` to `MONGODB_DB: hourglass_v2`.

- [ ] **Step 5: Commit**

```bash
git add deployments/testnet.json docker-compose.yml
git commit -m "feat(deploy): lockup v0.2 on testnet (batch + recurring); fresh indexer db"
```

- [ ] **Step 6: Trigger the hosted rebuild**

Push `main` (`git push origin main`). Dokploy rebuilds `frontend` and `indexer` from the repo with the new `deployment.json` baked in. After it is up, open `/stream/<recurring id from the smoke>` — it must render with the `RECURRING` eyebrow and an "Unlocks" list under the Schedule tab, and `/dashboard` for the deployer address must list the batch streams. If the hosted app is not reachable from this session, report that this verification is pending for the user.

---

### Task 10: Documentation

**Files:**
- Modify: `README.md`
- Modify: `contract-technical-reference.md`

- [ ] **Step 1: README status + layout**

In `README.md` replace the `## Status` section body with:

```markdown
Lockup **v0.2** on testnet — Linear, Tranched and **Recurring** streams, atomic **batch creation**, NFT receipts. Frontend + Mongo indexer deployed; batch/recurring create UI, search/filtering and treasury prep are the next phase-2 sub-projects (see `docs/superpowers/specs/2026-09-10-batch-recurring-streams-design.md`).

- `cargo test` — all workspace tests pass in-process (no network).
- Wasm builds clean (`scripts/build.sh`): comptroller ~9 KB, lockup ~95 KB optimized.
- Testnet: contract ids in `deployments/testnet.json`; `scripts/smoke-testnet.sh` exercises linear, recurring and batch creation end-to-end.
```

Then replace the actual sizes with the numbers printed by `ls -lh dist/` in Task 5 (edit the two `~… KB` values).

- [ ] **Step 2: Contract reference — addresses**

In `contract-technical-reference.md` §2, replace the `Lockup` address in the table and in the Stellar Expert link with the new id from `deployments/testnet.json`; set `**Version:** v0.2.0` and `**Deployed:**` to the `deployed_at` date. Add a row `| **Lockup (v0.1, retired)** | \`CDKYNKWDUBGDZSTJGU6ZYEQ5BUMGIHBXXEZUMAOMQAJRSAVVFFSB3CQK\` |` under the table.

- [ ] **Step 3: Contract reference — entry points**

In §3.1 add these rows to the entry-point table after `create_tranched`:

```markdown
| `create_recurring` | Any address | Creates a recurring stream: `count` unlocks of `amount_per_period`, first at `first_ts`, then every `period_secs` |
| `create_batch` | Any address | Creates 1–100 streams of mixed shapes for one sender/token in one transaction; atomic; one token transfer |
```

- [ ] **Step 4: Contract reference — data model + math**

In §4 change the `StreamShape` enum to include `Recurring(RecurringShape)` and add after `Tranche`:

```rust
pub struct RecurringShape {
    pub first_ts: u64,          // First unlock (== start_ts)
    pub period_secs: u64,       // Seconds between unlocks
    pub count: u32,             // Number of unlocks; end_ts = first_ts + (count-1)*period_secs
    pub amount_per_period: i128 // Per-unlock amount; deposited = amount_per_period * count
}
```

Add a new subsection at the end of §5:

```markdown
### 5.3 Recurring Vesting

Let `F` = `first_ts`, `P` = `period_secs`, `N` = `count`, `A` = `amount_per_period`.

```
if t < F:
    streamed = 0
else:
    k        = min(N, floor((t - F) / P) + 1)
    streamed = A × k
```

Equivalent to a Tranched stream with `N` equal tranches at `F, F+P, …` but stored in four fields with O(1) math.

**Example** — 1,000 USDC on the 1st of each month for 12 months: `A = 1,000`, `P = 2,592,000` (30 days), `N = 12`, deposit `12,000`.
```

Add a new top-level section after §7:

```markdown
## 7b. Batch Creation

`create_batch(sender, token, rows: Vec<CreateRow>) -> Vec<u32>`

```rust
pub struct CreateRow {
    pub recipient: Address,
    pub spec: CreateSpec,        // Linear(LinearParams) | Tranched(TranchedParams) | Recurring(RecurringParams)
    pub is_cancelable: bool,
    pub is_transferable: bool,
}
```

- One sender, one token, 1–100 rows of any mix of shapes.
- Every row is validated first; the deposits are pulled with a **single** token transfer; streams are then persisted in row order, so the returned ids are consecutive.
- Atomic: an invalid row or a failed transfer reverts the whole call — no partial batches.
- Each stream emits the normal `created` event; batch membership is visible off-chain through the shared transaction hash.
- Errors: `EmptyBatch` (19), `BatchTooLarge` (20), `InvalidPeriod` (21), `InvalidCount` (22) plus the per-shape create errors.
- Practical limit measured on testnet (smoke probe, linear rows): **N rows per transaction** — replace N with the number printed by `PROBE_BATCH=1 ./scripts/smoke-testnet.sh` in Task 9. Tranched rows with many tranches fit fewer.
```

- [ ] **Step 5: Commit**

```bash
git add README.md contract-technical-reference.md
git commit -m "docs: lockup v0.2 — recurring streams, batch creation, new testnet address"
```

---

### Task 11: Final sweep

- [ ] **Step 1: Everything green from a clean state**

Run:
```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets
cargo test --workspace
./scripts/build.sh
cd sdk && npm run build && cd ..
cd frontend && node scripts/sync-deployment.mjs && npm run typecheck && npm run build && cd ..
git status --short
```
Expected: fmt check passes; no new clippy warnings in `create.rs`/`math.rs`/`types.rs`; all tests pass; wasm builds; SDK and frontend build; `git status` is clean (only untracked `smoke-testnet-*.log`, which `*.log` in `.gitignore` already hides).

- [ ] **Step 2: Record the evidence**

Append to the bottom of `contract-technical-reference.md` a short `## 12. Testnet Evidence (v0.2 smoke)` section listing the stream ids and tx hashes printed by the smoke run in Task 9, each hash as `https://stellar.expert/explorer/testnet/tx/<hash>`. Commit:

```bash
git add contract-technical-reference.md
git commit -m "docs: record v0.2 testnet smoke evidence"
```

- [ ] **Step 3: Tag**

```bash
git tag v0.2.0-lockup -m "Lockup v0.2 — recurring streams + batch creation on testnet"
```

---

## Out of scope (next sub-projects)

- **Sub-project 2** — indexer/API: search, filtering, sorting, pagination, wallet-wide history, templates storage, `getEvents` paging fix.
- **Sub-project 3** — frontend: batch create (multi-row/CSV), recurring tab, templates save/load, dashboard filters, history view; SDK chunk size for batches.
- **Sub-project 4** — treasury prep: `treasury` contract, `YieldStrategy` trait, mock strategy, share accounting, testnet.
- **Sub-project 5** — public beta ops, developer docs, demo material.
