use super::common::{contract_error, setup, Fixture};
use hourglass_shared::{Error, RecurringShape, StreamShape, StreamStatus};
use soroban_sdk::testutils::Ledger as _;

const AMOUNT: i128 = 1_000;
const PERIOD: u64 = 100;
const COUNT: u32 = 12;
const SENDER_START_BALANCE: i128 = 1_000_000_000_000;

fn create(f: &Fixture<'_>, first_ts: u64) -> u32 {
    f.lockup.create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &PERIOD,
        &COUNT,
        &first_ts,
        &true,
        &true,
    )
}

#[test]
fn create_recurring_derives_fields_and_pulls_deposit() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;

    let id = create(&f, first);
    assert_eq!(id, 1);

    let total = AMOUNT * COUNT as i128; // 12_000
    assert_eq!(
        f.token_client.balance(&f.sender),
        SENDER_START_BALANCE - total
    );
    assert_eq!(f.token_client.balance(&f.lockup_addr), total);

    let s = f.lockup.get_stream(&id);
    assert_eq!(s.sender, f.sender);
    assert_eq!(s.recipient, f.recipient);
    assert_eq!(s.token, f.token);
    assert_eq!(s.start_ts, first);
    assert_eq!(s.end_ts, first + (COUNT as u64 - 1) * PERIOD);
    assert_eq!(s.deposited, total);
    assert_eq!(s.withdrawn, 0);
    assert_eq!(s.refunded, 0);
    assert!(s.is_cancelable);
    assert!(s.is_transferable);
    assert_eq!(
        s.shape,
        StreamShape::Recurring(RecurringShape {
            first_ts: first,
            period_secs: PERIOD,
            count: COUNT,
            amount_per_period: AMOUNT,
        })
    );

    // NFT receipt minted to the recipient.
    assert_eq!(f.lockup.owner_of(&id), f.recipient);
    assert_eq!(f.lockup.total_supply(), 1);
}

#[test]
fn create_recurring_rejects_zero_amount() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &0i128,
        &PERIOD,
        &COUNT,
        &(now + 100),
        &true,
        &true,
    );
    assert_eq!(contract_error(res), Error::ZeroDeposit);
}

#[test]
fn create_recurring_rejects_zero_period() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &0u64,
        &COUNT,
        &(now + 100),
        &true,
        &true,
    );
    assert_eq!(contract_error(res), Error::InvalidPeriod);
}

#[test]
fn create_recurring_rejects_zero_count() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &PERIOD,
        &0u32,
        &(now + 100),
        &true,
        &true,
    );
    assert_eq!(contract_error(res), Error::InvalidCount);
}

#[test]
fn create_recurring_rejects_first_ts_in_past() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &PERIOD,
        &COUNT,
        &(now - 1),
        &true,
        &true,
    );
    assert_eq!(contract_error(res), Error::StartInPast);
}

#[test]
fn create_recurring_rejects_amount_overflow() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &i128::MAX,
        &PERIOD,
        &2u32,
        &(now + 100),
        &true,
        &true,
    );
    assert_eq!(contract_error(res), Error::Overflow);
}

#[test]
fn create_recurring_rejects_end_ts_overflow() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let res = f.lockup.try_create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &u64::MAX,
        &3u32,
        &(now + 100),
        &true,
        &true,
    );
    assert_eq!(contract_error(res), Error::Overflow);
}

#[test]
fn recurring_streams_in_steps() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = create(&f, first);

    f.env.ledger().set_timestamp(first - 1);
    assert_eq!(f.lockup.streamed_amount(&id), 0);
    assert_eq!(f.lockup.status(&id), StreamStatus::Pending);

    f.env.ledger().set_timestamp(first);
    assert_eq!(f.lockup.streamed_amount(&id), AMOUNT);
    assert_eq!(f.lockup.status(&id), StreamStatus::Streaming);

    f.env.ledger().set_timestamp(first + 250);
    assert_eq!(f.lockup.streamed_amount(&id), 3 * AMOUNT);

    f.env
        .ledger()
        .set_timestamp(first + (COUNT as u64 - 1) * PERIOD);
    assert_eq!(f.lockup.streamed_amount(&id), AMOUNT * COUNT as i128);
    assert_eq!(f.lockup.status(&id), StreamStatus::Settled);
}

#[test]
fn recurring_withdraw_after_k_periods() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = create(&f, first);

    // 4 full periods elapsed after the first unlock → 5 unlocks available.
    f.env.ledger().set_timestamp(first + 4 * PERIOD + 1);
    f.lockup.withdraw_max(&id, &f.recipient);

    assert_eq!(f.token_client.balance(&f.recipient), 5 * AMOUNT);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 5 * AMOUNT);
    assert!(!s.is_depleted);
}

#[test]
fn recurring_cancel_refunds_unvested_periods() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = create(&f, first);
    let total = AMOUNT * COUNT as i128;

    f.env.ledger().set_timestamp(first + 4 * PERIOD + 1); // 5 unlocked
    let sender_before = f.token_client.balance(&f.sender);
    f.lockup.cancel(&id);

    let s = f.lockup.get_stream(&id);
    assert!(s.was_canceled);
    assert_eq!(s.refunded, total - 5 * AMOUNT);
    assert_eq!(
        f.token_client.balance(&f.sender),
        sender_before + (total - 5 * AMOUNT)
    );

    // Recipient still collects the 5 unlocked periods, which depletes the stream.
    f.lockup.withdraw_max(&id, &f.recipient);
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.withdrawn, 5 * AMOUNT);
    assert!(s.is_depleted);
    assert_eq!(f.token_client.balance(&f.lockup_addr), 0);
}

#[test]
fn recurring_single_period_settles_at_first_ts() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = f.lockup.create_recurring(
        &f.sender,
        &f.recipient,
        &f.token,
        &AMOUNT,
        &PERIOD,
        &1u32,
        &first,
        &true,
        &true,
    );
    let s = f.lockup.get_stream(&id);
    assert_eq!(s.start_ts, first);
    assert_eq!(s.end_ts, first);
    assert_eq!(s.deposited, AMOUNT);

    f.env.ledger().set_timestamp(first);
    assert_eq!(f.lockup.status(&id), StreamStatus::Settled);
    assert_eq!(f.lockup.streamed_amount(&id), AMOUNT);
}

#[test]
fn recurring_renounce_blocks_cancel() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let id = create(&f, now + 100);
    f.lockup.renounce(&id);
    assert!(!f.lockup.get_stream(&id).is_cancelable);
    assert_eq!(
        contract_error(f.lockup.try_cancel(&id)),
        Error::NotCancelable
    );
}

#[test]
fn recurring_burn_after_depletion() {
    let f = setup();
    let now = f.env.ledger().timestamp();
    let first = now + 100;
    let id = create(&f, first);
    f.env.ledger().set_timestamp(first + 100_000);
    f.lockup.withdraw_max(&id, &f.recipient);
    f.lockup.burn(&id);
    assert_eq!(
        contract_error(f.lockup.try_get_stream(&id)),
        Error::StreamNotFound
    );
}
