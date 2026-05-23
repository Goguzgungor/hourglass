# Hourglass MVP — Smart Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Hourglass smart-contract MVP to Stellar testnet — two Soroban contracts (`lockup` for streams + `comptroller` for fee config) supporting Lockup Linear and Tranched streams, NFT-wrapped receipts, full lifecycle (create / withdraw / cancel / renounce / transfer / burn), with TDD coverage, deterministic deploy scripts, a smoke test, and minimal TypeScript bindings ready for downstream consumers.

**Architecture:** A Rust Cargo workspace with three crates: `shared` (types + errors + math), `comptroller` (upgradeable; admin + USD-denominated fee oracle adapter), `lockup` (immutable; stream storage + lifecycle + embedded OZ NFT receipt). Soroban-only — no off-chain components in this plan. The indexer (Mercury Retroshades) and frontend (Next.js) get their own plans once this contract API is live on testnet.

**Tech Stack:** Rust (stable), `soroban-sdk = "26"`, OpenZeppelin `stellar-tokens` v0.7.1, `stellar-cli`, TypeScript (for generated bindings), GitHub Actions for CI.

**Scope cut from this plan (deliberately):** Reflector oracle production wiring beyond an adapter trait + mock + a stub real impl behind a feature flag; broker fees at create; sender-sponsored withdrawal fees; on-chain SVG NFT renderer; Dynamic / Flow / Airdrops / Claimable-Balance hybrid. These are explicitly Phase 1+ in the spec.

---

## File Structure

```
stellar-sablier/                                # working dir; rename to hourglass before launch
├── .gitignore
├── LICENSE                                     # Apache-2.0
├── README.md
├── Cargo.toml                                  # workspace root
├── rust-toolchain.toml                         # pin stable
├── contracts/
│   ├── shared/                                 # rlib — no contract; just types/math
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── errors.rs                       # Error contracterror enum
│   │       ├── types.rs                        # Stream, StreamShape, Tranche, OpKind
│   │       └── math.rs                         # i128 helpers + streamed_amount fns
│   ├── comptroller/                            # cdylib — upgradeable Soroban contract
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                          # contract entry, storage, public fns
│   │       ├── oracle.rs                       # PriceOracle trait + Mock + ReflectorAdapter
│   │       └── tests.rs                        # integration tests
│   └── lockup/                                 # cdylib — immutable Soroban contract
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                          # contract entry, storage, dispatch
│           ├── create.rs                       # create_linear, create_tranched
│           ├── lifecycle.rs                    # withdraw, cancel, renounce, burn, transfer hook
│           ├── nft.rs                          # OZ NonFungibleToken Enumerable glue
│           ├── view.rs                         # streamed_amount, withdrawable_amount, status
│           ├── events.rs                       # event publish helpers
│           └── tests/                          # integration tests by feature
│               ├── mod.rs
│               ├── common.rs                   # test helpers (env, fixtures)
│               ├── linear.rs
│               ├── tranched.rs
│               ├── cancel.rs
│               ├── renounce.rs
│               ├── transfer.rs
│               └── invariants.rs
├── scripts/
│   ├── build.sh                                # compiles both contracts to wasm
│   ├── deploy-testnet.sh                       # deploys comptroller then lockup
│   ├── smoke-testnet.sh                        # end-to-end happy-path
│   └── verify-wasm.sh                          # sanity-checks wasm artifacts
├── deployments/
│   └── testnet.json                            # written by deploy-testnet.sh
└── sdk/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts
    │   ├── lockup.ts                           # re-exports generated client + helpers
    │   ├── comptroller.ts                      # re-exports generated client
    │   └── generated/                          # output of `stellar contract bindings typescript`
    └── tests/
        └── smoke.test.ts                       # uses local quickstart RPC
```

Files that change together live together. Tests sit next to (or as siblings of) the implementation. `shared` is pure logic — easy to unit-test outside any Soroban env (mostly). Contract crates have integration tests that spin up `Env::default()`.

---

## Task 1: Initialize repo, license, and workspace

**Files:**
- Create: `LICENSE`, `README.md`, `.gitignore`, `Cargo.toml`, `rust-toolchain.toml`

- [ ] **Step 1: Initialize git + .gitignore**

```bash
cd /Users/midex/Documents/stellar-sablier
git init -b main
```

Write `.gitignore`:

```gitignore
# Rust
target/
**/*.rs.bk
Cargo.lock

# Node
node_modules/
*.log
.next/
dist/

# Stellar
.soroban/
*.wasm
deployments/*.local.json

# OS / editor
.DS_Store
.vscode/
.idea/
```

- [ ] **Step 2: Write LICENSE (Apache-2.0)**

Write the full Apache-2.0 license text. Use the canonical version from `https://www.apache.org/licenses/LICENSE-2.0.txt`. Replace the copyright placeholder line with `Copyright 2026 Hourglass contributors`.

- [ ] **Step 3: Write README.md (stub)**

```markdown
# Hourglass

Token streaming on Stellar / Soroban.

Clean-room reimplementation inspired by Sablier's publicly documented Lockup protocol. Apache-2.0.

## Status

Pre-MVP. See `docs/superpowers/specs/2026-05-23-hourglass-design.md` for the design and `docs/superpowers/plans/2026-05-23-hourglass-contracts-mvp.md` for the contracts implementation plan.

## Repo layout

- `contracts/` — Rust workspace: `shared`, `comptroller`, `lockup`.
- `sdk/` — TypeScript bindings.
- `scripts/` — build / deploy / smoke.

## Build

```bash
./scripts/build.sh
```

## Test

```bash
cargo test
```
```

- [ ] **Step 4: Write rust-toolchain.toml**

```toml
[toolchain]
channel = "stable"
targets = ["wasm32-unknown-unknown"]
components = ["rustfmt", "clippy"]
```

- [ ] **Step 5: Write Cargo.toml workspace root**

```toml
[workspace]
resolver = "2"
members = [
    "contracts/shared",
    "contracts/comptroller",
    "contracts/lockup",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "Apache-2.0"
repository = "https://github.com/hourglass-protocol/hourglass"
rust-version = "1.79"

[workspace.dependencies]
soroban-sdk = "26"
stellar-tokens = "=0.7.1"
stellar-access = "=0.7.1"
stellar-contract-utils = "=0.7.1"
stellar-macros = "=0.7.1"

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true

[profile.release-with-logs]
inherits = "release"
debug-assertions = true
```

- [ ] **Step 6: Verify workspace parses**

Run: `cargo metadata --format-version 1 > /dev/null`
Expected: exits 0 (will fail until member crates exist; will create them next tasks). To make this pass now temporarily, you can skip this step until Task 3 finishes — note it as deferred.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: initialize repo, license, and workspace skeleton"
```

---

## Task 2: Verify stellar-cli + create testnet identity

**Files:** None (environment setup); record output in `README.md` under a new "Toolchain" section.

- [ ] **Step 1: Check stellar-cli version**

Run: `stellar --version`
Expected: `stellar 22.x` or newer (the Soroban-aware CLI). If not installed, run `cargo install --locked stellar-cli` and re-check.

- [ ] **Step 2: Add testnet network config**

```bash
stellar network add testnet \
    --rpc-url https://soroban-testnet.stellar.org:443 \
    --network-passphrase "Test SDF Network ; September 2015"
```

- [ ] **Step 3: Create deploying identity**

```bash
stellar keys generate hourglass-deploy --network testnet --fund
```

This funds the identity from Friendbot.

- [ ] **Step 4: Confirm balance**

```bash
stellar keys address hourglass-deploy
# Copy the GD... address, then:
curl -s "https://horizon-testnet.stellar.org/accounts/<address>" | head -20
```

Expected: JSON with `"balance": "10000.0000000"` for native XLM (or similar).

- [ ] **Step 5: Append "Toolchain" section to README**

```markdown
## Toolchain

- `stellar-cli` 22+ (`cargo install --locked stellar-cli`)
- Rust stable + `wasm32-unknown-unknown` target (set automatically by `rust-toolchain.toml`)

Local deployer identity for testnet (one-time):

```bash
stellar network add testnet \
    --rpc-url https://soroban-testnet.stellar.org:443 \
    --network-passphrase "Test SDF Network ; September 2015"
stellar keys generate hourglass-deploy --network testnet --fund
```
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document stellar-cli toolchain and deployer identity setup"
```

---

## Task 3: Scaffold `shared` crate

**Files:**
- Create: `contracts/shared/Cargo.toml`, `contracts/shared/src/lib.rs`

- [ ] **Step 1: Write `contracts/shared/Cargo.toml`**

```toml
[package]
name = "hourglass-shared"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
rust-version.workspace = true
description = "Shared types, errors, and math for Hourglass contracts"

[lib]
crate-type = ["rlib"]
doctest = false

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
```

- [ ] **Step 2: Write `contracts/shared/src/lib.rs`**

```rust
#![no_std]

pub mod errors;
pub mod math;
pub mod types;

pub use errors::Error;
pub use types::{OpKind, Stream, StreamShape, StreamStatus, Tranche};
```

- [ ] **Step 3: Verify it builds**

Run: `cargo build -p hourglass-shared`
Expected: errors about missing `errors`, `math`, `types` modules. That's fine — fix in next tasks.

- [ ] **Step 4: Stub the missing modules so it builds clean**

```bash
mkdir -p contracts/shared/src
```

Write `contracts/shared/src/errors.rs`:

```rust
//! Error enum filled in Task 4.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Placeholder = 0,
}
```

Write `contracts/shared/src/math.rs`:

```rust
//! Math helpers filled in Task 6 onwards.
```

Write `contracts/shared/src/types.rs`:

```rust
//! Types filled in Task 5.

