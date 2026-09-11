use super::common::{contract_error, setup, Fixture};
use hourglass_shared::{
    CreateRow, CreateSpec, Error, LinearParams, RecurringParams, StreamShape, Tranche,
    TranchedParams, MAX_BATCH_ROWS,
};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    vec,
    xdr::{ContractEventBody, ScVal},
    Address, Vec,
};

const SENDER_START_BALANCE: i128 = 1_000_000_000_000;
const LINEAR_DEPOSIT: i128 = 1_000_000;
const RECURRING_TOTAL: i128 = 12 * 1_000;
const TRANCHED_TOTAL: i128 = 100 + 200 + 300;

fn linear_row(recipient: &Address, now: u64) -> CreateRow {
    CreateRow {
        recipient: recipient.clone(),
        spec: CreateSpec::Linear(LinearParams {
            deposited: LINEAR_DEPOSIT,
            start_ts: now + 100,
            cliff_ts: now + 200,
            end_ts: now + 1_100,
            unlock_at_start: 0,
            unlock_at_cliff: 0,
        }),
        is_cancelable: true,
        is_transferable: true,
    }
}

fn recurring_row(recipient: &Address, now: u64) -> CreateRow {
    CreateRow {
        recipient: recipient.clone(),
        spec: CreateSpec::Recurring(RecurringParams {
            amount_per_period: 1_000,
            period_secs: 100,
            count: 12,
            first_ts: now + 100,
        }),
        is_cancelable: true,
        is_transferable: false,
    }
}

fn tranched_row(f: &Fixture<'_>, recipient: &Address, now: u64) -> CreateRow {
    CreateRow {
        recipient: recipient.clone(),
        spec: CreateSpec::Tranched(TranchedParams {
            tranches: vec![
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
            ],
        }),
        is_cancelable: false,
        is_transferable: true,
    }
}

/// Count `("stream","created",..)` events emitted by the lockup in the last
/// invocation (token transfer + NFT mint events are filtered out).
fn count_created_events(f: &Fixture<'_>) -> usize {
    f.env
        .events()
        .all()
        .filter_by_contract(&f.lockup_addr)
        .events()
        .iter()
        .filter(|e| {
            let ContractEventBody::V0(v0) = &e.body;
            matches!(
                v0.topics.get(1),
                Some(ScVal::Symbol(s)) if s.to_utf8_string_lossy() == "created"
            )
        })
        .count()
}

#[test]
fn batch_creates_mixed_rows_with_one_transfer() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let r1 = Address::generate(&f.env);
    let r2 = Address::generate(&f.env);
    let r3 = Address::generate(&f.env);
    let rows = vec![
        &f.env,
        linear_row(&r1, now),
        recurring_row(&r2, now),
        tranched_row(&f, &r3, now),
    ];

    let ids = f.lockup.create_batch(&f.sender, &f.token, &rows);
    // Must run before any other invocation: events().all() only holds the last call's events.
    assert_eq!(count_created_events(&f), 3);
    assert_eq!(ids, vec![&f.env, 1u32, 2u32, 3u32]);

    let total = LINEAR_DEPOSIT + RECURRING_TOTAL + TRANCHED_TOTAL;
    assert_eq!(
        f.token_client.balance(&f.sender),
        SENDER_START_BALANCE - total
    );
    assert_eq!(f.token_client.balance(&f.lockup_addr), total);

    let s1 = f.lockup.get_stream(&1);
    assert_eq!(s1.recipient, r1);
    assert_eq!(s1.deposited, LINEAR_DEPOSIT);
    assert!(matches!(s1.shape, StreamShape::Linear(_)));
    assert!(s1.is_cancelable && s1.is_transferable);

    let s2 = f.lockup.get_stream(&2);
    assert_eq!(s2.recipient, r2);
    assert_eq!(s2.deposited, RECURRING_TOTAL);
    assert!(matches!(s2.shape, StreamShape::Recurring(_)));
    assert!(s2.is_cancelable && !s2.is_transferable);

    let s3 = f.lockup.get_stream(&3);
    assert_eq!(s3.recipient, r3);
    assert_eq!(s3.deposited, TRANCHED_TOTAL);
    assert!(matches!(s3.shape, StreamShape::Tranched(_)));
    assert!(!s3.is_cancelable && s3.is_transferable);

    assert_eq!(f.lockup.owner_of(&1), r1);
    assert_eq!(f.lockup.owner_of(&2), r2);
    assert_eq!(f.lockup.owner_of(&3), r3);
    assert_eq!(f.lockup.total_supply(), 3);
}

