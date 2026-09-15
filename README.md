# Hourglass

Token streaming on Stellar / Soroban. Clean-room reimplementation inspired by Sablier's publicly documented Lockup protocol. Apache-2.0.

## What it does

Lock SEP-41 tokens into a vesting schedule (linear with cliff, stepped tranches, or recurring periodic equal unlocks — created singly or in an atomic batch), represented as a transferable NFT receipt. Senders can cancel mid-stream (until renounced); recipients can withdraw the accrued portion any time.

## Status

Lockup **v0.2.1** on testnet — Linear, Tranched and **Recurring** streams, atomic **batch creation**, NFT receipts. Frontend + Mongo indexer deployed; batch/recurring create UI, search/filtering and treasury prep are the next phase-2 sub-projects (see `docs/superpowers/specs/2026-09-10-batch-recurring-streams-design.md`).

- `cargo test` — all workspace tests pass in-process (no network); 111 tests (comptroller 11, lockup 60, shared 40).
- Wasm builds clean (`scripts/build.sh`): comptroller ~11 KB, lockup ~97 KB optimized.
- Testnet: contract ids in `deployments/testnet.json`; `scripts/smoke-testnet.sh` exercises linear, recurring and batch creation end-to-end.

See `docs/superpowers/specs/2026-05-23-hourglass-design.md` for the design and `docs/superpowers/plans/2026-05-23-hourglass-contracts-mvp.md` for the implementation plan.

## Project layout

| Path | Purpose |
|---|---|
| `contracts/shared` | Types, errors, streaming math (pure Rust `rlib`). |
| `contracts/comptroller` | Upgradeable admin + USD-denominated fee oracle adapter. |
| `contracts/lockup` | Immutable stream storage + lifecycle + embedded NFT receipt. |
| `scripts/` | Build (`build.sh`); deploy/smoke land in a follow-up. |
| `dist/` | Output of `build.sh` — release + optimized wasm. |
| `docs/superpowers/specs/` | Design specs. |
| `docs/superpowers/plans/` | Implementation plans. |

## Toolchain

- Rust stable (set by `rust-toolchain.toml`; needs >= 1.91 for `soroban-sdk` 25.3).
- `wasm32v1-none` target (auto-installed via `rust-toolchain.toml`).
- `stellar-cli` 25.2+ (`cargo install --locked stellar-cli` — pick 25.2.0 if your rustc is < 1.92, else 26.0.0).

## Quickstart

### Run the test suite (in-process, no network)

```bash
cargo test
```

All contract tests run against `soroban_sdk::Env` — no docker, no network.

### Build release wasm

```bash
./scripts/build.sh
```

Produces `dist/{comptroller,lockup}.wasm` + `*.optimized.wasm`. `stellar contract optimize` runs at the end.

## License

Apache-2.0. See `LICENSE`.
