//! NFT integration for the Lockup contract.
//!
//! Each stream is wrapped as a transferable NFT receipt. The integration uses
//! OpenZeppelin's `stellar-tokens` 0.7.1 `NonFungibleToken` trait with the
//! `Enumerable` extension as the `ContractType`. This provides on-chain
//! enumeration (`total_supply`, `get_token_id`, `get_owner_token_id`) for
//! free.
//!
//! ## Step 0 — API survey (stellar-tokens 0.7.1)
//!
//! * `Base::set_metadata(env, base_uri, name, symbol)` — three `String` args.
//! * `Base::mint(env, &to, token_id)` — no auth; for the Enumerable extension
//!   we must use `Enumerable::non_sequential_mint` so the enumeration
//!   storage stays in sync.
//! * `Base::burn(env, &from, token_id)` — calls `from.require_auth()`; the
//!   Enumerable wrapper `Enumerable::burn` chains the bookkeeping.
//! * `Base::transfer(env, &from, &to, token_id)` — calls `from.require_auth()`;
//!   `Enumerable::transfer` wraps it and updates the owner index.
//! * The override mechanism is `trait NonFungibleToken { type ContractType: ContractOverrides; }`.
//!   `NonFungibleEnumerable` constrains `ContractType = Enumerable` exactly,
//!   so we cannot use a custom marker; the transferable hook must therefore
//!   be applied by overriding the `transfer` / `transfer_from` trait methods
//!   in the `impl NonFungibleToken for Lockup` block, then delegating to
//!   `Enumerable::transfer` / `transfer_from`.
//! * `#[contractimpl(contracttrait)]` is required so the trait methods become
//!   exported contract entrypoints.

use soroban_sdk::{contractimpl, panic_with_error, Address, Env, String};
use stellar_tokens::non_fungible::{
    enumerable::{Enumerable, NonFungibleEnumerable},
    Base, NonFungibleToken,
};

use crate::{events, load_stream, save_stream, Lockup, LockupArgs, LockupClient};

// ----------------------------- internal helpers -----------------------------

pub(crate) fn init(env: &Env) {
    Base::set_metadata(
        env,
        String::from_str(env, "https://hourglass.fi/api/nft/"),
        String::from_str(env, "Hourglass Stream"),
        String::from_str(env, "STREAM"),
    );
}

/// Mint an NFT receipt for `token_id == stream_id` to `to`. Updates the
/// Enumerable extension's owner + global token lists.
pub(crate) fn mint(env: &Env, to: &Address, token_id: u32) {
    Enumerable::non_sequential_mint(env, to, token_id);
}

/// Burn the NFT with `token_id`. The caller (current NFT owner) must have
/// already authorized; this skips the auth check via `Base::update` so that
/// the lockup `burn` lifecycle can drive it.
pub(crate) fn burn(env: &Env, token_id: u32) {
    // Look up the current owner and update enumeration manually so we don't
    // pull in `Base::burn`'s auth requirement (which would force the NFT
    // owner to sign, on top of the stream's own depletion guarantee).
    let owner = Base::owner_of(env, token_id);
    Base::update(env, Some(&owner), None, token_id);
    Enumerable::remove_from_enumerations(env, &owner, token_id);
}

/// Transfer the NFT WITHOUT running the `is_transferable` hook. Used by
/// `withdraw_max_and_transfer` (Task 28) where the recipient is moving the
/// receipt as part of a single atomic step. Updates Enumerable bookkeeping.
#[allow(dead_code)] // wired up in Task 28
pub(crate) fn base_transfer(env: &Env, from: &Address, to: &Address, token_id: u32) {
    // Bypass the auth in `Base::transfer` because the caller has already been
    // authorized at the lockup-method level.
    Base::update(env, Some(from), Some(to), token_id);
    if from != to {
        Enumerable::remove_from_owner_enumeration(env, from, token_id);
        Enumerable::add_to_owner_enumeration(env, to, token_id);
    }
    stellar_tokens::non_fungible::emit_transfer(env, from, to, token_id);
}

#[allow(dead_code)] // exposed for tests / future call-sites
pub(crate) fn owner_of(env: &Env, token_id: u32) -> Address {
    Base::owner_of(env, token_id)
}

// ----------------------------- trait integration ----------------------------

/// `is_transferable` enforcement + stream-side bookkeeping shared by the
/// `transfer` and `transfer_from` overrides.
fn enforce_transferable(env: &Env, to: &Address, token_id: u32) {
    let s = load_stream(env, token_id);
    if !s.is_transferable {
        panic_with_error!(env, hourglass_shared::Error::NotTransferable);
    }
    let mut s = s;
    s.recipient = to.clone();
    save_stream(env, token_id, &s);
}

#[contractimpl(contracttrait)]
impl NonFungibleToken for Lockup {
    type ContractType = Enumerable;

    fn transfer(env: &Env, from: Address, to: Address, token_id: u32) {
        enforce_transferable(env, &to, token_id);
        Enumerable::transfer(env, &from, &to, token_id);
        events::transferred(env, token_id, &from, &to);
    }

    fn transfer_from(env: &Env, spender: Address, from: Address, to: Address, token_id: u32) {
        enforce_transferable(env, &to, token_id);
        Enumerable::transfer_from(env, &spender, &from, &to, token_id);
        events::transferred(env, token_id, &from, &to);
    }
}

#[contractimpl(contracttrait)]
impl NonFungibleEnumerable for Lockup {}
