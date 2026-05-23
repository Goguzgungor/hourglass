#![no_std]

use hourglass_shared::{Error, Stream};
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Env, Vec,
};

mod create;
mod events;
mod lifecycle;
mod nft;
mod view;

const STREAM_TTL_BUMP_LEDGERS: u32 = 17_280 * 90; // ~90 days at 5s/ledger
const STREAM_TTL_MIN_LEDGERS: u32 = 17_280 * 30;  // bump if below ~30 days

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    Comptroller,
    NativeToken,
    NextStreamId,
    Stream(u32),
}

#[contract]
pub struct Lockup;

#[contractimpl]
impl Lockup {
    pub fn __constructor(env: Env, admin: Address, comptroller: Address, native_token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Comptroller, &comptroller);
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
        env.storage().instance().set(&DataKey::NextStreamId, &1u32);
        nft::init(&env);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn comptroller(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Comptroller).unwrap()
    }

    pub fn get_stream(env: Env, stream_id: u32) -> Stream {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::StreamNotFound))
    }
}

pub(crate) fn next_id(env: &Env) -> u32 {
    let id: u32 = env.storage().instance().get(&DataKey::NextStreamId).unwrap();
    env.storage()
        .instance()
        .set(&DataKey::NextStreamId, &(id + 1));
    id
}

pub(crate) fn save_stream(env: &Env, stream_id: u32, stream: &Stream) {
    let key = DataKey::Stream(stream_id);
    env.storage().persistent().set(&key, stream);
    env.storage()
        .persistent()
        .extend_ttl(&key, STREAM_TTL_MIN_LEDGERS, STREAM_TTL_BUMP_LEDGERS);
}

pub(crate) fn load_stream(env: &Env, stream_id: u32) -> Stream {
    let key = DataKey::Stream(stream_id);
    let s: Stream = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::StreamNotFound));
    env.storage()
        .persistent()
        .extend_ttl(&key, STREAM_TTL_MIN_LEDGERS, STREAM_TTL_BUMP_LEDGERS);
    s
}

#[cfg(test)]
mod tests;
