use hourglass_shared::Error;
use soroban_sdk::{contracttype, Address, Env};

/// Price snapshot returned by the oracle adapter.
/// `price_x14` is XLM-per-USD scaled by 1e14 (matches Reflector's published scale).
/// `ts_secs` is the unix-seconds timestamp of the snapshot.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceSnapshot {
    pub price_x14: i128,
    pub ts_secs: u64,
}

pub trait PriceOracle {
    fn last_xlm_per_usd(env: &Env, oracle_addr: &Address) -> Result<PriceSnapshot, Error>;
}

/// Mock oracle used in tests. Returns a value written to the oracle contract's
/// instance storage via the `set()` helper.
#[cfg(any(test, feature = "test-utils"))]
pub mod mock {
    use super::*;
    use soroban_sdk::contracttype;

    #[contracttype]
    pub enum MockKey {
        Price,
        Ts,
    }

    pub fn set(env: &Env, contract: &Address, price_x14: i128, ts_secs: u64) {
        env.as_contract(contract, || {
            env.storage().instance().set(&MockKey::Price, &price_x14);
            env.storage().instance().set(&MockKey::Ts, &ts_secs);
        });
    }

    pub struct MockOracle;

    impl PriceOracle for MockOracle {
        fn last_xlm_per_usd(env: &Env, oracle_addr: &Address) -> Result<PriceSnapshot, Error> {
            let (price_x14, ts_secs) = env.as_contract(oracle_addr, || {
                let price: i128 = env.storage().instance().get(&MockKey::Price).unwrap_or(0);
                let ts: u64 = env.storage().instance().get(&MockKey::Ts).unwrap_or(0);
                (price, ts)
            });
            if price_x14 <= 0 {
                return Err(Error::InvalidOraclePrice);
            }
            Ok(PriceSnapshot { price_x14, ts_secs })
        }
    }
}

/// Live Reflector adapter. Phase-1 work — gated behind the `reflector` feature
/// and a no-op stub for Phase 0. When the feature is enabled but the wiring
/// isn't done, returns Error::OracleStale so a mis-configured deploy fails loudly.
#[cfg(feature = "reflector")]
pub mod reflector {
    use super::*;

    pub struct ReflectorOracle;

    impl PriceOracle for ReflectorOracle {
        fn last_xlm_per_usd(_env: &Env, _oracle_addr: &Address) -> Result<PriceSnapshot, Error> {
            Err(Error::OracleStale)
        }
    }
}
