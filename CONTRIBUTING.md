# Contributing to Hourglass

## Toolchain

- Rust stable (set by `rust-toolchain.toml`).
- `stellar-cli` 25.2+ (`cargo install --locked stellar-cli` — pick `--version 25.2.0` if your rustc is older than 1.92).
- Node 20+ (for the future SDK package).

## Workflow

1. Pick or open an issue.
2. Branch from `main`: `git checkout -b feat/<short-name>`.
3. TDD: write the test first; watch it fail; implement; watch it pass; commit.
4. Run the full suite locally: `cargo test`.
5. Open a PR. Keep PRs small and reviewable.

## Commit messages

Conventional Commits:

- `feat(scope): …` — user-visible behavior.
- `fix(scope): …` — bug fix.
- `test(scope): …` — tests only.
- `docs(scope): …` — docs only.
- `chore(scope): …` — tooling, deps.
- `build(...): ...` — build pipeline.

Scopes match crate names: `shared`, `lockup`, `comptroller`, plus `build`, `deploy`, `test`.

## Build order matters

`hourglass-lockup` uses `soroban_sdk::contractimport!` to read `hourglass-comptroller`'s wasm at compile time. Comptroller wasm must be built first. `scripts/build.sh` enforces this. If you run cargo build directly, run `cargo build -p hourglass-comptroller --target wasm32v1-none --release` before any lockup build/test.

## Code style

- `cargo fmt` and `cargo clippy --workspace -- -D warnings` are CI-enforced.
- Prefer `unwrap_or_else(|| panic_with_error!(env, Error::Foo))` over silent `unwrap()`.
- Every error path returns a defined `Error` variant from `hourglass-shared`.

## Testing

- Default: `soroban_sdk::Env` in-process tests via `cargo test`. No network needed.
- Local end-to-end (optional, future): local Stellar quickstart docker.
- Public testnet: don't deploy from local — that's a release-cut activity.
