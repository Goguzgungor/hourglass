use super::common::setup;
use soroban_sdk::testutils::Ledger as _;

#[test]
fn cancel_midstream_refunds_sender_and_locks_recipient_share() {
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

    // 60% through (now+700: 600 / 1000 elapsed)
    f.env.ledger().set_timestamp(now + 700);
    let sender_bal_before = f.token_client.balance(&f.sender);
    f.lockup.cancel(&id);

    let s = f.lockup.get_stream(&id);
    assert!(s.was_canceled);
    assert_eq!(s.refunded, 400_000);
    assert_eq!(f.token_client.balance(&f.sender), sender_bal_before + 400_000);
    // Recipient's 600k still sits in the lockup until they withdraw.
    assert_eq!(f.token_client.balance(&f.lockup_addr), 600_000);

    // Recipient can still withdraw their accrued share.
    f.lockup.withdraw(&id, &f.recipient, &600_000i128);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 600_000);
    assert!(s.is_depleted);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
}

#[test]
#[should_panic]
fn cancel_after_settled_fails() {
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
    f.lockup.cancel(&id);
}

#[test]
fn cancel_at_start_full_refund() {
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
    let bal_before = f.token_client.balance(&f.sender);
    f.lockup.cancel(&id);
    assert_eq!(f.token_client.balance(&f.sender), bal_before + 1_000);
    let s = f.lockup.get_stream(&id);
    assert!(s.is_depleted); // nothing streamed, nothing to withdraw
}
