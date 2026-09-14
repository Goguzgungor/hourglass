# Hourglass — Contract Technical Reference

**Version:** v0.2.0  
**Network:** Stellar Testnet  
**Deployed:** 2026-09-14  
**License:** Apache-2.0  
**Repository:** https://github.com/Goguzgungor/hourglass

---

## 1. Overview

Hourglass is a token-streaming protocol deployed on Stellar / Soroban. It allows a sender to lock SEP-41 tokens into a time-based stream that continuously releases funds to a recipient according to a programmable vesting schedule. Each stream is represented by a transferable NFT receipt that can be traded, transferred, or used as collateral.

**Key properties:**
- Non-custodial: tokens are held in the lockup contract, not by any intermediary
- Immutable lockup: stream logic cannot be upgraded, providing recipients with strong guarantees
- Configurable cancelability and transferability per stream
- No protocol fee on the streamed asset; fees are USD-denominated and minimal
- All vesting math is deterministic and verifiable on-chain

---

## 2. Deployed Contracts (Testnet)

| Contract | Address |
|----------|---------|
| **Lockup** | `CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU` |
| **Comptroller** | `CDIXANE4HA76SPOLISKSZIWGX2FZW4BDFLGUOGRQETELLVEV6O6A3AZW` |
| **Lockup (v0.1, retired)** | `CDKYNKWDUBGDZSTJGU6ZYEQ5BUMGIHBXXEZUMAOMQAJRSAVVFFSB3CQK` |

**Network details:**
- Network: Stellar Testnet
- RPC: `https://soroban-testnet.stellar.org`
- Horizon: `https://horizon-testnet.stellar.org`
- Deployer: `GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2`

**Verify on Stellar Expert:**
- Lockup: https://stellar.expert/explorer/testnet/contract/CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU
- Comptroller: https://stellar.expert/explorer/testnet/contract/CDIXANE4HA76SPOLISKSZIWGX2FZW4BDFLGUOGRQETELLVEV6O6A3AZW

