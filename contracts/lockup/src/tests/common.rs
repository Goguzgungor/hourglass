use crate::{Lockup, LockupClient};
use hourglass_comptroller::{Comptroller, ComptrollerClient};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, ConversionError, Env, InvokeError,
};

/// A no-op stub contract registered at the oracle address so `env.as_contract`
/// calls against it (in the comptroller's mock oracle) succeed.
#[contract]
pub struct OracleStub;

#[contractimpl]
impl OracleStub {}

pub struct Fixture<'a> {
    pub env: Env,
    pub admin: Address,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub token_admin: StellarAssetClient<'a>,
    pub token_client: TokenClient<'a>,
    pub lockup_addr: Address,
    pub lockup: LockupClient<'a>,
    pub comptroller_addr: Address,
    pub comptroller: ComptrollerClient<'a>,
    pub native: Address,
    pub native_admin: StellarAssetClient<'a>,
}

pub fn setup<'a>() -> Fixture<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let issuer = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(issuer.clone());
    let token = token_contract.address();
    let token_admin = StellarAssetClient::new(&env, &token);
    let token_client = TokenClient::new(&env, &token);

    token_admin.mint(&sender, &1_000_000_000_000i128);

    let native_contract = env.register_stellar_asset_contract_v2(issuer.clone());
    let native = native_contract.address();
    let native_admin = StellarAssetClient::new(&env, &native);
    native_admin.mint(&recipient, &10_000_000_000i128);

    let oracle = env.register(OracleStub, ());
    let comptroller_addr = env.register(
        Comptroller,
        (admin.clone(), admin.clone(), oracle, 3_600u32),
    );
    let comptroller = ComptrollerClient::new(&env, &comptroller_addr);

    let lockup_addr = env.register(
        Lockup,
        (admin.clone(), comptroller_addr.clone(), native.clone()),
    );
    let lockup = LockupClient::new(&env, &lockup_addr);

    Fixture {
        env,
        admin,
        sender,
        recipient,
        token,
        token_admin,
        token_client,
        lockup_addr,
        lockup,
        comptroller_addr,
        comptroller,
        native,
        native_admin,
    }
}

/// Extract the contract `Error` from a `try_*` client call that failed inside
/// the contract (via `panic_with_error!`). Every lockup entry point returns a
/// plain value (not `Result<T, Error>`) and panics on invalid input, so the
/// generated `try_*` client method's `Err(Ok(_))` payload is a raw
/// `soroban_sdk::Error`, not `hourglass_shared::Error` directly — this
/// converts it. Panics if the call succeeded or failed for a non-contract
/// reason (e.g. a host/auth error).
pub fn contract_error<T: core::fmt::Debug>(
    res: Result<Result<T, ConversionError>, Result<soroban_sdk::Error, InvokeError>>,
) -> hourglass_shared::Error {
    match res {
        Err(Ok(e)) => hourglass_shared::Error::try_from(e).expect("not a contract error"),
        other => panic!("expected a contract error, got {:?}", other),
    }
}
