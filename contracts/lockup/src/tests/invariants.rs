use super::common::setup;
use hourglass_shared::Tranche;
use soroban_sdk::{testutils::Ledger as _, vec};

/// For any time t1 <= t2, streamed_amount(t1) <= streamed_amount(t2).
#[test]
fn streamed_amount_monotonic_linear() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000_000i128,
        &(now + 100),
        &(now + 250),
        &(now + 1_100),
        &50_000i128,
        &50_000i128,
        &true,
        &true,
    );
    let mut prev = 0i128;
    for t in (0..2_500u64).step_by(13) {
        f.env.ledger().set_timestamp(now + t);
        let cur = f.lockup.streamed_amount(&id);
        assert!(cur >= prev, "decrease at t={}", t);
        prev = cur;
    }
}

#[test]
fn streamed_amount_monotonic_tranched() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &vec![
            &f.env,
            Tranche {
                amount: 100,
                ts: now + 100,
            },
            Tranche {
                amount: 200,
                ts: now + 300,
            },
            Tranche {
                amount: 700,
                ts: now + 600,
            },
        ],
        &true,
        &true,
    );
    let mut prev = 0i128;
    for t in (0..1_000u64).step_by(7) {
        f.env.ledger().set_timestamp(now + t);
        let cur = f.lockup.streamed_amount(&id);
        assert!(cur >= prev, "decrease at t={}", t);
        prev = cur;
    }
}

/// deposited == withdrawn + refunded + remaining-in-contract, at all times.
#[test]
fn asset_conservation_after_cancel_and_withdraw() {
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
    f.env.ledger().set_timestamp(now + 700);
    f.lockup.cancel(&id);
    f.lockup.withdraw(&id, &f.recipient, &200_000i128);

    let s = f.lockup.get_stream(&id);
    let in_contract = f.token_client.balance(&f.lockup_addr);
    assert_eq!(s.deposited, s.withdrawn + s.refunded + in_contract);
}
