# Hourglass — Token Streaming on Stellar / Soroban

**Status**: Draft v1 — design under review
**Author**: brainstorming session, 2026-05-23
**Working directory**: `/Users/midex/Documents/stellar-sablier`
**Product name**: Hourglass (working dir keeps `stellar-sablier`; rename before launch)
**License**: Apache-2.0

---

## 1. Summary

Hourglass is a token-streaming protocol on the Stellar / Soroban smart-contract platform. It is a **clean-room reimplementation** based on the publicly documented semantics of Sablier's Lockup protocol — not a fork. Senders lock SEP-41 tokens into a contract that releases them to a recipient on a vesting schedule (linear or tranched), where each stream is represented by a transferable NFT receipt.

MVP scope is deliberately lean: **Lockup Linear + Lockup Tranched only**. Dynamic streams, Flow (open-ended), Airstreams (Merkle), and the Claimable-Balance hybrid are Phase 1+ work with their own specs.

## 2. Goals

- Provide a production-grade vesting / payroll / grant-disbursement primitive native to Stellar.
- Match the user-facing semantics that Sablier's Lockup Linear and Tranched users already understand: cliff vesting, partial withdrawals, sender-cancel + sender-renounce + NFT transfer of stream ownership.
- Ship a dashboard, create-stream wizard, and stream-detail page polished enough to be the obvious default for Stellar teams looking for vesting tooling.
- Be the first credible Sablier-class streaming protocol on Stellar and earn the category.

## 3. Non-Goals (Phase 0)

- Dynamic streams (segments with exponents) — needs fixed-point `pow()` ; Phase 1.
- Flow (open-ended debt-tracking streams) — Phase 2.
- Airdrops / Merkle factories — Phase 1.
- Claimable-Balance hybrid path for cheap cliffs — Phase 2.
- Recipient-hook callbacks + append-only allowlist — Phase 2.
- Cross-chain / IBC / bridging — out of scope indefinitely.
- A protocol governance token — no token, monetize via fees.

## 4. Users & Use Cases

Primary users in MVP:
- **Foundations & DAOs on Stellar** distributing tokens to investors, advisors, contributors.
- **Stellar-native teams** running internal payroll / grant streams to contributors.
- **Token issuers** doing post-launch vesting for team / partners.

Each use case maps to one stream shape:
- *Investor / team vesting with cliff* → **Linear** with `cliff_ts > start_ts`, optional `unlock_at_start` and `unlock_at_cliff` lump sums.
- *Quarterly milestone disbursement* → **Tranched** with one tranche per milestone date.
- *Smooth payroll* → **Linear** with `cliff_ts == start_ts`, both unlocks zero.

## 5. Architecture

Three logical components; two deployed Soroban contracts.

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ lockup                       │───▶│ comptroller (upgradeable)    │
│   - stream CRUD              │    │   - fee config (USD)         │
│   - NFT receipt (embedded)   │    │   - oracle ref (Reflector)   │
│   - withdraw/cancel/renounce │    │   - admin roles              │
└────────────┬─────────────────┘    └──────────────────────────────┘
             │
             ▼
   ┌──────────────────┐
   │ SEP-41 token     │ (XLM SAC, USDC SAC, any custom SEP-41)
   └──────────────────┘
