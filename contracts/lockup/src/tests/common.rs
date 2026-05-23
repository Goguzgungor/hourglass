use crate::{Lockup, LockupClient};
use hourglass_comptroller::{Comptroller, ComptrollerClient};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
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

    let oracle = env.register(OracleStub, ());
    let comptroller_addr = env.register(
        Comptroller,
        (admin.clone(), admin.clone(), oracle, 3_600u32),
    );
    let comptroller = ComptrollerClient::new(&env, &comptroller_addr);

    let lockup_addr = env.register(Lockup, (admin.clone(), comptroller_addr.clone()));
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
    }
}
