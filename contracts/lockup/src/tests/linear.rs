use super::common::setup;
use hourglass_shared::StreamShape;

#[test]
fn create_linear_pulls_tokens_and_persists() {
    let f = setup();
    let now = f.env.ledger().timestamp();

    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 200),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );

    assert_eq!(id, 1);
    assert_eq!(f.token_client.balance(&f.sender), 1_000_000_000_000i128 - 1_000_000);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 1_000_000);

    let s = f.lockup.get_stream(&id);
    assert_eq!(s.sender, f.sender);
    assert_eq!(s.recipient, f.recipient);
    assert_eq!(s.deposited, 1_000_000);
    assert_eq!(s.withdrawn, 0);
    assert!(matches!(s.shape, StreamShape::Linear(_)));
}

#[test]
#[should_panic]
fn create_linear_rejects_zero_deposit() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &0i128,
        &(now + 100),
        &(now + 200),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn create_linear_rejects_cliff_after_end() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 2_000),
        &(now + 1_000),
        &0i128,
        &0i128,
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn create_linear_rejects_start_in_past() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now - 1),
        &now,
        &(now + 1_000),
        &0i128,
        &0i128,
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn create_linear_rejects_unlocks_exceeding_deposit() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &(now + 100),
        &(now + 200),
        &(now + 1_100),
        &600i128,
        &500i128,
        &true,
        &true,
    );
}
