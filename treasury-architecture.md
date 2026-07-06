# Hourglass — Treasury Architecture

**Document type:** Technical Design  
**Version:** v0.1-draft  
**Status:** Design proposal — not yet implemented  
**Protocol:** Hourglass / Stellar / Soroban  

---

## 1. Problem Statement

When a sender creates a token stream, the locked tokens sit idle in the lockup contract for the entire duration of the vesting period. For a typical 12-month team vesting schedule with a 3-month cliff, roughly 75% of the deposited capital is stationary at any given moment — generating no yield for anyone.

This represents a structural inefficiency:
- The **sender** locks up capital that could otherwise be earning yield
- The **recipient** is exposed to the opportunity cost of tokens not yet vested
- The **protocol** provides no differentiated value over a simple time-locked escrow

A yield-generating treasury layer addresses this directly: idle tokens go to work inside Stellar's DeFi ecosystem, and the accrued yield is distributed back to protocol participants.

---

## 2. Design Goals

| Goal | Constraint |
|------|-----------|
| Idle vesting capital earns yield | Yield sources must be on Stellar / Soroban |
| Lockup contract stays immutable | Treasury is a separate, upgradeable contract |
| Stream math is unchanged | Vesting schedule is unaffected by yield activity |
| Recipients always get ≥ their vested amount | Yield is additive, not a substitute |
| Senders can opt in per stream | Not all senders want their tokens deployed |
| Treasury is non-custodial | No admin key can rug the yield |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Hourglass Protocol                           │
│                                                                      │
│  ┌─────────────────────┐     ┌────────────────────────────────────┐  │
│  │  hourglass-lockup   │────▶│  hourglass-treasury (new)          │  │
│  │  (immutable)        │     │  (upgradeable)                     │  │
│  │                     │     │                                    │  │
│  │  create_linear()    │     │  • Accepts token deposits          │  │
│  │  withdraw_max()     │     │  • Routes to yield strategies      │  │
│  │  cancel()           │     │  • Tracks per-stream shares        │  │
│  │                     │     │  • Settles yield at withdraw time  │  │
│  └─────────────────────┘     └──────────┬─────────────────────────┘  │
│                                         │                            │
│         ┌───────────────────────────────┼──────────────────┐         │
│         ▼                               ▼                  ▼         │
│  ┌─────────────┐               ┌──────────────┐   ┌──────────────┐   │
│  │  Blend      │               │  Stellar AMM │   │  Future      │   │
│  │  (lending)  │               │  (LP fees)   │   │  strategies  │   │
│  └─────────────┘               └──────────────┘   └──────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

The `hourglass-treasury` contract is a new, separate Soroban contract. It holds deposited tokens on behalf of opted-in streams, deploys them to whitelisted yield strategies, and accounts for each stream's pro-rata share of accrued yield.

The lockup contract's code does not change. Streams that opt into the treasury pass their tokens to it at creation time; streams that do not behave exactly as today.

---

## 4. Component Breakdown

### 4.1 hourglass-treasury

**Role:** Central vault + yield router  
**Upgradeability:** UUPS-style (same pattern as comptroller)  
**Storage:** One `TreasuryPosition` per stream_id

```rust
pub struct TreasuryPosition {
    pub stream_id: u64,
    pub token: Address,
    pub principal: i128,          // Tokens deposited by this stream
    pub shares: i128,             // Pro-rata claim on strategy pool
    pub yield_earned: i128,       // Cumulative yield settled to date
    pub strategy: Address,        // Which strategy contract holds the funds
    pub opted_in: bool,
}
```

**Entry points:**
| Function | Called by | Description |
|----------|----------|-------------|
| `deposit(stream_id, amount, token)` | lockup (at create) | Accept tokens, route to active strategy |
| `withdraw(stream_id, amount)` | lockup (at withdraw) | Return principal + yield to recipient |
| `settle_yield(stream_id)` | Anyone | Compute and record accrued yield for a stream |
| `rebalance(strategy)` | Admin | Move funds to a different strategy |
| `add_strategy(address)` | Admin | Whitelist a new yield source |
| `pause()` / `unpause()` | Admin | Emergency circuit breaker |
| `get_position(stream_id)` | Read-only | View current position + yield |