```

- **`lockup`** (immutable): owns all stream state; mints/burns NFT receipts; pulls/pushes tokens.
- **`comptroller`** (UUPS-style upgradeable via OZ `Upgradeable` mixin): owns fee parameters, fee collector address, and Reflector oracle address. The lockup contract reads fees from the comptroller at each fee-paying op.
- **NFT receipt**: an OpenZeppelin `stellar-tokens` `NonFungibleToken Enumerable` module embedded into `lockup` (not a separate deployed contract). `token_id == stream_id`.

### Why this split

- Stream logic is permissionless and irreversible — must not be upgradeable. Putting it in a non-upgradeable contract is the trust guarantee for users.
- Fees and oracle source evolve (price feed changes, fee tuning, new ops added) — those belong behind a UUPS proxy.
- The NFT receipt and the stream state are inseparable conceptually — embedding the NFT mixin avoids one cross-contract call per op and avoids a custodial NFT contract that could be confused for the source of truth.

## 6. Data Model

All persistent storage in `lockup` is keyed by an enum `DataKey` to avoid collisions, with TTL extension on every mutation.

```rust
#[contracttype]
pub enum DataKey {
    Admin,                          // Instance
    Comptroller,                    // Instance
    NextStreamId,                   // Instance, u32
    Stream(u32),                    // Persistent — one entry per stream
    // NFT module owns its own keyspace via stellar-tokens
}
```

### Stream record (Persistent — one entry per stream)

```rust
#[contracttype]
pub enum StreamShape {
    Linear {
        cliff_ts: u64,              // == start_ts when there is no cliff
        unlock_at_start: i128,      // lump sum released at start_ts
        unlock_at_cliff: i128,      // lump sum released at cliff_ts
    },
    Tranched {
        tranches: Vec<Tranche>,     // ascending by ts; sum == deposited
    },
}

#[contracttype]
pub struct Tranche {
    pub amount: i128,
    pub ts: u64,
}

#[contracttype]
pub struct Stream {
    pub sender: Address,
    pub recipient: Address,         // mirrors NFT owner; updated on transfer
    pub token: Address,             // SEP-41 address
    pub start_ts: u64,
    pub end_ts: u64,
    pub is_cancelable: bool,
    pub is_transferable: bool,
    pub was_canceled: bool,
    pub is_depleted: bool,
    pub deposited: i128,
    pub withdrawn: i128,
    pub refunded: i128,
    pub shape: StreamShape,         // model-specific data lives in the enum
}
```

### Storage rationale

- **Instance** for singletons (admin, comptroller, counter) — pays one rent line for the whole contract.
- **Persistent** for streams — survives archival; auto-restorable on access under Protocol 23+.
- **One record per stream.** Model-specific data (Linear cliff/unlocks, Tranched tranches list) lives inside the `StreamShape` enum so reads always pull the full state in one storage hit. Simpler code, one TTL window to manage per stream, one entry to enumerate. Larger reads for Tranched streams with many tranches are acceptable for MVP; revisit only if profiling shows it.
- **No iteration** anywhere: dashboards enumerate via the indexer, not via storage scans. The contract tracks `next_stream_id` but never lists streams on-chain.

## 7. Streamed-Amount Semantics

The contract exposes a pure `streamed_amount(stream_id, now: u64) -> i128` view.

### Linear

Let `S = start_ts`, `C = cliff_ts`, `E = end_ts`, `D = deposited`, `Us = unlock_at_start`, `Uc = unlock_at_cliff`, `t = now`. Invariants enforced at create: `S ≤ C ≤ E`, `Us + Uc ≤ D`.

```
if t < S:        streamed = 0
elif t < C:      streamed = Us
elif t >= E:     streamed = D
else:            base = D - Us - Uc
                 streamed = Us + Uc + (base * (t - C)) / (E - C)
```

All in `i128`. Division floors. `withdrawable = streamed - withdrawn`, never decreases.

### Tranched

```
streamed = Σ tranche.amount for each tranche where tranche.ts <= now
if streamed > deposited:  (must not happen — create-time check)
    revert
