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
        env.storage()
            .instance()
            .set(&DataKey::FeeCollector, &fee_collector);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&DataKey::OracleMaxStaleness, &max_staleness_secs);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn fee_collector(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .unwrap()
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
        env.events().publish(
            (symbol_short!("admin"), symbol_short!("changed")),
            new_admin,
        );
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
        env.events()
            .publish((Symbol::new(&env, "fee_set"), op_index(&op)), micros);
    }

    pub fn get_fee_usd_micros(env: Env, op: hourglass_shared::OpKind) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::FeeUsdMicros(op_index(&op)))
            .unwrap_or(0)
    }
}

#[cfg(test)]
use crate::oracle::mock::MockOracle;
use crate::oracle::{PriceOracle, PriceSnapshot};

#[contractimpl]
impl Comptroller {
    /// Returns the XLM-stroops a caller must pay to perform `op`, given the
    /// current oracle quote. Reverts if oracle is stale or invalid.
    pub fn fee_for(env: Env, op: hourglass_shared::OpKind) -> i128 {
        let micros: i128 = Self::get_fee_usd_micros(env.clone(), op);
        if micros == 0 {
            return 0;
        }
        let oracle_addr: Address = env.storage().instance().get(&DataKey::Oracle).unwrap();
        let max_stale: u32 = env
            .storage()
            .instance()
            .get(&DataKey::OracleMaxStaleness)
            .unwrap();

        // PHASE 0: tests use the mock oracle; non-test default builds fail loudly
        // (no real oracle wired in Phase 0). Phase 1 swaps this dispatch for the
        // feature-gated Reflector adapter selection.
        #[cfg(test)]
        let snap: PriceSnapshot = MockOracle::last_xlm_per_usd(&env, &oracle_addr).unwrap();
        #[cfg(not(test))]
        let snap: PriceSnapshot = {
            #[cfg(feature = "reflector")]
            {
                crate::oracle::reflector::ReflectorOracle::last_xlm_per_usd(&env, &oracle_addr)
                    .unwrap()
            }
            #[cfg(not(feature = "reflector"))]
            {
                panic_with_error!(&env, Error::OracleStale)
            }
        };

        let now = env.ledger().timestamp();
        if now.saturating_sub(snap.ts_secs) > max_stale as u64 {
            panic_with_error!(&env, Error::OracleStale);
        }
        // micros is i128 USD * 1e6
        // snap.price_x14 is i128 XLM * 1e14 per USD
        // 1 XLM = 10_000_000 stroops
        // stroops = micros * price_x14 * 10_000_000 / (1e6 * 1e14)
        //        = micros * price_x14 / 1e13
        let num = micros.checked_mul(snap.price_x14).unwrap_or(i128::MAX);
        num / 10_000_000_000_000i128
    }
}

use soroban_sdk::BytesN;

#[contractimpl]
impl Comptroller {
    /// Upgrade the running wasm. Admin-gated.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        require_admin(&env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

mod tests;
