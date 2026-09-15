#![no_std]

pub mod errors;
pub mod math;
pub mod types;

pub use errors::Error;
pub use types::{
    CreateRow, CreateSpec, LinearParams, LinearShape, OpKind, RecurringParams, RecurringShape,
    Stream, StreamShape, StreamStatus, Tranche, TranchedParams, TranchedShape, MAX_BATCH_ROWS,
    MAX_TRANCHES,
};