use soroban_sdk::{contracttype, Address, Vec};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OpKind {
    Withdraw,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StreamStatus {
    Pending,
    Streaming,
    Settled,
    Canceled,
    Depleted,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Tranche {
    pub amount: i128,
    pub ts: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StreamShape {
    Linear {
        cliff_ts: u64,
        unlock_at_start: i128,
        unlock_at_cliff: i128,
    },
    Tranched {
        tranches: Vec<Tranche>,
    },
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Stream {
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub start_ts: u64,
    pub end_ts: u64,
    pub is_cancelable: bool,
    pub is_transferable: bool,
    pub was_canceled: bool,
    pub is_depleted: bool,
    pub deposited: i128,
    pub withdrawn: i128,
    pub refunded: i128,
    pub shape: StreamShape,
}
```

- [ ] **Step 5: Verify it builds**

Run: `cargo build -p hourglass-shared`
Expected: PASS with warnings about unused code. Fix actual `cargo metadata --format-version 1` invocation from Task 1 Step 6 also passes now.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(shared): scaffold shared crate with type and error stubs"
```

---

## Task 4: Flesh out the `Error` enum

**Files:** Modify `contracts/shared/src/errors.rs`

- [ ] **Step 1: Write the full error enum**

Replace `contracts/shared/src/errors.rs`:

```rust
use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Invalid call — generic catch-all (avoid in new code; prefer a specific variant).
    InvalidCall = 1,

    // ---- Create-time validation ----
    /// Deposit must be > 0.
    ZeroDeposit = 10,
    /// `start_ts` must be < `end_ts`.
    StartAfterEnd = 11,
    /// `cliff_ts` must be in [`start_ts`, `end_ts`].
    CliffOutOfRange = 12,
    /// `unlock_at_start + unlock_at_cliff` must be ≤ `deposited`.
    UnlocksExceedDeposit = 13,
    /// At least one tranche required.
    NoTranches = 14,
    /// Tranches must be strictly ascending by `ts`.
    TranchesNotAscending = 15,
    /// Sum of tranche amounts must equal `deposited`.
    TrancheSumMismatch = 16,
    /// Tranche count exceeds `MAX_TRANCHES`.
    TooManyTranches = 17,
    /// `start_ts` (or first tranche ts) must be ≥ current ledger time.
    StartInPast = 18,

    // ---- Lifecycle pre-conditions ----
    /// Stream id has no record.
    StreamNotFound = 30,
    /// Caller is not the sender of the stream.
    NotSender = 31,
    /// Caller is not the recipient (NFT owner) or an approved spender.
    NotRecipient = 32,
    /// Stream is not cancelable (was renounced or created non-cancelable).
    NotCancelable = 33,
    /// Stream is not transferable.
    NotTransferable = 34,
    /// Stream has already been canceled.
    AlreadyCanceled = 35,
    /// Stream has already been depleted.
    AlreadyDepleted = 36,
    /// Stream is in a status that does not permit this op (e.g., burn before depleted).
    InvalidStatus = 37,

    // ---- Withdraw ----
    /// Requested withdraw amount > withdrawable.
    InsufficientWithdrawable = 50,
    /// Requested withdraw amount must be > 0.
    ZeroWithdraw = 51,

    // ---- Comptroller ----
    /// Caller is not the admin.
    NotAdmin = 70,
    /// Oracle price is stale (older than allowed window).
    OracleStale = 71,
    /// Oracle returned a non-positive price.
    InvalidOraclePrice = 72,
    /// Unknown operation enum value.
    UnknownOp = 73,

    // ---- Arithmetic ----
    /// Integer overflow during math.
    Overflow = 90,
}
```

- [ ] **Step 2: Build**

Run: `cargo build -p hourglass-shared`
Expected: PASS clean.

- [ ] **Step 3: Commit**

```bash
git add contracts/shared/src/errors.rs
git commit -m "feat(shared): define complete Error enum"
```

---

## Task 5: Lock down `types.rs` constants + helpers

**Files:** Modify `contracts/shared/src/types.rs`

- [ ] **Step 1: Add constants + status helper**

Append to `contracts/shared/src/types.rs`:

```rust
/// Maximum number of tranches in a Tranched stream. Bounded to keep
/// storage entry size + tx resource fee predictable.
pub const MAX_TRANCHES: u32 = 100;

impl Stream {
    /// Pure status derivation from current timestamp. Does not read storage.
    pub fn status(&self, now: u64) -> StreamStatus {
        if self.is_depleted {
            return StreamStatus::Depleted;
        }
        if self.was_canceled {
            return StreamStatus::Canceled;
        }
        if now < self.start_ts {
            return StreamStatus::Pending;
        }
        if now >= self.end_ts {
            return StreamStatus::Settled;
        }
        StreamStatus::Streaming
    }
}
```

- [ ] **Step 2: Add a unit test for the status helper**

Append at end of `types.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn stream(env: &Env) -> Stream {
        let addr = Address::generate(env);
        Stream {
            sender: addr.clone(),
            recipient: addr.clone(),
            token: addr.clone(),
            start_ts: 100,
            end_ts: 200,
            is_cancelable: true,
            is_transferable: true,
            was_canceled: false,
            is_depleted: false,
            deposited: 1000,
            withdrawn: 0,
            refunded: 0,
            shape: StreamShape::Linear {
                cliff_ts: 100,
                unlock_at_start: 0,
                unlock_at_cliff: 0,
            },
        }
    }

    #[test]
    fn status_pending_before_start() {
        let env = Env::default();
        assert_eq!(stream(&env).status(50), StreamStatus::Pending);
    }

    #[test]
    fn status_streaming_during_window() {
        let env = Env::default();
        assert_eq!(stream(&env).status(150), StreamStatus::Streaming);
    }

    #[test]
    fn status_settled_at_or_after_end() {
        let env = Env::default();
        assert_eq!(stream(&env).status(200), StreamStatus::Settled);
        assert_eq!(stream(&env).status(99999), StreamStatus::Settled);
    }

    #[test]
    fn status_canceled_takes_precedence_over_time() {
        let env = Env::default();
        let mut s = stream(&env);
        s.was_canceled = true;
        assert_eq!(s.status(150), StreamStatus::Canceled);
    }

    #[test]
    fn status_depleted_takes_precedence_over_canceled() {
        let env = Env::default();
        let mut s = stream(&env);
        s.was_canceled = true;
        s.is_depleted = true;
        assert_eq!(s.status(50), StreamStatus::Depleted);
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-shared types::tests`
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add contracts/shared/src/types.rs
git commit -m "feat(shared): add MAX_TRANCHES + Stream::status with tests"
```

---

## Task 6: Math helpers — checked arithmetic

**Files:** Modify `contracts/shared/src/math.rs`

- [ ] **Step 1: Write the failing tests first**

Replace `contracts/shared/src/math.rs`:

```rust
use crate::errors::Error;

/// Checked i128 addition; returns Error::Overflow on overflow.
pub fn add(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_add(b).ok_or(Error::Overflow)
}

/// Checked i128 subtraction; returns Error::Overflow on overflow.
pub fn sub(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_sub(b).ok_or(Error::Overflow)
}

/// Checked i128 multiplication; returns Error::Overflow on overflow.
pub fn mul(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_mul(b).ok_or(Error::Overflow)
}

/// Checked i128 division; returns Error::Overflow on overflow (incl. divide by zero).
pub fn div(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_div(b).ok_or(Error::Overflow)
}

/// `(a * b) / c` with intermediate overflow protection. Floors.
/// Used for linear interpolation: `base * (now - cliff) / (end - cliff)`.
pub fn mul_div(a: i128, b: i128, c: i128) -> Result<i128, Error> {
    let prod = mul(a, b)?;
    div(prod, c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_ok() {
        assert_eq!(add(1, 2).unwrap(), 3);
    }

    #[test]
    fn add_overflow() {
        assert!(matches!(add(i128::MAX, 1), Err(Error::Overflow)));
    }

    #[test]
    fn sub_ok() {
        assert_eq!(sub(10, 4).unwrap(), 6);
    }

    #[test]
    fn sub_overflow() {
        assert!(matches!(sub(i128::MIN, 1), Err(Error::Overflow)));
    }

    #[test]
    fn mul_ok() {
        assert_eq!(mul(7, 6).unwrap(), 42);
    }

    #[test]
    fn mul_overflow() {
        assert!(matches!(mul(i128::MAX, 2), Err(Error::Overflow)));
    }

    #[test]
    fn div_by_zero() {
        assert!(matches!(div(10, 0), Err(Error::Overflow)));
    }

    #[test]
    fn mul_div_floors() {
        // 7 * 3 / 2 = 21 / 2 = 10 (floors).
        assert_eq!(mul_div(7, 3, 2).unwrap(), 10);
    }

    #[test]
    fn mul_div_handles_large() {
        // (1e30 * 1e18) / 1e18 = 1e30, would overflow naive i128 only if we did wrong order.
        // Our mul_div multiplies first; this DOES overflow — that's expected.
        assert!(matches!(mul_div(10i128.pow(30), 10i128.pow(18), 10i128.pow(18)), Err(Error::Overflow)));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p hourglass-shared math::tests`
Expected: 9 passed.

- [ ] **Step 3: Commit**

```bash
git add contracts/shared/src/math.rs
git commit -m "feat(shared): add checked i128 arithmetic helpers with tests"
```

---

## Task 7: `streamed_amount` for Linear streams

**Files:** Modify `contracts/shared/src/math.rs`

- [ ] **Step 1: Add the function and its tests**

Append to `contracts/shared/src/math.rs`:

```rust
use crate::types::Stream;

/// Compute the cumulative streamed amount of a Linear stream at time `now`.
///
/// Semantics (matches spec section 7):
///   - before start_ts          → 0
///   - in [start_ts, cliff_ts)  → unlock_at_start
///   - at  [cliff_ts, end_ts)   → unlock_at_start + unlock_at_cliff + linear_interpolation(remaining)
///   - at or after end_ts       → deposited
pub fn streamed_amount_linear(
    deposited: i128,
    start_ts: u64,
    cliff_ts: u64,
    end_ts: u64,
    unlock_at_start: i128,
    unlock_at_cliff: i128,
    now: u64,
) -> Result<i128, Error> {
    if now < start_ts {
        return Ok(0);
    }
    if now < cliff_ts {
        return Ok(unlock_at_start);
    }
    if now >= end_ts {
        return Ok(deposited);
    }
    let base = sub(sub(deposited, unlock_at_start)?, unlock_at_cliff)?;
    let elapsed = (now - cliff_ts) as i128;
    let span = (end_ts - cliff_ts) as i128;
    let portion = mul_div(base, elapsed, span)?;
    add(add(unlock_at_start, unlock_at_cliff)?, portion)
}

#[cfg(test)]
mod linear_tests {
    use super::*;

    const D: i128 = 1_000_000;
    const S: u64 = 1_000;
    const C: u64 = 2_000;
    const E: u64 = 4_000;

    #[test]
    fn zero_before_start() {
        assert_eq!(streamed_amount_linear(D, S, C, E, 0, 0, 500).unwrap(), 0);
    }

    #[test]
    fn unlock_at_start_only_before_cliff() {
        // unlock_at_start = 100k, no cliff lump
        assert_eq!(streamed_amount_linear(D, S, C, E, 100_000, 0, 1_500).unwrap(), 100_000);
    }

    #[test]
    fn cliff_lump_applies_at_cliff() {
        // 100k at start + 50k at cliff; at exactly cliff_ts, base = 850k, elapsed = 0
        assert_eq!(streamed_amount_linear(D, S, C, E, 100_000, 50_000, 2_000).unwrap(), 150_000);
    }

    #[test]
    fn linear_interpolation_midway() {
        // halfway between cliff (2000) and end (4000) → 3000.
        // base = 1M - 0 - 0 = 1M; elapsed=1000, span=2000 → 500k; total = 500k.
        assert_eq!(streamed_amount_linear(D, S, C, E, 0, 0, 3_000).unwrap(), 500_000);
    }

    #[test]
    fn full_at_end_ts() {
        assert_eq!(streamed_amount_linear(D, S, C, E, 0, 0, 4_000).unwrap(), D);
    }

    #[test]
    fn full_after_end_ts() {
        assert_eq!(streamed_amount_linear(D, S, C, E, 100_000, 50_000, 99_999).unwrap(), D);
    }

    #[test]
    fn no_cliff_equals_no_cliff_lump() {
        // cliff_ts == start_ts means we go straight to linear interpolation after start.
        // At t=2000 (halfway between 1000 and 3000), base=1M, elapsed=1000, span=2000 → 500k.
        assert_eq!(streamed_amount_linear(D, S, S, 3_000, 0, 0, 2_000).unwrap(), 500_000);
    }

    #[test]
    fn monotonic_non_decreasing() {
        // Walk forward in time, value never decreases.
        let mut prev = 0i128;
        for t in (0..5_000u64).step_by(37) {
            let cur = streamed_amount_linear(D, S, C, E, 10_000, 20_000, t).unwrap();
            assert!(cur >= prev, "decreased at t={}: prev={}, cur={}", t, prev, cur);
            prev = cur;
        }
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p hourglass-shared math::linear_tests`
Expected: 8 passed.

- [ ] **Step 3: Commit**

```bash
git add contracts/shared/src/math.rs
git commit -m "feat(shared): implement streamed_amount_linear with unit tests"
```

---

## Task 8: `streamed_amount` for Tranched streams

**Files:** Modify `contracts/shared/src/math.rs`

- [ ] **Step 1: Add function + tests**

Append to `contracts/shared/src/math.rs`:

```rust
use crate::types::Tranche;
use soroban_sdk::Vec as SorobanVec;

/// Cumulative streamed amount for a Tranched stream: sum of all tranche amounts
/// whose timestamp has passed (ts <= now).
///
/// Caller must ensure tranches are sorted ascending by ts (enforced at create).
pub fn streamed_amount_tranched(
    tranches: &SorobanVec<Tranche>,
    now: u64,
) -> Result<i128, Error> {
    let mut acc: i128 = 0;
    for t in tranches.iter() {
        if t.ts > now {
            break;
        }
        acc = add(acc, t.amount)?;
    }
    Ok(acc)
}

#[cfg(test)]
mod tranched_tests {
    use super::*;
    use soroban_sdk::{vec, Env};

    fn tranches(env: &Env, items: &[(i128, u64)]) -> SorobanVec<Tranche> {
        let mut v = SorobanVec::new(env);
        for (amount, ts) in items {
            v.push_back(Tranche { amount: *amount, ts: *ts });
        }
        v
    }

    #[test]
    fn zero_before_first_tranche() {
        let env = Env::default();
        let t = tranches(&env, &[(100, 1_000), (200, 2_000)]);
        assert_eq!(streamed_amount_tranched(&t, 500).unwrap(), 0);
    }

    #[test]
    fn first_tranche_at_its_ts() {
        let env = Env::default();
        let t = tranches(&env, &[(100, 1_000), (200, 2_000)]);
        assert_eq!(streamed_amount_tranched(&t, 1_000).unwrap(), 100);
    }

    #[test]
    fn accumulates_through_tranches() {
        let env = Env::default();
        let t = tranches(&env, &[(100, 1_000), (200, 2_000), (300, 3_000)]);
        assert_eq!(streamed_amount_tranched(&t, 2_500).unwrap(), 300);
    }

    #[test]
    fn full_after_last_tranche() {
        let env = Env::default();
        let t = tranches(&env, &[(100, 1_000), (200, 2_000), (300, 3_000)]);
        assert_eq!(streamed_amount_tranched(&t, 99_999).unwrap(), 600);
    }

    #[test]
    fn empty_returns_zero() {
        let env = Env::default();
        let t = tranches(&env, &[]);
        assert_eq!(streamed_amount_tranched(&t, 99_999).unwrap(), 0);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p hourglass-shared math::tranched_tests`
Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add contracts/shared/src/math.rs
git commit -m "feat(shared): implement streamed_amount_tranched with unit tests"
```

---

## Task 9: `streamed_amount` dispatcher on `Stream`

**Files:** Modify `contracts/shared/src/math.rs` and `contracts/shared/src/types.rs`

- [ ] **Step 1: Add a dispatcher method**

Append to `contracts/shared/src/math.rs`:

```rust
use crate::types::StreamShape;

/// Dispatcher: pulls the right shape branch and computes streamed amount.
pub fn streamed_amount(stream: &Stream, now: u64) -> Result<i128, Error> {
    match &stream.shape {
        StreamShape::Linear { cliff_ts, unlock_at_start, unlock_at_cliff } => {
            streamed_amount_linear(
                stream.deposited,
                stream.start_ts,
                *cliff_ts,
                stream.end_ts,
                *unlock_at_start,
                *unlock_at_cliff,
                now,
            )
        }
        StreamShape::Tranched { tranches } => streamed_amount_tranched(tranches, now),
    }
}

/// `withdrawable = streamed_amount(now) - withdrawn`. Saturates at 0 just in case
/// (should never go negative; defense in depth).
pub fn withdrawable_amount(stream: &Stream, now: u64) -> Result<i128, Error> {
    let streamed = streamed_amount(stream, now)?;
    Ok(sub(streamed, stream.withdrawn).unwrap_or(0).max(0))
}
```

- [ ] **Step 2: Add a Stream::withdrawable convenience method**

Append to `contracts/shared/src/types.rs` (inside the existing `impl Stream` block):

```rust
    pub fn withdrawable(&self, now: u64) -> i128 {
        crate::math::withdrawable_amount(self, now).unwrap_or(0)
    }
```

- [ ] **Step 3: Test the dispatcher**

Append to `contracts/shared/src/math.rs`:

```rust
#[cfg(test)]
mod dispatcher_tests {
    use super::*;
    use crate::types::*;
    use soroban_sdk::{testutils::Address as _, vec, Address, Env};

    fn linear_stream(env: &Env) -> Stream {
        let a = Address::generate(env);
        Stream {
            sender: a.clone(),
            recipient: a.clone(),
            token: a.clone(),
            start_ts: 1_000,
            end_ts: 4_000,
            is_cancelable: true,
            is_transferable: true,
            was_canceled: false,
            is_depleted: false,
            deposited: 1_000_000,
            withdrawn: 0,
            refunded: 0,
            shape: StreamShape::Linear {
                cliff_ts: 2_000,
                unlock_at_start: 0,
                unlock_at_cliff: 0,
            },
        }
    }

    #[test]
    fn linear_dispatch() {
        let env = Env::default();
        let s = linear_stream(&env);
        assert_eq!(streamed_amount(&s, 3_000).unwrap(), 500_000);
    }

    #[test]
    fn withdrawable_subtracts_withdrawn() {
        let env = Env::default();
        let mut s = linear_stream(&env);
        s.withdrawn = 200_000;
        assert_eq!(withdrawable_amount(&s, 3_000).unwrap(), 300_000);
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test -p hourglass-shared`
Expected: all previous tests + 2 new ones pass.

- [ ] **Step 5: Commit**

```bash
git add contracts/shared/src/math.rs contracts/shared/src/types.rs
git commit -m "feat(shared): add streamed_amount + withdrawable_amount dispatchers"
```

---

## Task 10: Scaffold `comptroller` crate

**Files:** Create `contracts/comptroller/Cargo.toml`, `contracts/comptroller/src/lib.rs`

- [ ] **Step 1: Write Cargo.toml**

```toml
[package]
name = "hourglass-comptroller"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
rust-version.workspace = true
description = "Hourglass admin + fee oracle contract"

[lib]
crate-type = ["cdylib"]
doctest = false

[dependencies]
soroban-sdk = { workspace = true }
hourglass-shared = { path = "../shared" }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
hourglass-shared = { path = "../shared" }
```

- [ ] **Step 2: Write the initial `lib.rs`**

```rust
#![no_std]

use hourglass_shared::Error;
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

mod oracle;

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    FeeCollector,
    /// Per-op USD fee in micro-USD (i.e., 1_000_000 == $1.00).
    FeeUsdMicros(u32),
    /// Oracle contract address.
    Oracle,
    /// Max accepted oracle staleness (ledger seconds).
    OracleMaxStaleness,
}

#[contract]
pub struct Comptroller;

#[contractimpl]
impl Comptroller {
    /// One-shot initializer. Idempotent: panics on re-init.
    pub fn __constructor(
        env: Env,
        admin: Address,
        fee_collector: Address,
        oracle: Address,
        max_staleness_secs: u32,
    ) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeCollector, &fee_collector);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&DataKey::OracleMaxStaleness, &max_staleness_secs);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn fee_collector(env: Env) -> Address {
        env.storage().instance().get(&DataKey::FeeCollector).unwrap()
    }
}

mod tests;
```

- [ ] **Step 3: Stub `oracle.rs` and `tests.rs`**

`contracts/comptroller/src/oracle.rs`:

```rust
//! Oracle adapter — filled in Task 13.
```

`contracts/comptroller/src/tests.rs`:

```rust
#![cfg(test)]
// Filled in Task 11.
```

- [ ] **Step 4: Build**

Run: `cargo build -p hourglass-comptroller --target wasm32-unknown-unknown --release`
Expected: PASS, produces `target/wasm32-unknown-unknown/release/hourglass_comptroller.wasm`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(comptroller): scaffold crate with constructor and getters"
```

---

## Task 11: Comptroller constructor test + admin helper

**Files:** Modify `contracts/comptroller/src/tests.rs`, `contracts/comptroller/src/lib.rs`

- [ ] **Step 1: Add admin gate helper to lib.rs**

Append before the last `mod tests;` line in `contracts/comptroller/src/lib.rs`:

```rust
fn require_admin(env: &Env) {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    admin.require_auth();
}

#[contractimpl]
impl Comptroller {
    pub fn set_admin(env: Env, new_admin: Address) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.events()
            .publish((symbol_short!("admin"), symbol_short!("changed")), new_admin);
    }
}
```

- [ ] **Step 2: Write integration test**

Replace `contracts/comptroller/src/tests.rs`:

```rust
#![cfg(test)]

use crate::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let oracle = Address::generate(&env);
    let id = env.register(
        Comptroller,
        (admin.clone(), fee_collector.clone(), oracle.clone(), 3_600u32),
    );
    (env, id, admin, fee_collector, oracle)
}

#[test]
fn constructor_sets_addresses() {
    let (env, id, admin, fee_collector, _oracle) = setup();
    let client = ComptrollerClient::new(&env, &id);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.fee_collector(), fee_collector);
}

#[test]
fn set_admin_requires_admin_auth() {
    let (env, id, admin, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    let new_admin = Address::generate(&env);

    env.mock_all_auths();
    client.set_admin(&new_admin);
    assert_eq!(client.admin(), new_admin);
}

#[test]
#[should_panic(expected = "auth")]
fn set_admin_without_auth_fails() {
    let (env, id, _admin, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    let new_admin = Address::generate(&env);

    // No mock_all_auths -> require_auth panics.
    client.set_admin(&new_admin);
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-comptroller`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(comptroller): add set_admin with auth check and tests"
```

---

## Task 12: Comptroller fee storage (`set_fee` / `get_fee`)

**Files:** Modify `contracts/comptroller/src/lib.rs` and `contracts/comptroller/src/tests.rs`

- [ ] **Step 1: Add op-kind enum + fee setters**

Append to `contracts/comptroller/src/lib.rs` (a fresh `#[contractimpl]` block is fine — Soroban concatenates them):

```rust
/// Convert an OpKind to its DataKey index. Keep stable forever (don't reorder).
fn op_index(op: &hourglass_shared::OpKind) -> u32 {
    match op {
        hourglass_shared::OpKind::Withdraw => 1,
    }
}

#[contractimpl]
impl Comptroller {
    pub fn set_fee_usd_micros(env: Env, op: hourglass_shared::OpKind, micros: i128) {
        require_admin(&env);
        if micros < 0 {
            panic_with_error!(&env, Error::InvalidCall);
        }
        env.storage()
            .instance()
            .set(&DataKey::FeeUsdMicros(op_index(&op)), &micros);
        env.events().publish(
            (Symbol::new(&env, "fee_set"), op_index(&op)),
            micros,
        );
    }

    pub fn get_fee_usd_micros(env: Env, op: hourglass_shared::OpKind) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::FeeUsdMicros(op_index(&op)))
            .unwrap_or(0)
    }
}
```

Add `panic_with_error` to the import line at the top: change `use soroban_sdk::{...};` to include `panic_with_error`.

- [ ] **Step 2: Test**

Append to `contracts/comptroller/src/tests.rs`:

```rust
use hourglass_shared::OpKind;

#[test]
fn fee_defaults_to_zero() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    assert_eq!(client.get_fee_usd_micros(&OpKind::Withdraw), 0);
}

#[test]
fn admin_can_set_fee() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    env.mock_all_auths();
    client.set_fee_usd_micros(&OpKind::Withdraw, &99_000);
    assert_eq!(client.get_fee_usd_micros(&OpKind::Withdraw), 99_000);
}

#[test]
#[should_panic]
fn non_admin_cannot_set_fee() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    client.set_fee_usd_micros(&OpKind::Withdraw, &99_000);
}

#[test]
#[should_panic]
fn negative_fee_rejected() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    env.mock_all_auths();
    client.set_fee_usd_micros(&OpKind::Withdraw, &-1);
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-comptroller`
Expected: 7 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(comptroller): add USD-denominated per-op fee storage with tests"
```

---

## Task 13: Oracle adapter (trait + mock; real adapter stubbed behind feature)

**Files:** Replace `contracts/comptroller/src/oracle.rs`; modify `Cargo.toml`

- [ ] **Step 1: Add feature flag for the real Reflector wiring**

Modify `contracts/comptroller/Cargo.toml` — add a `[features]` section:

```toml
[features]
default = []
reflector = []
```

The `reflector` feature gates the live oracle import so tests + Phase-0 deploys can use the mock without pulling in an external contract WASM.

- [ ] **Step 2: Define the adapter API in `oracle.rs`**

Replace `contracts/comptroller/src/oracle.rs`:

```rust
use hourglass_shared::Error;
use soroban_sdk::{contracttype, Address, Env};

/// Price snapshot returned by the oracle adapter.
/// `price_x14` is XLM-per-USD scaled by 1e14 (matches Reflector's published scale).
/// `ts_secs` is the unix-seconds timestamp of the snapshot.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceSnapshot {
    pub price_x14: i128,
    pub ts_secs: u64,
}

pub trait PriceOracle {
    fn last_xlm_per_usd(env: &Env, oracle_addr: &Address) -> Result<PriceSnapshot, Error>;
}

/// Mock oracle used in tests. Returns a value written to the contract's
/// `MockOraclePrice` and `MockOracleTs` instance keys.
#[cfg(any(test, feature = "test-utils"))]
pub mod mock {
    use super::*;
    use soroban_sdk::contracttype;

    #[contracttype]
    pub enum MockKey {
        Price,
        Ts,
    }

    pub fn set(env: &Env, contract: &Address, price_x14: i128, ts_secs: u64) {
        env.as_contract(contract, || {
            env.storage().instance().set(&MockKey::Price, &price_x14);
            env.storage().instance().set(&MockKey::Ts, &ts_secs);
        });
    }

    pub struct MockOracle;

    impl PriceOracle for MockOracle {
        fn last_xlm_per_usd(env: &Env, oracle_addr: &Address) -> Result<PriceSnapshot, Error> {
            let (price_x14, ts_secs) = env.as_contract(oracle_addr, || {
                let price: i128 = env
                    .storage()
                    .instance()
                    .get(&MockKey::Price)
                    .unwrap_or(0);
                let ts: u64 = env
                    .storage()
                    .instance()
                    .get(&MockKey::Ts)
                    .unwrap_or(0);
                (price, ts)
            });
            if price_x14 <= 0 {
                return Err(Error::InvalidOraclePrice);
            }
            Ok(PriceSnapshot { price_x14, ts_secs })
        }
    }
}

/// Live Reflector adapter. Reflector exposes a `lastprice(asset)` function returning
/// `Option<PriceData{price: i128, timestamp: u64}>` where `price` is scaled by 1e14.
/// We `contractimport!` the on-chain contract spec via a build script when `reflector`
/// feature is enabled. For Phase 0 builds without the feature, this is a no-op stub
/// that always returns Error::OracleStale so a mis-configured deploy fails loud.
#[cfg(feature = "reflector")]
pub mod reflector {
    use super::*;

    pub struct ReflectorOracle;

    impl PriceOracle for ReflectorOracle {
        fn last_xlm_per_usd(_env: &Env, _oracle_addr: &Address) -> Result<PriceSnapshot, Error> {
            // Wire the real `contractimport!` here once Reflector ABI is pinned. The
            // task that turns this on is in the Phase-1 plan (oracle hardening),
            // not Phase-0 MVP. Until then, `reflector` feature must not be enabled.
            Err(Error::OracleStale)
        }
    }
}
```

- [ ] **Step 3: Build (default features)**

Run: `cargo build -p hourglass-comptroller`
Expected: PASS, no use of the `reflector` cfg.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(comptroller): add PriceOracle trait + mock adapter; gate live Reflector behind feature"
```

---

## Task 14: `fee_for(op)` — USD → XLM stroops conversion

**Files:** Modify `contracts/comptroller/src/lib.rs` and `contracts/comptroller/src/tests.rs`

- [ ] **Step 1: Add fee_for**

Append to `contracts/comptroller/src/lib.rs`:

```rust
use crate::oracle::{PriceOracle, PriceSnapshot};
#[cfg(test)]
use crate::oracle::mock::MockOracle;

#[contractimpl]
impl Comptroller {
    /// Returns the XLM-stroops a caller must pay to perform `op`, given the
    /// current oracle quote. Reverts if oracle is stale or invalid.
    pub fn fee_for(env: Env, op: hourglass_shared::OpKind) -> i128 {
        let micros: i128 = Self::get_fee_usd_micros(env.clone(), op);
        if micros == 0 {
            return 0;
        }
        let oracle_addr: Address = env.storage().instance().get(&DataKey::Oracle).unwrap();
        let max_stale: u32 = env
            .storage()
            .instance()
            .get(&DataKey::OracleMaxStaleness)
            .unwrap();

        // PHASE 0: use mock oracle (test) or fail-closed (default-build) — see Task 13.
        // Phase 1 swaps this dispatch for a feature-gated adapter selection.
        #[cfg(test)]
        let snap: PriceSnapshot = MockOracle::last_xlm_per_usd(&env, &oracle_addr).unwrap();
        #[cfg(not(test))]
        let snap: PriceSnapshot = {
            #[cfg(feature = "reflector")]
            {
                crate::oracle::reflector::ReflectorOracle::last_xlm_per_usd(&env, &oracle_addr)
                    .unwrap()
            }
            #[cfg(not(feature = "reflector"))]
            {
                // No oracle wired -> revert. Phase-0 testnet deploys MUST stub the fee to 0
                // in `set_fee_usd_micros` rather than enabling this path on mainnet.
                panic_with_error!(&env, Error::OracleStale)
            }
        };

        let now = env.ledger().timestamp();
        if now.saturating_sub(snap.ts_secs) > max_stale as u64 {
            panic_with_error!(&env, Error::OracleStale);
        }
        // micros is i128 USD * 1e6
        // snap.price_x14 is i128 XLM * 1e14 per USD
        // 1 XLM = 10_000_000 stroops
        // stroops = micros * price_x14 * 10_000_000 / (1e6 * 1e14)
        //        = micros * price_x14 / 1e13
        let num = micros.checked_mul(snap.price_x14).unwrap_or(i128::MAX);
        num / 10_000_000_000_000i128
    }
}
```

- [ ] **Step 2: Tests**

Append to `contracts/comptroller/src/tests.rs`:

```rust
use crate::oracle::mock as oracle_mock;

#[test]
fn fee_for_zero_when_unset() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    assert_eq!(client.fee_for(&OpKind::Withdraw), 0);
}

#[test]
fn fee_for_uses_oracle() {
    let (env, id, _a, _fc, oracle) = setup();
    let client = ComptrollerClient::new(&env, &id);
    env.mock_all_auths();
    client.set_fee_usd_micros(&OpKind::Withdraw, &99_000); // $0.099

    // Pretend XLM = $0.10  ->  10 XLM per USD  ->  price_x14 = 10 * 1e14 = 1e15
    env.ledger().set_timestamp(1_000_000);
    oracle_mock::set(&env, &oracle, 1_000_000_000_000_000i128, 999_999);

    // expected = 99_000 * 1e15 / 1e13 = 99_000 * 100 = 9_900_000 stroops = 0.99 XLM
    assert_eq!(client.fee_for(&OpKind::Withdraw), 9_900_000);
}

#[test]
#[should_panic]
fn fee_for_panics_when_oracle_stale() {
    let (env, id, _a, _fc, oracle) = setup();
    let client = ComptrollerClient::new(&env, &id);
    env.mock_all_auths();
    client.set_fee_usd_micros(&OpKind::Withdraw, &99_000);

    env.ledger().set_timestamp(1_000_000);
    oracle_mock::set(&env, &oracle, 1_000_000_000_000_000i128, 100); // very stale
    client.fee_for(&OpKind::Withdraw);
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-comptroller`
Expected: 10 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(comptroller): implement fee_for(op) with oracle conversion + staleness check"
```

---

## Task 15: Upgrade entry for comptroller

**Files:** Modify `contracts/comptroller/src/lib.rs` and `contracts/comptroller/src/tests.rs`

- [ ] **Step 1: Add upgrade entry**

Append to `contracts/comptroller/src/lib.rs`:

```rust
use soroban_sdk::BytesN;

#[contractimpl]
impl Comptroller {
    /// Upgrade the running wasm. Admin-gated.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        require_admin(&env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}
```

- [ ] **Step 2: Test (only that admin gating fires — actually swapping wasm requires a second contract binary which we skip in unit tests)**

Append to `contracts/comptroller/src/tests.rs`:

```rust
use soroban_sdk::BytesN;

#[test]
#[should_panic]
fn upgrade_requires_admin() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    let zero_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
    client.upgrade(&zero_hash);
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-comptroller`
Expected: 11 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(comptroller): add admin-gated upgrade entry"
```

---

## Task 16: Scaffold `lockup` crate

**Files:** Create `contracts/lockup/Cargo.toml`, `contracts/lockup/src/lib.rs`, `contracts/lockup/src/{events,view,create,lifecycle,nft}.rs`, `contracts/lockup/src/tests/{mod,common}.rs`

- [ ] **Step 1: Write `Cargo.toml`**

```toml
[package]
name = "hourglass-lockup"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
rust-version.workspace = true
description = "Hourglass Lockup streams (Linear + Tranched) with NFT-wrapped receipts"

[lib]
crate-type = ["cdylib"]
doctest = false

[dependencies]
soroban-sdk = { workspace = true }
hourglass-shared = { path = "../shared" }
hourglass-comptroller = { path = "../comptroller", features = [] }
stellar-tokens = { workspace = true }
stellar-access = { workspace = true }
stellar-contract-utils = { workspace = true }
stellar-macros = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
hourglass-shared = { path = "../shared" }
hourglass-comptroller = { path = "../comptroller" }
```

- [ ] **Step 2: Skeleton `lib.rs`**

```rust
#![no_std]

use hourglass_shared::{Error, Stream};
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Env, Vec,
};

mod create;
mod events;
mod lifecycle;
mod nft;
mod view;

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    Comptroller,
    NextStreamId,
    Stream(u32),
}

#[contract]
pub struct Lockup;

#[contractimpl]
impl Lockup {
    pub fn __constructor(env: Env, admin: Address, comptroller: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Comptroller, &comptroller);
        env.storage().instance().set(&DataKey::NextStreamId, &1u32);
        nft::init(&env);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn comptroller(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Comptroller).unwrap()
    }

    pub fn get_stream(env: Env, stream_id: u32) -> Stream {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::StreamNotFound))
    }
}

pub(crate) fn next_id(env: &Env) -> u32 {
    let id: u32 = env.storage().instance().get(&DataKey::NextStreamId).unwrap();
    env.storage()
        .instance()
        .set(&DataKey::NextStreamId, &(id + 1));
    id
}

pub(crate) fn save_stream(env: &Env, stream_id: u32, stream: &Stream) {
    env.storage()
        .persistent()
        .set(&DataKey::Stream(stream_id), stream);
}

pub(crate) fn load_stream(env: &Env, stream_id: u32) -> Stream {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::StreamNotFound))
}

#[cfg(test)]
mod tests;
```

- [ ] **Step 3: Stub the submodules so it builds**

`contracts/lockup/src/create.rs`:

```rust
// Filled in Task 17.
```

`contracts/lockup/src/events.rs`:

```rust
//! Event publish helpers — filled in Task 17.
```

`contracts/lockup/src/lifecycle.rs`:

```rust
// Filled in Tasks 19-23.
```

`contracts/lockup/src/nft.rs`:

```rust
use soroban_sdk::Env;

/// Filled in Task 24.
pub(crate) fn init(_env: &Env) {}
```

`contracts/lockup/src/view.rs`:

```rust
// Filled in Task 25.
```

`contracts/lockup/src/tests/mod.rs`:

```rust
#![cfg(test)]

mod common;
```

`contracts/lockup/src/tests/common.rs`:

```rust
// Filled in Task 17.
```

- [ ] **Step 4: Build for wasm target**

Run: `cargo build -p hourglass-lockup --target wasm32-unknown-unknown --release`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lockup): scaffold crate, constructor, storage helpers"
```

---

## Task 17: Test fixtures + first `create_linear` end-to-end

**Files:** Modify `contracts/lockup/src/create.rs`, `events.rs`, `tests/common.rs`, `tests/mod.rs`. Add `tests/linear.rs`.

- [ ] **Step 1: Implement event helpers**

Replace `contracts/lockup/src/events.rs`:

```rust
use hourglass_shared::Stream;
use soroban_sdk::{symbol_short, Address, Env, Symbol};

pub(crate) fn stream_created(env: &Env, id: u32, s: &Stream) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = symbol_short!("created");
    env.events().publish(
        (topic_domain, topic_action, id, s.sender.clone()),
        (s.recipient.clone(), s.token.clone(), s.deposited),
    );
}

pub(crate) fn withdrawn(env: &Env, id: u32, to: &Address, amount: i128, caller: &Address) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "withdrawn");
    env.events().publish(
        (topic_domain, topic_action, id, to.clone()),
        (amount, caller.clone()),
    );
}

pub(crate) fn canceled(env: &Env, id: u32, sender_refund: i128, recipient_balance: i128) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "canceled");
    env.events()
        .publish((topic_domain, topic_action, id), (sender_refund, recipient_balance));
}

pub(crate) fn renounced(env: &Env, id: u32) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "renounced");
    env.events().publish((topic_domain, topic_action, id), ());
}

pub(crate) fn burned(env: &Env, id: u32) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "burned");
    env.events().publish((topic_domain, topic_action, id), ());
}

pub(crate) fn transferred(env: &Env, id: u32, from: &Address, new_owner: &Address) {
    let topic_domain = Symbol::new(env, "stream");
    let topic_action = Symbol::new(env, "transferred");
    env.events().publish(
        (topic_domain, topic_action, id, new_owner.clone()),
        from.clone(),
    );
}
```

- [ ] **Step 2: Implement `create_linear`**

Replace `contracts/lockup/src/create.rs`:

```rust
use crate::{events, next_id, save_stream, DataKey, Lockup};
use hourglass_shared::{Error, Stream, StreamShape};
use soroban_sdk::{contractimpl, panic_with_error, token, Address, Env};

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

        // Validation
        if deposited <= 0 {
            panic_with_error!(&env, Error::ZeroDeposit);
        }
        if !(start_ts < end_ts) {
            panic_with_error!(&env, Error::StartAfterEnd);
        }
        if !(start_ts <= cliff_ts && cliff_ts <= end_ts) {
            panic_with_error!(&env, Error::CliffOutOfRange);
        }
        if unlock_at_start < 0 || unlock_at_cliff < 0 {
            panic_with_error!(&env, Error::UnlocksExceedDeposit);
        }
        let unlock_sum = unlock_at_start
            .checked_add(unlock_at_cliff)
            .ok_or(())
            .unwrap_or_else(|_| panic_with_error!(&env, Error::Overflow));
        if unlock_sum > deposited {
            panic_with_error!(&env, Error::UnlocksExceedDeposit);
        }
        if start_ts < env.ledger().timestamp() {
            panic_with_error!(&env, Error::StartInPast);
        }

        // Pull tokens into the lockup contract.
        let client = token::Client::new(&env, &token);
        client.transfer(&sender, &env.current_contract_address(), &deposited);

        // Build + persist the Stream.
        let stream = Stream {
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
            shape: StreamShape::Linear {
                cliff_ts,
                unlock_at_start,
                unlock_at_cliff,
            },
        };
        let id = next_id(&env);
        save_stream(&env, id, &stream);
        events::stream_created(&env, id, &stream);
        // NFT mint added in Task 25.
        id
    }
}
```

- [ ] **Step 3: Test fixtures in `tests/common.rs`**

Replace `contracts/lockup/src/tests/common.rs`:

```rust
use crate::{Lockup, LockupClient};
use hourglass_comptroller::{Comptroller, ComptrollerClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

pub struct Fixture<'a> {
    pub env: Env,
    pub admin: Address,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub token_admin: StellarAssetClient<'a>,
    pub token_client: TokenClient<'a>,
    pub lockup_addr: Address,
    pub lockup: LockupClient<'a>,
    pub comptroller_addr: Address,
    pub comptroller: ComptrollerClient<'a>,
}

