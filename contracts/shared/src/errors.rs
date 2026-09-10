use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Invalid call — generic catch-all (avoid in new code; prefer a specific variant).
    InvalidCall = 1,

    // ---- Create-time validation ----
    /// Deposit must be > 0.
    ZeroDeposit = 10,
    /// `start_ts` must be < `end_ts`.
    StartAfterEnd = 11,
    /// `cliff_ts` must be in [`start_ts`, `end_ts`].
    CliffOutOfRange = 12,
    /// `unlock_at_start + unlock_at_cliff` must be ≤ `deposited`.
    UnlocksExceedDeposit = 13,
    /// At least one tranche required.
    NoTranches = 14,
    /// Tranches must be strictly ascending by `ts`.
    TranchesNotAscending = 15,
    /// Sum of tranche amounts must equal `deposited`.
    TrancheSumMismatch = 16,
    /// Tranche count exceeds `MAX_TRANCHES`.
    TooManyTranches = 17,
    /// `start_ts` (or first tranche ts) must be ≥ current ledger time.
    StartInPast = 18,
    /// Batch must contain at least one row.
    EmptyBatch = 19,
    /// Batch row count exceeds `MAX_BATCH_ROWS`.
    BatchTooLarge = 20,
    /// `period_secs` must be > 0.
    InvalidPeriod = 21,
    /// `count` must be >= 1.
    InvalidCount = 22,

    // ---- Lifecycle pre-conditions ----
    /// Stream id has no record.
    StreamNotFound = 30,
    /// Caller is not the sender of the stream.
    NotSender = 31,
    /// Caller is not the recipient (NFT owner) or an approved spender.
    NotRecipient = 32,
    /// Stream is not cancelable (was renounced or created non-cancelable).
    NotCancelable = 33,
    /// Stream is not transferable.
    NotTransferable = 34,
    /// Stream has already been canceled.
    AlreadyCanceled = 35,
    /// Stream has already been depleted.
    AlreadyDepleted = 36,
    /// Stream is in a status that does not permit this op (e.g., burn before depleted).
    InvalidStatus = 37,

    // ---- Withdraw ----
    /// Requested withdraw amount > withdrawable.
    InsufficientWithdrawable = 50,
    /// Requested withdraw amount must be > 0.
    ZeroWithdraw = 51,

    // ---- Comptroller ----
    /// Caller is not the admin.
    NotAdmin = 70,
    /// Oracle price is stale (older than allowed window).
    OracleStale = 71,
    /// Oracle returned a non-positive price.
    InvalidOraclePrice = 72,
    /// Unknown operation enum value.
    UnknownOp = 73,

    // ---- Arithmetic ----
    /// Integer overflow during math.
    Overflow = 90,
}
