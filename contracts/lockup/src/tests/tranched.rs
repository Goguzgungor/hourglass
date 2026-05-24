use super::common::setup;
use hourglass_shared::{StreamShape, StreamStatus, Tranche};
use soroban_sdk::{testutils::Ledger as _, vec};

#[test]
fn create_tranched_pulls_sum() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let tranches = vec![
        &f.env,
        Tranche {
            amount: 100,
            ts: now + 100,
        },
        Tranche {
            amount: 200,
            ts: now + 200,
        },
        Tranche {
            amount: 300,
            ts: now + 300,
        },
    ];
    let id = f
        .lockup
        .create_tranched(&f.sender, &f.recipient, &f.token, &tranches, &true, &true);
    assert_eq!(id, 1);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 600);

    let s = f.lockup.get_stream(&id);
    assert!(matches!(s.shape, StreamShape::Tranched(_)));
    assert_eq!(s.deposited, 600);
}

#[test]
fn tranched_progresses_in_steps() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let tranches = vec![
        &f.env,
        Tranche {
            amount: 100,
            ts: now + 100,
        },
        Tranche {
            amount: 200,
            ts: now + 200,
        },
        Tranche {
            amount: 300,
            ts: now + 300,
        },
    ];
    let id = f
        .lockup
        .create_tranched(&f.sender, &f.recipient, &f.token, &tranches, &true, &true);

    assert_eq!(f.lockup.streamed_amount(&id), 0);
    f.env.ledger().set_timestamp(now + 100);
    assert_eq!(f.lockup.streamed_amount(&id), 100);
    f.env.ledger().set_timestamp(now + 250);
    assert_eq!(f.lockup.streamed_amount(&id), 300);
    f.env.ledger().set_timestamp(now + 350);
    assert_eq!(f.lockup.streamed_amount(&id), 600);
    assert_eq!(f.lockup.status(&id), StreamStatus::Settled);
}

#[test]
#[should_panic]
fn tranched_rejects_empty() {
    let f = setup();
    f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &vec![&f.env],
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn tranched_rejects_non_ascending() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &vec![
            &f.env,
            Tranche {
                amount: 100,
                ts: now + 200,
            },
            Tranche {
                amount: 100,
                ts: now + 100,
            },
        ],
        &true,
        &true,
    );
}

#[test]
#[should_panic]
fn tranched_rejects_zero_amount() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    f.lockup.create_tranched(
        &f.sender,
        &f.recipient,
        &f.token,
        &vec![
            &f.env,
            Tranche {
                amount: 0,
                ts: now + 100,
            },
        ],
        &true,
        &true,
    );
}