pub fn setup<'a>() -> Fixture<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Register a SEP-41 / SAC token.
    let issuer = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(issuer.clone());
    let token = token_contract.address();
    let token_admin = StellarAssetClient::new(&env, &token);
    let token_client = TokenClient::new(&env, &token);

    // Mint to the sender.
    token_admin.mint(&sender, &1_000_000_000_000i128);

    // Deploy comptroller (oracle = a sink address; fee = 0 by default so paths don't need it).
    let oracle = Address::generate(&env);
    let comptroller_addr = env.register(
        Comptroller,
        (admin.clone(), admin.clone(), oracle, 3_600u32),
    );
    let comptroller = ComptrollerClient::new(&env, &comptroller_addr);

    // Deploy lockup.
    let lockup_addr = env.register(Lockup, (admin.clone(), comptroller_addr.clone()));
    let lockup = LockupClient::new(&env, &lockup_addr);

    Fixture {
        env,
        admin,
        sender,
        recipient,
        token,
        token_admin,
        token_client,
        lockup_addr,
        lockup,
        comptroller_addr,
        comptroller,
    }
}
```

- [ ] **Step 4: Wire submodules in `tests/mod.rs`**

```rust
#![cfg(test)]

mod common;
mod linear;
```

- [ ] **Step 5: Write `tests/linear.rs`**

```rust
use super::common::setup;
use hourglass_shared::StreamShape;

