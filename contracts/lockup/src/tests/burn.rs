use super::common::setup;
use soroban_sdk::testutils::Ledger as _;

#[test]
fn burn_after_full_withdraw() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    f.env.ledger().set_timestamp(now + 100_000);
    f.lockup.withdraw_max(&id, &f.recipient);
    f.lockup.burn(&id);
    // Stream record is gone (verified by the next test).
}

#[test]
#[should_panic]
fn get_after_burn_fails() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    f.env.ledger().set_timestamp(now + 100_000);
    f.lockup.withdraw_max(&id, &f.recipient);
    f.lockup.burn(&id);
    f.lockup.get_stream(&id);
}

#[test]
#[should_panic]
fn burn_before_depleted_rejected() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    f.env.ledger().set_timestamp(now + 500);
    f.lockup.burn(&id);
}

#[test]
#[should_panic]
fn owner_of_after_burn_panics() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    f.env.ledger().set_timestamp(now + 100_000);
    f.lockup.withdraw_max(&id, &f.recipient);
    f.lockup.burn(&id);
    // owner_of should now panic since the token is burned.
    f.lockup.owner_of(&id);
}
