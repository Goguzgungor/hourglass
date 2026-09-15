use super::common::setup;
use hourglass_shared::{CreateRow, CreateSpec, LinearParams, RecurringParams, Tranche};
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

#[test]
fn streamed_amount_monotonic_recurring() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = f.lockup.create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &1_000i128,
        &100u64,
        &12u32,
        &(now + 100),
        &true,
        &true,
    );
    let mut prev = 0i128;
    for t in (0..2_500u64).step_by(7) {
        f.env.ledger().set_timestamp(now + t);
        let cur = f.lockup.streamed_amount(&id);
        assert!(cur >= prev, "decrease at t={}", t);
        prev = cur;
    }
    assert_eq!(prev, 12_000);
}

/// Σ deposited == Σ withdrawn + Σ refunded + contract balance across a batch,
/// after a cancel on one stream and a withdraw on another.
#[test]
fn asset_conservation_across_batch() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let rows = vec![
        &f.env,
        CreateRow {
            recipient: f.recipient.clone(),
            spec: CreateSpec::Linear(LinearParams {
                deposited: 1_000_000,
                start_ts: now + 100,
                cliff_ts: now + 100,
                end_ts: now + 1_100,
                unlock_at_start: 0,
                unlock_at_cliff: 0,
            }),
            is_cancelable: true,
            is_transferable: true,
        },
        CreateRow {
            recipient: f.recipient.clone(),
            spec: CreateSpec::Recurring(RecurringParams {
                amount_per_period: 1_000,
                period_secs: 100,
                count: 12,
                first_ts: now + 100,
            }),
            is_cancelable: true,
            is_transferable: true,
        },
    ];
    let ids = f.lockup.create_batch(&f.sender, &f.token, &rows);

    f.env.ledger().set_timestamp(now + 700);
    f.lockup.cancel(&ids.get(0).unwrap());
    f.lockup.withdraw_max(&ids.get(1).unwrap(), &f.recipient);

    let mut deposited = 0i128;
    let mut withdrawn = 0i128;
    let mut refunded = 0i128;
    for id in ids.iter() {
        let s = f.lockup.get_stream(&id);
        deposited += s.deposited;
        withdrawn += s.withdrawn;
        refunded += s.refunded;
    }
    let in_contract = f.token_client.balance(&f.lockup_addr);
    // Guard against a vacuous pass: both lifecycle calls must have moved funds.
    assert!(withdrawn > 0, "withdraw_max moved nothing");
    assert!(refunded > 0, "cancel refunded nothing");
    assert_eq!(deposited, withdrawn + refunded + in_contract);
}

/// After `cancel`, the recipient's withdrawable amount must never exceed
/// `deposited - refunded - withdrawn`, no matter how much time passes: the
/// refund already left the contract, and any excess would be paid out of
/// other streams' pooled balance.
#[test]
fn withdrawable_after_cancel_is_capped_at_deposited_minus_refunded() {
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

    // Cancel at 60%: 600k vested, 400k refunded to the sender.
    f.env.ledger().set_timestamp(now + 700);
    f.lockup.cancel(&id);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.refunded, 400_000);

    // Long after the schedule would have ended, the recipient still only has
    // the 600k that stayed in the contract.
    f.env.ledger().set_timestamp(now + 100_000);
    assert_eq!(f.lockup.withdrawable_amount(&id), 600_000);

    f.lockup.withdraw_max(&id, &f.recipient);
    assert_eq!(f.token_client.balance(&f.recipient), 600_000);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 600_000);
    assert!(s.is_depleted);
}

/// Same cap on a tranched stream canceled between tranches.
#[test]
fn tranched_withdrawable_after_cancel_is_capped() {
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
    // Cancel after the first tranche: 100 vested, 900 refunded.
    f.env.ledger().set_timestamp(now + 150);
    f.lockup.cancel(&id);
    f.env.ledger().set_timestamp(now + 10_000);
    assert_eq!(f.lockup.withdrawable_amount(&id), 100);
    f.lockup.withdraw_max(&id, &f.recipient);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
    assert!(f.lockup.get_stream(&id).is_depleted);
}
