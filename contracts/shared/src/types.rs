//! Types filled in Task 5.

use soroban_sdk::{contracttype, Address, Vec};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OpKind {
    Withdraw,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StreamStatus {
    Pending,
    Streaming,
    Settled,
    Canceled,
    Depleted,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Tranche {
    pub amount: i128,
    pub ts: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LinearShape {
    pub cliff_ts: u64,
    pub unlock_at_start: i128,
    pub unlock_at_cliff: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TranchedShape {
    pub tranches: Vec<Tranche>,
}

/// N equal unlocks of `amount_per_period`, the first at `first_ts`, then every
/// `period_secs`. `stream.start_ts == first_ts`,
/// `stream.end_ts == first_ts + (count - 1) * period_secs`,
/// `stream.deposited == amount_per_period * count`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RecurringShape {
    pub first_ts: u64,
    pub period_secs: u64,
    pub count: u32,
    pub amount_per_period: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StreamShape {
    Linear(LinearShape),
    Tranched(TranchedShape),
    Recurring(RecurringShape),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Stream {
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub start_ts: u64,
    pub end_ts: u64,
    pub is_cancelable: bool,
    pub is_transferable: bool,
    pub was_canceled: bool,
    pub is_depleted: bool,
    pub deposited: i128,
    pub withdrawn: i128,
    pub refunded: i128,
    pub shape: StreamShape,
}

/// Maximum number of tranches in a Tranched stream. Bounded to keep
/// storage entry size + tx resource fee predictable.
pub const MAX_TRANCHES: u32 = 100;

/// Maximum rows accepted by `create_batch`. A sanity cap that yields a clear
/// error; the real bound is the per-transaction resource budget.
pub const MAX_BATCH_ROWS: u32 = 100;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LinearParams {
    pub deposited: i128,
    pub start_ts: u64,
    pub cliff_ts: u64,
    pub end_ts: u64,
    pub unlock_at_start: i128,
    pub unlock_at_cliff: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TranchedParams {
    pub tranches: Vec<Tranche>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RecurringParams {
    pub amount_per_period: i128,
    pub period_secs: u64,
    pub count: u32,
    pub first_ts: u64,
}

/// Shape-specific create parameters (no recipient / flags).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CreateSpec {
    Linear(LinearParams),
    Tranched(TranchedParams),
    Recurring(RecurringParams),
}

/// One row of a `create_batch` call.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CreateRow {
    pub recipient: Address,
    pub spec: CreateSpec,
    pub is_cancelable: bool,
    pub is_transferable: bool,
}

impl Stream {
    /// Pure status derivation from current timestamp. Does not read storage.
    pub fn status(&self, now: u64) -> StreamStatus {
        if self.is_depleted {
            return StreamStatus::Depleted;
        }
        if self.was_canceled {
            return StreamStatus::Canceled;
        }
        if now < self.start_ts {
            return StreamStatus::Pending;
        }
        if now >= self.end_ts {
            return StreamStatus::Settled;
        }
        StreamStatus::Streaming
    }

    pub fn withdrawable(&self, now: u64) -> i128 {
        crate::math::withdrawable_amount(self, now).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn stream(env: &Env) -> Stream {
        let addr = Address::generate(env);
        Stream {
            sender: addr.clone(),
            recipient: addr.clone(),
            token: addr.clone(),
            start_ts: 100,
            end_ts: 200,
            is_cancelable: true,
            is_transferable: true,
            was_canceled: false,
            is_depleted: false,
            deposited: 1000,
            withdrawn: 0,
            refunded: 0,
            shape: StreamShape::Linear(LinearShape {
                cliff_ts: 100,
                unlock_at_start: 0,
                unlock_at_cliff: 0,
            }),
        }
    }

    #[test]
    fn status_pending_before_start() {
        let env = Env::default();
        assert_eq!(stream(&env).status(50), StreamStatus::Pending);
    }

    #[test]
    fn status_streaming_during_window() {
        let env = Env::default();
        assert_eq!(stream(&env).status(150), StreamStatus::Streaming);
    }

    #[test]
    fn status_settled_at_or_after_end() {
        let env = Env::default();
        assert_eq!(stream(&env).status(200), StreamStatus::Settled);
        assert_eq!(stream(&env).status(99999), StreamStatus::Settled);
    }

    #[test]
    fn status_canceled_takes_precedence_over_time() {
        let env = Env::default();
        let mut s = stream(&env);
        s.was_canceled = true;
        assert_eq!(s.status(150), StreamStatus::Canceled);
    }

    #[test]
    fn status_depleted_takes_precedence_over_canceled() {
        let env = Env::default();
        let mut s = stream(&env);
        s.was_canceled = true;
        s.is_depleted = true;
        assert_eq!(s.status(50), StreamStatus::Depleted);
    }

    #[test]
    fn status_for_recurring_uses_start_and_end() {
        let env = Env::default();
        let mut s = stream(&env);
        s.start_ts = 1_000;
        s.end_ts = 1_000 + 11 * 100;
        s.deposited = 12_000;
        s.shape = StreamShape::Recurring(RecurringShape {
            first_ts: 1_000,
            period_secs: 100,
            count: 12,
            amount_per_period: 1_000,
        });
        assert_eq!(s.status(999), StreamStatus::Pending);
        assert_eq!(s.status(1_000), StreamStatus::Streaming);
        assert_eq!(s.status(2_099), StreamStatus::Streaming);
        assert_eq!(s.status(2_100), StreamStatus::Settled);
        // withdrawable goes through the dispatcher
        assert_eq!(s.withdrawable(1_250), 3_000);
    }
}
