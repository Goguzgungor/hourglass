use crate::{events, load_stream, save_stream, DataKey, Lockup, LockupArgs, LockupClient};
use hourglass_shared::{Error, OpKind};
use soroban_sdk::{contractimpl, panic_with_error, token, Address, Env};

#[contractimpl]
impl Lockup {
    pub fn withdraw(env: Env, stream_id: u32, to: Address, amount: i128) {
        let mut s = load_stream(&env, stream_id);

        // Auth: recipient (NFT owner) must sign. NFT-approval flow (third-party
        // spender via `approve`) is Phase 1 — not in this plan.
        s.recipient.require_auth();

        if s.is_depleted {
            panic_with_error!(&env, Error::AlreadyDepleted);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::ZeroWithdraw);
        }
        let now = env.ledger().timestamp();
        let withdrawable = s.withdrawable(now);
        if amount > withdrawable {
            panic_with_error!(&env, Error::InsufficientWithdrawable);
        }

        // Charge fee in XLM (skip if comptroller fee is 0).
        let comptroller_addr: Address =
            env.storage().instance().get(&DataKey::Comptroller).unwrap();
        let comp_client = hourglass_comptroller::ComptrollerClient::new(&env, &comptroller_addr);
        let xlm_fee = comp_client.fee_for(&OpKind::Withdraw);
        if xlm_fee > 0 {
            let xlm = native_token(&env);
            let collector = comp_client.fee_collector();
            xlm.transfer(&s.recipient, &collector, &xlm_fee);
        }

        // Transfer stream token from this contract to `to`.
        let token_client = token::Client::new(&env, &s.token);
        token_client.transfer(&env.current_contract_address(), &to, &amount);

        s.withdrawn += amount;
        if s.withdrawn + s.refunded >= s.deposited {
            s.is_depleted = true;
        }
        save_stream(&env, stream_id, &s);
        events::withdrawn(&env, stream_id, &to, amount, &s.recipient);
    }

    pub fn withdraw_max(env: Env, stream_id: u32, to: Address) {
        let s = load_stream(&env, stream_id);
        let withdrawable = s.withdrawable(env.ledger().timestamp());
        if withdrawable == 0 {
            return;
        }
        Self::withdraw(env, stream_id, to, withdrawable);
    }
}

#[contractimpl]
impl Lockup {
    pub fn cancel(env: Env, stream_id: u32) {
        let mut s = load_stream(&env, stream_id);

        s.sender.require_auth();

        if !s.is_cancelable {
            panic_with_error!(&env, Error::NotCancelable);
        }
        if s.was_canceled {
            panic_with_error!(&env, Error::AlreadyCanceled);
        }
        if s.is_depleted {
            panic_with_error!(&env, Error::AlreadyDepleted);
        }
        let now = env.ledger().timestamp();
        let status = s.status(now);
        if !matches!(
            status,
            hourglass_shared::StreamStatus::Pending | hourglass_shared::StreamStatus::Streaming
        ) {
            panic_with_error!(&env, Error::InvalidStatus);
        }

        let streamed = hourglass_shared::math::streamed_amount(&s, now)
            .unwrap_or_else(|e| panic_with_error!(&env, e));
        let recipient_balance = streamed - s.withdrawn;
        let sender_refund = s.deposited - streamed;

        if sender_refund > 0 {
            let token_client = token::Client::new(&env, &s.token);
            token_client.transfer(
                &env.current_contract_address(),
                &s.sender,
                &sender_refund,
            );
        }

        s.was_canceled = true;
        s.refunded = sender_refund;
        if recipient_balance == 0 {
            s.is_depleted = true;
        }
        save_stream(&env, stream_id, &s);
        events::canceled(&env, stream_id, sender_refund, recipient_balance);
    }
}

#[contractimpl]
impl Lockup {
    pub fn renounce(env: Env, stream_id: u32) {
        let mut s = load_stream(&env, stream_id);
        s.sender.require_auth();
        if !s.is_cancelable {
            panic_with_error!(&env, Error::NotCancelable);
        }
        let now = env.ledger().timestamp();
        let status = s.status(now);
        if !matches!(
            status,
            hourglass_shared::StreamStatus::Pending | hourglass_shared::StreamStatus::Streaming
        ) {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        s.is_cancelable = false;
        save_stream(&env, stream_id, &s);
        events::renounced(&env, stream_id);
    }
}

#[contractimpl]
impl Lockup {
    pub fn burn(env: Env, stream_id: u32) {
        let s = load_stream(&env, stream_id);
        if !s.is_depleted {
            panic_with_error!(&env, Error::InvalidStatus);
        }
        env.storage().persistent().remove(&DataKey::Stream(stream_id));
        events::burned(&env, stream_id);
        // NFT burn added in Task 27.
    }
}

fn native_token(env: &Env) -> token::Client {
    let native: Address = env
        .storage()
        .instance()
        .get(&crate::DataKey::NativeToken)
        .unwrap();
    token::Client::new(env, &native)
}