#[test]
fn create_linear_pulls_tokens_and_persists() {
    let f = setup();
    let now = f.env.ledger().timestamp();

    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 200),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );

    assert_eq!(id, 1);
    assert_eq!(f.token_client.balance(&f.sender), 1_000_000_000_000i128 - 1_000_000);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 1_000_000);

    let s = f.lockup.get_stream(&id);
    assert_eq!(s.sender, f.sender);
    assert_eq!(s.recipient, f.recipient);
    assert_eq!(s.deposited, 1_000_000);
    assert_eq!(s.withdrawn, 0);
    assert!(matches!(s.shape, StreamShape::Linear { .. }));
}

#[test]
#[should_panic]
fn create_linear_rejects_zero_deposit() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &0i128,
        &(now + 100),
        &(now + 200),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn create_linear_rejects_cliff_after_end() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 2_000),
        &(now + 1_000),
        &0i128,
        &0i128,
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn create_linear_rejects_start_in_past() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now - 1),
        &now,
        &(now + 1_000),
        &0i128,
        &0i128,
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn create_linear_rejects_unlocks_exceeding_deposit() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 200),
        &(now + 1_100),
        &600i128,
        &500i128,
        &true,
        &true,
    );
}
```

- [ ] **Step 6: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(lockup): implement create_linear with token pull, persistence, events"
```