```

### Status (derived)

```
PENDING    when t < S and not was_canceled
STREAMING  when S <= t < E and not was_canceled and not is_depleted
SETTLED    when t >= E or streamed == deposited (whichever first), not canceled, not depleted
CANCELED   when was_canceled
DEPLETED   when is_depleted
```

`CANCELED → DEPLETED` and `SETTLED → DEPLETED` are valid transitions; `DEPLETED` is terminal.

## 8. Lifecycle Operations

All caller-signed authorizations use `Address::require_auth()` or `require_auth_for_args(...)` from soroban-sdk.

### `create_linear`

```rust
fn create_linear(
    env: Env,
    sender: Address,
    recipient: Address,
    token: Address,
    deposit: i128,
    start_ts: u64,
    cliff_ts: u64,
    end_ts: u64,
    unlock_at_start: i128,
    unlock_at_cliff: i128,
    is_cancelable: bool,
    is_transferable: bool,
) -> u32
```

Behavior:
1. `sender.require_auth()`.
2. Validate: `start_ts <= cliff_ts <= end_ts`, `deposit > 0`, `Us + Uc <= deposit`, `token` is a valid contract address.
3. `token::Client::new(&env, &token).transfer(&sender, &env.current_contract_address(), &deposit)`.
4. Allocate `stream_id = next_stream_id; next_stream_id += 1`.
5. Persist `Stream`, `LinearTail` ; extend TTL aggressively (e.g., `end_ts + 30 days` worth of ledgers).
6. Mint NFT (`token_id = stream_id`) to `recipient` via embedded NFT mixin.
7. Emit `("stream","created", stream_id, sender)` topics + `(recipient, token, deposit, Linear)` data.
8. Return `stream_id`.

### `create_tranched`

Same shape but takes `tranches: Vec<Tranche>`. Validates: non-empty, ascending `ts`, `tranches[0].ts >= now`, `Σ amount == deposit`. `start_ts = tranches[0].ts`, `end_ts = tranches[last].ts`.

### `withdraw(stream_id, to, amount)`

1. Read `Stream`.
2. `require_auth` from current NFT owner OR an approved spender (per SEP-41 `approve`-like logic on the NFT module).
3. Compute `withdrawable = streamed(now) - withdrawn`; require `amount <= withdrawable`, `amount > 0`.
4. Charge fee: read `comptroller.fee_for(OpKind::Withdraw)` in XLM stroops; `token::Client` on the XLM SAC transfers fee from caller to comptroller fee collector. (Caller is the one paying; sender-sponsorship is a Phase 1 enhancement.)
5. Transfer `amount` of the stream token from contract to `to`.
6. `stream.withdrawn += amount`; if `stream.withdrawn + stream.refunded == stream.deposited` then `stream.is_depleted = true`.
7. Persist `Stream`; emit `("stream","withdrawn", stream_id, to)` + `(amount, caller)`.

### `withdraw_max(stream_id, to)`

Convenience: `withdraw(stream_id, to, withdrawable)`.

### `cancel(stream_id)`

1. Read `Stream`.
2. `require_auth(sender)`.
3. Require `is_cancelable` and status ∈ {`PENDING`, `STREAMING`}.
4. `s = streamed(now)`; `recipient_balance = s - withdrawn`; `sender_refund = deposited - s`.
5. Transfer `sender_refund` back to sender from contract (skip if 0).
6. `stream.refunded = sender_refund; stream.was_canceled = true`.
7. If `recipient_balance == 0` then `is_depleted = true` (nothing more to withdraw).
8. Persist; emit `("stream","canceled", stream_id)` + `(sender_refund, recipient_balance)`.

(Note: recipient_balance stays in the contract until the recipient calls `withdraw`. We do NOT auto-transfer it — recipient pays the fee on their pull, matching Sablier's UX.)

### `renounce(stream_id)`

1. `require_auth(sender)`.
2. Require status ∈ {`PENDING`, `STREAMING`} and `is_cancelable == true`.
3. Set `is_cancelable = false`. Persist. Emit `("stream","renounced", stream_id)`.

### `transfer(stream_id, new_owner)`

Implemented by the NFT module's `transfer_from` — requires `is_transferable == true` (checked in a hook). Updates `stream.recipient = new_owner` in the same call. Emits NFT `Transfer` event + `("stream","transferred", stream_id, new_owner)` + `(from)`.

### `withdraw_max_and_transfer(stream_id, new_owner)`

Atomic withdraw-max-to-current-owner followed by NFT transfer. Mirrors a useful Sablier convenience for clean ownership handoff.

### `burn(stream_id)`

Anyone may call once `is_depleted == true`. Removes stream tail entries (free up rent) and burns NFT.

## 9. Fee Model

Three surfaces, only the first one is enforced in contract:

1. **Per-withdrawal fee** — flat USD-denominated minimum, paid by caller in XLM at the moment of withdrawal. Stored in `comptroller` as `min_fee_usd_micros: i128` (e.g., `99_000` = $0.099). Conversion to XLM done via Reflector oracle. Bounded staleness check (e.g., reject if oracle update > 1 hour old).

2. **Broker fee at creation** — *Phase 1.* Optional `Broker { address, fee_bps: u32 }` parameter. Skim `fee_bps / 10_000` of deposit to broker at create time. Cap at 10%. Not in MVP to keep create surface small.

3. **Streamed-asset protocol fee** — **0%**, by policy. The protocol never takes a cut of the streamed asset. Matches Sablier's design choice and is a strong marketing point.

The comptroller exposes:
```rust
fn fee_for(env: Env, op: OpKind) -> i128; // returns XLM stroops
fn fee_collector(env: Env) -> Address;
```

## 10. NFT Receipt

Backed by OpenZeppelin `stellar-tokens` `NonFungibleToken Enumerable`. Embedded into `lockup` via the macro mixin pattern.

- `name = "Hourglass Stream"`, `symbol = "STREAM"`.
- `token_id == stream_id` — both `u32`. Matches OZ Stellar Contracts' native NFT ID type, no separate ID space to track. 4.2 billion stream ceiling is effectively unbounded (same practical guarantee Sablier gets from EVM `uint256`).
- Hook on `transfer_from`: reverts if `!is_transferable`; updates `stream.recipient`.
- Metadata URI: returns an `https://hourglass.fi/api/nft/{id}` URI served by a hosted renderer (we operate it). No on-chain SVG generation in MVP — Phase 1.
- Burning permitted only via the contract's `burn(stream_id)` entry, which checks `is_depleted`.