### 4.2 Yield Strategies

Each strategy is a thin adapter contract that wraps a specific Stellar DeFi protocol. The treasury calls a standardized interface:

```rust
pub trait YieldStrategy {
    fn deposit(token: Address, amount: i128) -> i128;   // Returns shares
    fn withdraw(shares: i128) -> i128;                   // Returns tokens
    fn value_of(shares: i128) -> i128;                   // Current token value
    fn token() -> Address;                               // Supported token
}
```

**Planned strategies (Phase 1):**

| Strategy | Protocol | Mechanism | Expected APY |
|----------|----------|-----------|-------------|
| `BlendUSDCStrategy` | Blend Protocol | Supply USDC to Blend lending pool; earn borrow interest | ~4–8% |
| `BlendXLMStrategy` | Blend Protocol | Supply XLM to Blend; earn borrow interest | ~2–5% |
| `AMMStrategy` | Stellar DEX | Provide liquidity to XLM/USDC AMM pool; earn trading fees | variable |

### 4.3 hourglass-comptroller (extended)

The existing comptroller gains two new configuration fields:

```rust
pub struct FeeConfig {
    // existing fields ...
    pub treasury: Option<Address>,      // Treasury contract (None = opt-in disabled)
    pub yield_fee_bps: u32,             // Protocol cut of yield (default: 1000 = 10%)
}
```

The yield fee is taken at settlement — a small percentage of accrued yield is redirected to the protocol fee collector before the remainder is credited to the stream.

---

## 5. Token Flow

### 5.1 Stream Creation (with treasury opt-in)

```
Sender
  │  transfer(deposited + fee)
  ▼
Lockup contract
  │  (validates, stores stream record, mints NFT)
  │  treasury.deposit(stream_id, deposited, token)
  ▼
Treasury
  │  strategy.deposit(token, deposited) → shares
  │  store TreasuryPosition { principal, shares }
  ▼
Blend / AMM (tokens earning yield)
```

### 5.2 Recipient Withdrawal

```
Recipient calls withdraw_max(stream_id)
  ▼
Lockup
  │  compute withdrawable_amount() via vesting math
  │  treasury.withdraw(stream_id, withdrawable_amount)
  ▼
Treasury
  │  value_of(shares) → current_value
  │  yield_earned = current_value - principal_withdrawn_so_far
  │  yield_fee = yield_earned * yield_fee_bps / 10000
  │  recipient_yield = yield_earned - yield_fee
  │  strategy.withdraw(proportional_shares) → tokens
  │  transfer(tokens + recipient_yield → recipient)
  │  transfer(yield_fee → fee_collector)
  ▼
Recipient receives: vested_principal + yield
```

### 5.3 Cancellation (with treasury)

```
Sender calls cancel(stream_id)
  ▼
Lockup
  │  was_canceled = true
  │  treasury.withdraw(stream_id, refund_amount)
  ▼
Treasury
  │  return principal (pro-rata) to sender
  │  distribute yield earned so far:
  │    - recipient share of yield (based on elapsed time)
  │    - sender share of yield (based on remaining time)
  │    - yield_fee to protocol
  ▼
Both parties receive their fair share of yield
```

---

## 6. Share Accounting

The treasury uses a share-based model to handle multiple streams pooled into a single strategy position, avoiding rounding errors and fragmentation.

When stream A deposits 1,000 USDC and receives 1,000 shares, the pool's exchange rate is 1.0. When stream B deposits 1,000 USDC later (after yield has accrued), the pool rate might be 1.05 — so stream B receives ~952 shares for 1,000 USDC. When B withdraws, those 952 shares are worth more than 1,000 USDC because the exchange rate has increased further.