#[test]
fn batch_ids_continue_from_existing_counter() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = f.lockup.create_linear(
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
    assert_eq!(first, 1);

    let rows = vec![
        &f.env,
        linear_row(&f.recipient, now),
        recurring_row(&f.recipient, now),
    ];
    let ids = f.lockup.create_batch(&f.sender, &f.token, &rows);
    assert_eq!(ids, vec![&f.env, 2u32, 3u32]);
}

#[test]
fn batch_is_atomic_when_a_row_is_invalid() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let mut bad = linear_row(&f.recipient, now);
    bad.spec = CreateSpec::Linear(LinearParams {
        deposited: 1_000,
        start_ts: now - 1, // StartInPast
        cliff_ts: now,
        end_ts: now + 1_000,
        unlock_at_start: 0,
        unlock_at_cliff: 0,
    });
    let rows = vec![
        &f.env,
        linear_row(&f.recipient, now),
        recurring_row(&f.recipient, now),
        bad,
    ];

    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert_eq!(contract_error(res), Error::StartInPast);

    // Nothing happened.
    assert_eq!(f.token_client.balance(&f.sender), SENDER_START_BALANCE);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
    assert_eq!(f.lockup.total_supply(), 0);
    assert_eq!(
        contract_error(f.lockup.try_get_stream(&1)),
        Error::StreamNotFound
    );

    // The id counter was not consumed.
    let ok_rows = vec![&f.env, linear_row(&f.recipient, now)];
    let ids = f.lockup.create_batch(&f.sender, &f.token, &ok_rows);
    assert_eq!(ids, vec![&f.env, 1u32]);
}

#[test]
fn batch_is_atomic_when_sender_balance_is_insufficient() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    // Two rows whose sum exceeds the sender's balance, each individually valid.
    let mut big = linear_row(&f.recipient, now);
    big.spec = CreateSpec::Linear(LinearParams {
        deposited: SENDER_START_BALANCE,
        start_ts: now + 100,
        cliff_ts: now + 100,
        end_ts: now + 1_100,
        unlock_at_start: 0,
        unlock_at_cliff: 0,
    });
    let rows = vec![&f.env, big, linear_row(&f.recipient, now)];

    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert!(res.is_err());

    assert_eq!(f.token_client.balance(&f.sender), SENDER_START_BALANCE);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
    assert_eq!(f.lockup.total_supply(), 0);
    assert_eq!(
        contract_error(f.lockup.try_get_stream(&1)),
        Error::StreamNotFound
    );
}

#[test]
fn batch_rejects_empty() {
    let f = setup();
    let rows: Vec<CreateRow> = Vec::new(&f.env);
    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert_eq!(contract_error(res), Error::EmptyBatch);
}

#[test]
fn batch_rejects_more_than_max_rows() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let mut rows: Vec<CreateRow> = Vec::new(&f.env);
    for _ in 0..(MAX_BATCH_ROWS + 1) {
        rows.push_back(linear_row(&f.recipient, now));
    }
    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert_eq!(contract_error(res), Error::BatchTooLarge);
}

#[test]
fn batch_rejects_deposit_sum_overflow() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let mut huge = linear_row(&f.recipient, now);
    huge.spec = CreateSpec::Linear(LinearParams {
        deposited: i128::MAX,
        start_ts: now + 100,
        cliff_ts: now + 100,
        end_ts: now + 1_100,
        unlock_at_start: 0,
        unlock_at_cliff: 0,
    });
    let rows = vec![&f.env, huge, linear_row(&f.recipient, now)];
    let res = f.lockup.try_create_batch(&f.sender, &f.token, &rows);
    assert_eq!(contract_error(res), Error::Overflow);
    assert_eq!(f.token_client.balance(&f.sender), SENDER_START_BALANCE);
}

#[test]
fn single_row_batch_matches_single_create() {
    let f = setup();
    let now = f.env.ledger().timestamp();

    let via_batch = f.lockup.create_batch(
        &f.sender,
        &f.token,
        &vec![&f.env, linear_row(&f.recipient, now)],
    );
    let via_single = f.lockup.create_linear(
        &f.sender,
        &f.recipient,
        &f.token,
        &LINEAR_DEPOSIT,
        &(now + 100),
        &(now + 200),
        &(now + 1_100),
        &0i128,
        &0i128,
        &true,
        &true,
    );
    assert_eq!(via_batch, vec![&f.env, 1u32]);
    assert_eq!(via_single, 2);
    assert_eq!(f.lockup.get_stream(&1), f.lockup.get_stream(&2));
}
