# Hourglass — Contract Technical Reference

**Version:** v0.2.1  
**Network:** Stellar Testnet  
**Deployed:** 2026-09-15  
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
| **Lockup** | `CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL` |
| **Comptroller** | `CDIXANE4HA76SPOLISKSZIWGX2FZW4BDFLGUOGRQETELLVEV6O6A3AZW` |
| **Lockup (v0.2, retired — post-cancel over-withdraw bug)** | `CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU` |
| **Lockup (v0.1, retired)** | `CDKYNKWDUBGDZSTJGU6ZYEQ5BUMGIHBXXEZUMAOMQAJRSAVVFFSB3CQK` |

**Network details:**
- Network: Stellar Testnet
- RPC: `https://soroban-testnet.stellar.org`
- Horizon: `https://horizon-testnet.stellar.org`
- Deployer: `GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2`

**Verify on Stellar Expert:**
- Lockup: https://stellar.expert/explorer/testnet/contract/CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL
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
- Instance storage: `admin`, `comptroller`, `native_token` (the XLM SAC used for fees), `next_stream_id`
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
3. Refund = `deposited - streamed(now)` (everything not yet vested)
4. Tokens are returned to the sender immediately
5. Recipient keeps what had vested by the cancel time: whatever was already withdrawn plus `streamed(now) - withdrawn`, which stays withdrawable
6. From then on the recipient's withdrawable amount is capped at `deposited - refunded - withdrawn` — the schedule no longer vests anything beyond the cancel point (v0.2.1 fix; earlier lockups let the recipient withdraw past the refund and drain the pooled balance)

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
- Errors: `EmptyBatch` (19) and `BatchTooLarge` (20) are batch-level errors; `InvalidPeriod` (21) and `InvalidCount` (22) are Recurring-row validation errors (also raised by `create_recurring`), plus the per-shape create errors.
- Practical limit measured on testnet (smoke probe, linear rows): **30 rows per transaction**. Tranched rows with many tranches fit fewer.

---

## 8. Fee Model

Fees are denominated in USD and collected in XLM on each `withdraw`/`withdraw_max` call, paid by the recipient. The fee amount is fetched from the comptroller, which queries the Reflector oracle for the current XLM/USD price; the charge is skipped entirely when the configured fee is 0.

**Current testnet fee:** configurable (currently set to 0 on testnet)

No fee is charged at stream creation, cancel, renounce, transfer, or burn — only on withdrawal.

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
| Post-cancel cap | `withdrawable = min(streamed, deposited − refunded) − withdrawn`, so a canceled stream can never pay out more than what stayed in the contract |

---

## 10. Test Coverage

