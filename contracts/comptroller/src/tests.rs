#![cfg(test)]

use crate::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let oracle = Address::generate(&env);
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