---

## Task 18: View helpers (`streamed_amount`, `withdrawable_amount`, `status`)

**Files:** Modify `contracts/lockup/src/view.rs`

- [ ] **Step 1: Implement views**

Replace `contracts/lockup/src/view.rs`:

```rust
use crate::{load_stream, Lockup};
use hourglass_shared::{math, StreamStatus};
use soroban_sdk::{contractimpl, panic_with_error, Env};

#[contractimpl]
impl Lockup {
    pub fn streamed_amount(env: Env, stream_id: u32) -> i128 {
        let s = load_stream(&env, stream_id);
        let now = env.ledger().timestamp();
        match math::streamed_amount(&s, now) {
            Ok(v) => v,
            Err(e) => panic_with_error!(&env, e),
        }
    }

    pub fn withdrawable_amount(env: Env, stream_id: u32) -> i128 {
        let s = load_stream(&env, stream_id);
        let now = env.ledger().timestamp();
        s.withdrawable(now)
    }

    pub fn status(env: Env, stream_id: u32) -> StreamStatus {
        let s = load_stream(&env, stream_id);
        s.status(env.ledger().timestamp())
    }
}
```

- [ ] **Step 2: Test**

Append to `contracts/lockup/src/tests/linear.rs`:

```rust
use hourglass_shared::StreamStatus;
use soroban_sdk::testutils::Ledger as _;

#[test]
fn streamed_amount_progresses_with_time() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    // Pending before start.
    assert_eq!(f.lockup.streamed_amount(&id), 0);
    assert_eq!(f.lockup.status(&id), StreamStatus::Pending);

    // Halfway: now = start + 600 (out of 1000).
    f.env.ledger().set_timestamp(now + 700);
    assert_eq!(f.lockup.streamed_amount(&id), 600_000);
    assert_eq!(f.lockup.status(&id), StreamStatus::Streaming);

    // After end.
    f.env.ledger().set_timestamp(now + 100_000);
    assert_eq!(f.lockup.streamed_amount(&id), 1_000_000);
    assert_eq!(f.lockup.status(&id), StreamStatus::Settled);
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lockup): add streamed_amount/withdrawable_amount/status views"
```

---

## Task 19: `create_tranched`

**Files:** Modify `contracts/lockup/src/create.rs`; add `contracts/lockup/src/tests/tranched.rs` and wire it in `tests/mod.rs`.

- [ ] **Step 1: Add `create_tranched` to `create.rs`**

Append to `contracts/lockup/src/create.rs`:

```rust
use hourglass_shared::{Tranche, MAX_TRANCHES};
use soroban_sdk::Vec;

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

        // Validation
        if tranches.is_empty() {
            panic_with_error!(&env, Error::NoTranches);
        }
        if (tranches.len() as u32) > MAX_TRANCHES {
            panic_with_error!(&env, Error::TooManyTranches);
        }

        let mut last_ts: u64 = 0;
        let mut sum: i128 = 0;
        for (i, t) in tranches.iter().enumerate() {
            if t.amount <= 0 {
                panic_with_error!(&env, Error::ZeroDeposit);
            }
            if i > 0 && t.ts <= last_ts {
                panic_with_error!(&env, Error::TranchesNotAscending);
            }
            last_ts = t.ts;
            sum = sum
                .checked_add(t.amount)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        }
        let start_ts = tranches.first().unwrap().ts;
        let end_ts = tranches.last().unwrap().ts;
        if start_ts < env.ledger().timestamp() {
            panic_with_error!(&env, Error::StartInPast);
        }

        let deposited = sum;
        let client = token::Client::new(&env, &token);
        client.transfer(&sender, &env.current_contract_address(), &deposited);

        let stream = Stream {
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
            shape: StreamShape::Tranched { tranches: tranches.clone() },
        };
        let id = next_id(&env);
        save_stream(&env, id, &stream);
        events::stream_created(&env, id, &stream);
        id
    }
}
```

- [ ] **Step 2: Add `tests/tranched.rs`**

```rust
use super::common::setup;
use hourglass_shared::{StreamShape, StreamStatus, Tranche};
use soroban_sdk::{testutils::Ledger as _, vec};

#[test]
fn create_tranched_pulls_sum() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let tranches = vec![
        &f.env,
        Tranche { amount: 100, ts: now + 100 },
        Tranche { amount: 200, ts: now + 200 },
        Tranche { amount: 300, ts: now + 300 },
    ];
    let id = f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &tranches,
        &true,
        &true,
    );
    assert_eq!(id, 1);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 600);

    let s = f.lockup.get_stream(&id);
    assert!(matches!(s.shape, StreamShape::Tranched { .. }));
    assert_eq!(s.deposited, 600);
}

#[test]
fn tranched_progresses_in_steps() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let tranches = vec![
        &f.env,
        Tranche { amount: 100, ts: now + 100 },
        Tranche { amount: 200, ts: now + 200 },
        Tranche { amount: 300, ts: now + 300 },
    ];
    let id = f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &tranches,
        &true,
        &true,
    );

    assert_eq!(f.lockup.streamed_amount(&id), 0);
    f.env.ledger().set_timestamp(now + 100);
    assert_eq!(f.lockup.streamed_amount(&id), 100);
    f.env.ledger().set_timestamp(now + 250);
    assert_eq!(f.lockup.streamed_amount(&id), 300);
    f.env.ledger().set_timestamp(now + 350);
    assert_eq!(f.lockup.streamed_amount(&id), 600);
    assert_eq!(f.lockup.status(&id), StreamStatus::Settled);
}

#[test]
#[should_panic]
fn tranched_rejects_empty() {
    let f = setup();
    f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &vec![&f.env],
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn tranched_rejects_non_ascending() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &vec![
            &f.env,
            Tranche { amount: 100, ts: now + 200 },
            Tranche { amount: 100, ts: now + 100 },
        ],
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn tranched_rejects_zero_amount() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &vec![
            &f.env,
            Tranche { amount: 0, ts: now + 100 },
        ],
        &true,
        &true,
    );
}
```

- [ ] **Step 3: Wire submodule**

Replace `contracts/lockup/src/tests/mod.rs`:

```rust
#![cfg(test)]

mod common;
mod linear;
mod tranched;
```

- [ ] **Step 4: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lockup): implement create_tranched with validation + tests"
```

---

## Task 20: `withdraw` + `withdraw_max`

**Files:** Modify `contracts/lockup/src/lifecycle.rs`; add `contracts/lockup/src/tests/withdraw.rs` and wire it.

- [ ] **Step 1: Implement withdraw**

Replace `contracts/lockup/src/lifecycle.rs`:

```rust
use crate::{events, load_stream, save_stream, DataKey, Lockup};
use hourglass_shared::{Error, OpKind};
use soroban_sdk::{contractimpl, panic_with_error, token, Address, Env};

#[contractimpl]
impl Lockup {
    pub fn withdraw(env: Env, stream_id: u32, to: Address, amount: i128) {
        let mut s = load_stream(&env, stream_id);

        // Auth: recipient (NFT owner) must sign. NFT-approval flow (third-party
        // spender via `approve`) is Phase 1 — not in this plan.
        s.recipient.require_auth();

        if s.is_depleted {
            panic_with_error!(&env, Error::AlreadyDepleted);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::ZeroWithdraw);
        }
        let now = env.ledger().timestamp();
        let withdrawable = s.withdrawable(now);
        if amount > withdrawable {
            panic_with_error!(&env, Error::InsufficientWithdrawable);
        }

        // Charge fee in XLM.
        let comptroller_addr: Address =
            env.storage().instance().get(&DataKey::Comptroller).unwrap();
        let comp_client = hourglass_comptroller::ComptrollerClient::new(&env, &comptroller_addr);
        let xlm_fee = comp_client.fee_for(&OpKind::Withdraw);
        if xlm_fee > 0 {
            let xlm = native_token(&env);
            let collector = comp_client.fee_collector();
            xlm.transfer(&s.recipient, &collector, &xlm_fee);
        }

        // Transfer stream token from this contract to `to`.
        let token_client = token::Client::new(&env, &s.token);
        token_client.transfer(&env.current_contract_address(), &to, &amount);

        s.withdrawn += amount;
        if s.withdrawn + s.refunded >= s.deposited {
            s.is_depleted = true;
        }
        save_stream(&env, stream_id, &s);
        events::withdrawn(&env, stream_id, &to, amount, &s.recipient);
    }

    pub fn withdraw_max(env: Env, stream_id: u32, to: Address) {
        let s = load_stream(&env, stream_id);
        let withdrawable = s.withdrawable(env.ledger().timestamp());
        if withdrawable == 0 {
            return;
        }
        Self::withdraw(env, stream_id, to, withdrawable);
    }
}

/// Native XLM SAC address on the active network. Pulled from a config slot set at
/// constructor time — defined in Step 2 of this task.
fn native_token(env: &Env) -> token::Client {
    let native: Address = env
        .storage()
        .instance()
        .get(&crate::DataKey::NativeToken)
        .unwrap();
    token::Client::new(env, &native)
}
```

The `native_token` helper above references `DataKey::NativeToken`, which Step 2 of this task adds to `lib.rs`. Order of writes within this task: implement `lifecycle.rs` (Step 1), then update `lib.rs` to add the `NativeToken` variant + extended constructor (Step 2). The crate won't compile after Step 1 alone; that's expected — keep going.

- [ ] **Step 2: Add native-token config to the contract**

For the MVP we record the XLM SAC address at constructor time so tests and prod use the same path.

Modify `contracts/lockup/src/lib.rs`:

In `DataKey`, add a variant:

```rust
    NativeToken,
```

Replace `__constructor` body:

```rust
    pub fn __constructor(env: Env, admin: Address, comptroller: Address, native_token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Comptroller, &comptroller);
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
        env.storage().instance().set(&DataKey::NextStreamId, &1u32);
        nft::init(&env);
    }
```

Replace `native_token` in `lifecycle.rs`:

```rust
fn native_token(env: &Env) -> token::Client {
    let native: Address = env
        .storage()
        .instance()
        .get(&crate::DataKey::NativeToken)
        .unwrap();
    token::Client::new(env, &native)
}
```

- [ ] **Step 3: Update `tests/common.rs` to register a native SAC and pass it**

In `setup()`, after creating the issuer/token, also create a separate native SAC for fees:

```rust
    let native_contract = env.register_stellar_asset_contract_v2(issuer.clone());
    let native = native_contract.address();
    let native_admin = StellarAssetClient::new(&env, &native);
    // Mint native XLM to the recipient (so they can pay fees).
    native_admin.mint(&recipient, &10_000_000_000i128);
```

Change the `Lockup` register call:

```rust
    let lockup_addr = env.register(
        Lockup,
        (admin.clone(), comptroller_addr.clone(), native.clone()),
    );
```

Add `pub native: Address` and `pub native_admin: StellarAssetClient<'a>` to `Fixture` and populate them.

- [ ] **Step 4: Write withdraw tests**

Create `contracts/lockup/src/tests/withdraw.rs`:

