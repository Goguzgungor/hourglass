//! Compile-time-generated typed client for the deployed Comptroller contract.
//! Reads the pre-built comptroller wasm. The wasm must be built BEFORE this
//! crate is compiled — `scripts/build.sh` enforces the order, and any local
//! `cargo build` / `cargo test` run requires the wasm to be present.

soroban_sdk::contractimport!(
    file = "../../target/wasm32v1-none/release/hourglass_comptroller.wasm"
);
