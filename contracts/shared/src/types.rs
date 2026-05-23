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

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StreamShape {
    Linear(LinearShape),
    Tranched(TranchedShape),
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