```rust
use super::common::setup;
use soroban_sdk::testutils::Ledger as _;

#[test]
fn withdraw_max_settles_after_end() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );

    f.env.ledger().set_timestamp(now + 2_000);
    f.lockup.withdraw_max(&id, &f.recipient);

    assert_eq!(f.token_client.balance(&f.recipient), 1_000_000);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 1_000_000);
    assert!(s.is_depleted);
}

#[test]
fn withdraw_partial_streams() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    f.env.ledger().set_timestamp(now + 600); // half of [100, 1100]
    let half = f.lockup.withdrawable_amount(&id);
    assert!(half > 400_000 && half < 600_000);
    f.lockup.withdraw(&id, &f.recipient, &half);
    assert_eq!(f.lockup.get_stream(&id).withdrawn, half);
}

#[test]
#[should_panic]
fn withdraw_zero_rejected() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    f.env.ledger().set_timestamp(now + 500);
    f.lockup.withdraw(&id, &f.recipient, &0i128);
}

#[test]
#[should_panic]
fn withdraw_more_than_withdrawable_rejected() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    f.env.ledger().set_timestamp(now + 200);
    f.lockup.withdraw(&id, &f.recipient, &999_999_999i128);
}
```

Wire it: append `mod withdraw;` to `tests/mod.rs`.

- [ ] **Step 5: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 15 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(lockup): implement withdraw + withdraw_max with fee charge"
```

---

## Task 21: `cancel`

**Files:** Modify `contracts/lockup/src/lifecycle.rs`; add `contracts/lockup/src/tests/cancel.rs` and wire it.

- [ ] **Step 1: Implement cancel**

Append to `contracts/lockup/src/lifecycle.rs`:

```rust
#[contractimpl]
impl Lockup {
    pub fn cancel(env: Env, stream_id: u32) {
        let mut s = load_stream(&env, stream_id);

        s.sender.require_auth();

        if !s.is_cancelable {
            panic_with_error!(&env, Error::NotCancelable);
        }
        if s.was_canceled {
            panic_with_error!(&env, Error::AlreadyCanceled);
        }
        if s.is_depleted {
            panic_with_error!(&env, Error::AlreadyDepleted);
        }
        let now = env.ledger().timestamp();
        let status = s.status(now);
        if !matches!(
            status,
            hourglass_shared::StreamStatus::Pending | hourglass_shared::StreamStatus::Streaming
        ) {
            panic_with_error!(&env, Error::InvalidStatus);
        }

        let streamed = hourglass_shared::math::streamed_amount(&s, now)
            .unwrap_or_else(|e| panic_with_error!(&env, e));
        let recipient_balance = streamed - s.withdrawn;
        let sender_refund = s.deposited - streamed;

        if sender_refund > 0 {
            let token_client = token::Client::new(&env, &s.token);
            token_client.transfer(
                &env.current_contract_address(),
                &s.sender,
                &sender_refund,
            );
        }

        s.was_canceled = true;
        s.refunded = sender_refund;
        if recipient_balance == 0 {
            s.is_depleted = true;
        }
        save_stream(&env, stream_id, &s);
        events::canceled(&env, stream_id, sender_refund, recipient_balance);
    }
}
```

- [ ] **Step 2: Tests**

Create `contracts/lockup/src/tests/cancel.rs`:

```rust
use super::common::setup;
use soroban_sdk::testutils::Ledger as _;

#[test]
fn cancel_midstream_refunds_sender_and_locks_recipient_share() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );

    // 60% through (now+700: 600 / 1000 elapsed)
    f.env.ledger().set_timestamp(now + 700);
    let sender_bal_before = f.token_client.balance(&f.sender);
    f.lockup.cancel(&id);

    let s = f.lockup.get_stream(&id);
    assert!(s.was_canceled);
    assert_eq!(s.refunded, 400_000);
    assert_eq!(f.token_client.balance(&f.sender), sender_bal_before + 400_000);
    // Recipient's 600k still sits in the lockup until they withdraw.
    assert_eq!(f.token_client.balance(&f.lockup_addr), 600_000);

    // Recipient can still withdraw their accrued share.
    f.lockup.withdraw(&id, &f.recipient, &600_000i128);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 600_000);
    assert!(s.is_depleted);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
}

#[test]
#[should_panic]
fn cancel_after_settled_fails() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    f.env.ledger().set_timestamp(now + 100_000);
    f.lockup.cancel(&id);
}

#[test]
fn cancel_at_start_full_refund() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    let bal_before = f.token_client.balance(&f.sender);
    f.lockup.cancel(&id);
    assert_eq!(f.token_client.balance(&f.sender), bal_before + 1_000);
    let s = f.lockup.get_stream(&id);
    assert!(s.is_depleted); // nothing streamed, nothing to withdraw
}
```

Wire submodule: append `mod cancel;` to `tests/mod.rs`.

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 18 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lockup): implement cancel with refund + recipient lock-in"
```

---

## Task 22: `renounce`

**Files:** Modify `contracts/lockup/src/lifecycle.rs`; modify `contracts/lockup/src/tests/cancel.rs`.

- [ ] **Step 1: Implement renounce**

Append to `contracts/lockup/src/lifecycle.rs`:

```rust
#[contractimpl]
impl Lockup {
    pub fn renounce(env: Env, stream_id: u32) {
        let mut s = load_stream(&env, stream_id);
        s.sender.require_auth();
        if !s.is_cancelable {
            panic_with_error!(&env, Error::NotCancelable);
        }
        let now = env.ledger().timestamp();
        let status = s.status(now);
        if !matches!(
            status,
            hourglass_shared::StreamStatus::Pending | hourglass_shared::StreamStatus::Streaming
        ) {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        s.is_cancelable = false;
        save_stream(&env, stream_id, &s);
        events::renounced(&env, stream_id);
    }
}
```

- [ ] **Step 2: Add the renounce tests**

Append to `contracts/lockup/src/tests/cancel.rs`:

```rust
#[test]
fn renounce_flips_cancelable() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    assert!(f.lockup.get_stream(&id).is_cancelable);
    f.lockup.renounce(&id);
    assert!(!f.lockup.get_stream(&id).is_cancelable);
}

#[test]
#[should_panic]
fn cancel_after_renounce_fails() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    f.lockup.renounce(&id);
    f.lockup.cancel(&id);
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 20 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lockup): implement renounce"
```

---

## Task 23: `burn`

**Files:** Modify `contracts/lockup/src/lifecycle.rs`; add `contracts/lockup/src/tests/burn.rs` and wire it.

- [ ] **Step 1: Implement burn (stream-side; NFT burn is added in Task 28)**

Append to `contracts/lockup/src/lifecycle.rs`:

```rust
#[contractimpl]
impl Lockup {
    pub fn burn(env: Env, stream_id: u32) {
        let s = load_stream(&env, stream_id);
        if !s.is_depleted {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        env.storage().persistent().remove(&DataKey::Stream(stream_id));
        events::burned(&env, stream_id);
        // NFT burn added in Task 28.
    }
}
```

- [ ] **Step 2: Test**

Create `contracts/lockup/src/tests/burn.rs`:

```rust
use super::common::setup;
use soroban_sdk::testutils::Ledger as _;

#[test]
fn burn_after_full_withdraw() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    f.env.ledger().set_timestamp(now + 100_000);
    f.lockup.withdraw_max(&id, &f.recipient);
    f.lockup.burn(&id);
    // Stream record is gone.
}

#[test]
#[should_panic]
fn get_after_burn_fails() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    f.env.ledger().set_timestamp(now + 100_000);
    f.lockup.withdraw_max(&id, &f.recipient);
    f.lockup.burn(&id);
    f.lockup.get_stream(&id);
}

#[test]
#[should_panic]
fn burn_before_depleted_rejected() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    f.env.ledger().set_timestamp(now + 500);
    f.lockup.burn(&id);
}
```

Wire it: append `mod burn;` to `tests/mod.rs`.

- [ ] **Step 2: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 23 passed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(lockup): implement burn (stream side; NFT burn deferred to Task 28)"
```

---

## Task 24: NFT integration — verify OZ stellar-tokens API and add module

**Files:** Modify `contracts/lockup/src/nft.rs`, `contracts/lockup/Cargo.toml`, `contracts/lockup/src/lib.rs`

**Important first step:** OpenZeppelin `stellar-contracts` v0.7.1 is young. Before writing code, confirm the public API of the `NonFungibleToken` mixin you're going to embed.

- [ ] **Step 1: Pin and read the OZ API**

Run: `cargo doc -p stellar-tokens --no-deps --open`

Read the `non_fungible` module's `base` and `enumerable` submodules. Confirm the following items exist on the installed v0.7.1 (or whatever pin resolves):

- A trait that exposes `owner_of(env, token_id) -> Address`, `transfer(env, from, to, token_id)`, `approve(env, owner, approved, token_id, live_until_ledger)`.
- A storage namespace key (e.g. `NFTStorageKey`) that does not collide with our `DataKey`.
- A `mint(env, to, token_id)` and `burn(env, token_id)` helper on the base impl.

If signatures differ from the code in Step 3 below, adjust Step 3 names accordingly — the test in Step 4 verifies behavior, not specific signatures.

- [ ] **Step 2: Confirm `Cargo.toml` deps already pin OZ libs**

Already done in Task 16. No change.

- [ ] **Step 3: Wire the NFT module into `lockup`**

Replace `contracts/lockup/src/nft.rs` with the following (using the standard module pattern OZ documents). If their re-export path differs slightly, adjust the `use` lines but keep the contractimpl structure:

```rust
use soroban_sdk::{contractimpl, Address, Env, String};
use stellar_tokens::non_fungible::{
    enumerable::NonFungibleEnumerable, Base as NFTBase, ContractOverrides, NonFungibleToken,
};

use crate::{load_stream, Lockup};

pub(crate) fn init(env: &Env) {
    let name = String::from_str(env, "Hourglass Stream");
    let symbol = String::from_str(env, "STREAM");
    NFTBase::set_metadata(env, String::from_str(env, "https://hourglass.fi/api/nft/"), name, symbol);
}

pub(crate) fn mint(env: &Env, to: &Address, token_id: u32) {
    NFTBase::mint(env, to, token_id);
}

pub(crate) fn burn(env: &Env, token_id: u32) {
    NFTBase::burn(env, token_id);
}

pub(crate) fn owner_of(env: &Env, token_id: u32) -> Address {
    NFTBase::owner_of(env, token_id)
}

/// Custom transfer hook: enforces `is_transferable` and updates the stream record.
pub struct LockupNFT;

impl ContractOverrides for LockupNFT {
    fn before_transfer(env: &Env, from: &Address, to: &Address, token_id: u32) {
        let mut s = load_stream(env, token_id);
        if !s.is_transferable {
            soroban_sdk::panic_with_error!(env, hourglass_shared::Error::NotTransferable);
        }
        s.recipient = to.clone();
        crate::save_stream(env, token_id, &s);
        crate::events::transferred(env, token_id, from, to);
    }
}

#[contractimpl]
impl NonFungibleToken for Lockup {
    type ContractType = LockupNFT;
}

#[contractimpl]
impl NonFungibleEnumerable for Lockup {}
```

Note: the exact trait names and methods (`ContractOverrides::before_transfer`, `Base::set_metadata`, etc.) are taken from the OZ docs structure documented for v0.7.x. If `cargo build -p hourglass-lockup --target wasm32-unknown-unknown --release` fails with "no method named X" or "no associated type Y", the OZ API has shifted: open `cargo doc` from Step 1 and adapt the wrappers to match. The custom `before_transfer` hook semantics (revert if not transferable + sync `recipient`) is the contract requirement; the binding glue is replaceable.

- [ ] **Step 4: Build**

Run: `cargo build -p hourglass-lockup --target wasm32-unknown-unknown --release`
Expected: PASS.

- [ ] **Step 5: Smoke test that the contract exposes NFT entrypoints**

Append to `contracts/lockup/src/tests/linear.rs`:

```rust
#[test]
fn nft_name_and_symbol_set() {
    let f = setup();
    let env = &f.env;
    use soroban_sdk::{String, IntoVal};
    let name: String = env.invoke_contract(&f.lockup_addr, &soroban_sdk::symbol_short!("name"), soroban_sdk::vec![env]);
    let symbol: String = env.invoke_contract(&f.lockup_addr, &soroban_sdk::symbol_short!("symbol"), soroban_sdk::vec![env]);
    assert_eq!(name, String::from_str(env, "Hourglass Stream"));
    assert_eq!(symbol, String::from_str(env, "STREAM"));
}
```

- [ ] **Step 6: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 24 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(lockup): embed OZ NonFungibleToken Enumerable with transferable hook"
```

---

## Task 25: Mint NFT on `create_linear` and `create_tranched`

**Files:** Modify `contracts/lockup/src/create.rs`

- [ ] **Step 1: Mint after persist**

In both `create_linear` and `create_tranched` in `contracts/lockup/src/create.rs`, after `save_stream` and before `events::stream_created`, insert:

```rust
        crate::nft::mint(&env, &recipient, id);
```

- [ ] **Step 2: Test ownership matches recipient**

Append to `contracts/lockup/src/tests/linear.rs`:

