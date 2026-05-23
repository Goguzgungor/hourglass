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

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    Comptroller,
    NextStreamId,
    Stream(u32),
}

#[contract]
pub struct Lockup;

#[contractimpl]
impl Lockup {
    pub fn __constructor(env: Env, admin: Address, comptroller: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Comptroller, &comptroller);
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
    env.storage()
        .persistent()
        .set(&DataKey::Stream(stream_id), stream);
}

pub(crate) fn load_stream(env: &Env, stream_id: u32) -> Stream {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::StreamNotFound))
}

#[cfg(test)]
mod tests;