111 tests across the workspace, all running in-process via `soroban_sdk::Env` (no network required):

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
# hourglass_comptroller.wasm          (~11 KB optimized)
# hourglass_lockup.wasm               (~97 KB optimized)
```

---

## 12. Testnet Evidence

### v0.2.1 smoke (2026-09-15)

Lockup v0.2.1 fixes the post-cancel over-withdraw bug (see §7 step 6 and
§9) and was redeployed to testnet and smoke-tested on **2026-09-15**. The
comptroller was reused; the v0.2 lockup below stays live on-chain but is
retired.

- Lockup contract: `CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL`
  https://stellar.expert/explorer/testnet/contract/CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL
- Stream ids created by the smoke run: linear = **1**, recurring = **2**,
  batch = **[3, 4, 5]**
- Batch-size probe result: the largest linear `create_batch` that still fit
  in one transaction was **30 rows** (40 rows did not fit) — unchanged

#### Deploy transactions

- Upload WASM: https://stellar.expert/explorer/testnet/tx/dbb131b800230cfcc951fc38d242fcc926619add7d6d4d95f30b4515e321be23
- Deploy contract: https://stellar.expert/explorer/testnet/tx/ed2e23d178e291065e217aa1cb8f2bccf20b8ed45f439ed119fa432d1695c254

#### Smoke + probe transactions

- https://stellar.expert/explorer/testnet/tx/12dccbaed47d124f869d4b9a9ed1d059a9c329197759393c7771d5c75c4ed773
- https://stellar.expert/explorer/testnet/tx/2318fe24739ca8febc79fd552e5fc3fc9dc66c74c7996785ed4164e6a70ff1f1
- https://stellar.expert/explorer/testnet/tx/6df82d7cce91efda85decbdc1d3ca6234be3807b61b48b9dff19b5a7664b1f62
- https://stellar.expert/explorer/testnet/tx/6f100e6b06c3d089c612c893ef9f8745fa72318bc6d2a7f546022f252bd534ff
- https://stellar.expert/explorer/testnet/tx/946fe805255c58c82a6fd0a43241e4295f845da141a8c1e2752350610331fbaf
- https://stellar.expert/explorer/testnet/tx/9f0fa2e70cca2a5d09e6859e9ac4b30bc326907be35c6196f3131a462fbb36be
- https://stellar.expert/explorer/testnet/tx/a727345d0258d0dafc88e3bd1816dc203af59decda4a4c52b8fe431b3af51c1f
- https://stellar.expert/explorer/testnet/tx/c45035463dc06cf461dae60838a0320cf010ca2792c7b78ffed8a7d500e643cd
- https://stellar.expert/explorer/testnet/tx/db47ed15bc4fb6350a00481b6d85f2abe708584e8eadb5087999ae352c10d35f

### v0.2 smoke (2026-09-14, retired lockup)

Lockup v0.2 (recurring streams + atomic `create_batch`) was redeployed to
testnet and smoke-tested on **2026-09-14**.

- Lockup contract: `CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU`
  https://stellar.expert/explorer/testnet/contract/CCP7G5WXXUUNMLKUOIZXFTYF46NSE45ZLWMOTTIMGTQKKPNADF55DRSU
- Stream ids created by the smoke run: linear = **1**, recurring = **2**,
  batch = **[3, 4, 5]**
- Batch-size probe result: the largest linear `create_batch` that still fit
  in one transaction was **30 rows** (40 rows did not fit)

#### Deploy transactions

- Upload WASM: https://stellar.expert/explorer/testnet/tx/e78c775f8ee025a95d1e2d59ec5fdf57f967eb28f4f73ce90fcd4cd35ec6912f
- Deploy contract: https://stellar.expert/explorer/testnet/tx/e07e071e7e2118cb54427a3390e5894b6c5d3e9ae1ab520d8bad9e7ee2a78e6b

#### Smoke + probe transactions

- https://stellar.expert/explorer/testnet/tx/08dcfdf7a8bb28cce6b326f8245a2a41c337bd3ad451fab0a68dc32146a33ee4
- https://stellar.expert/explorer/testnet/tx/277a1af4dd65635a973bc702844428ffe93861a493f2cc977f9acff03126ec18
- https://stellar.expert/explorer/testnet/tx/5c1ac66639f4dcb13941833514e78ee11b5563ccf601764d780e17557cbe5681
- https://stellar.expert/explorer/testnet/tx/69774087bc47197d48c67de5ea263406b558b2fa764235edaf00b7a8f98dfc0c
- https://stellar.expert/explorer/testnet/tx/85c16c1c82524096a966e2a32e91f6f01f839bcf2fe6a8feedb4e9e5ab874d6e
- https://stellar.expert/explorer/testnet/tx/be7ed20e3ed07ed9ac3e233b8f4ce6d4fab55785a4215d8a261bbb728c4d6831
- https://stellar.expert/explorer/testnet/tx/c50de153e6b24dcd407f89cb7e6cea45d9ad70fe4e402e1ca996f3c17e448181
- https://stellar.expert/explorer/testnet/tx/e8badbdf99f45a1f9f153cf3c69e3188c5196c349e984779079547837cf65d4f
- https://stellar.expert/explorer/testnet/tx/f007941d41c9fc09cc597577aeaf0c600966a4a4b48963c5c0db6636a3eb8328

Both the deploy transactions and the batch-size probe transactions are
included above. (One 64-hex value in the Task 9 deploy log,
`2d98e9e91fc7f79b6739ccd5db2e163bf2ffc6f941341a83acbf6c3b10195f01`, is the
uploaded WASM's hash, not a transaction hash, and is omitted from this
list for that reason.)

These hashes are the record of the smoke run; they can be looked up
directly on stellar.expert using the links above.

---

*Hourglass Protocol — Apache-2.0 — https://hourglassprotocol.org*
