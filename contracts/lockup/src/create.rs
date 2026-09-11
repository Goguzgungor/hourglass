use crate::{events, next_id, nft, save_stream, Lockup, LockupArgs, LockupClient};
use hourglass_shared::{
    CreateRow, CreateSpec, Error, LinearParams, LinearShape, RecurringParams, RecurringShape,
    Stream, StreamShape, Tranche, TranchedParams, TranchedShape, MAX_BATCH_ROWS, MAX_TRANCHES,
};
use soroban_sdk::{contractimpl, panic_with_error, token, Address, Env, Vec};

// ------------------------------------------------------------------------
// Pure helpers (no storage, no transfers, no events)
// ------------------------------------------------------------------------

/// Validate a create request and build the `Stream` record. Panics with the
/// matching `Error` on invalid input. Pure: safe to call for every row of a
/// batch before any state is touched.
pub(crate) fn build_stream(
    env: &Env,
    sender: &Address,
    token: &Address,
    recipient: &Address,
    spec: &CreateSpec,
    is_cancelable: bool,
    is_transferable: bool,
) -> Stream {
    let now = env.ledger().timestamp();
    let (start_ts, end_ts, deposited, shape) = match spec {
        CreateSpec::Linear(p) => validate_linear(env, p, now),
        CreateSpec::Tranched(p) => validate_tranched(env, p, now),
        CreateSpec::Recurring(p) => validate_recurring(env, p, now),
    };
    Stream {
        sender: sender.clone(),
        recipient: recipient.clone(),
        token: token.clone(),
        start_ts,
        end_ts,
        is_cancelable,
        is_transferable,
        was_canceled: false,
        is_depleted: false,
        deposited,
        withdrawn: 0,
        refunded: 0,
        shape,
    }
}

/// Returns `(start_ts, end_ts, deposited, shape)`.
fn validate_linear(env: &Env, p: &LinearParams, now: u64) -> (u64, u64, i128, StreamShape) {
    if p.deposited <= 0 {
        panic_with_error!(env, Error::ZeroDeposit);
    }
    if !(p.start_ts < p.end_ts) {
        panic_with_error!(env, Error::StartAfterEnd);
    }
    if !(p.start_ts <= p.cliff_ts && p.cliff_ts <= p.end_ts) {
        panic_with_error!(env, Error::CliffOutOfRange);
    }
    if p.unlock_at_start < 0 || p.unlock_at_cliff < 0 {
        panic_with_error!(env, Error::UnlocksExceedDeposit);
    }
    let unlock_sum = p
        .unlock_at_start
        .checked_add(p.unlock_at_cliff)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    if unlock_sum > p.deposited {
        panic_with_error!(env, Error::UnlocksExceedDeposit);
    }
    if p.start_ts < now {
        panic_with_error!(env, Error::StartInPast);
    }
    (
        p.start_ts,
        p.end_ts,
        p.deposited,
        StreamShape::Linear(LinearShape {
            cliff_ts: p.cliff_ts,
            unlock_at_start: p.unlock_at_start,
            unlock_at_cliff: p.unlock_at_cliff,
        }),
    )
}

/// Returns `(start_ts, end_ts, deposited, shape)`.
fn validate_tranched(env: &Env, p: &TranchedParams, now: u64) -> (u64, u64, i128, StreamShape) {
    let tranches: &Vec<Tranche> = &p.tranches;
    if tranches.is_empty() {
        panic_with_error!(env, Error::NoTranches);
    }
    if tranches.len() > MAX_TRANCHES {
        panic_with_error!(env, Error::TooManyTranches);
    }
    let mut last_ts: u64 = 0;
    let mut sum: i128 = 0;
    for (i, t) in tranches.iter().enumerate() {
        if t.amount <= 0 {
            panic_with_error!(env, Error::ZeroDeposit);
        }
        if i > 0 && t.ts <= last_ts {
            panic_with_error!(env, Error::TranchesNotAscending);
        }
        last_ts = t.ts;
        sum = sum
            .checked_add(t.amount)
            .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    }
    let start_ts = tranches.first().unwrap().ts;
    let end_ts = tranches.last().unwrap().ts;
    if start_ts < now {
        panic_with_error!(env, Error::StartInPast);
    }
    (
        start_ts,
        end_ts,
        sum,
        StreamShape::Tranched(TranchedShape {
            tranches: tranches.clone(),
        }),
    )
}

/// Returns `(start_ts, end_ts, deposited, shape)`.
fn validate_recurring(env: &Env, p: &RecurringParams, now: u64) -> (u64, u64, i128, StreamShape) {
    if p.amount_per_period <= 0 {
        panic_with_error!(env, Error::ZeroDeposit);
    }
    if p.period_secs == 0 {
        panic_with_error!(env, Error::InvalidPeriod);
    }
    if p.count == 0 {
        panic_with_error!(env, Error::InvalidCount);
    }
    if p.first_ts < now {
        panic_with_error!(env, Error::StartInPast);
    }
    let deposited = p
        .amount_per_period
        .checked_mul(p.count as i128)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    let span = u64::from(p.count)
        .saturating_sub(1)
        .checked_mul(p.period_secs)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    let end_ts = p
        .first_ts
        .checked_add(span)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    (
        p.first_ts,
        end_ts,
        deposited,
        StreamShape::Recurring(RecurringShape {
            first_ts: p.first_ts,
            period_secs: p.period_secs,
            count: p.count,
            amount_per_period: p.amount_per_period,
        }),
    )
}

