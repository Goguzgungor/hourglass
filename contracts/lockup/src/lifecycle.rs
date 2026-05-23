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

fn native_token(env: &Env) -> token::Client {
    let native: Address = env
        .storage()
        .instance()
        .get(&crate::DataKey::NativeToken)
        .unwrap();
    token::Client::new(env, &native)
}
