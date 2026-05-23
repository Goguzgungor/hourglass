use crate::{load_stream, Lockup, LockupArgs, LockupClient};
use hourglass_shared::{math, StreamStatus};
use soroban_sdk::{contractimpl, panic_with_error, Env};

#[contractimpl]
impl Lockup {
    pub fn streamed_amount(env: Env, stream_id: u32) -> i128 {
        let s = load_stream(&env, stream_id);
        let now = env.ledger().timestamp();
        match math::streamed_amount(&s, now) {
            Ok(v) => v,
            Err(e) => panic_with_error!(&env, e),
        }
    }

    pub fn withdrawable_amount(env: Env, stream_id: u32) -> i128 {
        let s = load_stream(&env, stream_id);
        let now = env.ledger().timestamp();
        s.withdrawable(now)
    }

    pub fn status(env: Env, stream_id: u32) -> StreamStatus {
        let s = load_stream(&env, stream_id);
        s.status(env.ledger().timestamp())
    }
}
