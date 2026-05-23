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