## 11. Events

Stellar limits events to **4 topics**. All events use the pattern `(domain, action, ...)`.

| Topic 1 | Topic 2 | Topic 3 | Topic 4 | Data |
|---|---|---|---|---|
| `"stream"` | `"created"` | `stream_id: u32` | `sender: Address` | `(recipient, token, deposit, model)` |
| `"stream"` | `"withdrawn"` | `stream_id: u32` | `to: Address` | `(amount: i128, caller: Address)` |
| `"stream"` | `"canceled"` | `stream_id: u32` | — | `(sender_refund: i128, recipient_balance: i128)` |
| `"stream"` | `"renounced"` | `stream_id: u32` | — | — |
| `"stream"` | `"transferred"` | `stream_id: u32` | `new_owner: Address` | `(from: Address)` |
| `"stream"` | `"burned"` | `stream_id: u32` | — | — |

Indexer-side: ingest, dedupe by `(ledger, tx_hash, op_index)`, project into `Stream` and `Action` tables.

## 12. Frontend (Phase 0)

**Stack**: Next.js 15 (App Router) + TypeScript + Tailwind v4 + `@stellar/stellar-sdk` + `@creit.tech/stellar-wallets-kit`. React Query for indexer + RPC reads.

**Pages**:

- `/` — landing. Hero, "Create a stream", connect wallet.
- `/dashboard` — connected-only. Two columns: *Streams I sent* / *Streams I received*. Filter by status, asset, counterparty. Aggregate cards: total streamed in / out, pending withdrawable.
- `/stream/[id]` — public. Animated curve (linear or step), real-time withdrawable counter, withdraw button (recipient), cancel/renounce/transfer (sender), full event log, link to Stellar Expert.
- `/create` — wizard. Step 1 asset + amount. Step 2 recipient address. Step 3 schedule (Linear tab: start / cliff / end / unlock-at-start / unlock-at-cliff. Tranched tab: tranche editor.) Step 4 cancelable + transferable toggles, defaults `true / true`. Step 5 review + sign.

**Visual identity**:

- Working motif: hourglass cross-faded with a Stellar nebula. Dark-first.
- Palette: deep navy `#0b1020` background; sand-amber `#f4b860` primary; teal accent `#5bcfd1`; off-white `#e9eef5` for text (never pure white).
- Type: Inter for body, Clash Display for headlines. Revisit at design phase if a stronger paired choice emerges.
- **Distinct from Sablier's orange gradient** to avoid trade-dress confusion.

**Wallet UX**:
- Connect modal via wallets-kit; supports Freighter / Albedo / Lobstr / xBull / WalletConnect / Ledger out of the box.
- Auto fee estimation via `server.prepareTransaction(tx)`.
- Per-op auth tree shown in human-readable form before signing.

## 13. Indexer

**Choice**: Mercury Retroshades as the primary indexer. Mercury's contract-level structured-event emitters compile into the contract behind a Cargo feature `mercury` so we don't pay any binary-size cost on mainnet without it.

**Tables (Postgres-backed inside Mercury)**:

- `streams(stream_id, sender, recipient, token, model, start_ts, end_ts, cliff_ts, deposited, withdrawn, refunded, is_cancelable, is_transferable, was_canceled, is_depleted, created_ledger, created_tx)`
- `actions(id, stream_id, action, ts, amount, actor, tx_hash, ledger, log_index)` — one row per emitted event
- `tranches(stream_id, idx, amount, ts)` — for Tranched streams

**GraphQL** exposed by Mercury, queried from the frontend via React Query. RPC `simulateTransaction` is used only for the live withdrawable counter and for fee preview on signs.

**Fallback indexer**: SubQuery — same schema; defined but not deployed until needed.

## 14. Open Questions & Risks

1. **Sender-sponsored withdrawal fees.** Phase 0 has the caller (recipient) paying the XLM fee. Sponsored-by-sender UX is a Sablier feature we want in Phase 1; it needs a fee escrow accounted per stream.
2. **Reflector oracle freshness.** What's a tolerable staleness window for the USD-to-XLM conversion? Default proposal: 1 hour. If oracle is stale, do we fail-closed (revert) or fail-open (use last known)? Proposal: revert with a clear error so frontends can show a "fee oracle stale" banner.
3. **TTL strategy for long-vest streams.** Linear streams may run 4 years. Persistent storage TTL is finite and pays rent. **Phase 0**: extend TTL on every interaction (create, withdraw, cancel) to push live-until to `max(end_ts + 30 days, current_ledger + max_TTL_window)`. **Phase 1**: add an off-protocol keeper bot that bumps TTL on inactive long streams, funded from the comptroller fee pool. Pre-paid one-time create-time rent is rejected for MVP — too complex to size.
4. **What happens if the SEP-41 token contract is paused / frozen?** Streams continue accruing but withdrawals revert. Document; do not work around.
5. **Fee-on-transfer / rebasing tokens.** Unsupported (matches Sablier). Documented in user-facing docs. The create wizard maintains a small allowlist of known-good SEP-41 tokens (XLM, USDC, EURC, top stable-issued assets) and shows a yellow warning + "I understand the risks" checkbox for any token outside the allowlist.
6. **Multisig sender experience.** Stellar has native multisig (M-of-N on classic accounts) and custom account contracts on Soroban. Most likely senders for vesting are foundations using multisig. Verify the wallets-kit + multisig flow works end-to-end before MVP launch; otherwise consider a deferred-sign / proposal-flow UI.
7. **Mainnet launch dependency on OZ Stellar Contracts**: We're pinning `stellar-tokens = "=0.7.1"`. The library is young. Plan: audit the embedded NFT mixin specifically as part of our audit scope.

## 15. License & IP

- **License**: Apache-2.0 for all code in this repository.
- **Clean-room reimplementation**: This design is derived only from Sablier's *publicly documented* protocol semantics (sablier.com, docs.sablier.com, public blog posts, public audit reports, GitHub READMEs and on-chain interfaces visible from public chain explorers). No Sablier source code is copied or paraphrased line-by-line.
- **Trademark**: "Sablier" is not used in user-facing branding. Project name = Hourglass.
- **Attribution**: Where the design intentionally mirrors a Sablier concept (e.g., status taxonomy, cancel semantics), this document cites Sablier docs as the source of the public specification, in keeping with standard practice for category clones (e.g., Soroswap → Uniswap).

