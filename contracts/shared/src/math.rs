use crate::errors::Error;

/// Checked i128 addition; returns Error::Overflow on overflow.
pub fn add(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_add(b).ok_or(Error::Overflow)
}

/// Checked i128 subtraction; returns Error::Overflow on overflow.
pub fn sub(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_sub(b).ok_or(Error::Overflow)
}

/// Checked i128 multiplication; returns Error::Overflow on overflow.
pub fn mul(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_mul(b).ok_or(Error::Overflow)
}

/// Checked i128 division; returns Error::Overflow on overflow (incl. divide by zero).
pub fn div(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_div(b).ok_or(Error::Overflow)
}

/// `(a * b) / c` with intermediate overflow protection. Floors.
/// Used for linear interpolation: `base * (now - cliff) / (end - cliff)`.
pub fn mul_div(a: i128, b: i128, c: i128) -> Result<i128, Error> {
    let prod = mul(a, b)?;
    div(prod, c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_ok() {
        assert_eq!(add(1, 2).unwrap(), 3);
    }

    #[test]
    fn add_overflow() {
        assert!(matches!(add(i128::MAX, 1), Err(Error::Overflow)));
    }

    #[test]
    fn sub_ok() {
        assert_eq!(sub(10, 4).unwrap(), 6);
    }

    #[test]
    fn sub_overflow() {
        assert!(matches!(sub(i128::MIN, 1), Err(Error::Overflow)));
    }

    #[test]
    fn mul_ok() {
        assert_eq!(mul(7, 6).unwrap(), 42);
    }

    #[test]
    fn mul_overflow() {
        assert!(matches!(mul(i128::MAX, 2), Err(Error::Overflow)));
    }

    #[test]
    fn div_by_zero() {
        assert!(matches!(div(10, 0), Err(Error::Overflow)));
    }

    #[test]
    fn mul_div_floors() {
        // 7 * 3 / 2 = 21 / 2 = 10 (floors).
        assert_eq!(mul_div(7, 3, 2).unwrap(), 10);
    }

    #[test]
    fn mul_div_handles_large() {
        // Multiplies first; (1e30 * 1e18) overflows i128 even before the divide.
        assert!(matches!(
            mul_div(10i128.pow(30), 10i128.pow(18), 10i128.pow(18)),
            Err(Error::Overflow)
        ));
    }
}

use crate::types::Stream;

/// Compute the cumulative streamed amount of a Linear stream at time `now`.
///
/// Semantics (matches spec section 7):
///   - before start_ts          → 0
///   - in [start_ts, cliff_ts)  → unlock_at_start
///   - at  [cliff_ts, end_ts)   → unlock_at_start + unlock_at_cliff + linear_interpolation(remaining)
///   - at or after end_ts       → deposited
pub fn streamed_amount_linear(
    deposited: i128,
    start_ts: u64,
    cliff_ts: u64,
    end_ts: u64,
    unlock_at_start: i128,
    unlock_at_cliff: i128,
    now: u64,
) -> Result<i128, Error> {
    if now < start_ts {
        return Ok(0);
    }
    if now < cliff_ts {
        return Ok(unlock_at_start);
    }
    if now >= end_ts {
        return Ok(deposited);
    }
    let base = sub(sub(deposited, unlock_at_start)?, unlock_at_cliff)?;
    let elapsed = (now - cliff_ts) as i128;
    let span = (end_ts - cliff_ts) as i128;
    let portion = mul_div(base, elapsed, span)?;
    add(add(unlock_at_start, unlock_at_cliff)?, portion)
}

#[cfg(test)]
mod linear_tests {
    use super::*;

    const D: i128 = 1_000_000;
    const S: u64 = 1_000;
    const C: u64 = 2_000;
    const E: u64 = 4_000;

    #[test]
    fn zero_before_start() {
        assert_eq!(streamed_amount_linear(D, S, C, E, 0, 0, 500).unwrap(), 0);
    }

    #[test]
    fn unlock_at_start_only_before_cliff() {
        assert_eq!(streamed_amount_linear(D, S, C, E, 100_000, 0, 1_500).unwrap(), 100_000);
    }

    #[test]
    fn cliff_lump_applies_at_cliff() {
        // 100k at start + 50k at cliff; at exactly cliff_ts, base = 850k, elapsed = 0
        assert_eq!(streamed_amount_linear(D, S, C, E, 100_000, 50_000, 2_000).unwrap(), 150_000);
    }

    #[test]
    fn linear_interpolation_midway() {
        // halfway between cliff (2000) and end (4000) → 3000.
        // base = 1M; elapsed=1000, span=2000 → 500k; total = 500k.
        assert_eq!(streamed_amount_linear(D, S, C, E, 0, 0, 3_000).unwrap(), 500_000);
    }

    #[test]
    fn full_at_end_ts() {
        assert_eq!(streamed_amount_linear(D, S, C, E, 0, 0, 4_000).unwrap(), D);
    }

    #[test]
    fn full_after_end_ts() {
        assert_eq!(streamed_amount_linear(D, S, C, E, 100_000, 50_000, 99_999).unwrap(), D);
    }

    #[test]
    fn no_cliff_equals_no_cliff_lump() {
        // cliff_ts == start_ts means we go straight to linear interpolation after start.
        // At t=2000 (halfway between 1000 and 3000), base=1M, elapsed=1000, span=2000 → 500k.
        assert_eq!(streamed_amount_linear(D, S, S, 3_000, 0, 0, 2_000).unwrap(), 500_000);
    }

    #[test]
    fn monotonic_non_decreasing() {
        let mut prev = 0i128;
        for t in (0..5_000u64).step_by(37) {
            let cur = streamed_amount_linear(D, S, C, E, 10_000, 20_000, t).unwrap();
            assert!(cur >= prev, "decreased at t={}: prev={}, cur={}", t, prev, cur);
            prev = cur;
        }
    }
}

use crate::types::Tranche;
use soroban_sdk::Vec as SorobanVec;

/// Cumulative streamed amount for a Tranched stream: sum of all tranche amounts
/// whose timestamp has passed (ts <= now).
///
/// Caller must ensure tranches are sorted ascending by ts (enforced at create).
pub fn streamed_amount_tranched(
    tranches: &SorobanVec<Tranche>,
    now: u64,
) -> Result<i128, Error> {
    let mut acc: i128 = 0;
    for t in tranches.iter() {
        if t.ts > now {
            break;
        }
        acc = add(acc, t.amount)?;
    }
    Ok(acc)
}

#[cfg(test)]
mod tranched_tests {
    use super::*;
    use soroban_sdk::Env;

    fn tranches(env: &Env, items: &[(i128, u64)]) -> SorobanVec<Tranche> {
        let mut v = SorobanVec::new(env);
        for (amount, ts) in items {
            v.push_back(Tranche { amount: *amount, ts: *ts });
        }
        v
    }

    #[test]
    fn zero_before_first_tranche() {
        let env = Env::default();
        let t = tranches(&env, &[(100, 1_000), (200, 2_000)]);
        assert_eq!(streamed_amount_tranched(&t, 500).unwrap(), 0);
    }

    #[test]
    fn first_tranche_at_its_ts() {
        let env = Env::default();
        let t = tranches(&env, &[(100, 1_000), (200, 2_000)]);
        assert_eq!(streamed_amount_tranched(&t, 1_000).unwrap(), 100);
    }

    #[test]
    fn accumulates_through_tranches() {
        let env = Env::default();
        let t = tranches(&env, &[(100, 1_000), (200, 2_000), (300, 3_000)]);
        assert_eq!(streamed_amount_tranched(&t, 2_500).unwrap(), 300);
    }

    #[test]
    fn full_after_last_tranche() {
        let env = Env::default();
        let t = tranches(&env, &[(100, 1_000), (200, 2_000), (300, 3_000)]);
        assert_eq!(streamed_amount_tranched(&t, 99_999).unwrap(), 600);
    }

    #[test]
    fn empty_returns_zero() {
        let env = Env::default();
        let t = tranches(&env, &[]);
        assert_eq!(streamed_amount_tranched(&t, 99_999).unwrap(), 0);
    }
}