```rust
#[test]
fn create_mints_nft_to_recipient() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    // OZ NonFungibleToken exposes `owner_of` as a contract method.
    let owner = f.env.invoke_contract::<soroban_sdk::Address>(
        &f.lockup_addr,
        &soroban_sdk::Symbol::new(&f.env, "owner_of"),
        soroban_sdk::vec![&f.env, id.into_val(&f.env)],
    );
    assert_eq!(owner, f.recipient);
}
```

Add `use soroban_sdk::IntoVal as _;` at the top if not already present.

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 25 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lockup): mint NFT to recipient on create_linear and create_tranched"
```

---

## Task 26: NFT transfer respects `is_transferable`

**Files:** Add `contracts/lockup/src/tests/transfer.rs`; wire it.

- [ ] **Step 1: Tests**

```rust
use super::common::setup;
use soroban_sdk::{testutils::Address as _, Address, IntoVal, Symbol};

#[test]
fn nft_transfer_updates_recipient_on_stream() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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

    let new_owner = Address::generate(&f.env);
    // OZ transfer entrypoint: transfer(from, to, token_id)
    f.env.invoke_contract::<()>(
        &f.lockup_addr,
        &Symbol::new(&f.env, "transfer"),
        soroban_sdk::vec![
            &f.env,
            f.recipient.into_val(&f.env),
            new_owner.into_val(&f.env),
            id.into_val(&f.env),
        ],
    );

    let s = f.lockup.get_stream(&id);
    assert_eq!(s.recipient, new_owner);
}

#[test]
#[should_panic]
fn nft_transfer_rejected_when_not_transferable() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
        &false, // not transferable
    );
    let new_owner = Address::generate(&f.env);
    f.env.invoke_contract::<()>(
        &f.lockup_addr,
        &Symbol::new(&f.env, "transfer"),
        soroban_sdk::vec![
            &f.env,
            f.recipient.into_val(&f.env),
            new_owner.into_val(&f.env),
            id.into_val(&f.env),
        ],
    );
}
```

Append `mod transfer;` to `tests/mod.rs`.

- [ ] **Step 2: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 27 passed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(lockup): cover NFT transfer + is_transferable enforcement"
```

---

## Task 27: Burn the NFT inside `burn(stream_id)`

**Files:** Modify `contracts/lockup/src/lifecycle.rs`; modify `contracts/lockup/src/tests/burn.rs`.

- [ ] **Step 1: Call into NFT burn helper**

In `contracts/lockup/src/lifecycle.rs`, modify the `burn` function:

```rust
    pub fn burn(env: Env, stream_id: u32) {
        let s = load_stream(&env, stream_id);
        if !s.is_depleted {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        env.storage().persistent().remove(&DataKey::Stream(stream_id));
        crate::nft::burn(&env, stream_id);
        events::burned(&env, stream_id);
    }
```

- [ ] **Step 2: Test that owner_of fails after burn**

Append to `contracts/lockup/src/tests/burn.rs`:

```rust
#[test]
#[should_panic]
fn owner_of_after_burn_panics() {
    use soroban_sdk::{IntoVal, Symbol};
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
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
    f.env.ledger().set_timestamp(now + 100_000);
    f.lockup.withdraw_max(&id, &f.recipient);
    f.lockup.burn(&id);
    f.env.invoke_contract::<soroban_sdk::Address>(
        &f.lockup_addr,
        &Symbol::new(&f.env, "owner_of"),
        soroban_sdk::vec![&f.env, id.into_val(&f.env)],
    );
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 28 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lockup): burn NFT alongside stream record"
```

---

## Task 28: `withdraw_max_and_transfer`

**Files:** Modify `contracts/lockup/src/lifecycle.rs`; append a test to `tests/transfer.rs`.

- [ ] **Step 1: Implement composite op**

Append to `contracts/lockup/src/lifecycle.rs`:

```rust
#[contractimpl]
impl Lockup {
    pub fn withdraw_max_and_transfer(env: Env, stream_id: u32, new_owner: Address) {
        let s = load_stream(&env, stream_id);
        if !s.is_transferable {
            panic_with_error!(&env, Error::NotTransferable);
        }
        s.recipient.require_auth();
        let withdrawable = s.withdrawable(env.ledger().timestamp());
        if withdrawable > 0 {
            Self::withdraw(env.clone(), stream_id, s.recipient.clone(), withdrawable);
        }
        crate::nft::base_transfer(&env, &s.recipient, &new_owner, stream_id);
    }
}
```

Add a helper in `contracts/lockup/src/nft.rs`:

```rust
pub(crate) fn base_transfer(env: &Env, from: &Address, to: &Address, token_id: u32) {
    NFTBase::transfer(env, from, to, token_id);
}
```

- [ ] **Step 2: Test**

Append to `contracts/lockup/src/tests/transfer.rs`:

```rust
#[test]
fn withdraw_max_and_transfer_atomic() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );

    f.env.ledger().set_timestamp(now + 600);
    let new_owner = Address::generate(&f.env);
    let bal_before = f.token_client.balance(&f.recipient);
    f.lockup.withdraw_max_and_transfer(&id, &new_owner);

    let bal_after = f.token_client.balance(&f.recipient);
    assert!(bal_after > bal_before, "recipient should have received the streamed portion");
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.recipient, new_owner);
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 29 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lockup): add withdraw_max_and_transfer composite op"
```

---

## Task 29: Invariant / property tests

**Files:** Add `contracts/lockup/src/tests/invariants.rs`; wire it.

- [ ] **Step 1: Write invariants**

```rust
use super::common::setup;
use hourglass_shared::Tranche;
use soroban_sdk::{testutils::Ledger as _, vec};

/// For any time t1 <= t2, streamed_amount(t1) <= streamed_amount(t2).
#[test]
fn streamed_amount_monotonic_linear() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 250),
        &(now + 1_100),
        &50_000i128,
        &50_000i128,
        &true,
        &true,
    );
    let mut prev = 0i128;
    for t in (0..2_500u64).step_by(13) {
        f.env.ledger().set_timestamp(now + t);
        let cur = f.lockup.streamed_amount(&id);
        assert!(cur >= prev, "decrease at t={}", t);
        prev = cur;
    }
}

#[test]
fn streamed_amount_monotonic_tranched() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &vec![
            &f.env,
            Tranche { amount: 100, ts: now + 100 },
            Tranche { amount: 200, ts: now + 300 },
            Tranche { amount: 700, ts: now + 600 },
        ],
        &true,
        &true,
    );
    let mut prev = 0i128;
    for t in (0..1_000u64).step_by(7) {
        f.env.ledger().set_timestamp(now + t);
        let cur = f.lockup.streamed_amount(&id);
        assert!(cur >= prev, "decrease at t={}", t);
        prev = cur;
    }
}

/// deposited == withdrawn + refunded + remaining-in-contract, at all times.
#[test]
fn asset_conservation_after_cancel_and_withdraw() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    f.env.ledger().set_timestamp(now + 700);
    f.lockup.cancel(&id);
    f.lockup.withdraw(&id, &f.recipient, &200_000i128);

    let s = f.lockup.get_stream(&id);
    let in_contract = f.token_client.balance(&f.lockup_addr);
    assert_eq!(s.deposited, s.withdrawn + s.refunded + in_contract);
}
```

Append `mod invariants;` to `tests/mod.rs`.

- [ ] **Step 2: Run tests**

Run: `cargo test -p hourglass-lockup`
Expected: 32 passed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(lockup): add monotonicity + asset-conservation invariant tests"
```

---

## Task 30: TTL extension on hot path

**Files:** Modify `contracts/lockup/src/lib.rs`

- [ ] **Step 1: Add TTL bump to `save_stream`**

```rust
const STREAM_TTL_BUMP_LEDGERS: u32 = 17_280 * 90; // ~90 days at 5s/ledger
const STREAM_TTL_MIN_LEDGERS: u32 = 17_280 * 30;  // bump if below 30 days

pub(crate) fn save_stream(env: &Env, stream_id: u32, stream: &Stream) {
    let key = DataKey::Stream(stream_id);
    env.storage().persistent().set(&key, stream);
    env.storage()
        .persistent()
        .extend_ttl(&key, STREAM_TTL_MIN_LEDGERS, STREAM_TTL_BUMP_LEDGERS);
}
```

- [ ] **Step 2: Add a TTL bump on every read via `load_stream` (cheap; OK for MVP)**

```rust
pub(crate) fn load_stream(env: &Env, stream_id: u32) -> Stream {
    let key = DataKey::Stream(stream_id);
    let s: Stream = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::StreamNotFound));
    env.storage()
        .persistent()
        .extend_ttl(&key, STREAM_TTL_MIN_LEDGERS, STREAM_TTL_BUMP_LEDGERS);
    s
}
```

- [ ] **Step 3: Build + run all tests**

Run: `cargo test -p hourglass-lockup`
Expected: 32 passed.

- [ ] **Step 4: Commit**

```bash
git add contracts/lockup/src/lib.rs
git commit -m "feat(lockup): extend stream TTL on every save/load"
```

---

## Task 31: Build script

**Files:** Create `scripts/build.sh`

- [ ] **Step 1: Write the build script**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building Hourglass contracts (release wasm)"
cargo build --target wasm32-unknown-unknown --release \
    -p hourglass-comptroller \
    -p hourglass-lockup

mkdir -p dist
cp target/wasm32-unknown-unknown/release/hourglass_comptroller.wasm dist/
cp target/wasm32-unknown-unknown/release/hourglass_lockup.wasm dist/

echo "==> Optimizing wasm"
for f in dist/*.wasm; do
    stellar contract optimize --wasm "$f"
done

echo "==> Done. Artifacts in dist/"
ls -l dist/
```

- [ ] **Step 2: Make executable + run**

```bash
chmod +x scripts/build.sh
./scripts/build.sh
```

Expected: produces `dist/hourglass_comptroller.optimized.wasm` and `dist/hourglass_lockup.optimized.wasm`.

- [ ] **Step 3: Commit**

```bash
git add scripts/build.sh
git commit -m "build: add build.sh that produces optimized wasm artifacts"
```

---

## Task 32: Testnet deploy script

**Files:** Create `scripts/deploy-testnet.sh`, `deployments/.gitkeep`

- [ ] **Step 1: Write the deploy script**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-hourglass-deploy}"
ADMIN="$(stellar keys address "$IDENTITY")"
NATIVE_XLM="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
# Sentinel oracle address for Phase 0 (no live oracle wired). Fees default to 0,
# so this address is never invoked. Replace once Reflector is integrated.
ORACLE_SENTINEL="$ADMIN"

mkdir -p deployments

echo "==> Uploading + deploying comptroller"
COMPTROLLER_ID="$(stellar contract deploy \
    --network "$NETWORK" \
    --source "$IDENTITY" \
    --wasm dist/hourglass_comptroller.optimized.wasm \
    -- \
    --admin "$ADMIN" \
    --fee_collector "$ADMIN" \
    --oracle "$ORACLE_SENTINEL" \
    --max_staleness_secs 3600)"
echo "Comptroller: $COMPTROLLER_ID"

echo "==> Uploading + deploying lockup"
LOCKUP_ID="$(stellar contract deploy \
    --network "$NETWORK" \
    --source "$IDENTITY" \
    --wasm dist/hourglass_lockup.optimized.wasm \
    -- \
    --admin "$ADMIN" \
    --comptroller "$COMPTROLLER_ID" \
    --native_token "$NATIVE_XLM")"
echo "Lockup: $LOCKUP_ID"

cat > "deployments/${NETWORK}.json" <<EOF
{
  "network": "$NETWORK",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "$ADMIN",
  "comptroller": "$COMPTROLLER_ID",
  "lockup": "$LOCKUP_ID",
  "native_token": "$NATIVE_XLM"
}
EOF

