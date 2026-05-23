#![no_std]

pub mod errors;
pub mod math;
pub mod types;

pub use errors::Error;
pub use types::{
    LinearShape, OpKind, Stream, StreamShape, StreamStatus, Tranche, TranchedShape, MAX_TRANCHES,
};
