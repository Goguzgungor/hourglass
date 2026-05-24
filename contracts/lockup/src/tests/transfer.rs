use super::common::setup;
use soroban_sdk::{testutils::Address as _, Address};

#[test]
fn nft_transfer_updates_recipient_on_stream() {
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

    let new_owner = Address::generate(&f.env);
    // OZ NonFungibleToken trait exposes transfer(from, to, token_id).
    f.lockup.transfer(&f.recipient, &new_owner, &id);

    let s = f.lockup.get_stream(&id);
    assert_eq!(s.recipient, new_owner);
}

#[test]
#[should_panic]
fn nft_transfer_rejected_when_not_transferable() {
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
        &false, // not transferable
    );
    let new_owner = Address::generate(&f.env);
    f.lockup.transfer(&f.recipient, &new_owner, &id);
}

use soroban_sdk::testutils::Ledger as _;

#[test]
fn withdraw_max_and_transfer_atomic() {
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

    f.env.ledger().set_timestamp(now + 600);
    let new_owner = Address::generate(&f.env);
    let bal_before = f.token_client.balance(&f.recipient);
    f.lockup.withdraw_max_and_transfer(&id, &new_owner);

    let bal_after = f.token_client.balance(&f.recipient);
    assert!(
        bal_after > bal_before,
        "recipient should have received the streamed portion"
    );
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.recipient, new_owner);
}