// ------------------------------------------------------------------------
// Side-effecting helpers
// ------------------------------------------------------------------------

/// Pull `amount` of `token` from `sender` into this contract.
pub(crate) fn pull_deposit(env: &Env, token: &Address, sender: &Address, amount: i128) {
    let client = token::Client::new(env, token);
    client.transfer(sender, &env.current_contract_address(), &amount);
}

/// Allocate an id, persist the record, mint the NFT receipt to the recipient
/// and emit `created`. Returns the new stream id.
pub(crate) fn persist(env: &Env, stream: &Stream) -> u32 {
    let id = next_id(env);
    save_stream(env, id, stream);
    nft::mint(env, &stream.recipient, id);
    events::stream_created(env, id, stream);
    id
}

// ------------------------------------------------------------------------
// Entry points
// ------------------------------------------------------------------------

#[contractimpl]
impl Lockup {
    pub fn create_linear(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        deposited: i128,
        start_ts: u64,
        cliff_ts: u64,
        end_ts: u64,
        unlock_at_start: i128,
        unlock_at_cliff: i128,
        is_cancelable: bool,
        is_transferable: bool,
    ) -> u32 {
        sender.require_auth();
        let spec = CreateSpec::Linear(LinearParams {
            deposited,
            start_ts,
            cliff_ts,
            end_ts,
            unlock_at_start,
            unlock_at_cliff,
        });
        let stream = build_stream(
            &env,
            &sender,
            &token,
            &recipient,
            &spec,
            is_cancelable,
            is_transferable,
        );
        pull_deposit(&env, &token, &sender, stream.deposited);
        persist(&env, &stream)
    }
}

#[contractimpl]
impl Lockup {
    pub fn create_tranched(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        tranches: Vec<Tranche>,
        is_cancelable: bool,
        is_transferable: bool,
    ) -> u32 {
        sender.require_auth();
        let spec = CreateSpec::Tranched(TranchedParams { tranches });
        let stream = build_stream(
            &env,
            &sender,
            &token,
            &recipient,
            &spec,
            is_cancelable,
            is_transferable,
        );
        pull_deposit(&env, &token, &sender, stream.deposited);
        persist(&env, &stream)
    }
}

#[contractimpl]
impl Lockup {
    /// Recurring stream: `count` unlocks of `amount_per_period`, the first at
    /// `first_ts`, then every `period_secs`. Deposit = amount_per_period * count.
    pub fn create_recurring(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount_per_period: i128,
        period_secs: u64,
        count: u32,
        first_ts: u64,
        is_cancelable: bool,
        is_transferable: bool,
    ) -> u32 {
        sender.require_auth();
        let spec = CreateSpec::Recurring(RecurringParams {
            amount_per_period,
            period_secs,
            count,
            first_ts,
        });
        let stream = build_stream(
            &env,
            &sender,
            &token,
            &recipient,
            &spec,
            is_cancelable,
            is_transferable,
        );
        pull_deposit(&env, &token, &sender, stream.deposited);
        persist(&env, &stream)
    }
}

#[contractimpl]
impl Lockup {
    /// Create 1..=MAX_BATCH_ROWS streams of mixed shapes for one sender and one
    /// token in a single transaction. Every row is validated before any state
    /// changes; the deposits are pulled with ONE token transfer; ids are
    /// consecutive and returned in row order. Any failure reverts everything.
    pub fn create_batch(
        env: Env,
        sender: Address,
        token: Address,
        rows: Vec<CreateRow>,
    ) -> Vec<u32> {
        sender.require_auth();
        if rows.is_empty() {
            panic_with_error!(&env, Error::EmptyBatch);
        }
        if rows.len() > MAX_BATCH_ROWS {
            panic_with_error!(&env, Error::BatchTooLarge);
        }

        // Phase 1 — validate every row, build the records, sum the deposits.
        let mut streams: Vec<Stream> = Vec::new(&env);
        let mut total: i128 = 0;
        for row in rows.iter() {
            let s = build_stream(
                &env,
                &sender,
                &token,
                &row.recipient,
                &row.spec,
                row.is_cancelable,
                row.is_transferable,
            );
            total = total
                .checked_add(s.deposited)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
            streams.push_back(s);
        }

        // Phase 2 — exactly one transfer for the whole batch.
        pull_deposit(&env, &token, &sender, total);

        // Phase 3 — persist in row order (ids are consecutive).
        let mut ids: Vec<u32> = Vec::new(&env);
        for s in streams.iter() {
            ids.push_back(persist(&env, &s));
        }
        ids
    }
}