This ensures:
- Late depositors don't dilute early depositors' yield
- Early withdrawers don't take more than their proportional share
- Gas-efficient: one pool position per strategy, not one per stream

---

## 7. Risk Model

| Risk | Mitigation |
|------|-----------|
| Strategy contract exploit | Whitelist-only strategies; multi-sig admin; circuit breaker |
| Oracle manipulation (AMM) | Use TWAP or Reflector price, not spot |
| Liquidity crunch in Blend | Max utilization cap per strategy; maintain withdrawal buffer |
| Smart contract bug in treasury | Upgradeable; audited before mainnet |
| Yield rate drops to zero | Streams still work — treasury returns principal unchanged |
| Protocol insolvency of yield source | Diversify across strategies; emergency withdrawal function |

**Conservative invariant:** Recipients always receive at least their vested principal. Yield is additive. If the strategy generates negative returns (e.g., impermanent loss), the protocol absorbs the loss up to a configurable insurance buffer funded by protocol yield fees.

---

## 8. Opt-In UX

On the `/create` stream wizard, senders see a toggle:

```
┌─────────────────────────────────────────────────┐
│  Put idle tokens to work?                       │
│                                                 │
│  ○ Standard stream (tokens held in escrow)      │
│  ● Yield stream (earn ~4-6% APY while vesting)  │
│                                                 │
│  Strategy: Blend USDC (currently 5.1% APY)      │
│  Recipient receives: vested amount + yield      │
│  Protocol fee: 10% of yield only                │
└─────────────────────────────────────────────────┘
```

The recipient sees on the stream detail page:
- Vested amount (from streaming math, unchanged)
- Yield accrued (from treasury position)
- Total withdrawable = vested + yield

---

## 9. Implementation Phases

### Phase 1 — Treasury Foundation (next milestone)
- `hourglass-treasury` contract (deposit, withdraw, settle_yield)
- `BlendUSDCStrategy` adapter
- Opt-in flag on stream creation
- Frontend: yield toggle on `/create`, yield display on `/stream/[id]`

### Phase 2 — Multi-Strategy
- `BlendXLMStrategy` adapter
- `AMMStrategy` adapter (Stellar DEX LP)
- Strategy selection per stream
- Rebalancing tooling

### Phase 3 — Yield Distribution
- Yield sharing between sender and recipient on cancel
- Insurance fund funded by protocol yield fees
- Governance for strategy whitelisting

---

## 10. Integration Points with Existing Protocol

| Existing component | Change required |
|-------------------|----------------|
| `hourglass-lockup` | None — treasury is opt-in via separate contract call |
| `hourglass-comptroller` | Add `treasury` address + `yield_fee_bps` config |
| SDK (`lockup.ts`) | Add `treasury` param to `create_linear` / `create_tranched` |
| Frontend (`/create`) | Add yield strategy toggle |
| Frontend (`/stream/[id]`) | Add yield accrued display + total withdrawable |
| Indexer | Index `YieldSettled` and `YieldDeposited` events from treasury |
| MongoDB schema | Add `yield_earned`, `strategy` fields to stream doc |

---

## 11. Why Stellar Is Ideal for This

Stellar's DeFi ecosystem provides the building blocks that make a yield treasury practical at low cost:

- **Blend Protocol** — over-collateralized lending market on Soroban; USDC and XLM supply rates are deterministic and auditable
- **Stellar DEX** — native AMM with minimal fees; LP positions are composable
- **Low transaction costs** — yield settlement per stream costs ~0.0001 XLM
- **Soroban composability** — contracts can call contracts synchronously; the treasury can atomically deposit → strategy in a single transaction
- **SEP-41 uniformity** — any token the lockup accepts is also usable in Blend or the AMM, so the treasury doesn't need token-specific adapters beyond the strategy layer

---

*Hourglass Protocol — Apache-2.0 — https://hourglassprotocol.org*
