#![no_std]

use hourglass_shared::Error;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Env, Symbol,
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

mod tests;
