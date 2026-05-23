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
