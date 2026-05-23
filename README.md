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