**Test assets deployed on testnet:**
| Asset | Contract |
|-------|---------|
| HGT (test token) | `CANJRTA7Z6JFPKNL3DVAP6UJEGXBIBKH7HDA4CRQO35EA3DGVYMV7I7N` |
| USDC (test) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| XLM (native SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

---

## 3. Architecture

```
┌─────────────────────────────────┐    ┌──────────────────────────────────┐
│  hourglass-lockup  (immutable)  │───▶│  hourglass-comptroller           │
│                                 │    │  (upgradeable)                   │
│  • Stream CRUD                  │    │                                  │
│  • NFT receipt (ERC-721-like)   │    │  • Fee config (USD-denominated)  │
│  • withdraw / cancel / renounce │    │  • Oracle reference (Reflector)  │
│  • burn / transfer              │    │  • Admin roles                   │
└────────────┬────────────────────┘    └──────────────────────────────────┘
             │
             ▼
   ┌──────────────────┐
   │  SEP-41 Token    │  (XLM SAC, USDC SAC, or any custom SEP-41)
   └──────────────────┘
```

### 3.1 hourglass-lockup

The core immutable contract. Holds all stream state in Soroban persistent storage (one entry per stream ID). Embeds a NonFungibleToken Enumerable mixin for NFT receipts.

**Storage layout:**
- Instance storage: `admin`, `comptroller`, `next_stream_id`
- Persistent storage: `Stream { id }` — one entry per active stream

**Entry points:**
| Function | Who can call | Description |
|----------|-------------|-------------|
| `create_linear` | Any address | Creates a linear vesting stream |
| `create_tranched` | Any address | Creates a tranched (step) vesting stream |
| `create_recurring` | Any address | Creates a recurring stream: `count` unlocks of `amount_per_period`, first at `first_ts`, then every `period_secs` |
| `create_batch` | Any address | Creates 1–100 streams of mixed shapes for one sender/token in one transaction; atomic; one token transfer |
| `withdraw_max` | NFT owner (recipient) | Withdraws all currently unlocked tokens |
| `cancel` | Sender (if `is_cancelable`) | Cancels stream; refunds unvested amount |
| `renounce` | Sender | Permanently removes sender's cancel right |
| `burn` | Anyone | Burns NFT once stream is fully settled |
| `transfer` | NFT owner | Transfers stream NFT to a new address |
| `get_stream` | Read-only | Returns full stream state |
| `streamed_amount` | Read-only | Returns total vested amount at a given timestamp |
| `withdrawable_amount` | Read-only | Returns amount available to withdraw now |
| `status` | Read-only | Returns stream status enum |

### 3.2 hourglass-comptroller

Upgradeable contract that holds fee configuration and oracle reference. The lockup calls into the comptroller at stream creation to compute the required fee in XLM (converted from a USD target price using Reflector oracle data). This design allows fee adjustments without requiring stream migration.

---

## 4. Stream Data Model

```rust
pub struct Stream {
    pub sender: Address,        // Original depositor
    pub recipient: Address,     // Token receiver + NFT owner
    pub token: Address,         // SEP-41 contract address
    pub start_ts: u64,          // Unix timestamp: stream begins
    pub end_ts: u64,            // Unix timestamp: all tokens vested
    pub is_cancelable: bool,    // Sender can cancel until renounced
    pub is_transferable: bool,  // Recipient can transfer NFT
    pub was_canceled: bool,     // True once canceled
    pub is_depleted: bool,      // True once burned
    pub deposited: i128,        // Total tokens locked (stroops)
    pub withdrawn: i128,        // Total tokens withdrawn so far
    pub refunded: i128,         // Tokens refunded to sender on cancel
    pub shape: StreamShape,     // Linear, Tranched or Recurring
}

pub enum StreamShape {
    Linear(LinearShape),
    Tranched(TranchedShape),
    Recurring(RecurringShape),
}

pub struct LinearShape {
    pub cliff_ts: u64,          // Cliff timestamp (== start_ts if no cliff)
    pub unlock_at_start: i128,  // Immediate lump sum at start_ts
    pub unlock_at_cliff: i128,  // Lump sum released at cliff_ts
}

pub struct TranchedShape {
    pub tranches: Vec<Tranche>, // Ordered by ts; sum == deposited
}

pub struct Tranche {
    pub amount: i128,           // Tokens unlocked at this timestamp
    pub ts: u64,                // Unix timestamp
}

pub struct RecurringShape {
    pub first_ts: u64,          // First unlock (== start_ts)
    pub period_secs: u64,       // Seconds between unlocks
    pub count: u32,             // Number of unlocks; end_ts = first_ts + (count-1)*period_secs
    pub amount_per_period: i128 // Per-unlock amount; deposited = amount_per_period * count
}
```

**Stream status:**
| Status | Condition |
|--------|-----------|
| `Pending` | `now < start_ts` |
| `Streaming` | `start_ts <= now < end_ts` and not canceled |
| `Canceled` | `was_canceled == true` |
| `Settled` | `now >= end_ts` and not canceled |
| `Depleted` | `is_depleted == true` (burned) |

---

## 5. Vesting Math

### 5.1 Linear Vesting

**Variables:**
- `S` = `start_ts`, `C` = `cliff_ts`, `E` = `end_ts`
- `D` = `deposited`, `Us` = `unlock_at_start`, `Uc` = `unlock_at_cliff`
- `t` = current timestamp

**Invariants enforced at create:**
- `S ≤ C ≤ E`
- `Us + Uc ≤ D`

**Streamed amount formula:**

```
if t < S:
    streamed = 0

elif t < C:
    streamed = Us                          ← only the start lump sum

elif t >= E:
    streamed = D                           ← fully vested

else:
    base = D - Us - Uc
    elapsed = t - C
    duration = E - C
    streamed = Us + Uc + floor(base × elapsed / duration)
```

**Withdrawable amount:**
```
withdrawable = max(0, streamed - withdrawn)
```

**Example** — 100,000 USDC stream over 12 months, 3-month cliff, 10% at start, 10% at cliff:

| Time | Streamed |
|------|---------|
| t=0 (start) | 10,000 USDC |
| t=1 month | 10,000 USDC |
| t=3 months (cliff) | 20,000 USDC |
| t=6 months | 60,000 USDC |
| t=12 months | 100,000 USDC |

### 5.2 Tranched Vesting

Tranches are sorted ascending by timestamp. The vested amount at any time `t` is the sum of all tranche amounts whose timestamp has passed:

```
streamed = Σ tranche.amount  for all tranches where tranche.ts <= t
```

**Example** — 4-tranche milestone release:
| Date | Amount |
|------|--------|
| 2026-01-01 | 25,000 USDC |
| 2026-04-01 | 25,000 USDC |
| 2026-07-01 | 25,000 USDC |
| 2026-10-01 | 25,000 USDC |

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

---

## 6. NFT Receipt System

Each stream mints exactly one NFT at creation time (token ID = stream ID). The NFT represents ownership of the stream's withdrawable balance and can be:

- **Transferred** — new owner becomes the recipient and can withdraw
- **Burned** — only after the stream is fully `Settled` and depleted

This makes streams composable: a recipient can sell a vesting position, use it as collateral in a lending protocol, or transfer it as part of an OTC deal.

**Transfer security:** transferring the NFT automatically updates the `recipient` field on the underlying stream record, so the previous owner immediately loses withdrawal rights.

---

## 7. Cancel & Renounce Flows

### Cancel
1. Sender calls `cancel(stream_id)`
2. Contract sets `was_canceled = true`
3. Refund = `deposited - withdrawn` (all unvested + unstreamed tokens)
4. Tokens are returned to the sender immediately
5. Recipient retains whatever they had already withdrawn

**Cancel is only possible if:**
- `is_cancelable == true`
- `was_canceled == false`
- `is_depleted == false`

### Renounce
1. Sender calls `renounce(stream_id)`
2. Contract sets `is_cancelable = false` permanently
3. The stream is now irrevocable — recipient has full certainty

Renounce is a one-way operation and cannot be undone.

---

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
- Practical limit measured on testnet (smoke probe, linear rows): **30 rows per transaction**. Tranched rows with many tranches fit fewer.

---

## 8. Fee Model

Fees are denominated in USD and collected in XLM at stream creation. The fee amount is fetched from the comptroller, which queries the Reflector oracle for the current XLM/USD price.

**Current testnet fee:** configurable (default: $1 USD equivalent in XLM)

No fee is charged on withdrawals, cancels, or any subsequent operations — only at stream creation.

---

## 9. Security Properties

| Property | Implementation |
|----------|---------------|
| Immutable lockup | Contract is not upgradeable; stream logic is fixed at deploy |
| Upgradeable comptroller | Fee/oracle config can be updated without affecting streams |
| No silent overflow | Release profile enforces `overflow-checks = true` |
| `mul_div` precision | Intermediate 256-bit multiplication avoids truncation errors |
| Explicit error handling | All error paths return typed `Error` variants; no panics |
| Re-entrancy | Soroban's execution model prevents re-entrant calls |
| Access control | `sender`/`recipient` roles enforced per operation |

---

## 10. Test Coverage

106 tests across the workspace, all running in-process via `soroban_sdk::Env` (no network required):

| Module | Test file |
|--------|-----------|
| Shared math | `contracts/shared/src/lib.rs` |
| Comptroller | `contracts/comptroller/src/tests.rs` |
| Linear streams | `contracts/lockup/src/tests/linear.rs` |
| Tranched streams | `contracts/lockup/src/tests/tranched.rs` |
| Recurring streams | `contracts/lockup/src/tests/recurring.rs` |
| Batch creation | `contracts/lockup/src/tests/batch.rs` |
| Withdraw | `contracts/lockup/src/tests/withdraw.rs` |
| Cancel / Renounce | `contracts/lockup/src/tests/cancel.rs` |
| Burn | `contracts/lockup/src/tests/burn.rs` |
| NFT Transfer | `contracts/lockup/src/tests/transfer.rs` |
| Global invariants | `contracts/lockup/src/tests/invariants.rs` |

Run all tests:
```bash
cargo test
```

---

## 11. Build & Reproduce

```bash
# Clone
git clone https://github.com/Goguzgungor/hourglass
cd hourglass/contracts

# Install Rust + wasm target
rustup target add wasm32v1-none

# Build (comptroller must be built first — lockup imports its WASM at compile time)
./scripts/build.sh

# Output
ls dist/
# hourglass_comptroller.wasm          (~9 KB optimized)
# hourglass_lockup.wasm               (~90 KB optimized)
```

---

*Hourglass Protocol — Apache-2.0 — https://hourglassprotocol.org*
