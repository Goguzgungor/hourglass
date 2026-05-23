use crate::{events, next_id, save_stream, Lockup, LockupArgs, LockupClient};
use hourglass_shared::{Error, LinearShape, Stream, StreamShape};
use soroban_sdk::{contractimpl, panic_with_error, token, Address, Env};

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

        // Validation
        if deposited <= 0 {
            panic_with_error!(&env, Error::ZeroDeposit);
        }
        if !(start_ts < end_ts) {
            panic_with_error!(&env, Error::StartAfterEnd);
        }
        if !(start_ts <= cliff_ts && cliff_ts <= end_ts) {
            panic_with_error!(&env, Error::CliffOutOfRange);
        }
        if unlock_at_start < 0 || unlock_at_cliff < 0 {
            panic_with_error!(&env, Error::UnlocksExceedDeposit);
        }
        let unlock_sum = unlock_at_start
            .checked_add(unlock_at_cliff)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        if unlock_sum > deposited {
            panic_with_error!(&env, Error::UnlocksExceedDeposit);
        }
        if start_ts < env.ledger().timestamp() {
            panic_with_error!(&env, Error::StartInPast);
        }

        // Pull tokens into the lockup contract.
        let client = token::Client::new(&env, &token);
        client.transfer(&sender, &env.current_contract_address(), &deposited);

        // Build + persist the Stream.
        let stream = Stream {
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
            shape: StreamShape::Linear(LinearShape {
                cliff_ts,
                unlock_at_start,
                unlock_at_cliff,
            }),
        };
        let id = next_id(&env);
        save_stream(&env, id, &stream);
        events::stream_created(&env, id, &stream);
        // NFT mint will be added in Task 25.
        id
    }
}
