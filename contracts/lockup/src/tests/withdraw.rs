use super::common::setup;
use soroban_sdk::testutils::Ledger as _;

#[test]
fn withdraw_max_settles_after_end() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );

    f.env.ledger().set_timestamp(now + 2_000);
    f.lockup.withdraw_max(&id, &f.recipient);

    assert_eq!(f.token_client.balance(&f.recipient), 1_000_000);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 1_000_000);
    assert!(s.is_depleted);
}

#[test]
fn withdraw_partial_streams() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 100),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    f.env.ledger().set_timestamp(now + 600); // half of [100, 1100]
    let half = f.lockup.withdrawable_amount(&id);
    assert!(half > 400_000 && half < 600_000);
    f.lockup.withdraw(&id, &f.recipient, &half);
    assert_eq!(f.lockup.get_stream(&id).withdrawn, half);
}

#[test]
#[should_panic]
fn withdraw_zero_rejected() {
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
    f.lockup.withdraw(&id, &f.recipient, &0i128);
}

#[test]
#[should_panic]
fn withdraw_more_than_withdrawable_rejected() {
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
    f.env.ledger().set_timestamp(now + 200);
    f.lockup.withdraw(&id, &f.recipient, &999_999_999i128);
}