echo "==> Wrote deployments/${NETWORK}.json"
cat "deployments/${NETWORK}.json"
```

The `NATIVE_XLM` constant above is the **canonical Stellar Asset Contract address for native XLM on testnet** (CDLZ... is the testnet wrapper). Verify the current value before deploying — Stellar publishes it in their docs.

- [ ] **Step 2: Add `deployments/.gitkeep` and update `.gitignore`**

```bash
touch deployments/.gitkeep
```

Already in `.gitignore`: `deployments/*.local.json`. Production deploy JSONs (`testnet.json`, `mainnet.json`) are committed so the SDK can read them.

- [ ] **Step 3: Make executable**

```bash
chmod +x scripts/deploy-testnet.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-testnet.sh deployments/.gitkeep
git commit -m "deploy: add testnet deploy script + deployments dir"
```

- [ ] **Step 5: Actually run the deploy (manual)**

```bash
./scripts/deploy-testnet.sh
```

Confirm the contract IDs in the output. The JSON file appears under `deployments/testnet.json`. If running before Task 31 succeeds, build artifacts will be missing.

- [ ] **Step 6: Commit the testnet deployment record**

```bash
git add deployments/testnet.json
git commit -m "deploy: testnet deployment record"
```

---

## Task 33: Smoke test against testnet

**Files:** Create `scripts/smoke-testnet.sh`

- [ ] **Step 1: Write the smoke test**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-hourglass-deploy}"
DEPLOYMENT="deployments/${NETWORK}.json"

if [ ! -f "$DEPLOYMENT" ]; then
    echo "Missing $DEPLOYMENT — run scripts/deploy-testnet.sh first."
    exit 1
fi

LOCKUP="$(jq -r .lockup "$DEPLOYMENT")"
NATIVE="$(jq -r .native_token "$DEPLOYMENT")"
SENDER="$(stellar keys address "$IDENTITY")"

# We'll stream native XLM to a freshly-funded recipient.
RECIPIENT_KEY="hourglass-smoke-recipient-$(date +%s)"
stellar keys generate "$RECIPIENT_KEY" --network "$NETWORK" --fund
RECIPIENT="$(stellar keys address "$RECIPIENT_KEY")"

NOW="$(date +%s)"
START="$((NOW + 60))"
CLIFF="$START"
END="$((START + 600))"   # 10-minute stream

echo "==> Creating linear stream (sender=$SENDER, recipient=$RECIPIENT)"
STREAM_ID="$(stellar contract invoke \
    --network "$NETWORK" \
    --source "$IDENTITY" \
    --id "$LOCKUP" \
    -- create_linear \
    --sender "$SENDER" \
    --recipient "$RECIPIENT" \
    --token "$NATIVE" \
    --deposited 100000000 \
    --start_ts "$START" \
    --cliff_ts "$CLIFF" \
    --end_ts "$END" \
    --unlock_at_start 0 \
    --unlock_at_cliff 0 \
    --is_cancelable true \
    --is_transferable true)"

echo "Stream id: $STREAM_ID"

echo "==> Reading stream back"
stellar contract invoke \
    --network "$NETWORK" \
    --source "$IDENTITY" \
    --id "$LOCKUP" \
    -- get_stream --stream_id "$STREAM_ID"

echo "==> Waiting 70s for the stream to enter STREAMING status..."
sleep 70

echo "==> Withdrawable amount:"
stellar contract invoke \
    --network "$NETWORK" \
    --source "$RECIPIENT_KEY" \
    --id "$LOCKUP" \
    -- withdrawable_amount --stream_id "$STREAM_ID"

echo "==> Withdraw max"
stellar contract invoke \
    --network "$NETWORK" \
    --source "$RECIPIENT_KEY" \
    --id "$LOCKUP" \
    -- withdraw_max --stream_id "$STREAM_ID" --to "$RECIPIENT"

echo "==> Done."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/smoke-testnet.sh
```

- [ ] **Step 3: Run it (manual)**

```bash
./scripts/smoke-testnet.sh
```

Expected: prints a stream id, fetches the stream, waits, withdraws — exits 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-testnet.sh
git commit -m "test: add testnet smoke script for end-to-end happy path"
```

---

## Task 34: Generate TypeScript bindings

**Files:** Create `sdk/package.json`, `sdk/tsconfig.json`, `sdk/src/{index,lockup,comptroller}.ts`

- [ ] **Step 1: Scaffold SDK package**

`sdk/package.json`:

```json
{
  "name": "hourglass",
  "version": "0.1.0",
  "description": "Hourglass TypeScript SDK",
  "type": "module",
  "license": "Apache-2.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./lockup": "./dist/lockup.js",
    "./comptroller": "./dist/comptroller.js"
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "tsc -p .",
    "regen": "bash scripts/regen-bindings.sh",
    "test": "vitest run"
  },
  "dependencies": {
    "@stellar/stellar-sdk": "^13.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

`sdk/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the regen script**

`sdk/scripts/regen-bindings.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SDK_DIR="$ROOT/sdk"

if [ ! -f "$ROOT/deployments/testnet.json" ]; then
    echo "Need testnet deployment for IDs. Run scripts/deploy-testnet.sh first."
    exit 1
fi

LOCKUP="$(jq -r .lockup "$ROOT/deployments/testnet.json")"
COMPTROLLER="$(jq -r .comptroller "$ROOT/deployments/testnet.json")"

mkdir -p "$SDK_DIR/src/generated"

stellar contract bindings typescript \
    --network testnet \
    --id "$LOCKUP" \
    --output-dir "$SDK_DIR/src/generated/lockup" \
    --overwrite

stellar contract bindings typescript \
    --network testnet \
    --id "$COMPTROLLER" \
    --output-dir "$SDK_DIR/src/generated/comptroller" \
    --overwrite

echo "Regenerated bindings into sdk/src/generated/"
```

`chmod +x sdk/scripts/regen-bindings.sh`.

- [ ] **Step 3: Top-level re-exports**

`sdk/src/index.ts`:

```ts
export * as lockup from './lockup.js';
export * as comptroller from './comptroller.js';
```

`sdk/src/lockup.ts`:

```ts
export * from './generated/lockup/index.js';
```

`sdk/src/comptroller.ts`:

```ts
export * from './generated/comptroller/index.js';
```

- [ ] **Step 4: Regenerate + build**

```bash
cd sdk
./scripts/regen-bindings.sh
npm install
npm run build
```

Expected: builds successfully with type declarations in `dist/`.

- [ ] **Step 5: Commit**

```bash
git add sdk/
git commit -m "feat(sdk): scaffold TS bindings package with regen script"
```

---

## Task 35: SDK smoke test (testnet)

**Files:** Create `sdk/tests/smoke.test.ts`, modify `sdk/package.json` if needed.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { rpc, Keypair, Networks } from '@stellar/stellar-sdk';
import { readFileSync } from 'node:fs';
import { Client as LockupClient } from '../src/generated/lockup/index.js';

const deployment = JSON.parse(
  readFileSync(new URL('../../deployments/testnet.json', import.meta.url), 'utf8'),
);

const RPC_URL = process.env.HOURGLASS_RPC ?? 'https://soroban-testnet.stellar.org:443';
const SECRET = process.env.HOURGLASS_SECRET;

describe('hourglass sdk smoke', () => {
  it('reads admin of lockup', async () => {
    if (!SECRET) {
      // Test is opt-in to avoid requiring funded testnet keys in CI by default.
      return;
    }
    const keypair = Keypair.fromSecret(SECRET);
    const client = new LockupClient({
      contractId: deployment.lockup,
      networkPassphrase: Networks.TESTNET,
      rpcUrl: RPC_URL,
      publicKey: keypair.publicKey(),
    });
    const tx = await client.admin();
    const result = await tx.simulate();
    expect(result.result).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run**

```bash
cd sdk
npm test
```

Expected: passes (with the `SECRET` env var case skipped if not set).

- [ ] **Step 3: Commit**

```bash
git add sdk/tests/smoke.test.ts
git commit -m "test(sdk): add opt-in testnet smoke that simulates Lockup.admin()"
```

---

## Task 36: README + repo docs polish

**Files:** Modify `README.md`; add `CONTRIBUTING.md`.

- [ ] **Step 1: Rewrite README**

Replace `README.md`:

```markdown
# Hourglass

Token streaming on Stellar / Soroban. Clean-room reimplementation inspired by Sablier's publicly documented Lockup protocol. Apache-2.0.

## What it does

Lock SEP-41 tokens into a vesting schedule (linear with cliff, or stepped tranches), represented as a transferable NFT receipt. Senders can cancel mid-stream (until renounced); recipients can withdraw the accrued portion any time.

## Project layout

| Path | Purpose |
|---|---|
| `contracts/shared` | Types, errors, streaming math (pure Rust). |
| `contracts/comptroller` | Upgradeable admin + USD-denominated fee oracle adapter. |
| `contracts/lockup` | Immutable stream storage + lifecycle + embedded NFT receipt. |
| `sdk/` | TypeScript bindings generated from deployed contracts. |
| `scripts/` | Build, deploy, smoke. |
| `deployments/` | Pinned contract IDs per network. |
| `docs/superpowers/specs/` | Design specs. |
| `docs/superpowers/plans/` | Implementation plans. |

## Quickstart

### Build the contracts

```bash
./scripts/build.sh
```

Produces optimized wasm in `dist/`.

### Run the test suite

```bash
cargo test
```

All contract tests run with `soroban_sdk::Env`; no network access required.

### Deploy to testnet

```bash
./scripts/deploy-testnet.sh
```

Writes pinned IDs to `deployments/testnet.json`.

### Smoke-test the deployed contracts

```bash
./scripts/smoke-testnet.sh
```

### Regenerate the SDK

```bash
cd sdk
./scripts/regen-bindings.sh
npm run build
```

## Status

Pre-MVP. See `docs/superpowers/specs/2026-05-23-hourglass-design.md` for the design and `docs/superpowers/plans/2026-05-23-hourglass-contracts-mvp.md` for this contracts plan.

Phase 0 (this plan): Lockup Linear + Tranched, NFT receipts, cancel/renounce/transfer, testnet deploy, smoke test, TS bindings.

Phase 1: Lockup Dynamic, Merkle Airstreams, sender-sponsored fees, batch creation contract, mainnet launch. See spec §18.

## License

Apache-2.0. See `LICENSE`.
```

- [ ] **Step 2: Add `CONTRIBUTING.md`**

```markdown
# Contributing to Hourglass

## Toolchain

- Rust stable (set by `rust-toolchain.toml`).
- `stellar-cli` 22+ (`cargo install --locked stellar-cli`).
- Node 20+ (for the SDK package).

## Workflow

1. Pick or open an issue.
2. Branch from `main`: `git checkout -b feat/<short-name>`.
3. TDD: write the test first; watch it fail; implement; watch it pass; commit.
4. Run the full suite locally: `cargo test && (cd sdk && npm test)`.
5. Open a PR. Keep PRs small and reviewable.

## Commit messages

Conventional Commits:

- `feat(scope): …` — user-visible behavior.
- `fix(scope): …` — bug fix.
- `test(scope): …` — tests only.
- `docs(scope): …` — docs only.
- `chore(scope): …` — tooling, deps.

Scopes match crate names: `shared`, `lockup`, `comptroller`, `sdk`, plus `build`, `deploy`, `test`.

## Code style

- `cargo fmt` and `cargo clippy --workspace -- -D warnings` are CI-enforced.
- Prefer `unwrap_or_else(|| panic_with_error!(env, Error::Foo))` over silent `unwrap()`.
- Every error path returns a defined `Error` variant from `hourglass-shared`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CONTRIBUTING.md
git commit -m "docs: write README quickstart + CONTRIBUTING guide"
```

---

## Task 37: CI workflow

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1: Write GitHub Actions workflow**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - name: fmt
        run: cargo fmt --all -- --check
      - name: clippy
        run: cargo clippy --workspace --all-targets -- -D warnings
      - name: test
        run: cargo test --workspace
      - name: wasm build
        run: |
          cargo build --target wasm32-unknown-unknown --release \
              -p hourglass-comptroller -p hourglass-lockup

  sdk:
    runs-on: ubuntu-latest
    needs: contracts
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: install
        run: cd sdk && npm ci
      - name: build
        run: cd sdk && npm run build
      - name: test
        run: cd sdk && npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add cargo fmt/clippy/test + wasm build + SDK build/test workflow"
```

---

## Task 38: Verify all the things — final sweep

**Files:** None.

- [ ] **Step 1: Full local test sweep**

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
./scripts/build.sh
```

Expected: every step exits 0.

- [ ] **Step 2: Verify wasm sizes are reasonable**

```bash
ls -lh dist/
```

Expected: each `.optimized.wasm` is well under 64 KiB (Soroban prefers small binaries). Comptroller should be small (~5–10 KB). Lockup will be larger due to OZ NFT embedding (~25–45 KB). If lockup is over 60 KB, profile binary bloat with `cargo bloat --release -p hourglass-lockup` before deploying to mainnet.

- [ ] **Step 3: Smoke-test deployed testnet again to confirm nothing regressed**

```bash
./scripts/smoke-testnet.sh
```

- [ ] **Step 4: Commit the final state (no source change expected)**

If you made any cleanup edits, commit them with a clear message. If nothing changed, skip.

- [ ] **Step 5: Tag the milestone**

```bash
git tag v0.1.0-mvp -m "Hourglass MVP — contracts ready for testnet"
```

---

## Out-of-scope follow-ups (their own plans)

The following are explicitly NOT in this plan. Each gets its own design + plan once this contracts MVP is live on testnet and the API has stabilized:

1. **Indexer plan (Mercury Retroshades)** — schemas for `streams`, `actions`, `tranches`; event handlers; GraphQL endpoint smoke test.
2. **Frontend plan (Next.js 15)** — landing, dashboard, stream detail, create wizard; wallets-kit integration; live withdrawable counter; transaction signing flow.
3. **Live Reflector oracle wiring** — replaces the Phase-0 sentinel oracle with real Reflector contractimport + price-feed health checks.
4. **Phase-1 contracts** — Dynamic streams, MerkleInstant + MerkleLL airstreams, dedicated batch creation contract, sender-sponsored withdrawal fees, on-chain SVG NFT renderer.
5. **Mainnet launch** — separate plan covering audit prep, audit fixes, deployment, monitoring, runbook.