## 16. Repository Structure

```
stellar-sablier/                           # working dir; rename to hourglass before launch
├── README.md
├── LICENSE                                # Apache-2.0
├── Cargo.toml                             # Rust workspace root
├── contracts/
│   ├── lockup/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                     # contract entry + storage
│   │       ├── linear.rs                  # streamed_amount + create_linear
│   │       ├── tranched.rs                # streamed_amount + create_tranched
│   │       ├── lifecycle.rs               # withdraw/cancel/renounce/transfer/burn
│   │       ├── nft.rs                     # OZ mixin glue
│   │       └── events.rs
│   ├── comptroller/
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── oracle.rs                  # Reflector adapter
│   │       └── upgrade.rs
│   └── shared/
│       ├── Cargo.toml
│       └── src/
│           ├── errors.rs                  # contracterror enums
│           ├── types.rs                   # Stream/Tranche/etc shared
│           └── math.rs                    # i128 helpers (no pow yet)
├── frontend/                              # Next.js 15 app
│   ├── app/
│   ├── components/
│   └── lib/                               # SDK glue, wallet kit setup
├── indexer/
│   ├── Cargo.toml                         # Mercury Retroshades crate
│   └── src/
├── sdk/
│   ├── package.json                       # TS package: 'hourglass'
│   └── src/                               # generated bindings + helpers
├── docs/                                  # user-facing docs site (later)
└── docs/superpowers/specs/                # design specs (this file)
```

## 17. Build / Test / Deploy

- **Build**: `stellar contract build` per contract.
- **Test**:
  - Unit + integration in Rust using `soroban_sdk::Env`. `mock_all_auths` for happy paths, explicit `set_auths` for negative tests.
  - Fuzz `streamed_amount` invariants: monotonic non-decreasing in `now`, `streamed(end_ts) == deposited`, no overflow.
  - Property tests: invariant `deposited == withdrawn + refunded + remaining_in_contract` for any sequence of ops.
- **Deploy**:
  - Testnet → smoke suite → mainnet.
  - Contracts deployed deterministically; addresses pinned in `sdk/`.
  - Comptroller deployed before lockup; lockup's constructor takes `comptroller` address.

## 18. Phases (lookahead)

- **Phase 0 — MVP** (this spec): Linear + Tranched, NFT receipt, dashboard, withdraw / cancel / renounce / transfer / burn, Reflector fee oracle, Mercury indexer, testnet then mainnet.
- **Phase 1**: Dynamic streams (requires fixed-point `pow` library — adapt PRBMath-style SD59x18 to `i128`); Airstreams via Merkle factory (MerkleInstant + MerkleLL); sender-sponsored fees; broker fee at creation; on-chain NFT SVG renderer.
- **Phase 2**: Flow (open-ended streams); Claimable-Balance hybrid for ultra-cheap fixed-date unlocks; recipient-hook callbacks + append-only allowlist; CSV bulk import.
- **Phase 3**: Snapshot / governance integrations; price-gated streams; vault adapters (yield while vesting).

Each later phase gets its own design spec and plan when started.

## 19. References

- Sablier protocol docs: https://docs.sablier.com/
- Sablier monorepo (public source for spec-level understanding only): https://github.com/sablier-labs/evm-monorepo
- Sablier audits: https://github.com/sablier-labs/audits
- Stellar Soroban docs: https://developers.stellar.org/docs/build/smart-contracts
- soroban-sdk: https://github.com/stellar/rs-soroban-sdk
- OpenZeppelin Stellar Contracts: https://github.com/OpenZeppelin/stellar-contracts (docs: https://docs.openzeppelin.com/stellar-contracts)
- SEP-41 token interface: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md
- Reflector oracle: https://reflector.network/
- Mercury Retroshades: https://docs.mercurydata.app/retroshades/introduction-to-retroshades
- `@creit.tech/stellar-wallets-kit`: https://stellarwalletskit.dev/
