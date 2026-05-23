#![cfg(test)]

use crate::*;
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env};

/// Empty stub used so the oracle address in tests is a real registered
/// contract — required by `env.as_contract(...)` in the mock oracle helpers.
#[contract]
pub struct OracleStub;

#[contractimpl]
impl OracleStub {}

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let oracle = env.register(OracleStub, ());
    let id = env.register(
        Comptroller,
        (admin.clone(), fee_collector.clone(), oracle.clone(), 3_600u32),
    );
    (env, id, admin, fee_collector, oracle)
}

#[test]
fn constructor_sets_addresses() {
    let (env, id, admin, fee_collector, _oracle) = setup();
    let client = ComptrollerClient::new(&env, &id);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.fee_collector(), fee_collector);
}

#[test]
fn set_admin_requires_admin_auth() {
    let (env, id, _admin, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    let new_admin = Address::generate(&env);

    env.mock_all_auths();
    client.set_admin(&new_admin);
    assert_eq!(client.admin(), new_admin);
}

#[test]
#[should_panic(expected = "auth")]
fn set_admin_without_auth_fails() {
    let (env, id, _admin, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    let new_admin = Address::generate(&env);

    // No mock_all_auths -> require_auth panics.
    client.set_admin(&new_admin);
}

use hourglass_shared::OpKind;

#[test]
fn fee_defaults_to_zero() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    assert_eq!(client.get_fee_usd_micros(&OpKind::Withdraw), 0);
}

#[test]
fn admin_can_set_fee() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    env.mock_all_auths();
    client.set_fee_usd_micros(&OpKind::Withdraw, &99_000);
    assert_eq!(client.get_fee_usd_micros(&OpKind::Withdraw), 99_000);
}

#[test]
#[should_panic]
fn non_admin_cannot_set_fee() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    client.set_fee_usd_micros(&OpKind::Withdraw, &99_000);
}

#[test]
#[should_panic]
fn negative_fee_rejected() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    env.mock_all_auths();
    client.set_fee_usd_micros(&OpKind::Withdraw, &-1);
}

use crate::oracle::mock as oracle_mock;
use soroban_sdk::testutils::Ledger as _;

#[test]
fn fee_for_zero_when_unset() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    assert_eq!(client.fee_for(&OpKind::Withdraw), 0);
}

#[test]
fn fee_for_uses_oracle() {
    let (env, id, _a, _fc, oracle) = setup();
    let client = ComptrollerClient::new(&env, &id);
    env.mock_all_auths();
    client.set_fee_usd_micros(&OpKind::Withdraw, &99_000); // $0.099

    // Pretend XLM = $0.10  ->  10 XLM per USD  ->  price_x14 = 10 * 1e14 = 1e15
    env.ledger().set_timestamp(1_000_000);
    oracle_mock::set(&env, &oracle, 1_000_000_000_000_000i128, 999_999);

    // expected = 99_000 * 1e15 / 1e13 = 99_000 * 100 = 9_900_000 stroops = 0.99 XLM
    assert_eq!(client.fee_for(&OpKind::Withdraw), 9_900_000);
}

#[test]
#[should_panic]
fn fee_for_panics_when_oracle_stale() {
    let (env, id, _a, _fc, oracle) = setup();
    let client = ComptrollerClient::new(&env, &id);
    env.mock_all_auths();
    client.set_fee_usd_micros(&OpKind::Withdraw, &99_000);

    env.ledger().set_timestamp(1_000_000);
    oracle_mock::set(&env, &oracle, 1_000_000_000_000_000i128, 100); // very stale
    client.fee_for(&OpKind::Withdraw);
}

use soroban_sdk::BytesN;

#[test]
#[should_panic]
fn upgrade_requires_admin() {
    let (env, id, _a, _fc, _o) = setup();
    let client = ComptrollerClient::new(&env, &id);
    let zero_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
    client.upgrade(&zero_hash);
}
