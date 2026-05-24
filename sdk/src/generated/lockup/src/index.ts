import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}
















export interface PriceSnapshot {
  price_x14: i128;
  ts_secs: u64;
}



export type DataKey = {tag: "Admin", values: void} | {tag: "Comptroller", values: void} | {tag: "NativeToken", values: void} | {tag: "NextStreamId", values: void} | {tag: "Stream", values: readonly [u32]};


export interface OwnerTokensKey {
  index: u32;
  owner: string;
}

/**
 * Storage keys for the data associated with the enumerable extension of
 * `NonFungibleToken`
 */
export type NFTEnumerableStorageKey = {tag: "TotalSupply", values: void} | {tag: "OwnerTokens", values: readonly [OwnerTokensKey]} | {tag: "OwnerTokensIndex", values: readonly [u32]} | {tag: "GlobalTokens", values: readonly [u32]} | {tag: "GlobalTokensIndex", values: readonly [u32]};


/**
 * Storage keys for the data associated with the consecutive extension of
 * `NonFungibleToken`
 */
export type NFTConsecutiveStorageKey = {tag: "Approval", values: readonly [u32]} | {tag: "Owner", values: readonly [u32]} | {tag: "OwnershipBucket", values: readonly [u32]} | {tag: "BurnedToken", values: readonly [u32]};






/**
 * Storage container for royalty information
 */
export interface RoyaltyInfo {
  basis_points: u32;
  receiver: string;
}

/**
 * Storage keys for royalty data
 */
export type NFTRoyaltiesStorageKey = {tag: "DefaultRoyalty", values: void} | {tag: "TokenRoyalty", values: readonly [u32]};





export const NonFungibleTokenError = {
  /**
   * Indicates a non-existent `token_id`.
   */
  200: {message:"NonExistentToken"},
  /**
   * Indicates an error related to the ownership over a particular token.
   * Used in transfers.
   */
  201: {message:"IncorrectOwner"},
  /**
   * Indicates a failure with the `operator`s approval. Used in transfers.
   */
  202: {message:"InsufficientApproval"},
  /**
   * Indicates a failure with the `approver` of a token to be approved. Used
   * in approvals.
   */
  203: {message:"InvalidApprover"},
  /**
   * Indicates an invalid value for `live_until_ledger` when setting
   * approvals.
   */
  204: {message:"InvalidLiveUntilLedger"},
  /**
   * Indicates overflow when adding two values
   */
  205: {message:"MathOverflow"},
  /**
   * Indicates all possible `token_id`s are already in use.
   */
  206: {message:"TokenIDsAreDepleted"},
  /**
   * Indicates an invalid amount to batch mint in `consecutive` extension.
   */
  207: {message:"InvalidAmount"},
  /**
   * Indicates the token does not exist in owner's list.
   */
  208: {message:"TokenNotFoundInOwnerList"},
  /**
   * Indicates the token does not exist in global list.
   */
  209: {message:"TokenNotFoundInGlobalList"},
  /**
   * Indicates access to unset metadata.
   */
  210: {message:"UnsetMetadata"},
  /**
   * Indicates the length of the base URI exceeds the maximum allowed.
   */
  211: {message:"BaseUriMaxLenExceeded"},
  /**
   * Indicates the royalty amount is higher than 10_000 (100%) basis points.
   */
  212: {message:"InvalidRoyaltyAmount"},
  /**
   * Indicates the length of the name exceeds the maximum allowed.
   */
  213: {message:"NameMaxLenExceeded"},
  /**
   * Indicates the length of the symbol exceeds the maximum allowed.
   */
  214: {message:"SymbolMaxLenExceeded"}
}

export type NFTSequentialStorageKey = {tag: "TokenIdCounter", values: void};




/**
 * Storage container for the token for which an approval is granted
 * and the ledger number at which this approval expires.
 */
export interface ApprovalData {
  approved: string;
  live_until_ledger: u32;
}

/**
 * Storage keys for the data associated with `NonFungibleToken`
 */
export type NFTStorageKey = {tag: "Owner", values: readonly [u32]} | {tag: "Balance", values: readonly [string]} | {tag: "Approval", values: readonly [u32]} | {tag: "ApprovalForAll", values: readonly [string, string]} | {tag: "Metadata", values: void};



/**
 * Hook types for modular compliance system.
 * 
 * Each hook type represents a specific event or validation point
 * where compliance modules can be executed.
 */
export type ComplianceHook = {tag: "Transferred", values: void} | {tag: "Created", values: void} | {tag: "Destroyed", values: void} | {tag: "CanTransfer", values: void} | {tag: "CanCreate", values: void};

export const ComplianceError = {
  /**
   * Indicates a module is already registered for this hook.
   */
  360: {message:"ModuleAlreadyRegistered"},
  /**
   * Indicates a module is not registered for this hook.
   */
  361: {message:"ModuleNotRegistered"},
  /**
   * Indicates a module bound is exceeded.
   */
  362: {message:"ModuleBoundExceeded"},
  /**
   * Indicates a token is not bound to this compliance contract.
   */
  363: {message:"TokenNotBound"}
}

/**
 * Error codes shared by all compliance modules.
 * 
 * Compliance module errors occupy the 390–400 range, following the RWA
 * error numbering convention.
 */
export const ComplianceModuleError = {
  /**
   * The compliance contract address has not been set.
   */
  390: {message:"ComplianceNotSet"},
  /**
   * An amount argument is negative when it must be non-negative.
   */
  391: {message:"InvalidAmount"},
  /**
   * Arithmetic overflow in a checked addition.
   */
  392: {message:"MathOverflow"},
  /**
   * Arithmetic underflow in a checked subtraction.
   */
  393: {message:"MathUnderflow"},
  /**
   * A required limit entry is missing for the given token.
   */
  394: {message:"MissingLimit"},
  /**
   * A required transfer counter entry is missing.
   */
  395: {message:"MissingCounter"},
  /**
   * A required country data entry is missing.
   */
  396: {message:"MissingCountry"},
  /**
   * The identity registry storage address has not been configured.
   */
  397: {message:"IdentityRegistryNotSet"},
  /**
   * A module is not registered on a required compliance hook.
   */
  398: {message:"MissingRequiredHook"},
  /**
   * The compliance contract address has already been set.
   */
  399: {message:"ComplianceAlreadySet"},
  /**
   * A token has reached the maximum number of configured limit entries.
   */
  400: {message:"TooManyLimits"}
}

export type ComplianceModuleStorageKey = {tag: "Compliance", values: void} | {tag: "HooksVerified", values: void} | {tag: "Registry", values: readonly [string]};

/**
 * Storage keys for the modular compliance contract.
 */
export type ComplianceDataKey = {tag: "HookModules", values: readonly [ComplianceHook]};

/**
 * Error codes for document management operations.
 */
export const DocumentError = {
  /**
   * The specified document was not found.
   */
  380: {message:"DocumentNotFound"},
  /**
   * Maximum number of documents has been reached.
   */
  381: {message:"MaxDocumentsReached"},
  /**
   * The URI exceeds the maximum allowed length.
   */
  382: {message:"UriTooLong"}
}




/**
 * Represents a document with its metadata.
 */
export interface Document {
  /**
 * The hash of the document contents.
 */
document_hash: Buffer;
  /**
 * Timestamp when the document was last modified.
 */
timestamp: u64;
  /**
 * The URI where the document can be accessed.
 */
uri: string;
}

/**
 * Storage keys for document management.
 */
export type DocumentStorageKey = {tag: "Index", values: readonly [Buffer]} | {tag: "Bucket", values: readonly [u32]} | {tag: "Count", values: void};






export const ClaimIssuerError = {
  /**
   * Signature data length does not match the expected scheme.
   */
  350: {message:"SigDataMismatch"},
  /**
   * The provided key is empty.
   */
  351: {message:"KeyIsEmpty"},
  /**
   * The key is already allowed for the specified topic.
   */
  352: {message:"KeyAlreadyAllowed"},
  /**
   * The specified key was not found in the allowed keys.
   */
  353: {message:"KeyNotFound"},
  /**
   * The claim issuer is not allowed to sign claims about the specified
   * claim topic.
   */
  354: {message:"NotAllowed"},
  /**
   * Maximum limit exceeded (keys per topic or registries per key).
   */
  355: {message:"LimitExceeded"},
  /**
   * No signing keys found for the specified claim topic.
   */
  356: {message:"NoKeysForTopic"},
  /**
   * Invalid claim data encoding.
   */
  357: {message:"InvalidClaimDataExpiration"},
  /**
   * Recovery of the Secp256k1 public key failed.
   */
  358: {message:"Secp256k1RecoveryFailed"},
  /**
   * Indicates overflow when adding two values.
   */
  359: {message:"MathOverflow"}
}



export interface SigningKey {
  public_key: Buffer;
  scheme: u32;
}


/**
 * Signature data for Ed25519 scheme.
 */
export interface Ed25519SignatureData {
  public_key: Buffer;
  signature: Buffer;
}

/**
 * Storage keys for claim issuer key management.
 */
export type ClaimIssuerStorageKey = {tag: "Topics", values: readonly [u32]} | {tag: "Pairs", values: readonly [SigningKey]} | {tag: "RevokedClaim", values: readonly [Buffer]} | {tag: "ClaimNonce", values: readonly [string, u32]};


/**
 * Signature data for Secp256k1 scheme.
 */
export interface Secp256k1SignatureData {
  public_key: Buffer;
  recovery_id: u32;
  signature: Buffer;
}


/**
 * Signature data for Secp256r1 scheme.
 */
export interface Secp256r1SignatureData {
  public_key: Buffer;
  signature: Buffer;
}


export const ClaimsError = {
  /**
   * Claim  ID does not exist.
   */
  340: {message:"ClaimNotFound"},
  /**
   * Claim Issuer cannot validate the claim (revocation, signature mismatch,
   * unauthorized signing key, etc.)
   */
  341: {message:"ClaimNotValid"}
}




/**
 * Represents a claim stored on-chain.
 */
export interface Claim {
  /**
 * The claim data
 */
data: Buffer;
  /**
 * The address of the claim issuer
 */
issuer: string;
  /**
 * The signature scheme used
 */
scheme: u32;
  /**
 * The cryptographic signature
 */
signature: Buffer;
  /**
 * The claim topic (numeric identifier)
 */
topic: u32;
  /**
 * Optional URI for additional information
 */
uri: string;
}

/**
 * Storage keys for the data associated with Identity Claims.
 */
export type ClaimsStorageKey = {tag: "Claim", values: readonly [Buffer]} | {tag: "ClaimsByTopic", values: readonly [u32]};






export const ClaimTopicsAndIssuersError = {
  /**
   * Indicates a non-existent claim topic.
   */
  370: {message:"ClaimTopicDoesNotExist"},
  /**
   * Indicates a non-existent trusted issuer.
   */
  371: {message:"IssuerDoesNotExist"},
  /**
   * Indicates a claim topic already exists.
   */
  372: {message:"ClaimTopicAlreadyExists"},
  /**
   * Indicates a trusted issuer already exists.
   */
  373: {message:"IssuerAlreadyExists"},
  /**
   * Indicates max claim topics limit is reached.
   */
  374: {message:"MaxClaimTopicsLimitReached"},
  /**
   * Indicates max trusted issuers limit is reached.
   */
  375: {message:"MaxIssuersLimitReached"},
  /**
   * Indicates claim topics set provided for the issuer cannot be empty.
   */
  376: {message:"ClaimTopicsSetCannotBeEmpty"}
}

/**
 * Storage keys for the data associated with the claim topics and issuers
 * extension
 */
export type ClaimTopicsAndIssuersStorageKey = {tag: "ClaimTopics", values: void} | {tag: "TrustedIssuers", values: void} | {tag: "IssuerClaimTopics", values: readonly [string]} | {tag: "ClaimTopicIssuers", values: readonly [u32]};

/**
 * Error codes for the Identity Registry Storage system.
 */
export const IRSError = {
  /**
   * An identity already exists for the given account.
   */
  320: {message:"IdentityOverwrite"},
  /**
   * No identity found for the given account.
   */
  321: {message:"IdentityNotFound"},
  /**
   * Country data not found at the specified index.
   */
  322: {message:"CountryDataNotFound"},
  /**
   * Identity can't be with empty country data list.
   */
  323: {message:"EmptyCountryList"},
  /**
   * The maximum number of country entries has been reached.
   */
  324: {message:"MaxCountryEntriesReached"},
  /**
   * Account has been recovered and cannot be used.
   */
  325: {message:"AccountRecovered"},
  /**
   * Metadata has too many entries (exceeds MAX_METADATA_ENTRIES).
   */
  326: {message:"MetadataTooManyEntries"},
  /**
   * Metadata string value is too long (exceeds MAX_METADATA_STRING_LEN).
   */
  327: {message:"MetadataStringTooLong"}
}









/**
 * A country data containing the country relationship and optional metadata
 */
export interface CountryData {
  /**
 * Type of country relationship
 */
country: CountryRelation;
  /**
 * Optional metadata (e.g., visa type, validity period)
 */
metadata: Option<Map<string, string>>;
}

/**
 * Represents the type of identity holder
 */
export type IdentityType = {tag: "Individual", values: void} | {tag: "Organization", values: void};

/**
 * Storage keys for the data associated with Identity Storage Registry.
 */
export type IRSStorageKey = {tag: "Identity", values: readonly [string]} | {tag: "IdentityProfile", values: readonly [string]} | {tag: "RecoveredTo", values: readonly [string]};

/**
 * Unified country relationship that can be either individual or organizational
 */
export type CountryRelation = {tag: "Individual", values: readonly [IndividualCountryRelation]} | {tag: "Organization", values: readonly [OrganizationCountryRelation]};


/**
 * Complete identity profile containing identity type and country data
 */
export interface IdentityProfile {
  countries: Array<CountryData>;
  identity_type: IdentityType;
}

/**
 * Represents different types of country relationships for individuals
 * ISO 3166-1 numeric country code
 */
export type IndividualCountryRelation = {tag: "Residence", values: readonly [u32]} | {tag: "Citizenship", values: readonly [u32]} | {tag: "SourceOfFunds", values: readonly [u32]} | {tag: "TaxResidency", values: readonly [u32]} | {tag: "Custom", values: readonly [string, u32]};

/**
 * Represents different types of country relationships for organizations
 */
export type OrganizationCountryRelation = {tag: "Incorporation", values: readonly [u32]} | {tag: "OperatingJurisdiction", values: readonly [u32]} | {tag: "TaxJurisdiction", values: readonly [u32]} | {tag: "SourceOfFunds", values: readonly [u32]} | {tag: "Custom", values: readonly [string, u32]};

/**
 * Storage keys for the data associated with `RWA` token
 */
export type IdentityVerifierStorageKey = {tag: "ClaimTopicsAndIssuers", values: void} | {tag: "IdentityRegistryStorage", values: void};

export const RWAError = {
  /**
   * Indicates an error related to insufficient balance for the operation.
   */
  300: {message:"InsufficientBalance"},
  /**
   * Indicates an error when an input must be >= 0.
   */
  301: {message:"LessThanZero"},
  /**
   * Indicates the address is frozen and cannot perform operations.
   */
  302: {message:"AddressFrozen"},
  /**
   * Indicates insufficient free tokens (due to partial freezing).
   */
  303: {message:"InsufficientFreeTokens"},
  /**
   * Indicates an identity cannot be verified.
   */
  304: {message:"IdentityVerificationFailed"},
  /**
   * Indicates the transfer does not comply with the compliance rules.
   */
  305: {message:"TransferNotCompliant"},
  /**
   * Indicates the mint operation does not comply with the compliance rules.
   */
  306: {message:"MintNotCompliant"},
  /**
   * Indicates the compliance contract is not set.
   */
  307: {message:"ComplianceNotSet"},
  /**
   * Indicates the onchain ID is not set.
   */
  308: {message:"OnchainIdNotSet"},
  /**
   * Indicates the version is not set.
   */
  309: {message:"VersionNotSet"},
  /**
   * Indicates the claim topics and issuers contract is not set.
   */
  310: {message:"ClaimTopicsAndIssuersNotSet"},
  /**
   * Indicates the identity registry storage contract is not set.
   */
  311: {message:"IdentityRegistryStorageNotSet"},
  /**
   * Indicates the identity verifier contract is not set.
   */
  312: {message:"IdentityVerifierNotSet"},
  /**
   * Indicates the old account and new account have different identities.
   */
  313: {message:"IdentityMismatch"}
}











/**
 * Error codes for the Token Binder system.
 */
export const TokenBinderError = {
  /**
   * The specified token was not found in the bound tokens list.
   */
  330: {message:"TokenNotFound"},
  /**
   * Attempted to bind a token that is already bound.
   */
  331: {message:"TokenAlreadyBound"},
  /**
   * Total token capacity (MAX_TOKENS) has been reached.
   */
  332: {message:"MaxTokensReached"},
  /**
   * Batch bind size exceeded.
   */
  333: {message:"BindBatchTooLarge"},
  /**
   * The batch contains duplicates.
   */
  334: {message:"BindBatchDuplicates"}
}

/**
 * Storage keys for the token binder system.
 * 
 * - Tokens are stored in buckets of 100 addresses each
 * - Each bucket is a `Vec<Address>` stored under its bucket index
 * - Total count is tracked separately
 * - When a token is unbound, the last token is moved to fill the gap
 * (swap-remove pattern)
 */
export type TokenBinderStorageKey = {tag: "TokenBucket", values: readonly [u32]} | {tag: "TotalCount", values: void};

/**
 * Storage keys for the data associated with `RWA` token
 */
export type RWAStorageKey = {tag: "AddressFrozen", values: readonly [string]} | {tag: "FrozenTokens", values: readonly [string]} | {tag: "Compliance", values: void} | {tag: "OnchainId", values: void} | {tag: "Version", values: void} | {tag: "IdentityVerifier", values: void};



export const VaultTokenError = {
  /**
   * Indicates access to uninitialized vault asset address.
   */
  400: {message:"VaultAssetAddressNotSet"},
  /**
   * Indicates that vault asset address is already set.
   */
  401: {message:"VaultAssetAddressAlreadySet"},
  /**
   * Indicates that vault virtual decimals offset is already set.
   */
  402: {message:"VaultVirtualDecimalsOffsetAlreadySet"},
  /**
   * Indicates the amount is not a valid vault assets value.
   */
  403: {message:"VaultInvalidAssetsAmount"},
  /**
   * Indicates the amount is not a valid vault shares value.
   */
  404: {message:"VaultInvalidSharesAmount"},
  /**
   * Attempted to deposit more assets than the max amount for address.
   */
  405: {message:"VaultExceededMaxDeposit"},
  /**
   * Attempted to mint more shares than the max amount for address.
   */
  406: {message:"VaultExceededMaxMint"},
  /**
   * Attempted to withdraw more assets than the max amount for address.
   */
  407: {message:"VaultExceededMaxWithdraw"},
  /**
   * Attempted to redeem more shares than the max amount for address.
   */
  408: {message:"VaultExceededMaxRedeem"},
  /**
   * Maximum number of decimals offset exceeded
   */
  409: {message:"VaultMaxDecimalsOffsetExceeded"},
  /**
   * Indicates overflow due to mathematical operations
   */
  410: {message:"MathOverflow"}
}

/**
 * Storage keys for the data associated with the vault extension
 */
export type VaultStorageKey = {tag: "AssetAddress", values: void} | {tag: "VirtualDecimalsOffset", values: void};

/**
 * Storage key for the cap value
 */
export type CapStorageKey = {tag: "Cap", values: void};




/**
 * Storage keys for the data associated with the allowlist extension
 */
export type AllowListStorageKey = {tag: "Allowed", values: readonly [string]};



/**
 * Storage keys for the data associated with the blocklist extension
 */
export type BlockListStorageKey = {tag: "Blocked", values: readonly [string]};





export const FungibleTokenError = {
  /**
   * Indicates an error related to the current balance of account from which
   * tokens are expected to be transferred.
   */
  100: {message:"InsufficientBalance"},
  /**
   * Indicates a failure with the allowance mechanism when a given spender
   * doesn't have enough allowance.
   */
  101: {message:"InsufficientAllowance"},
  /**
   * Indicates an invalid value for `live_until_ledger` when setting an
   * allowance.
   */
  102: {message:"InvalidLiveUntilLedger"},
  /**
   * Indicates an error when an input that must be >= 0
   */
  103: {message:"LessThanZero"},
  /**
   * Indicates overflow when adding two values
   */
  104: {message:"MathOverflow"},
  /**
   * Indicates access to uninitialized metadata
   */
  105: {message:"UnsetMetadata"},
  /**
   * Indicates that the operation would have caused `total_supply` to exceed
   * the `cap`.
   */
  106: {message:"ExceededCap"},
  /**
   * Indicates the supplied `cap` is not a valid cap value.
   */
  107: {message:"InvalidCap"},
  /**
   * Indicates the Cap was not set.
   */
  108: {message:"CapNotSet"},
  /**
   * Indicates the SAC address was not set.
   */
  109: {message:"SACNotSet"},
  /**
   * Indicates a SAC address different than expected.
   */
  110: {message:"SACAddressMismatch"},
  /**
   * Indicates a missing function parameter in the SAC contract context.
   */
  111: {message:"SACMissingFnParam"},
  /**
   * Indicates an invalid function parameter in the SAC contract context.
   */
  112: {message:"SACInvalidFnParam"},
  /**
   * The user is not allowed to perform this operation
   */
  113: {message:"UserNotAllowed"},
  /**
   * The user is blocked and cannot perform this operation
   */
  114: {message:"UserBlocked"}
}

/**
 * Storage key for accessing the SAC address
 */
export type SACAdminGenericDataKey = {tag: "Sac", values: void};

/**
 * Storage key for accessing the SAC address
 */
export type SACAdminWrapperDataKey = {tag: "Sac", values: void};


/**
 * Storage container for token metadata
 */
export interface Metadata {
  decimals: u32;
  name: string;
  symbol: string;
}


/**
 * Storage key that maps to [`AllowanceData`]
 */
export interface AllowanceKey {
  owner: string;
  spender: string;
}


/**
 * Storage container for the amount of tokens for which an allowance is granted
 * and the ledger number at which this allowance expires.
 */
export interface AllowanceData {
  amount: i128;
  live_until_ledger: u32;
}

/**
 * Storage keys for the data associated with `FungibleToken`
 */
export type FungibleStorageKey = {tag: "Meta", values: void} | {tag: "TotalSupply", values: void} | {tag: "Balance", values: readonly [string]} | {tag: "Allowance", values: readonly [AllowanceKey]};

export type UpgradeableStorageKey = {tag: "SchemaVersion", values: void};



export const MerkleDistributorError = {
  /**
   * The merkle root is not set.
   */
  1300: {message:"RootNotSet"},
  /**
   * The provided index was already claimed.
   */
  1301: {message:"IndexAlreadyClaimed"},
  /**
   * The proof is invalid.
   */
  1302: {message:"InvalidProof"}
}

/**
 * Storage keys for the data associated with `MerkleDistributor`
 */
export type MerkleDistributorStorageKey = {tag: "Root", values: void} | {tag: "Claimed", values: readonly [u32]};

/**
 * Rounding direction for division operations
 */
export type Rounding = {tag: "Floor", values: void} | {tag: "Ceil", values: void} | {tag: "Truncate", values: void};

export const SorobanFixedPointError = {
  /**
   * Arithmetic overflow occurred
   */
  1500: {message:"Overflow"},
  /**
   * Division by zero
   */
  1501: {message:"DivisionByZero"}
}

export const CryptoError = {
  /**
   * The merkle proof length is out of bounds.
   */
  1400: {message:"MerkleProofOutOfBounds"},
  /**
   * The index of the leaf is out of bounds.
   */
  1401: {message:"MerkleIndexOutOfBounds"},
  /**
   * No data in hasher state.
   */
  1402: {message:"HasherEmptyState"}
}



export const PausableError = {
  /**
   * The operation failed because the contract is paused.
   */
  1000: {message:"EnforcedPause"},
  /**
   * The operation failed because the contract is not paused.
   */
  1001: {message:"ExpectedPause"}
}

/**
 * Storage key for the pausable state
 */
export type PausableStorageKey = {tag: "Paused", values: void};

/**
 * Errors that can occur in votes operations.
 */
export const VotesError = {
  /**
   * The ledger is in the future
   */
  4100: {message:"FutureLookup"},
  /**
   * Arithmetic overflow occurred
   */
  4101: {message:"MathOverflow"},
  /**
   * Attempting to transfer more voting units than available
   */
  4102: {message:"InsufficientVotingUnits"},
  /**
   * Attempting to delegate to the same delegate that is already set
   */
  4103: {message:"SameDelegate"},
  /**
   * A checkpoint that was expected to exist was not found in storage
   */
  4104: {message:"CheckpointNotFound"}
}




/**
 * A checkpoint recording voting power at a specific ledger sequence number.
 */
export interface Checkpoint {
  /**
 * The ledger sequence number when this checkpoint was created
 */
ledger: u32;
  /**
 * The voting power at this ledger sequence number
 */
votes: u128;
}

/**
 * Selects the checkpoint timeline to operate on.
 * 
 * Each variant maps to a different set of storage keys so that
 * per-account voting-power history and aggregate total supply history
 * are kept separate.
 */
export type CheckpointType = {tag: "TotalSupply", values: void} | {tag: "Account", values: readonly [string]};

/**
 * Storage keys for the votes module.
 * 
 * Only delegated voting power counts as votes (i.e., only delegatees can
 * vote), so the storage design tracks delegates and their checkpointed
 * voting power separately from the raw voting units held by each account.
 */
export type VotesStorageKey = {tag: "Delegatee", values: readonly [string]} | {tag: "NumCheckpoints", values: readonly [string]} | {tag: "DelegateCheckpoint", values: readonly [string, u32]} | {tag: "NumTotalSupplyCheckpoints", values: void} | {tag: "TotalSupplyCheckpoint", values: readonly [u32]} | {tag: "VotingUnits", values: readonly [string]};


/**
 * Errors that can occur in governor operations.
 */
export const GovernorError = {
  /**
   * The proposal was not found.
   */
  5000: {message:"ProposalNotFound"},
  /**
   * The proposal already exists.
   */
  5001: {message:"ProposalAlreadyExists"},
  /**
   * The proposer does not have enough voting power.
   */
  5002: {message:"InsufficientProposerVotes"},
  /**
   * The proposal contains no actions.
   */
  5003: {message:"EmptyProposal"},
  /**
   * The targets, functions, and args vectors have different lengths.
   */
  5004: {message:"InvalidProposalLength"},
  /**
   * The proposal is not in the active state.
   */
  5005: {message:"ProposalNotActive"},
  /**
   * The proposal has not succeeded.
   */
  5006: {message:"ProposalNotSuccessful"},
  /**
   * The proposal has not been queued.
   */
  5007: {message:"ProposalNotQueued"},
  /**
   * The proposal has already been executed.
   */
  5008: {message:"ProposalAlreadyExecuted"},
  /**
   * The proposal is in a non-cancellable state (`Canceled`, `Expired`, or
   * `Executed`).
   */
  5009: {message:"ProposalNotCancellable"},
  /**
   * The voting delay has not been set.
   */
  5010: {message:"VotingDelayNotSet"},
  /**
   * The voting period has not been set.
   */
  5011: {message:"VotingPeriodNotSet"},
  /**
   * The proposal threshold has not been set.
   */
  5012: {message:"ProposalThresholdNotSet"},
  /**
   * The name has not been set.
   */
  5013: {message:"NameNotSet"},
  /**
   * The version has not been set.
   */
  5014: {message:"VersionNotSet"},
  /**
   * Arithmetic overflow occurred.
   */
  5015: {message:"MathOverflow"},
  /**
   * The account has already voted on this proposal.
   */
  5016: {message:"AlreadyVoted"},
  /**
   * The vote type is invalid (must be 0, 1, or 2).
   */
  5017: {message:"InvalidVoteType"},
  /**
   * The quorum has not been set.
   */
  5018: {message:"QuorumNotSet"},
  /**
   * The token contract has already been set (can only be initialized once).
   */
  5019: {message:"TokenContractAlreadySet"},
  /**
   * The token contract has not been set.
   */
  5020: {message:"TokenContractNotSet"},
  /**
   * The proposal description exceeds the maximum allowed length.
   */
  5021: {message:"DescriptionTooLong"},
  /**
   * Queuing is not enabled for this governor.
   */
  5022: {message:"QueueNotEnabled"}
}

/**
 * The state of a proposal in its lifecycle.
 * 
 * States are divided into two categories:
 * 
 * ## Time-based states (derived, never stored explicitly)
 * 
 * These are computed by [`get_proposal_state()`] from the current ledger
 * relative to the proposal's voting schedule. They are only returned when
 * no explicit state has been set.
 * 
 * - [`Pending`](ProposalState::Pending) — voting has not started yet.
 * - [`Active`](ProposalState::Active) — voting is ongoing.
 * - [`Defeated`](ProposalState::Defeated) — voting ended **without** the
 * counting logic marking the proposal as `Succeeded`.
 * 
 * ## Explicit states
 * 
 * Set explicitly by the Governor or its extensions and persisted in
 * storage. Once set, they take precedence over any time-based derivation.
 * 
 * - [`Canceled`](ProposalState::Canceled) — set by the Governor.
 * - [`Succeeded`](ProposalState::Succeeded) — set by the counting logic.
 * - [`Queued`](ProposalState::Queued) / [`Expired`](ProposalState::Expired) —
 * set by extensions like `TimelockControl`.
 * - [`Executed`](ProposalState::Execu
 */
export enum ProposalState {
  Pending = 0,
  Active = 1,
  Defeated = 2,
  Canceled = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}







/**
 * Core proposal data stored on-chain.
 */
export interface ProposalCore {
  /**
 * The address that created the proposal.
 */
proposer: string;
  /**
 * The current state of the proposal.
 */
state: ProposalState;
  /**
 * The last ledger where voting is active (inclusive).
 */
vote_end: u32;
  /**
 * The ledger at which voting power is snapshotted. Voting opens on
 * the next ledger (`vote_snapshot + 1`).
 */
vote_snapshot: u32;
}


/**
 * A quorum checkpoint recording the quorum value at a specific ledger.
 */
export interface QuorumCheckpoint {
  /**
 * The ledger at which this quorum value took effect.
 */
ledger: u32;
  /**
 * The quorum value.
 */
quorum: u128;
}

/**
 * Storage keys for the Governor contract.
 */
export type GovernorStorageKey = {tag: "Name", values: void} | {tag: "Version", values: void} | {tag: "VotingDelay", values: void} | {tag: "VotingPeriod", values: void} | {tag: "ProposalThreshold", values: void} | {tag: "Proposal", values: readonly [Buffer]} | {tag: "NumQuorumCheckpoints", values: void} | {tag: "QuorumCheckpoint", values: readonly [u32]} | {tag: "ProposalVote", values: readonly [Buffer]} | {tag: "HasVoted", values: readonly [Buffer, string]} | {tag: "TokenContract", values: void};


/**
 * Vote tallies for a proposal.
 */
export interface ProposalVoteCounts {
  /**
 * Total voting power cast as abstain.
 */
abstain_votes: u128;
  /**
 * Total voting power cast against the proposal.
 */
against_votes: u128;
  /**
 * Total voting power cast in favor of the proposal.
 */
for_votes: u128;
}

/**
 * Errors that can occur in timelock operations.
 */
export const TimelockError = {
  /**
   * The operation is already scheduled
   */
  4000: {message:"OperationAlreadyScheduled"},
  /**
   * The delay is less than the minimum required delay
   */
  4001: {message:"InsufficientDelay"},
  /**
   * The operation is not in the expected state
   */
  4002: {message:"InvalidOperationState"},
  /**
   * A predecessor operation has not been executed yet
   */
  4003: {message:"UnexecutedPredecessor"},
  /**
   * The caller is not authorized to perform this action
   */
  4004: {message:"Unauthorized"},
  /**
   * The minimum delay has not been set
   */
  4005: {message:"MinDelayNotSet"},
  /**
   * The operation has not been scheduled
   */
  4006: {message:"OperationNotScheduled"}
}






/**
 * Represents a operation to be executed by the timelock.
 * 
 * An operation encapsulates all the information needed to invoke a function
 * on a target contract after the timelock delay has passed.
 */
export interface Operation {
  /**
 * The serialized arguments to pass to the function
 */
args: Array<any>;
  /**
 * The function name to invoke on the target contract
 */
function: string;
  /**
 * Hash of a predecessor operation that must be executed first.
 * Use BytesN::<32>::from_array(&[0u8; 32]) for no predecessor.
 */
predecessor: Buffer;
  /**
 * A salt value for operation uniqueness.
 * Allows scheduling the same operation multiple times with different IDs.
 */
salt: Buffer;
  /**
 * The contract address to call
 */
target: string;
}

/**
 * The state of an operation in the timelock system.
 */
export type OperationState = {tag: "Unset", values: void} | {tag: "Waiting", values: void} | {tag: "Ready", values: void} | {tag: "Done", values: void};

/**
 * Storage keys for the timelock module.
 */
export type TimelockStorageKey = {tag: "MinDelay", values: void} | {tag: "OperationLedger", values: readonly [Buffer]};

export type OpKind = {tag: "Withdraw", values: void};


export interface Stream {
  deposited: i128;
  end_ts: u64;
  is_cancelable: boolean;
  is_depleted: boolean;
  is_transferable: boolean;
  recipient: string;
  refunded: i128;
  sender: string;
  shape: StreamShape;
  start_ts: u64;
  token: string;
  was_canceled: boolean;
  withdrawn: i128;
}


export interface Tranche {
  amount: i128;
  ts: u64;
}


export interface LinearShape {
  cliff_ts: u64;
  unlock_at_cliff: i128;
  unlock_at_start: i128;
}

export type StreamShape = {tag: "Linear", values: readonly [LinearShape]} | {tag: "Tranched", values: readonly [TranchedShape]};

export type StreamStatus = {tag: "Pending", values: void} | {tag: "Streaming", values: void} | {tag: "Settled", values: void} | {tag: "Canceled", values: void} | {tag: "Depleted", values: void};


export interface TranchedShape {
  tranches: Array<Tranche>;
}

export const Errors = {
  /**
   * Invalid call — generic catch-all (avoid in new code; prefer a specific variant).
   */
  1: {message:"InvalidCall"},
  /**
   * Deposit must be > 0.
   */
  10: {message:"ZeroDeposit"},
  /**
   * `start_ts` must be < `end_ts`.
   */
  11: {message:"StartAfterEnd"},
  /**
   * `cliff_ts` must be in [`start_ts`, `end_ts`].
   */
  12: {message:"CliffOutOfRange"},
  /**
   * `unlock_at_start + unlock_at_cliff` must be ≤ `deposited`.
   */
  13: {message:"UnlocksExceedDeposit"},
  /**
   * At least one tranche required.
   */
  14: {message:"NoTranches"},
  /**
   * Tranches must be strictly ascending by `ts`.
   */
  15: {message:"TranchesNotAscending"},
  /**
   * Sum of tranche amounts must equal `deposited`.
   */
  16: {message:"TrancheSumMismatch"},
  /**
   * Tranche count exceeds `MAX_TRANCHES`.
   */
  17: {message:"TooManyTranches"},
  /**
   * `start_ts` (or first tranche ts) must be ≥ current ledger time.
   */
  18: {message:"StartInPast"},
  /**
   * Stream id has no record.
   */
  30: {message:"StreamNotFound"},
  /**
   * Caller is not the sender of the stream.
   */
  31: {message:"NotSender"},
  /**
   * Caller is not the recipient (NFT owner) or an approved spender.
   */
  32: {message:"NotRecipient"},
  /**
   * Stream is not cancelable (was renounced or created non-cancelable).
   */
  33: {message:"NotCancelable"},
  /**
   * Stream is not transferable.
   */
  34: {message:"NotTransferable"},
  /**
   * Stream has already been canceled.
   */
  35: {message:"AlreadyCanceled"},
  /**
   * Stream has already been depleted.
   */
  36: {message:"AlreadyDepleted"},
  /**
   * Stream is in a status that does not permit this op (e.g., burn before depleted).
   */
  37: {message:"InvalidStatus"},
  /**
   * Requested withdraw amount > withdrawable.
   */
  50: {message:"InsufficientWithdrawable"},
  /**
   * Requested withdraw amount must be > 0.
   */
  51: {message:"ZeroWithdraw"},
  /**
   * Caller is not the admin.
   */
  70: {message:"NotAdmin"},
  /**
   * Oracle price is stale (older than allowed window).
   */
  71: {message:"OracleStale"},
  /**
   * Oracle returned a non-positive price.
   */
  72: {message:"InvalidOraclePrice"},
  /**
   * Unknown operation enum value.
   */
  73: {message:"UnknownOp"},
  /**
   * Integer overflow during math.
   */
  90: {message:"Overflow"}
}

export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, comptroller, native_token}: {admin: string, comptroller: string, native_token: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, comptroller, native_token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAGQAAAAAAAAALSW52YWxpZENhbGwAAAAAAQAAAAAAAAALWmVyb0RlcG9zaXQAAAAACgAAAAAAAAANU3RhcnRBZnRlckVuZAAAAAAAAAsAAAAAAAAAD0NsaWZmT3V0T2ZSYW5nZQAAAAAMAAAAAAAAABRVbmxvY2tzRXhjZWVkRGVwb3NpdAAAAA0AAAAAAAAACk5vVHJhbmNoZXMAAAAAAA4AAAAAAAAAFFRyYW5jaGVzTm90QXNjZW5kaW5nAAAADwAAAAAAAAASVHJhbmNoZVN1bU1pc21hdGNoAAAAAAAQAAAAAAAAAA9Ub29NYW55VHJhbmNoZXMAAAAAEQAAAAAAAAALU3RhcnRJblBhc3QAAAAAEgAAAAAAAAAOU3RyZWFtTm90Rm91bmQAAAAAAB4AAAAAAAAACU5vdFNlbmRlcgAAAAAAAB8AAAAAAAAADE5vdFJlY2lwaWVudAAAACAAAAAAAAAADU5vdENhbmNlbGFibGUAAAAAAAAhAAAAAAAAAA9Ob3RUcmFuc2ZlcmFibGUAAAAAIgAAAAAAAAAPQWxyZWFkeUNhbmNlbGVkAAAAACMAAAAAAAAAD0FscmVhZHlEZXBsZXRlZAAAAAAkAAAAAAAAAA1JbnZhbGlkU3RhdHVzAAAAAAAAJQAAAAAAAAAYSW5zdWZmaWNpZW50V2l0aGRyYXdhYmxlAAAAMgAAAAAAAAAMWmVyb1dpdGhkcmF3AAAAMwAAAAAAAAAITm90QWRtaW4AAABGAAAAAAAAAAtPcmFjbGVTdGFsZQAAAABHAAAAAAAAABJJbnZhbGlkT3JhY2xlUHJpY2UAAAAAAEgAAAAAAAAACVVua25vd25PcAAAAAAAAEkAAAAAAAAACE92ZXJmbG93AAAAWg==",
        "AAAAAgAAAAAAAAAAAAAABk9wS2luZAAAAAAAAQAAAAAAAAAAAAAACFdpdGhkcmF3",
        "AAAAAQAAAAAAAAAAAAAABlN0cmVhbQAAAAAADQAAAAAAAAAJZGVwb3NpdGVkAAAAAAAACwAAAAAAAAAGZW5kX3RzAAAAAAAGAAAAAAAAAA1pc19jYW5jZWxhYmxlAAAAAAAAAQAAAAAAAAALaXNfZGVwbGV0ZWQAAAAAAQAAAAAAAAAPaXNfdHJhbnNmZXJhYmxlAAAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACHJlZnVuZGVkAAAACwAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAVzaGFwZQAAAAAAB9AAAAALU3RyZWFtU2hhcGUAAAAAAAAAAAhzdGFydF90cwAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAMd2FzX2NhbmNlbGVkAAAAAQAAAAAAAAAJd2l0aGRyYXduAAAAAAAACw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMRmVlQ29sbGVjdG9yAAAAAQAAAAAAAAAMRmVlVXNkTWljcm9zAAAAAQAAAAQAAAAAAAAAAAAAAAZPcmFjbGUAAAAAAAAAAAAAAAAAEk9yYWNsZU1heFN0YWxlbmVzcwAA",
        "AAAAAQAAAAAAAAAAAAAAB1RyYW5jaGUAAAAAAgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAJ0cwAAAAAABg==",
        "AAAAAQAAAAAAAAAAAAAAC0xpbmVhclNoYXBlAAAAAAMAAAAAAAAACGNsaWZmX3RzAAAABgAAAAAAAAAPdW5sb2NrX2F0X2NsaWZmAAAAAAsAAAAAAAAAD3VubG9ja19hdF9zdGFydAAAAAAL",
        "AAAAAgAAAAAAAAAAAAAAC1N0cmVhbVNoYXBlAAAAAAIAAAABAAAAAAAAAAZMaW5lYXIAAAAAAAEAAAfQAAAAC0xpbmVhclNoYXBlAAAAAAEAAAAAAAAACFRyYW5jaGVkAAAAAQAAB9AAAAANVHJhbmNoZWRTaGFwZQAAAA==",
        "AAAAAgAAAAAAAAAAAAAADFN0cmVhbVN0YXR1cwAAAAUAAAAAAAAAAAAAAAdQZW5kaW5nAAAAAAAAAAAAAAAACVN0cmVhbWluZwAAAAAAAAAAAAAAAAAAB1NldHRsZWQAAAAAAAAAAAAAAAAIQ2FuY2VsZWQAAAAAAAAAAAAAAAhEZXBsZXRlZA==",
        "AAAAAQAAAAAAAAAAAAAADVByaWNlU25hcHNob3QAAAAAAAACAAAAAAAAAAlwcmljZV94MTQAAAAAAAALAAAAAAAAAAd0c19zZWNzAAAAAAY=",
        "AAAAAQAAAAAAAAAAAAAADVRyYW5jaGVkU2hhcGUAAAAAAAABAAAAAAAAAAh0cmFuY2hlcwAAA+oAAAfQAAAAB1RyYW5jaGUA",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAALQ29tcHRyb2xsZXIAAAAAAAAAAAAAAAALTmF0aXZlVG9rZW4AAAAAAAAAAAAAAAAMTmV4dFN0cmVhbUlkAAAAAQAAAAAAAAAGU3RyZWFtAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAKZ2V0X3N0cmVhbQAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABAAAAAEAAAfQAAAABlN0cmVhbQAA",
        "AAAAAAAAAAAAAAALY29tcHRyb2xsZXIAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAALY29tcHRyb2xsZXIAAAAAEwAAAAAAAAAMbmF0aXZlX3Rva2VuAAAAEwAAAAA=",
        "AAAAAAAAAFtSZXR1cm5zIHRoZSB0b2tlbiBjb2xsZWN0aW9uIG5hbWUuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuAAAAAARuYW1lAAAAAAAAAAEAAAAQ",
        "AAAAAAAAAF1SZXR1cm5zIHRoZSB0b2tlbiBjb2xsZWN0aW9uIHN5bWJvbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAAAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAABABHaXZlcyBwZXJtaXNzaW9uIHRvIGBhcHByb3ZlZGAgdG8gdHJhbnNmZXIgdGhlIHRva2VuIHdpdGggYHRva2VuX2lkYCB0bwphbm90aGVyIGFjY291bnQuIFRoZSBhcHByb3ZhbCBpcyBjbGVhcmVkIHdoZW4gdGhlIHRva2VuIGlzCnRyYW5zZmVycmVkLgoKT25seSBhIHNpbmdsZSBhY2NvdW50IGNhbiBiZSBhcHByb3ZlZCBhdCBhIHRpbWUgZm9yIGEgYHRva2VuX2lkYC4KVG8gcmVtb3ZlIGFuIGFwcHJvdmFsLCB0aGUgYXBwcm92ZXIgY2FuIGFwcHJvdmUgdGhlaXIgb3duIGFkZHJlc3MsCmVmZmVjdGl2ZWx5IHJlbW92aW5nIHRoZSBwcmV2aW91cyBhcHByb3ZlZCBhZGRyZXNzLiBBbHRlcm5hdGl2ZWx5LApzZXR0aW5nIHRoZSBgbGl2ZV91bnRpbF9sZWRnZXJgIHRvIGAwYCB3aWxsIGFsc28gcmV2b2tlIHRoZSBhcHByb3ZhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhcHByb3ZlcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgYXBwcm92ZXIgKHNob3VsZCBiZSBgb3duZXJgIG9yCmBvcGVyYXRvcmApLgoqIGBhcHByb3ZlZGAgLSBUaGUgYWRkcmVzcyByZWNlaXZpbmcgdGhlIGFwcHJvdmFsLgoqIGB0b2tlbl9pZGAgLSBUb2tlbiBJRCBhcyBhIG51bWJlci4KKiBgbGl2ZV91bnRpbF9sZWRnZXJgIC0gVGhlIGxlZGdlciBudW1iZXIgYXQgd2hpY2ggdGhlIGFsbG93YW5jZQpleHBpcmVzLiBJZiBgbGl2ZV91bnRpbF9sZWRnZXJgIGlzIGAwYCwgdGhlIGFwcHJvdmFsIGlzIHJldm9rZWQuCgojIEVycm9ycwoKKiBbYE5vbkZ1bmdpYmxlVG9rZW5FcnJvcjo6Tm9uRXhpc3RlbnRUb2tlbmBdIC0gSWYgdGhlIHRva2VuIGRvZXMgbm90CmV4aXN0LgoqIFtgTm9uRnVuZ2libGVUb2tlbkVycm9yOjpJbnZhbGlkQXBwcm92ZXJgXSAtIElmIHRoZSBvd25lciBhZGRyZXNzIGlzCm5vdCB0aGUgYWN0dWFsIG93bmVyIG9mIHRoZSB0b2tlbi4KKiBbYE5vbkZ1bmdpYmxlVG9rZW5FcnJvcjo6SW52YWxpZExpdmVVbnRpbExlZGdlcmBdIC0gSWYgdGhlIGxlZGdlAAAAB2FwcHJvdmUAAAAABAAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAAAAAAhhcHByb3ZlZAAAABMAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAA==",
        "AAAAAAAAAKtSZXR1cm5zIHRoZSBudW1iZXIgb2YgdG9rZW5zIG93bmVkIGJ5IGBhY2NvdW50YC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgYWNjb3VudGAgLSBUaGUgYWRkcmVzcyBmb3Igd2hpY2ggdGhlIGJhbGFuY2UgaXMgYmVpbmcgcXVlcmllZC4AAAAAB2JhbGFuY2UAAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAQ=",
        "AAAAAAAAAOVSZXR1cm5zIHRoZSBvd25lciBvZiB0aGUgdG9rZW4gd2l0aCBgdG9rZW5faWRgLgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGB0b2tlbl9pZGAgLSBUb2tlbiBJRCBhcyBhIG51bWJlci4KCiMgRXJyb3JzCgoqIFtgTm9uRnVuZ2libGVUb2tlbkVycm9yOjpOb25FeGlzdGVudFRva2VuYF0gLSBJZiB0aGUgdG9rZW4gZG9lcyBub3QKZXhpc3QuAAAAAAAACG93bmVyX29mAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAACHRva2VuX2lkAAAABAAAAAA=",
        "AAAAAAAAAPVSZXR1cm5zIHRoZSBVbmlmb3JtIFJlc291cmNlIElkZW50aWZpZXIgKFVSSSkgZm9yIHRoZSB0b2tlbiB3aXRoCmB0b2tlbl9pZGAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYHRva2VuX2lkYCAtIFRva2VuIElEIGFzIGEgbnVtYmVyLgoKIyBOb3RlcwoKSWYgdGhlIHRva2VuIGRvZXMgbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIGlzIGV4cGVjdGVkIHRvIHBhbmljLgAAAAAAAAl0b2tlbl91cmkAAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAEA==",
        "AAAAAAAAAPFSZXR1cm5zIHRoZSBhY2NvdW50IGFwcHJvdmVkIGZvciB0aGUgdG9rZW4gd2l0aCBgdG9rZW5faWRgLgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGB0b2tlbl9pZGAgLSBUb2tlbiBJRCBhcyBhIG51bWJlci4KCiMgRXJyb3JzCgoqIFtgTm9uRnVuZ2libGVUb2tlbkVycm9yOjpOb25FeGlzdGVudFRva2VuYF0gLSBJZiB0aGUgdG9rZW4gZG9lcyBub3QKZXhpc3QuAAAAAAAADGdldF9hcHByb3ZlZAAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAtBSZXR1cm5zIHRoZSBgdG9rZW5faWRgIGF0IGEgZ2l2ZW4gYGluZGV4YCBpbiB0aGUgZ2xvYmFsIHRva2VuIGxpc3QuClVzZSBhbG9uZyB3aXRoIFtgTm9uRnVuZ2libGVFbnVtZXJhYmxlOjp0b3RhbF9zdXBwbHlgXSB0byBlbnVtZXJhdGUKYWxsIHRoZSB0b2tlbnMgaW4gdGhlIGNvbnRyYWN0LgoKQSBmdW5jdGlvbiB0byBnZXQgYWxsIHRva2VucyBvZiBhIGNvbnRyYWN0IGlzIG5vdCBwcm92aWRlZCBiZWNhdXNlIHRoYXQKd291bGQgYmUgdW5ib3VuZGVkLiBUbyBlbnVtZXJhdGUgYWxsIHRva2VucyBvZiBhIGNvbnRyYWN0LCB1c2UKW2BOb25GdW5naWJsZUVudW1lcmFibGU6OnRvdGFsX3N1cHBseWBdIHRvIGdldCB0aGUgdG90YWwgbnVtYmVyIG9mCnRva2VucyBhbmQgdGhlbiB1c2UgW2BOb25GdW5naWJsZUVudW1lcmFibGU6OmdldF90b2tlbl9pZGBdIHRvIHJldHJpZXZlCmVhY2ggdG9rZW4gb25lIGJ5IG9uZS4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgaW5kZXhgIC0gSW5kZXggb2YgdGhlIHRva2VuIGluIHRoZSBnbG9iYWwgbGlzdC4KCiMgRXJyb3JzCgoqIFtgY3JhdGU6Om5vbl9mdW5naWJsZTo6Tm9uRnVuZ2libGVUb2tlbkVycm9yOjpUb2tlbk5vdEZvdW5kSW5HbG9iYWxMaXN0YF0gLSBXaGVuIHRoZSB0b2tlbgpJRCBpcyBub3QgZm91bmQgaW4gdGhlIGdsb2JhbCBlbnVtZXJhdGlvbi4AAAAMZ2V0X3Rva2VuX2lkAAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAAAQ=",
        "AAAAAAAAAHNSZXR1cm5zIHRoZSB0b3RhbCBhbW91bnQgb2YgdG9rZW5zIHN0b3JlZCBieSB0aGUgY29udHJhY3QuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuAAAAAAx0b3RhbF9zdXBwbHkAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAANdHJhbnNmZXJfZnJvbQAAAAAAAAQAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA",
        "AAAAAAAAAr9BcHByb3ZlIG9yIHJlbW92ZSBgb3BlcmF0b3JgIGFzIGFuIG9wZXJhdG9yIGZvciB0aGUgb3duZXIuCgpPcGVyYXRvcnMgY2FuIGNhbGwgYHRyYW5zZmVyX2Zyb20oKWAgZm9yIGFueSB0b2tlbiBoZWxkIGJ5IGBvd25lcmAsCmFuZCBjYWxsIGBhcHByb3ZlKClgIG9uIGJlaGFsZiBvZiBgb3duZXJgLgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYG93bmVyYCAtIFRoZSBhZGRyZXNzIGhvbGRpbmcgdGhlIHRva2Vucy4KKiBgb3BlcmF0b3JgIC0gQWNjb3VudCB0byBhZGQgdG8gdGhlIHNldCBvZiBhdXRob3JpemVkIG9wZXJhdG9ycy4KKiBgbGl2ZV91bnRpbF9sZWRnZXJgIC0gVGhlIGxlZGdlciBudW1iZXIgYXQgd2hpY2ggdGhlIGFsbG93YW5jZQpleHBpcmVzLiBJZiBgbGl2ZV91bnRpbF9sZWRnZXJgIGlzIGAwYCwgdGhlIGFwcHJvdmFsIGlzIHJldm9rZWQuCgojIEVycm9ycwoKKiBbYE5vbkZ1bmdpYmxlVG9rZW5FcnJvcjo6SW52YWxpZExpdmVVbnRpbExlZGdlcmBdIC0gSWYgdGhlIGxlZGdlcgpudW1iZXIgaXMgbGVzcyB0aGFuIHRoZSBjdXJyZW50IGxlZGdlciBudW1iZXIuCgojIEV2ZW50cwoKKiB0b3BpY3MgLSBgWyJhcHByb3ZlX2Zvcl9hbGwiLCBmcm9tOiBBZGRyZXNzXWAKKiBkYXRhIC0gYFtvcGVyYXRvcjogQWRkcmVzcywgbGl2ZV91bnRpbF9sZWRnZXI6IHUzMl1gAAAAAA9hcHByb3ZlX2Zvcl9hbGwAAAAAAwAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAA=",
        "AAAAAAAAAe1SZXR1cm5zIHRoZSBgdG9rZW5faWRgIG93bmVkIGJ5IGBvd25lcmAgYXQgYSBnaXZlbiBgaW5kZXhgIGluIHRoZQpvd25lcidzIGxvY2FsIGxpc3QuIFVzZSBhbG9uZyB3aXRoCltgY3JhdGU6Om5vbl9mdW5naWJsZTo6Tm9uRnVuZ2libGVUb2tlbjo6YmFsYW5jZWBdIHRvIGVudW1lcmF0ZSBhbGwgb2YKYG93bmVyYCdzIHRva2Vucy4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgb3duZXJgIC0gQWNjb3VudCBvZiB0aGUgdG9rZW4ncyBvd25lci4KKiBgaW5kZXhgIC0gSW5kZXggb2YgdGhlIHRva2VuIGluIHRoZSBvd25lcidzIGxvY2FsIGxpc3QuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpub25fZnVuZ2libGU6Ok5vbkZ1bmdpYmxlVG9rZW5FcnJvcjo6VG9rZW5Ob3RGb3VuZEluT3duZXJMaXN0YF0gLSBXaGVuIHRoZSB0b2tlbgpJRCBpcyBub3QgZm91bmQgaW4gdGhlIG93bmVyJ3MgZW51bWVyYXRpb24uAAAAAAAAEmdldF9vd25lcl90b2tlbl9pZAAAAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAVpbmRleAAAAAAAAAQAAAABAAAABA==",
        "AAAAAAAAANdSZXR1cm5zIHdoZXRoZXIgdGhlIGBvcGVyYXRvcmAgaXMgYWxsb3dlZCB0byBtYW5hZ2UgYWxsIHRoZSBhc3NldHMgb2YKYG93bmVyYC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgb3duZXJgIC0gQWNjb3VudCBvZiB0aGUgdG9rZW4ncyBvd25lci4KKiBgb3BlcmF0b3JgIC0gQWNjb3VudCB0byBiZSBjaGVja2VkLgAAAAATaXNfYXBwcm92ZWRfZm9yX2FsbAAAAAACAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAEAAAAB",
        "AAAAAAAAAAAAAAAGc3RhdHVzAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAEAAAAAQAAB9AAAAAMU3RyZWFtU3RhdHVz",
        "AAAAAAAAAAAAAAAPc3RyZWFtZWRfYW1vdW50AAAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAQAAAABAAAACw==",
        "AAAAAAAAAAAAAAATd2l0aGRyYXdhYmxlX2Ftb3VudAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAEAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAANY3JlYXRlX2xpbmVhcgAAAAAAAAsAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAlkZXBvc2l0ZWQAAAAAAAALAAAAAAAAAAhzdGFydF90cwAAAAYAAAAAAAAACGNsaWZmX3RzAAAABgAAAAAAAAAGZW5kX3RzAAAAAAAGAAAAAAAAAA91bmxvY2tfYXRfc3RhcnQAAAAACwAAAAAAAAAPdW5sb2NrX2F0X2NsaWZmAAAAAAsAAAAAAAAADWlzX2NhbmNlbGFibGUAAAAAAAABAAAAAAAAAA9pc190cmFuc2ZlcmFibGUAAAAAAQAAAAEAAAAE",
        "AAAAAAAAAAAAAAAPY3JlYXRlX3RyYW5jaGVkAAAAAAYAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAh0cmFuY2hlcwAAA+oAAAfQAAAAB1RyYW5jaGUAAAAAAAAAAA1pc19jYW5jZWxhYmxlAAAAAAAAAQAAAAAAAAAPaXNfdHJhbnNmZXJhYmxlAAAAAAEAAAABAAAABA==",
        "AAAAAAAAAAAAAAAEYnVybgAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAQAAAAA",
        "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAIcmVub3VuY2UAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAId2l0aGRyYXcAAAADAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAEAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAMd2l0aGRyYXdfbWF4AAAAAgAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABAAAAAAAAAACdG8AAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAZd2l0aGRyYXdfbWF4X2FuZF90cmFuc2ZlcgAAAAAAAAIAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAQAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAA",
        "AAAAAQAAAAAAAAAAAAAADk93bmVyVG9rZW5zS2V5AAAAAAACAAAAAAAAAAVpbmRleAAAAAAAAAQAAAAAAAAABW93bmVyAAAAAAAAEw==",
        "AAAAAgAAAFhTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgZW51bWVyYWJsZSBleHRlbnNpb24gb2YKYE5vbkZ1bmdpYmxlVG9rZW5gAAAAAAAAABdORlRFbnVtZXJhYmxlU3RvcmFnZUtleQAAAAAFAAAAAAAAAAAAAAALVG90YWxTdXBwbHkAAAAAAQAAAAAAAAALT3duZXJUb2tlbnMAAAAAAQAAB9AAAAAOT3duZXJUb2tlbnNLZXkAAAAAAAEAAAAAAAAAEE93bmVyVG9rZW5zSW5kZXgAAAABAAAABAAAAAEAAAAAAAAADEdsb2JhbFRva2VucwAAAAEAAAAEAAAAAQAAAAAAAAARR2xvYmFsVG9rZW5zSW5kZXgAAAAAAAABAAAABA==",
        "AAAABQAAADFFdmVudCBlbWl0dGVkIHdoZW4gY29uc2VjdXRpdmUgdG9rZW5zIGFyZSBtaW50ZWQuAAAAAAAAAAAAAA9Db25zZWN1dGl2ZU1pbnQAAAAAAQAAABBjb25zZWN1dGl2ZV9taW50AAAAAwAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAA1mcm9tX3Rva2VuX2lkAAAAAAAABAAAAAAAAAAAAAAAC3RvX3Rva2VuX2lkAAAAAAQAAAAAAAAAAg==",
        "AAAAAgAAAFlTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgY29uc2VjdXRpdmUgZXh0ZW5zaW9uIG9mCmBOb25GdW5naWJsZVRva2VuYAAAAAAAAAAAAAAYTkZUQ29uc2VjdXRpdmVTdG9yYWdlS2V5AAAABAAAAAEAAAAAAAAACEFwcHJvdmFsAAAAAQAAAAQAAAABAAAAAAAAAAVPd25lcgAAAAAAAAEAAAAEAAAAAQAAAAAAAAAPT3duZXJzaGlwQnVja2V0AAAAAAEAAAAEAAAAAQAAAAAAAAALQnVybmVkVG9rZW4AAAAAAQAAAAQ=",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBidXJuZWQuAAAAAAAAAAAAAARCdXJuAAAAAQAAAARidXJuAAAAAgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAChFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW4gcm95YWx0eSBpcyBzZXQuAAAAAAAAAA9TZXRUb2tlblJveWFsdHkAAAAAAQAAABFzZXRfdG9rZW5fcm95YWx0eQAAAAAAAAMAAAAAAAAACHJlY2VpdmVyAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAADGJhc2lzX3BvaW50cwAAAAQAAAAAAAAAAg==",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gZGVmYXVsdCByb3lhbHR5IGlzIHNldC4AAAAAAAAAAAARU2V0RGVmYXVsdFJveWFsdHkAAAAAAAABAAAAE3NldF9kZWZhdWx0X3JveWFsdHkAAAAAAgAAAAAAAAAIcmVjZWl2ZXIAAAATAAAAAQAAAAAAAAAMYmFzaXNfcG9pbnRzAAAABAAAAAAAAAAC",
        "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW4gcm95YWx0eSBpcyByZW1vdmVkLgAAAAAAAAASUmVtb3ZlVG9rZW5Sb3lhbHR5AAAAAAABAAAAFHJlbW92ZV90b2tlbl9yb3lhbHR5AAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAI=",
        "AAAAAQAAAClTdG9yYWdlIGNvbnRhaW5lciBmb3Igcm95YWx0eSBpbmZvcm1hdGlvbgAAAAAAAAAAAAALUm95YWx0eUluZm8AAAAAAgAAAAAAAAAMYmFzaXNfcG9pbnRzAAAABAAAAAAAAAAIcmVjZWl2ZXIAAAAT",
        "AAAAAgAAAB1TdG9yYWdlIGtleXMgZm9yIHJveWFsdHkgZGF0YQAAAAAAAAAAAAAWTkZUUm95YWx0aWVzU3RvcmFnZUtleQAAAAAAAgAAAAAAAAAAAAAADkRlZmF1bHRSb3lhbHR5AAAAAAABAAAAAAAAAAxUb2tlblJveWFsdHkAAAABAAAABA==",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYW4gYXBwcm92YWwgaXMgZ3JhbnRlZC4AAAAAAAAAAAAHQXBwcm92ZQAAAAABAAAAB2FwcHJvdmUAAAAABAAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAIYXBwcm92ZWQAAAATAAAAAAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyB0cmFuc2ZlcnJlZC4AAAAAAAAAAAAIVHJhbnNmZXIAAAABAAAACHRyYW5zZmVyAAAAAwAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC",
        "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYXBwcm92YWwgZm9yIGFsbCB0b2tlbnMgaXMgZ3JhbnRlZC4AAAAAAAAAAAANQXBwcm92ZUZvckFsbAAAAAAAAAEAAAAPYXBwcm92ZV9mb3JfYWxsAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAAFU5vbkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAAAA8AAAAkSW5kaWNhdGVzIGEgbm9uLWV4aXN0ZW50IGB0b2tlbl9pZGAuAAAAEE5vbkV4aXN0ZW50VG9rZW4AAADIAAAAV0luZGljYXRlcyBhbiBlcnJvciByZWxhdGVkIHRvIHRoZSBvd25lcnNoaXAgb3ZlciBhIHBhcnRpY3VsYXIgdG9rZW4uClVzZWQgaW4gdHJhbnNmZXJzLgAAAAAOSW5jb3JyZWN0T3duZXIAAAAAAMkAAABFSW5kaWNhdGVzIGEgZmFpbHVyZSB3aXRoIHRoZSBgb3BlcmF0b3JgcyBhcHByb3ZhbC4gVXNlZCBpbiB0cmFuc2ZlcnMuAAAAAAAAFEluc3VmZmljaWVudEFwcHJvdmFsAAAAygAAAFVJbmRpY2F0ZXMgYSBmYWlsdXJlIHdpdGggdGhlIGBhcHByb3ZlcmAgb2YgYSB0b2tlbiB0byBiZSBhcHByb3ZlZC4gVXNlZAppbiBhcHByb3ZhbHMuAAAAAAAAD0ludmFsaWRBcHByb3ZlcgAAAADLAAAASkluZGljYXRlcyBhbiBpbnZhbGlkIHZhbHVlIGZvciBgbGl2ZV91bnRpbF9sZWRnZXJgIHdoZW4gc2V0dGluZwphcHByb3ZhbHMuAAAAAAAWSW52YWxpZExpdmVVbnRpbExlZGdlcgAAAAAAzAAAAClJbmRpY2F0ZXMgb3ZlcmZsb3cgd2hlbiBhZGRpbmcgdHdvIHZhbHVlcwAAAAAAAAxNYXRoT3ZlcmZsb3cAAADNAAAANkluZGljYXRlcyBhbGwgcG9zc2libGUgYHRva2VuX2lkYHMgYXJlIGFscmVhZHkgaW4gdXNlLgAAAAAAE1Rva2VuSURzQXJlRGVwbGV0ZWQAAAAAzgAAAEVJbmRpY2F0ZXMgYW4gaW52YWxpZCBhbW91bnQgdG8gYmF0Y2ggbWludCBpbiBgY29uc2VjdXRpdmVgIGV4dGVuc2lvbi4AAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAM8AAAAzSW5kaWNhdGVzIHRoZSB0b2tlbiBkb2VzIG5vdCBleGlzdCBpbiBvd25lcidzIGxpc3QuAAAAABhUb2tlbk5vdEZvdW5kSW5Pd25lckxpc3QAAADQAAAAMkluZGljYXRlcyB0aGUgdG9rZW4gZG9lcyBub3QgZXhpc3QgaW4gZ2xvYmFsIGxpc3QuAAAAAAAZVG9rZW5Ob3RGb3VuZEluR2xvYmFsTGlzdAAAAAAAANEAAAAjSW5kaWNhdGVzIGFjY2VzcyB0byB1bnNldCBtZXRhZGF0YS4AAAAADVVuc2V0TWV0YWRhdGEAAAAAAADSAAAAQUluZGljYXRlcyB0aGUgbGVuZ3RoIG9mIHRoZSBiYXNlIFVSSSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAFUJhc2VVcmlNYXhMZW5FeGNlZWRlZAAAAAAAANMAAABHSW5kaWNhdGVzIHRoZSByb3lhbHR5IGFtb3VudCBpcyBoaWdoZXIgdGhhbiAxMF8wMDAgKDEwMCUpIGJhc2lzIHBvaW50cy4AAAAAFEludmFsaWRSb3lhbHR5QW1vdW50AAAA1AAAAD1JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgbmFtZSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAEk5hbWVNYXhMZW5FeGNlZWRlZAAAAAAA1QAAAD9JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgc3ltYm9sIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZC4AAAAAFFN5bWJvbE1heExlbkV4Y2VlZGVkAAAA1g==",
        "AAAAAgAAAAAAAAAAAAAAF05GVFNlcXVlbnRpYWxTdG9yYWdlS2V5AAAAAAEAAAAAAAAAAAAAAA5Ub2tlbklkQ291bnRlcgAA",
        "AAAAAQAAACRTdG9yYWdlIGNvbnRhaW5lciBmb3IgdG9rZW4gbWV0YWRhdGEAAAAAAAAACE1ldGFkYXRhAAAAAwAAAAAAAAAIYmFzZV91cmkAAAAQAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQ",
        "AAAAAQAAAHZTdG9yYWdlIGNvbnRhaW5lciBmb3IgdGhlIHRva2VuIGZvciB3aGljaCBhbiBhcHByb3ZhbCBpcyBncmFudGVkCmFuZCB0aGUgbGVkZ2VyIG51bWJlciBhdCB3aGljaCB0aGlzIGFwcHJvdmFsIGV4cGlyZXMuAAAAAAAAAAAADEFwcHJvdmFsRGF0YQAAAAIAAAAAAAAACGFwcHJvdmVkAAAAEwAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAE",
        "AAAAAgAAADxTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgTm9uRnVuZ2libGVUb2tlbmAAAAAAAAAADU5GVFN0b3JhZ2VLZXkAAAAAAAAFAAAAAQAAAAAAAAAFT3duZXIAAAAAAAABAAAABAAAAAEAAAAAAAAAB0JhbGFuY2UAAAAAAQAAABMAAAABAAAAAAAAAAhBcHByb3ZhbAAAAAEAAAAEAAAAAQAAAAAAAAAOQXBwcm92YWxGb3JBbGwAAAAAAAIAAAATAAAAEwAAAAAAAAAAAAAACE1ldGFkYXRh",
        "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYSBtb2R1bGUgaXMgYWRkZWQgdG8gY29tcGxpYW5jZS4AAAAAAAAAAAtNb2R1bGVBZGRlZAAAAAABAAAADG1vZHVsZV9hZGRlZAAAAAIAAAAAAAAABGhvb2sAAAfQAAAADkNvbXBsaWFuY2VIb29rAAAAAAABAAAAAAAAAAZtb2R1bGUAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAADdFdmVudCBlbWl0dGVkIHdoZW4gYSBtb2R1bGUgaXMgcmVtb3ZlZCBmcm9tIGNvbXBsaWFuY2UuAAAAAAAAAAANTW9kdWxlUmVtb3ZlZAAAAAAAAAEAAAAObW9kdWxlX3JlbW92ZWQAAAAAAAIAAAAAAAAABGhvb2sAAAfQAAAADkNvbXBsaWFuY2VIb29rAAAAAAABAAAAAAAAAAZtb2R1bGUAAAAAABMAAAAAAAAAAg==",
        "AAAAAgAAAJNIb29rIHR5cGVzIGZvciBtb2R1bGFyIGNvbXBsaWFuY2Ugc3lzdGVtLgoKRWFjaCBob29rIHR5cGUgcmVwcmVzZW50cyBhIHNwZWNpZmljIGV2ZW50IG9yIHZhbGlkYXRpb24gcG9pbnQKd2hlcmUgY29tcGxpYW5jZSBtb2R1bGVzIGNhbiBiZSBleGVjdXRlZC4AAAAAAAAAAA5Db21wbGlhbmNlSG9vawAAAAAABQAAAAAAAACeQ2FsbGVkIGFmdGVyIHRva2VucyBhcmUgc3VjY2Vzc2Z1bGx5IHRyYW5zZmVycmVkIGZyb20gb25lIHdhbGxldCB0bwphbm90aGVyLiBNb2R1bGVzIHJlZ2lzdGVyZWQgZm9yIHRoaXMgaG9vayBjYW4gdXBkYXRlIHRoZWlyIHN0YXRlCmJhc2VkIG9uIHRyYW5zZmVyIGV2ZW50cy4AAAAAAAtUcmFuc2ZlcnJlZAAAAAAAAAAAkUNhbGxlZCBhZnRlciB0b2tlbnMgYXJlIHN1Y2Nlc3NmdWxseSBjcmVhdGVkL21pbnRlZCB0byBhIHdhbGxldC4KTW9kdWxlcyByZWdpc3RlcmVkIGZvciB0aGlzIGhvb2sgY2FuIHVwZGF0ZSB0aGVpciBzdGF0ZSBiYXNlZCBvbiBtaW50aW5nCmV2ZW50cy4AAAAAAAAHQ3JlYXRlZAAAAAAAAAAAlUNhbGxlZCBhZnRlciB0b2tlbnMgYXJlIHN1Y2Nlc3NmdWxseSBkZXN0cm95ZWQvYnVybmVkIGZyb20gYSB3YWxsZXQuCk1vZHVsZXMgcmVnaXN0ZXJlZCBmb3IgdGhpcyBob29rIGNhbiB1cGRhdGUgdGhlaXIgc3RhdGUgYmFzZWQgb24gYnVybmluZwpldmVudHMuAAAAAAAACURlc3Ryb3llZAAAAAAAAAAAAADMQ2FsbGVkIGR1cmluZyB0cmFuc2ZlciB2YWxpZGF0aW9uIHRvIGNoZWNrIGlmIGEgdHJhbnNmZXIgc2hvdWxkIGJlCmFsbG93ZWQuIE1vZHVsZXMgcmVnaXN0ZXJlZCBmb3IgdGhpcyBob29rIGNhbiBpbXBsZW1lbnQgdHJhbnNmZXIKcmVzdHJpY3Rpb25zLiBUaGlzIGlzIGEgUkVBRC1vbmx5IG9wZXJhdGlvbiBhbmQgc2hvdWxkIG5vdCBtb2RpZnkKc3RhdGUuAAAAC0NhblRyYW5zZmVyAAAAAAAAAADOQ2FsbGVkIGR1cmluZyBtaW50IHZhbGlkYXRpb24gdG8gY2hlY2sgaWYgYSBtaW50IG9wZXJhdGlvbiBzaG91bGQgYmUKYWxsb3dlZC4gTW9kdWxlcyByZWdpc3RlcmVkIGZvciB0aGlzIGhvb2sgY2FuIGltcGxlbWVudCB0cmFuc2ZlcgpyZXN0cmljdGlvbnMuIFRoaXMgaXMgYSBSRUFELW9ubHkgb3BlcmF0aW9uIGFuZCBzaG91bGQgbm90IG1vZGlmeQpzdGF0ZS4AAAAAAAlDYW5DcmVhdGUAAAA=",
        "AAAABAAAAAAAAAAAAAAAD0NvbXBsaWFuY2VFcnJvcgAAAAAEAAAAN0luZGljYXRlcyBhIG1vZHVsZSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQgZm9yIHRoaXMgaG9vay4AAAAAF01vZHVsZUFscmVhZHlSZWdpc3RlcmVkAAAAAWgAAAAzSW5kaWNhdGVzIGEgbW9kdWxlIGlzIG5vdCByZWdpc3RlcmVkIGZvciB0aGlzIGhvb2suAAAAABNNb2R1bGVOb3RSZWdpc3RlcmVkAAAAAWkAAAAlSW5kaWNhdGVzIGEgbW9kdWxlIGJvdW5kIGlzIGV4Y2VlZGVkLgAAAAAAABNNb2R1bGVCb3VuZEV4Y2VlZGVkAAAAAWoAAAA7SW5kaWNhdGVzIGEgdG9rZW4gaXMgbm90IGJvdW5kIHRvIHRoaXMgY29tcGxpYW5jZSBjb250cmFjdC4AAAAADVRva2VuTm90Qm91bmQAAAAAAAFr",
        "AAAABAAAAJFFcnJvciBjb2RlcyBzaGFyZWQgYnkgYWxsIGNvbXBsaWFuY2UgbW9kdWxlcy4KCkNvbXBsaWFuY2UgbW9kdWxlIGVycm9ycyBvY2N1cHkgdGhlIDM5MOKAkzQwMCByYW5nZSwgZm9sbG93aW5nIHRoZSBSV0EKZXJyb3IgbnVtYmVyaW5nIGNvbnZlbnRpb24uAAAAAAAAAAAAABVDb21wbGlhbmNlTW9kdWxlRXJyb3IAAAAAAAALAAAAMVRoZSBjb21wbGlhbmNlIGNvbnRyYWN0IGFkZHJlc3MgaGFzIG5vdCBiZWVuIHNldC4AAAAAAAAQQ29tcGxpYW5jZU5vdFNldAAAAYYAAAA8QW4gYW1vdW50IGFyZ3VtZW50IGlzIG5lZ2F0aXZlIHdoZW4gaXQgbXVzdCBiZSBub24tbmVnYXRpdmUuAAAADUludmFsaWRBbW91bnQAAAAAAAGHAAAAKkFyaXRobWV0aWMgb3ZlcmZsb3cgaW4gYSBjaGVja2VkIGFkZGl0aW9uLgAAAAAADE1hdGhPdmVyZmxvdwAAAYgAAAAuQXJpdGhtZXRpYyB1bmRlcmZsb3cgaW4gYSBjaGVja2VkIHN1YnRyYWN0aW9uLgAAAAAADU1hdGhVbmRlcmZsb3cAAAAAAAGJAAAANkEgcmVxdWlyZWQgbGltaXQgZW50cnkgaXMgbWlzc2luZyBmb3IgdGhlIGdpdmVuIHRva2VuLgAAAAAADE1pc3NpbmdMaW1pdAAAAYoAAAAtQSByZXF1aXJlZCB0cmFuc2ZlciBjb3VudGVyIGVudHJ5IGlzIG1pc3NpbmcuAAAAAAAADk1pc3NpbmdDb3VudGVyAAAAAAGLAAAAKUEgcmVxdWlyZWQgY291bnRyeSBkYXRhIGVudHJ5IGlzIG1pc3NpbmcuAAAAAAAADk1pc3NpbmdDb3VudHJ5AAAAAAGMAAAAPlRoZSBpZGVudGl0eSByZWdpc3RyeSBzdG9yYWdlIGFkZHJlc3MgaGFzIG5vdCBiZWVuIGNvbmZpZ3VyZWQuAAAAAAAWSWRlbnRpdHlSZWdpc3RyeU5vdFNldAAAAAABjQAAADlBIG1vZHVsZSBpcyBub3QgcmVnaXN0ZXJlZCBvbiBhIHJlcXVpcmVkIGNvbXBsaWFuY2UgaG9vay4AAAAAAAATTWlzc2luZ1JlcXVpcmVkSG9vawAAAAGOAAAANVRoZSBjb21wbGlhbmNlIGNvbnRyYWN0IGFkZHJlc3MgaGFzIGFscmVhZHkgYmVlbiBzZXQuAAAAAAAAFENvbXBsaWFuY2VBbHJlYWR5U2V0AAABjwAAAENBIHRva2VuIGhhcyByZWFjaGVkIHRoZSBtYXhpbXVtIG51bWJlciBvZiBjb25maWd1cmVkIGxpbWl0IGVudHJpZXMuAAAAAA1Ub29NYW55TGltaXRzAAAAAAABkA==",
        "AAAAAgAAAAAAAAAAAAAAGkNvbXBsaWFuY2VNb2R1bGVTdG9yYWdlS2V5AAAAAAADAAAAAAAAAEFNYXBzIHRvIHRoZSBjb21wbGlhbmNlIGNvbnRyYWN0IGFkZHJlc3MgZm9yIHRoaXMgbW9kdWxlIGluc3RhbmNlLgAAAAAAAApDb21wbGlhbmNlAAAAAAAAAAAARkNhY2hlcyBzdWNjZXNzZnVsIHJlcXVpcmVkLWhvb2sgdmVyaWZpY2F0aW9uIGZvciB0aGlzIG1vZHVsZSBpbnN0YW5jZS4AAAAAAA1Ib29rc1ZlcmlmaWVkAAAAAAAAAQAAAC5UaGUgSVJTIGNvbnRyYWN0IGFkZHJlc3MgZm9yIGEgc3BlY2lmaWMgdG9rZW4uAAAAAAAIUmVnaXN0cnkAAAABAAAAEw==",
        "AAAAAgAAADFTdG9yYWdlIGtleXMgZm9yIHRoZSBtb2R1bGFyIGNvbXBsaWFuY2UgY29udHJhY3QuAAAAAAAAAAAAABFDb21wbGlhbmNlRGF0YUtleQAAAAAAAAEAAAABAAAAPE1hcHMgQ29tcGxpYW5jZUhvb2sgLT4gYFZlYzxBZGRyZXNzPmAgZm9yIHJlZ2lzdGVyZWQgbW9kdWxlcwAAAAtIb29rTW9kdWxlcwAAAAABAAAH0AAAAA5Db21wbGlhbmNlSG9vawAA",
        "AAAABAAAAC9FcnJvciBjb2RlcyBmb3IgZG9jdW1lbnQgbWFuYWdlbWVudCBvcGVyYXRpb25zLgAAAAAAAAAADURvY3VtZW50RXJyb3IAAAAAAAADAAAAJVRoZSBzcGVjaWZpZWQgZG9jdW1lbnQgd2FzIG5vdCBmb3VuZC4AAAAAAAAQRG9jdW1lbnROb3RGb3VuZAAAAXwAAAAtTWF4aW11bSBudW1iZXIgb2YgZG9jdW1lbnRzIGhhcyBiZWVuIHJlYWNoZWQuAAAAAAAAE01heERvY3VtZW50c1JlYWNoZWQAAAABfQAAACtUaGUgVVJJIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAAApVcmlUb29Mb25nAAAAAAF+",
        "AAAABQAAAClFdmVudCBlbWl0dGVkIHdoZW4gYSBkb2N1bWVudCBpcyByZW1vdmVkLgAAAAAAAAAAAAAPRG9jdW1lbnRSZW1vdmVkAAAAAAEAAAAQZG9jdW1lbnRfcmVtb3ZlZAAAAAEAAAAAAAAABG5hbWUAAAPuAAAAIAAAAAEAAAAC",
        "AAAABQAAAD1FdmVudCBlbWl0dGVkIHdoZW4gYSBkb2N1bWVudCBpcyB1cGRhdGVkIChhZGRlZCBvciBtb2RpZmllZCkuAAAAAAAAAAAAAA9Eb2N1bWVudFVwZGF0ZWQAAAAAAQAAABBkb2N1bWVudF91cGRhdGVkAAAABAAAAAAAAAAEbmFtZQAAA+4AAAAgAAAAAQAAAAAAAAADdXJpAAAAABAAAAAAAAAAAAAAAA1kb2N1bWVudF9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAAAAAAl0aW1lc3RhbXAAAAAAAAAGAAAAAAAAAAI=",
        "AAAAAQAAAChSZXByZXNlbnRzIGEgZG9jdW1lbnQgd2l0aCBpdHMgbWV0YWRhdGEuAAAAAAAAAAhEb2N1bWVudAAAAAMAAAAiVGhlIGhhc2ggb2YgdGhlIGRvY3VtZW50IGNvbnRlbnRzLgAAAAAADWRvY3VtZW50X2hhc2gAAAAAAAPuAAAAIAAAAC5UaW1lc3RhbXAgd2hlbiB0aGUgZG9jdW1lbnQgd2FzIGxhc3QgbW9kaWZpZWQuAAAAAAAJdGltZXN0YW1wAAAAAAAABgAAACtUaGUgVVJJIHdoZXJlIHRoZSBkb2N1bWVudCBjYW4gYmUgYWNjZXNzZWQuAAAAAAN1cmkAAAAAEA==",
        "AAAAAgAAACVTdG9yYWdlIGtleXMgZm9yIGRvY3VtZW50IG1hbmFnZW1lbnQuAAAAAAAAAAAAABJEb2N1bWVudFN0b3JhZ2VLZXkAAAAAAAMAAAABAAAAJ01hcHMgZG9jdW1lbnQgbmFtZSB0byBpdHMgZ2xvYmFsIGluZGV4LgAAAAAFSW5kZXgAAAAAAAABAAAD7gAAACAAAAABAAAAOU1hcHMgYnVja2V0IGluZGV4IHRvIGEgdmVjdG9yIG9mIChuYW1lLCBkb2N1bWVudCkgdHVwbGVzLgAAAAAAAAZCdWNrZXQAAAAAAAEAAAAEAAAAAAAAABlUb3RhbCBjb3VudCBvZiBkb2N1bWVudHMuAAAAAAAABUNvdW50AAAA",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBidXJuZWQuAAAAAAAAAAAAAARCdXJuAAAAAQAAAARidXJuAAAAAgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAEFFdmVudCBlbWl0dGVkIHdoZW4gYSBrZXkgaXMgYWxsb3dlZCBmb3IgYSBzY2hlbWUgYW5kIGNsYWltIHRvcGljLgAAAAAAAAAAAAAKS2V5QWxsb3dlZAAAAAAAAQAAAAtrZXlfYWxsb3dlZAAAAAAEAAAAAAAAAApwdWJsaWNfa2V5AAAAAAAOAAAAAQAAAAAAAAAIcmVnaXN0cnkAAAATAAAAAAAAAAAAAAAGc2NoZW1lAAAAAAAEAAAAAAAAAAAAAAALY2xhaW1fdG9waWMAAAAABAAAAAAAAAAC",
        "AAAABQAAAEJFdmVudCBlbWl0dGVkIHdoZW4gYSBrZXkgaXMgcmVtb3ZlZCBmcm9tIGEgc2NoZW1lIGFuZCBjbGFpbSB0b3BpYy4AAAAAAAAAAAAKS2V5UmVtb3ZlZAAAAAAAAQAAAAtrZXlfcmVtb3ZlZAAAAAAEAAAAAAAAAApwdWJsaWNfa2V5AAAAAAAOAAAAAQAAAAAAAAAIcmVnaXN0cnkAAAATAAAAAAAAAAAAAAAGc2NoZW1lAAAAAAAEAAAAAAAAAAAAAAALY2xhaW1fdG9waWMAAAAABAAAAAAAAAAC",
        "AAAABQAAACZFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyByZXZva2VkLgAAAAAAAAAAAAxDbGFpbVJldm9rZWQAAAABAAAADWNsYWltX3Jldm9rZWQAAAAAAAAEAAAAAAAAAAhpZGVudGl0eQAAABMAAAABAAAAAAAAAAtjbGFpbV90b3BpYwAAAAAEAAAAAQAAAAAAAAAHcmV2b2tlZAAAAAABAAAAAQAAAAAAAAAKY2xhaW1fZGF0YQAAAAAADgAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAAEENsYWltSXNzdWVyRXJyb3IAAAAKAAAAOVNpZ25hdHVyZSBkYXRhIGxlbmd0aCBkb2VzIG5vdCBtYXRjaCB0aGUgZXhwZWN0ZWQgc2NoZW1lLgAAAAAAAA9TaWdEYXRhTWlzbWF0Y2gAAAABXgAAABpUaGUgcHJvdmlkZWQga2V5IGlzIGVtcHR5LgAAAAAACktleUlzRW1wdHkAAAAAAV8AAAAzVGhlIGtleSBpcyBhbHJlYWR5IGFsbG93ZWQgZm9yIHRoZSBzcGVjaWZpZWQgdG9waWMuAAAAABFLZXlBbHJlYWR5QWxsb3dlZAAAAAAAAWAAAAA0VGhlIHNwZWNpZmllZCBrZXkgd2FzIG5vdCBmb3VuZCBpbiB0aGUgYWxsb3dlZCBrZXlzLgAAAAtLZXlOb3RGb3VuZAAAAAFhAAAAT1RoZSBjbGFpbSBpc3N1ZXIgaXMgbm90IGFsbG93ZWQgdG8gc2lnbiBjbGFpbXMgYWJvdXQgdGhlIHNwZWNpZmllZApjbGFpbSB0b3BpYy4AAAAACk5vdEFsbG93ZWQAAAAAAWIAAAA+TWF4aW11bSBsaW1pdCBleGNlZWRlZCAoa2V5cyBwZXIgdG9waWMgb3IgcmVnaXN0cmllcyBwZXIga2V5KS4AAAAAAA1MaW1pdEV4Y2VlZGVkAAAAAAABYwAAADRObyBzaWduaW5nIGtleXMgZm91bmQgZm9yIHRoZSBzcGVjaWZpZWQgY2xhaW0gdG9waWMuAAAADk5vS2V5c0ZvclRvcGljAAAAAAFkAAAAHEludmFsaWQgY2xhaW0gZGF0YSBlbmNvZGluZy4AAAAaSW52YWxpZENsYWltRGF0YUV4cGlyYXRpb24AAAAAAWUAAAAsUmVjb3Zlcnkgb2YgdGhlIFNlY3AyNTZrMSBwdWJsaWMga2V5IGZhaWxlZC4AAAAXU2VjcDI1NmsxUmVjb3ZlcnlGYWlsZWQAAAABZgAAACpJbmRpY2F0ZXMgb3ZlcmZsb3cgd2hlbiBhZGRpbmcgdHdvIHZhbHVlcy4AAAAAAAxNYXRoT3ZlcmZsb3cAAAFn",
        "AAAABQAAAE5FdmVudCBlbWl0dGVkIHdoZW4gY2xhaW0gc2lnbmF0dXJlcyBhcmUgaW52YWxpZGF0ZWQgYnkgaW5jcmVtZW50aW5nIHRoZQpub25jZS4AAAAAAAAAAAAVU2lnbmF0dXJlc0ludmFsaWRhdGVkAAAAAAAAAQAAABZzaWduYXR1cmVzX2ludmFsaWRhdGVkAAAAAAADAAAAAAAAAAhpZGVudGl0eQAAABMAAAABAAAAAAAAAAtjbGFpbV90b3BpYwAAAAAEAAAAAQAAAAAAAAAFbm9uY2UAAAAAAAAEAAAAAAAAAAI=",
        "AAAAAQAAAAAAAAAAAAAAClNpZ25pbmdLZXkAAAAAAAIAAAAAAAAACnB1YmxpY19rZXkAAAAAAA4AAAAAAAAABnNjaGVtZQAAAAAABA==",
        "AAAAAQAAACJTaWduYXR1cmUgZGF0YSBmb3IgRWQyNTUxOSBzY2hlbWUuAAAAAAAAAAAAFEVkMjU1MTlTaWduYXR1cmVEYXRhAAAAAgAAAAAAAAAKcHVibGljX2tleQAAAAAD7gAAACAAAAAAAAAACXNpZ25hdHVyZQAAAAAAA+4AAABA",
        "AAAAAgAAAC1TdG9yYWdlIGtleXMgZm9yIGNsYWltIGlzc3VlciBrZXkgbWFuYWdlbWVudC4AAAAAAAAAAAAAFUNsYWltSXNzdWVyU3RvcmFnZUtleQAAAAAAAAQAAAABAAAAH01hcHMgVG9waWMgLT4gYFZlYzxTaWduaW5nS2V5PmAAAAAABlRvcGljcwAAAAAAAQAAAAQAAAABAAAAKU1hcHMgU2lnbmluZ0tleSAtPiBWZWM8KFRvcGljLCBSZWdpc3RyeSk+AAAAAAAABVBhaXJzAAAAAAAAAQAAB9AAAAAKU2lnbmluZ0tleQAAAAAAAQAAADBUcmFja3MgZXhwbGljaXRseSByZXZva2VkIGNsYWltcyBieSBjbGFpbSBkaWdlc3QAAAAMUmV2b2tlZENsYWltAAAAAQAAA+4AAAAgAAAAAQAAAD1UcmFja3MgY3VycmVudCBub25jZSBmb3IgYSBzcGVjaWZpYyBpZGVudGl0eSBhbmQgY2xhaW0gdG9waWNzAAAAAAAACkNsYWltTm9uY2UAAAAAAAIAAAATAAAABA==",
        "AAAAAQAAACRTaWduYXR1cmUgZGF0YSBmb3IgU2VjcDI1NmsxIHNjaGVtZS4AAAAAAAAAFlNlY3AyNTZrMVNpZ25hdHVyZURhdGEAAAAAAAMAAAAAAAAACnB1YmxpY19rZXkAAAAAA+4AAABBAAAAAAAAAAtyZWNvdmVyeV9pZAAAAAAEAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQA==",
        "AAAAAQAAACRTaWduYXR1cmUgZGF0YSBmb3IgU2VjcDI1NnIxIHNjaGVtZS4AAAAAAAAAFlNlY3AyNTZyMVNpZ25hdHVyZURhdGEAAAAAAAIAAAAAAAAACnB1YmxpY19rZXkAAAAAA+4AAABBAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQA==",
        "AAAABQAAACRFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyBhZGRlZC4AAAAAAAAACkNsYWltQWRkZWQAAAAAAAEAAAALY2xhaW1fYWRkZWQAAAAAAQAAAAAAAAAFY2xhaW0AAAAAAAfQAAAABUNsYWltAAAAAAAAAQAAAAI=",
        "AAAABAAAAAAAAAAAAAAAC0NsYWltc0Vycm9yAAAAAAIAAAAZQ2xhaW0gIElEIGRvZXMgbm90IGV4aXN0LgAAAAAAAA1DbGFpbU5vdEZvdW5kAAAAAAABVAAAAGdDbGFpbSBJc3N1ZXIgY2Fubm90IHZhbGlkYXRlIHRoZSBjbGFpbSAocmV2b2NhdGlvbiwgc2lnbmF0dXJlIG1pc21hdGNoLAp1bmF1dGhvcml6ZWQgc2lnbmluZyBrZXksIGV0Yy4pAAAAAA1DbGFpbU5vdFZhbGlkAAAAAAABVQ==",
        "AAAABQAAACZFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyBjaGFuZ2VkLgAAAAAAAAAAAAxDbGFpbUNoYW5nZWQAAAABAAAADWNsYWltX2NoYW5nZWQAAAAAAAABAAAAAAAAAAVjbGFpbQAAAAAAB9AAAAAFQ2xhaW0AAAAAAAABAAAAAg==",
        "AAAABQAAACZFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyByZW1vdmVkLgAAAAAAAAAAAAxDbGFpbVJlbW92ZWQAAAABAAAADWNsYWltX3JlbW92ZWQAAAAAAAABAAAAAAAAAAVjbGFpbQAAAAAAB9AAAAAFQ2xhaW0AAAAAAAABAAAAAg==",
        "AAAAAQAAACNSZXByZXNlbnRzIGEgY2xhaW0gc3RvcmVkIG9uLWNoYWluLgAAAAAAAAAABUNsYWltAAAAAAAABgAAAA5UaGUgY2xhaW0gZGF0YQAAAAAABGRhdGEAAAAOAAAAH1RoZSBhZGRyZXNzIG9mIHRoZSBjbGFpbSBpc3N1ZXIAAAAABmlzc3VlcgAAAAAAEwAAABlUaGUgc2lnbmF0dXJlIHNjaGVtZSB1c2VkAAAAAAAABnNjaGVtZQAAAAAABAAAABtUaGUgY3J5cHRvZ3JhcGhpYyBzaWduYXR1cmUAAAAACXNpZ25hdHVyZQAAAAAAAA4AAAAkVGhlIGNsYWltIHRvcGljIChudW1lcmljIGlkZW50aWZpZXIpAAAABXRvcGljAAAAAAAABAAAACdPcHRpb25hbCBVUkkgZm9yIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24AAAAAA3VyaQAAAAAQ",
        "AAAAAgAAADpTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBJZGVudGl0eSBDbGFpbXMuAAAAAAAAAAAAEENsYWltc1N0b3JhZ2VLZXkAAAACAAAAAQAAABtNYXBzIGNsYWltIElEIHRvIGNsYWltIGRhdGEAAAAABUNsYWltAAAAAAAAAQAAA+4AAAAgAAAAAQAAACFNYXBzIHRvcGljIHRvIHZlY3RvciBvZiBjbGFpbSBJRHMAAAAAAAANQ2xhaW1zQnlUb3BpYwAAAAAAAAEAAAAE",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSB0b3BpYyBpcyBhZGRlZC4AAAAAAAAAAAAPQ2xhaW1Ub3BpY0FkZGVkAAAAAAEAAAARY2xhaW1fdG9waWNfYWRkZWQAAAAAAAABAAAAAAAAAAtjbGFpbV90b3BpYwAAAAAEAAAAAQAAAAI=",
        "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSB0b3BpYyBpcyByZW1vdmVkLgAAAAAAAAARQ2xhaW1Ub3BpY1JlbW92ZWQAAAAAAAABAAAAE2NsYWltX3RvcGljX3JlbW92ZWQAAAAAAQAAAAAAAAALY2xhaW1fdG9waWMAAAAABAAAAAEAAAAC",
        "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYSB0cnVzdGVkIGlzc3VlciBpcyBhZGRlZC4AAAAAAAAAAAAAElRydXN0ZWRJc3N1ZXJBZGRlZAAAAAAAAQAAABR0cnVzdGVkX2lzc3Vlcl9hZGRlZAAAAAIAAAAAAAAADnRydXN0ZWRfaXNzdWVyAAAAAAATAAAAAQAAAAAAAAAMY2xhaW1fdG9waWNzAAAD6gAAAAQAAAAAAAAAAg==",
        "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gaXNzdWVyIHRvcGljcyBhcmUgdXBkYXRlZC4AAAAAAAAAAAAAE0lzc3VlclRvcGljc1VwZGF0ZWQAAAAAAQAAABVpc3N1ZXJfdG9waWNzX3VwZGF0ZWQAAAAAAAACAAAAAAAAAA50cnVzdGVkX2lzc3VlcgAAAAAAEwAAAAEAAAAAAAAADGNsYWltX3RvcGljcwAAA+oAAAAEAAAAAAAAAAI=",
        "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gYSB0cnVzdGVkIGlzc3VlciBpcyByZW1vdmVkLgAAAAAAAAAAFFRydXN0ZWRJc3N1ZXJSZW1vdmVkAAAAAQAAABZ0cnVzdGVkX2lzc3Vlcl9yZW1vdmVkAAAAAAABAAAAAAAAAA50cnVzdGVkX2lzc3VlcgAAAAAAEwAAAAEAAAAC",
        "AAAABAAAAAAAAAAAAAAAGkNsYWltVG9waWNzQW5kSXNzdWVyc0Vycm9yAAAAAAAHAAAAJUluZGljYXRlcyBhIG5vbi1leGlzdGVudCBjbGFpbSB0b3BpYy4AAAAAAAAWQ2xhaW1Ub3BpY0RvZXNOb3RFeGlzdAAAAAABcgAAAChJbmRpY2F0ZXMgYSBub24tZXhpc3RlbnQgdHJ1c3RlZCBpc3N1ZXIuAAAAEklzc3VlckRvZXNOb3RFeGlzdAAAAAABcwAAACdJbmRpY2F0ZXMgYSBjbGFpbSB0b3BpYyBhbHJlYWR5IGV4aXN0cy4AAAAAF0NsYWltVG9waWNBbHJlYWR5RXhpc3RzAAAAAXQAAAAqSW5kaWNhdGVzIGEgdHJ1c3RlZCBpc3N1ZXIgYWxyZWFkeSBleGlzdHMuAAAAAAATSXNzdWVyQWxyZWFkeUV4aXN0cwAAAAF1AAAALEluZGljYXRlcyBtYXggY2xhaW0gdG9waWNzIGxpbWl0IGlzIHJlYWNoZWQuAAAAGk1heENsYWltVG9waWNzTGltaXRSZWFjaGVkAAAAAAF2AAAAL0luZGljYXRlcyBtYXggdHJ1c3RlZCBpc3N1ZXJzIGxpbWl0IGlzIHJlYWNoZWQuAAAAABZNYXhJc3N1ZXJzTGltaXRSZWFjaGVkAAAAAAF3AAAAQ0luZGljYXRlcyBjbGFpbSB0b3BpY3Mgc2V0IHByb3ZpZGVkIGZvciB0aGUgaXNzdWVyIGNhbm5vdCBiZSBlbXB0eS4AAAAAG0NsYWltVG9waWNzU2V0Q2Fubm90QmVFbXB0eQAAAAF4",
        "AAAAAgAAAFBTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgY2xhaW0gdG9waWNzIGFuZCBpc3N1ZXJzCmV4dGVuc2lvbgAAAAAAAAAfQ2xhaW1Ub3BpY3NBbmRJc3N1ZXJzU3RvcmFnZUtleQAAAAAEAAAAAAAAACBTdG9yZXMgdGhlIGNsYWltIHRvcGljcyByZWdpc3RyeQAAAAtDbGFpbVRvcGljcwAAAAAAAAAAI1N0b3JlcyB0aGUgdHJ1c3RlZCBpc3N1ZXJzIHJlZ2lzdHJ5AAAAAA5UcnVzdGVkSXNzdWVycwAAAAAAAQAAAD1TdG9yZXMgdGhlIGNsYWltIHRvcGljcyBhbGxvd2VkIGZvciBhIHNwZWNpZmljIHRydXN0ZWQgaXNzdWVyAAAAAAAAEUlzc3VlckNsYWltVG9waWNzAAAAAAAAAQAAABMAAAABAAAAPVN0b3JlcyB0aGUgdHJ1c3RlZCBpc3N1ZXJzIGFsbG93ZWQgZm9yIGEgc3BlY2lmaWMgY2xhaW0gdG9waWMAAAAAAAARQ2xhaW1Ub3BpY0lzc3VlcnMAAAAAAAABAAAABA==",
        "AAAABAAAADVFcnJvciBjb2RlcyBmb3IgdGhlIElkZW50aXR5IFJlZ2lzdHJ5IFN0b3JhZ2Ugc3lzdGVtLgAAAAAAAAAAAAAISVJTRXJyb3IAAAAIAAAAMUFuIGlkZW50aXR5IGFscmVhZHkgZXhpc3RzIGZvciB0aGUgZ2l2ZW4gYWNjb3VudC4AAAAAAAARSWRlbnRpdHlPdmVyd3JpdGUAAAAAAAFAAAAAKE5vIGlkZW50aXR5IGZvdW5kIGZvciB0aGUgZ2l2ZW4gYWNjb3VudC4AAAAQSWRlbnRpdHlOb3RGb3VuZAAAAUEAAAAuQ291bnRyeSBkYXRhIG5vdCBmb3VuZCBhdCB0aGUgc3BlY2lmaWVkIGluZGV4LgAAAAAAE0NvdW50cnlEYXRhTm90Rm91bmQAAAABQgAAAC9JZGVudGl0eSBjYW4ndCBiZSB3aXRoIGVtcHR5IGNvdW50cnkgZGF0YSBsaXN0LgAAAAAQRW1wdHlDb3VudHJ5TGlzdAAAAUMAAAA3VGhlIG1heGltdW0gbnVtYmVyIG9mIGNvdW50cnkgZW50cmllcyBoYXMgYmVlbiByZWFjaGVkLgAAAAAYTWF4Q291bnRyeUVudHJpZXNSZWFjaGVkAAABRAAAAC5BY2NvdW50IGhhcyBiZWVuIHJlY292ZXJlZCBhbmQgY2Fubm90IGJlIHVzZWQuAAAAAAAQQWNjb3VudFJlY292ZXJlZAAAAUUAAAA9TWV0YWRhdGEgaGFzIHRvbyBtYW55IGVudHJpZXMgKGV4Y2VlZHMgTUFYX01FVEFEQVRBX0VOVFJJRVMpLgAAAAAAABZNZXRhZGF0YVRvb01hbnlFbnRyaWVzAAAAAAFGAAAARE1ldGFkYXRhIHN0cmluZyB2YWx1ZSBpcyB0b28gbG9uZyAoZXhjZWVkcyBNQVhfTUVUQURBVEFfU1RSSU5HX0xFTikuAAAAFU1ldGFkYXRhU3RyaW5nVG9vTG9uZwAAAAAAAUc=",
        "AAAABQAAADhFdmVudCBlbWl0dGVkIHdoZW4gYW4gaWRlbnRpdHkgaXMgc3RvcmVkIGZvciBhbiBhY2NvdW50LgAAAAAAAAAOSWRlbnRpdHlTdG9yZWQAAAAAAAEAAAAPaWRlbnRpdHlfc3RvcmVkAAAAAAIAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAAAAAACGlkZW50aXR5AAAAEwAAAAEAAAAC",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIGZvciBjb3VudHJ5IGRhdGEgb3BlcmF0aW9ucy4AAAAAAAAAAAAQQ291bnRyeURhdGFBZGRlZAAAAAEAAAASY291bnRyeV9kYXRhX2FkZGVkAAAAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAAAAAAAAxjb3VudHJ5X2RhdGEAAAAAAAAAAAAAAAI=",
        "AAAABQAAADpFdmVudCBlbWl0dGVkIHdoZW4gYW4gaWRlbnRpdHkgaXMgbW9kaWZpZWQgZm9yIGFuIGFjY291bnQuAAAAAAAAAAAAEElkZW50aXR5TW9kaWZpZWQAAAABAAAAEWlkZW50aXR5X21vZGlmaWVkAAAAAAAAAgAAAAAAAAAMb2xkX2lkZW50aXR5AAAAEwAAAAEAAAAAAAAADG5ld19pZGVudGl0eQAAABMAAAABAAAAAg==",
        "AAAABQAAADpFdmVudCBlbWl0dGVkIHdoZW4gYW4gaWRlbnRpdHkgaXMgcmVtb3ZlZCBmcm9tIGFuIGFjY291bnQuAAAAAAAAAAAAEElkZW50aXR5VW5zdG9yZWQAAAABAAAAEWlkZW50aXR5X3Vuc3RvcmVkAAAAAAAAAgAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAIaWRlbnRpdHkAAAATAAAAAQAAAAI=",
        "AAAABQAAAD5FdmVudCBlbWl0dGVkIHdoZW4gYW4gaWRlbnRpdHkgaXMgcmVjb3ZlcmVkIGZvciBhIG5ldyBhY2NvdW50LgAAAAAAAAAAABFJZGVudGl0eVJlY292ZXJlZAAAAAAAAAEAAAASaWRlbnRpdHlfcmVjb3ZlcmVkAAAAAAACAAAAAAAAAAtvbGRfYWNjb3VudAAAAAATAAAAAQAAAAAAAAALbmV3X2FjY291bnQAAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAAEkNvdW50cnlEYXRhUmVtb3ZlZAAAAAAAAQAAABRjb3VudHJ5X2RhdGFfcmVtb3ZlZAAAAAIAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAAAAAADGNvdW50cnlfZGF0YQAAAAAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAE0NvdW50cnlEYXRhTW9kaWZpZWQAAAAAAQAAABVjb3VudHJ5X2RhdGFfbW9kaWZpZWQAAAAAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAAAAAAAAxjb3VudHJ5X2RhdGEAAAAAAAAAAAAAAAI=",
        "AAAAAQAAAEhBIGNvdW50cnkgZGF0YSBjb250YWluaW5nIHRoZSBjb3VudHJ5IHJlbGF0aW9uc2hpcCBhbmQgb3B0aW9uYWwgbWV0YWRhdGEAAAAAAAAAC0NvdW50cnlEYXRhAAAAAAIAAAAcVHlwZSBvZiBjb3VudHJ5IHJlbGF0aW9uc2hpcAAAAAdjb3VudHJ5AAAAB9AAAAAPQ291bnRyeVJlbGF0aW9uAAAAADRPcHRpb25hbCBtZXRhZGF0YSAoZS5nLiwgdmlzYSB0eXBlLCB2YWxpZGl0eSBwZXJpb2QpAAAACG1ldGFkYXRhAAAD6AAAA+wAAAARAAAAEA==",
        "AAAAAgAAACZSZXByZXNlbnRzIHRoZSB0eXBlIG9mIGlkZW50aXR5IGhvbGRlcgAAAAAAAAAAAAxJZGVudGl0eVR5cGUAAAACAAAAAAAAAAAAAAAKSW5kaXZpZHVhbAAAAAAAAAAAAAAAAAAMT3JnYW5pemF0aW9u",
        "AAAAAgAAAERTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBJZGVudGl0eSBTdG9yYWdlIFJlZ2lzdHJ5LgAAAAAAAAANSVJTU3RvcmFnZUtleQAAAAAAAAMAAAABAAAAKE1hcHMgYWNjb3VudCBhZGRyZXNzIHRvIGlkZW50aXR5IGFkZHJlc3MAAAAISWRlbnRpdHkAAAABAAAAEwAAAAEAAAAwTWFwcyBhbiBhY2NvdW50IHRvIGl0cyBjb21wbGV0ZSBpZGVudGl0eSBwcm9maWxlAAAAD0lkZW50aXR5UHJvZmlsZQAAAAABAAAAEwAAAAEAAAAuTWFwcyBvbGQgYWNjb3VudCB0byBuZXcgYWNjb3VudCBhZnRlciByZWNvdmVyeQAAAAAAC1JlY292ZXJlZFRvAAAAAAEAAAAT",
        "AAAAAgAAAExVbmlmaWVkIGNvdW50cnkgcmVsYXRpb25zaGlwIHRoYXQgY2FuIGJlIGVpdGhlciBpbmRpdmlkdWFsIG9yIG9yZ2FuaXphdGlvbmFsAAAAAAAAAA9Db3VudHJ5UmVsYXRpb24AAAAAAgAAAAEAAAAAAAAACkluZGl2aWR1YWwAAAAAAAEAAAfQAAAAGUluZGl2aWR1YWxDb3VudHJ5UmVsYXRpb24AAAAAAAABAAAAAAAAAAxPcmdhbml6YXRpb24AAAABAAAH0AAAABtPcmdhbml6YXRpb25Db3VudHJ5UmVsYXRpb24A",
        "AAAAAQAAAENDb21wbGV0ZSBpZGVudGl0eSBwcm9maWxlIGNvbnRhaW5pbmcgaWRlbnRpdHkgdHlwZSBhbmQgY291bnRyeSBkYXRhAAAAAAAAAAAPSWRlbnRpdHlQcm9maWxlAAAAAAIAAAAAAAAACWNvdW50cmllcwAAAAAAA+oAAAfQAAAAC0NvdW50cnlEYXRhAAAAAAAAAAANaWRlbnRpdHlfdHlwZQAAAAAAB9AAAAAMSWRlbnRpdHlUeXBl",
        "AAAAAgAAAGNSZXByZXNlbnRzIGRpZmZlcmVudCB0eXBlcyBvZiBjb3VudHJ5IHJlbGF0aW9uc2hpcHMgZm9yIGluZGl2aWR1YWxzCklTTyAzMTY2LTEgbnVtZXJpYyBjb3VudHJ5IGNvZGUAAAAAAAAAABlJbmRpdmlkdWFsQ291bnRyeVJlbGF0aW9uAAAAAAAABQAAAAEAAAAUQ291bnRyeSBvZiByZXNpZGVuY2UAAAAJUmVzaWRlbmNlAAAAAAAAAQAAAAQAAAABAAAAFkNvdW50cnkgb2YgY2l0aXplbnNoaXAAAAAAAAtDaXRpemVuc2hpcAAAAAABAAAABAAAAAEAAAAdQ291bnRyeSB3aGVyZSBmdW5kcyBvcmlnaW5hdGUAAAAAAAANU291cmNlT2ZGdW5kcwAAAAAAAAEAAAAEAAAAAQAAAClUYXggcmVzaWRlbmN5IChjYW4gZGlmZmVyIGZyb20gcmVzaWRlbmNlKQAAAAAAAAxUYXhSZXNpZGVuY3kAAAABAAAABAAAAAEAAAApQ3VzdG9tIGNvdW50cnkgdHlwZSBmb3IgZnV0dXJlIGV4dGVuc2lvbnMAAAAAAAAGQ3VzdG9tAAAAAAACAAAAEQAAAAQ=",
        "AAAAAgAAAEVSZXByZXNlbnRzIGRpZmZlcmVudCB0eXBlcyBvZiBjb3VudHJ5IHJlbGF0aW9uc2hpcHMgZm9yIG9yZ2FuaXphdGlvbnMAAAAAAAAAAAAAG09yZ2FuaXphdGlvbkNvdW50cnlSZWxhdGlvbgAAAAAFAAAAAQAAACVDb3VudHJ5IG9mIGluY29ycG9yYXRpb24vcmVnaXN0cmF0aW9uAAAAAAAADUluY29ycG9yYXRpb24AAAAAAAABAAAABAAAAAEAAAAlQ291bnRyaWVzIHdoZXJlIG9yZ2FuaXphdGlvbiBvcGVyYXRlcwAAAAAAABVPcGVyYXRpbmdKdXJpc2RpY3Rpb24AAAAAAAABAAAABAAAAAEAAAAQVGF4IGp1cmlzZGljdGlvbgAAAA9UYXhKdXJpc2RpY3Rpb24AAAAAAQAAAAQAAAABAAAAHUNvdW50cnkgd2hlcmUgZnVuZHMgb3JpZ2luYXRlAAAAAAAADVNvdXJjZU9mRnVuZHMAAAAAAAABAAAABAAAAAEAAAApQ3VzdG9tIGNvdW50cnkgdHlwZSBmb3IgZnV0dXJlIGV4dGVuc2lvbnMAAAAAAAAGQ3VzdG9tAAAAAAACAAAAEQAAAAQ=",
        "AAAAAgAAADVTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgUldBYCB0b2tlbgAAAAAAAAAAAAAaSWRlbnRpdHlWZXJpZmllclN0b3JhZ2VLZXkAAAAAAAIAAAAAAAAAKUNsYWltIFRvcGljcyBhbmQgSXNzdWVycyBjb250cmFjdCBhZGRyZXNzAAAAAAAAFUNsYWltVG9waWNzQW5kSXNzdWVycwAAAAAAAAAAAAAqSWRlbnRpdHkgUmVnaXN0cnkgU3RvcmFnZSBjb250cmFjdCBhZGRyZXNzAAAAAAAXSWRlbnRpdHlSZWdpc3RyeVN0b3JhZ2UA",
        "AAAABAAAAAAAAAAAAAAACFJXQUVycm9yAAAADgAAAEVJbmRpY2F0ZXMgYW4gZXJyb3IgcmVsYXRlZCB0byBpbnN1ZmZpY2llbnQgYmFsYW5jZSBmb3IgdGhlIG9wZXJhdGlvbi4AAAAAAAATSW5zdWZmaWNpZW50QmFsYW5jZQAAAAEsAAAALkluZGljYXRlcyBhbiBlcnJvciB3aGVuIGFuIGlucHV0IG11c3QgYmUgPj0gMC4AAAAAAAxMZXNzVGhhblplcm8AAAEtAAAAPkluZGljYXRlcyB0aGUgYWRkcmVzcyBpcyBmcm96ZW4gYW5kIGNhbm5vdCBwZXJmb3JtIG9wZXJhdGlvbnMuAAAAAAANQWRkcmVzc0Zyb3plbgAAAAAAAS4AAAA9SW5kaWNhdGVzIGluc3VmZmljaWVudCBmcmVlIHRva2VucyAoZHVlIHRvIHBhcnRpYWwgZnJlZXppbmcpLgAAAAAAABZJbnN1ZmZpY2llbnRGcmVlVG9rZW5zAAAAAAEvAAAAKUluZGljYXRlcyBhbiBpZGVudGl0eSBjYW5ub3QgYmUgdmVyaWZpZWQuAAAAAAAAGklkZW50aXR5VmVyaWZpY2F0aW9uRmFpbGVkAAAAAAEwAAAAQUluZGljYXRlcyB0aGUgdHJhbnNmZXIgZG9lcyBub3QgY29tcGx5IHdpdGggdGhlIGNvbXBsaWFuY2UgcnVsZXMuAAAAAAAAFFRyYW5zZmVyTm90Q29tcGxpYW50AAABMQAAAEdJbmRpY2F0ZXMgdGhlIG1pbnQgb3BlcmF0aW9uIGRvZXMgbm90IGNvbXBseSB3aXRoIHRoZSBjb21wbGlhbmNlIHJ1bGVzLgAAAAAQTWludE5vdENvbXBsaWFudAAAATIAAAAtSW5kaWNhdGVzIHRoZSBjb21wbGlhbmNlIGNvbnRyYWN0IGlzIG5vdCBzZXQuAAAAAAAAEENvbXBsaWFuY2VOb3RTZXQAAAEzAAAAJEluZGljYXRlcyB0aGUgb25jaGFpbiBJRCBpcyBub3Qgc2V0LgAAAA9PbmNoYWluSWROb3RTZXQAAAABNAAAACFJbmRpY2F0ZXMgdGhlIHZlcnNpb24gaXMgbm90IHNldC4AAAAAAAANVmVyc2lvbk5vdFNldAAAAAAAATUAAAA7SW5kaWNhdGVzIHRoZSBjbGFpbSB0b3BpY3MgYW5kIGlzc3VlcnMgY29udHJhY3QgaXMgbm90IHNldC4AAAAAG0NsYWltVG9waWNzQW5kSXNzdWVyc05vdFNldAAAAAE2AAAAPEluZGljYXRlcyB0aGUgaWRlbnRpdHkgcmVnaXN0cnkgc3RvcmFnZSBjb250cmFjdCBpcyBub3Qgc2V0LgAAAB1JZGVudGl0eVJlZ2lzdHJ5U3RvcmFnZU5vdFNldAAAAAAAATcAAAA0SW5kaWNhdGVzIHRoZSBpZGVudGl0eSB2ZXJpZmllciBjb250cmFjdCBpcyBub3Qgc2V0LgAAABZJZGVudGl0eVZlcmlmaWVyTm90U2V0AAAAAAE4AAAAREluZGljYXRlcyB0aGUgb2xkIGFjY291bnQgYW5kIG5ldyBhY2NvdW50IGhhdmUgZGlmZmVyZW50IGlkZW50aXRpZXMuAAAAEElkZW50aXR5TWlzbWF0Y2gAAAE5",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBmcm96ZW4uAAAAAAAAAAAAAAxUb2tlbnNGcm96ZW4AAAABAAAADXRva2Vuc19mcm96ZW4AAAAAAAACAAAAAAAAAAx1c2VyX2FkZHJlc3MAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAADRFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRkcmVzcyBpcyBmcm96ZW4gb3IgdW5mcm96ZW4uAAAAAAAAAA1BZGRyZXNzRnJvemVuAAAAAAAAAQAAAA5hZGRyZXNzX2Zyb3plbgAAAAAAAgAAAAAAAAAMdXNlcl9hZGRyZXNzAAAAEwAAAAEAAAAAAAAACWlzX2Zyb3plbgAAAAAAAAEAAAABAAAAAg==",
        "AAAABQAAAC5FdmVudCBlbWl0dGVkIHdoZW4gY29tcGxpYW5jZSBjb250cmFjdCBpcyBzZXQuAAAAAAAAAAAADUNvbXBsaWFuY2VTZXQAAAAAAAABAAAADmNvbXBsaWFuY2Vfc2V0AAAAAAABAAAAAAAAAApjb21wbGlhbmNlAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAACdFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSB1bmZyb3plbi4AAAAAAAAAAA5Ub2tlbnNVbmZyb3plbgAAAAAAAQAAAA90b2tlbnNfdW5mcm96ZW4AAAAAAgAAAAAAAAAMdXNlcl9hZGRyZXNzAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYSByZWNvdmVyeSBpcyBzdWNjZXNzZnVsLgAAAAAAAAAPUmVjb3ZlcnlTdWNjZXNzAAAAAAEAAAAQcmVjb3Zlcnlfc3VjY2VzcwAAAAIAAAAAAAAAC29sZF9hY2NvdW50AAAAABMAAAABAAAAAAAAAAtuZXdfYWNjb3VudAAAAAATAAAAAQAAAAI=",
        "AAAABQAAADVFdmVudCBlbWl0dGVkIHdoZW4gaWRlbnRpdHkgdmVyaWZpZXIgY29udHJhY3QgaXMgc2V0LgAAAAAAAAAAAAATSWRlbnRpdHlWZXJpZmllclNldAAAAAABAAAAFWlkZW50aXR5X3ZlcmlmaWVyX3NldAAAAAAAAAEAAAAAAAAAEWlkZW50aXR5X3ZlcmlmaWVyAAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdG9rZW4gb25jaGFpbiBJRCBpcyB1cGRhdGVkLgAAAAAAAAAAFVRva2VuT25jaGFpbklkVXBkYXRlZAAAAAAAAAEAAAAYdG9rZW5fb25jaGFpbl9pZF91cGRhdGVkAAAAAQAAAAAAAAAKb25jaGFpbl9pZAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAADxFdmVudCBlbWl0dGVkIHdoZW4gY2xhaW0gdG9waWNzIGFuZCBpc3N1ZXJzIGNvbnRyYWN0IGlzIHNldC4AAAAAAAAAGENsYWltVG9waWNzQW5kSXNzdWVyc1NldAAAAAEAAAAcY2xhaW1fdG9waWNzX2FuZF9pc3N1ZXJzX3NldAAAAAEAAAAAAAAAGGNsYWltX3RvcGljc19hbmRfaXNzdWVycwAAABMAAAABAAAAAg==",
        "AAAABQAAADRFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBib3VuZCB0byB0aGUgY29udHJhY3QuAAAAAAAAAApUb2tlbkJvdW5kAAAAAAABAAAAC3Rva2VuX2JvdW5kAAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAADhFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyB1bmJvdW5kIGZyb20gdGhlIGNvbnRyYWN0LgAAAAAAAAAMVG9rZW5VbmJvdW5kAAAAAQAAAA10b2tlbl91bmJvdW5kAAAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAI=",
        "AAAABAAAAChFcnJvciBjb2RlcyBmb3IgdGhlIFRva2VuIEJpbmRlciBzeXN0ZW0uAAAAAAAAABBUb2tlbkJpbmRlckVycm9yAAAABQAAADtUaGUgc3BlY2lmaWVkIHRva2VuIHdhcyBub3QgZm91bmQgaW4gdGhlIGJvdW5kIHRva2VucyBsaXN0LgAAAAANVG9rZW5Ob3RGb3VuZAAAAAAAAUoAAAAwQXR0ZW1wdGVkIHRvIGJpbmQgYSB0b2tlbiB0aGF0IGlzIGFscmVhZHkgYm91bmQuAAAAEVRva2VuQWxyZWFkeUJvdW5kAAAAAAABSwAAADNUb3RhbCB0b2tlbiBjYXBhY2l0eSAoTUFYX1RPS0VOUykgaGFzIGJlZW4gcmVhY2hlZC4AAAAAEE1heFRva2Vuc1JlYWNoZWQAAAFMAAAAGUJhdGNoIGJpbmQgc2l6ZSBleGNlZWRlZC4AAAAAAAARQmluZEJhdGNoVG9vTGFyZ2UAAAAAAAFNAAAAHlRoZSBiYXRjaCBjb250YWlucyBkdXBsaWNhdGVzLgAAAAAAE0JpbmRCYXRjaER1cGxpY2F0ZXMAAAABTg==",
        "AAAAAgAAARxTdG9yYWdlIGtleXMgZm9yIHRoZSB0b2tlbiBiaW5kZXIgc3lzdGVtLgoKLSBUb2tlbnMgYXJlIHN0b3JlZCBpbiBidWNrZXRzIG9mIDEwMCBhZGRyZXNzZXMgZWFjaAotIEVhY2ggYnVja2V0IGlzIGEgYFZlYzxBZGRyZXNzPmAgc3RvcmVkIHVuZGVyIGl0cyBidWNrZXQgaW5kZXgKLSBUb3RhbCBjb3VudCBpcyB0cmFja2VkIHNlcGFyYXRlbHkKLSBXaGVuIGEgdG9rZW4gaXMgdW5ib3VuZCwgdGhlIGxhc3QgdG9rZW4gaXMgbW92ZWQgdG8gZmlsbCB0aGUgZ2FwCihzd2FwLXJlbW92ZSBwYXR0ZXJuKQAAAAAAAAAVVG9rZW5CaW5kZXJTdG9yYWdlS2V5AAAAAAAAAgAAAAEAAABFTWFwcyBidWNrZXQgaW5kZXggdG8gYSB2ZWN0b3Igb2YgdG9rZW4gYWRkcmVzc2VzIChtYXggMTAwIHBlciBidWNrZXQpAAAAAAAAC1Rva2VuQnVja2V0AAAAAAEAAAAEAAAAAAAAABtUb3RhbCBjb3VudCBvZiBib3VuZCB0b2tlbnMAAAAAClRvdGFsQ291bnQAAA==",
        "AAAAAgAAADVTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgUldBYCB0b2tlbgAAAAAAAAAAAAANUldBU3RvcmFnZUtleQAAAAAAAAYAAAABAAAAP0Zyb3plbiBzdGF0dXMgb2YgYW4gYWRkcmVzcyAodHJ1ZSA9IGZyb3plbiwgZmFsc2UgPSBub3QgZnJvemVuKQAAAAANQWRkcmVzc0Zyb3plbgAAAAAAAAEAAAATAAAAAQAAAC5BbW91bnQgb2YgdG9rZW5zIGZyb3plbiBmb3IgYSBzcGVjaWZpYyBhZGRyZXNzAAAAAAAMRnJvemVuVG9rZW5zAAAAAQAAABMAAAAAAAAAG0NvbXBsaWFuY2UgY29udHJhY3QgYWRkcmVzcwAAAAAKQ29tcGxpYW5jZQAAAAAAAAAAABpPbmNoYWluSUQgY29udHJhY3QgYWRkcmVzcwAAAAAACU9uY2hhaW5JZAAAAAAAAAAAAAAUVmVyc2lvbiBvZiB0aGUgdG9rZW4AAAAHVmVyc2lvbgAAAAAAAAAAIklkZW50aXR5IFZlcmlmaWVyIGNvbnRyYWN0IGFkZHJlc3MAAAAAABBJZGVudGl0eVZlcmlmaWVy",
        "AAAABQAAAEJFdmVudCBlbWl0dGVkIHdoZW4gdW5kZXJseWluZyBhc3NldHMgYXJlIGRlcG9zaXRlZCBpbnRvIHRoZSB2YXVsdC4AAAAAAAAAAAAHRGVwb3NpdAAAAAABAAAAB2RlcG9zaXQAAAAABQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAhyZWNlaXZlcgAAABMAAAABAAAAAAAAAAZhc3NldHMAAAAAAAsAAAAAAAAAAAAAAAZzaGFyZXMAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAENFdmVudCBlbWl0dGVkIHdoZW4gc2hhcmVzIGFyZSBleGNoYW5nZWQgYmFjayBmb3IgdW5kZXJseWluZyBhc3NldHMuAAAAAAAAAAAIV2l0aGRyYXcAAAABAAAACHdpdGhkcmF3AAAABQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAAAAAAAAIcmVjZWl2ZXIAAAATAAAAAQAAAAAAAAAFb3duZXIAAAAAAAATAAAAAQAAAAAAAAAGYXNzZXRzAAAAAAALAAAAAAAAAAAAAAAGc2hhcmVzAAAAAAALAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAAD1ZhdWx0VG9rZW5FcnJvcgAAAAALAAAANkluZGljYXRlcyBhY2Nlc3MgdG8gdW5pbml0aWFsaXplZCB2YXVsdCBhc3NldCBhZGRyZXNzLgAAAAAAF1ZhdWx0QXNzZXRBZGRyZXNzTm90U2V0AAAAAZAAAAAySW5kaWNhdGVzIHRoYXQgdmF1bHQgYXNzZXQgYWRkcmVzcyBpcyBhbHJlYWR5IHNldC4AAAAAABtWYXVsdEFzc2V0QWRkcmVzc0FscmVhZHlTZXQAAAABkQAAADxJbmRpY2F0ZXMgdGhhdCB2YXVsdCB2aXJ0dWFsIGRlY2ltYWxzIG9mZnNldCBpcyBhbHJlYWR5IHNldC4AAAAkVmF1bHRWaXJ0dWFsRGVjaW1hbHNPZmZzZXRBbHJlYWR5U2V0AAABkgAAADdJbmRpY2F0ZXMgdGhlIGFtb3VudCBpcyBub3QgYSB2YWxpZCB2YXVsdCBhc3NldHMgdmFsdWUuAAAAABhWYXVsdEludmFsaWRBc3NldHNBbW91bnQAAAGTAAAAN0luZGljYXRlcyB0aGUgYW1vdW50IGlzIG5vdCBhIHZhbGlkIHZhdWx0IHNoYXJlcyB2YWx1ZS4AAAAAGFZhdWx0SW52YWxpZFNoYXJlc0Ftb3VudAAAAZQAAABBQXR0ZW1wdGVkIHRvIGRlcG9zaXQgbW9yZSBhc3NldHMgdGhhbiB0aGUgbWF4IGFtb3VudCBmb3IgYWRkcmVzcy4AAAAAAAAXVmF1bHRFeGNlZWRlZE1heERlcG9zaXQAAAABlQAAAD5BdHRlbXB0ZWQgdG8gbWludCBtb3JlIHNoYXJlcyB0aGFuIHRoZSBtYXggYW1vdW50IGZvciBhZGRyZXNzLgAAAAAAFFZhdWx0RXhjZWVkZWRNYXhNaW50AAABlgAAAEJBdHRlbXB0ZWQgdG8gd2l0aGRyYXcgbW9yZSBhc3NldHMgdGhhbiB0aGUgbWF4IGFtb3VudCBmb3IgYWRkcmVzcy4AAAAAABhWYXVsdEV4Y2VlZGVkTWF4V2l0aGRyYXcAAAGXAAAAQEF0dGVtcHRlZCB0byByZWRlZW0gbW9yZSBzaGFyZXMgdGhhbiB0aGUgbWF4IGFtb3VudCBmb3IgYWRkcmVzcy4AAAAWVmF1bHRFeGNlZWRlZE1heFJlZGVlbQAAAAABmAAAACpNYXhpbXVtIG51bWJlciBvZiBkZWNpbWFscyBvZmZzZXQgZXhjZWVkZWQAAAAAAB5WYXVsdE1heERlY2ltYWxzT2Zmc2V0RXhjZWVkZWQAAAAAAZkAAAAxSW5kaWNhdGVzIG92ZXJmbG93IGR1ZSB0byBtYXRoZW1hdGljYWwgb3BlcmF0aW9ucwAAAAAAAAxNYXRoT3ZlcmZsb3cAAAGa",
        "AAAAAgAAAD1TdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgdmF1bHQgZXh0ZW5zaW9uAAAAAAAAAAAAAA9WYXVsdFN0b3JhZ2VLZXkAAAAAAgAAAAAAAAAyU3RvcmVzIHRoZSBhZGRyZXNzIG9mIHRoZSB2YXVsdCdzIHVuZGVybHlpbmcgYXNzZXQAAAAAAAxBc3NldEFkZHJlc3MAAAAAAAAAL1N0b3JlcyB0aGUgdmlydHVhbCBkZWNpbWFscyBvZmZzZXQgb2YgdGhlIHZhdWx0AAAAABVWaXJ0dWFsRGVjaW1hbHNPZmZzZXQAAAA=",
        "AAAAAgAAAB1TdG9yYWdlIGtleSBmb3IgdGhlIGNhcCB2YWx1ZQAAAAAAAAAAAAANQ2FwU3RvcmFnZUtleQAAAAAAAAEAAAAAAAAAAAAAAANDYXAA",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBidXJuZWQuAAAAAAAAAAAAAARCdXJuAAAAAQAAAARidXJuAAAAAgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAADhFdmVudCBlbWl0dGVkIHdoZW4gYSB1c2VyIGlzIGFsbG93ZWQgdG8gdHJhbnNmZXIgdG9rZW5zLgAAAAAAAAALVXNlckFsbG93ZWQAAAAAAQAAAAx1c2VyX2FsbG93ZWQAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAC",
        "AAAABQAAAEFFdmVudCBlbWl0dGVkIHdoZW4gYSB1c2VyIGlzIGRpc2FsbG93ZWQgZnJvbSB0cmFuc2ZlcnJpbmcgdG9rZW5zLgAAAAAAAAAAAAAOVXNlckRpc2FsbG93ZWQAAAAAAAEAAAAPdXNlcl9kaXNhbGxvd2VkAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAI=",
        "AAAAAgAAAEFTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYWxsb3dsaXN0IGV4dGVuc2lvbgAAAAAAAAAAAAATQWxsb3dMaXN0U3RvcmFnZUtleQAAAAABAAAAAQAAACdTdG9yZXMgdGhlIGFsbG93ZWQgc3RhdHVzIG9mIGFuIGFjY291bnQAAAAAB0FsbG93ZWQAAAAAAQAAABM=",
        "AAAABQAAAD5FdmVudCBlbWl0dGVkIHdoZW4gYSB1c2VyIGlzIGJsb2NrZWQgZnJvbSB0cmFuc2ZlcnJpbmcgdG9rZW5zLgAAAAAAAAAAAAtVc2VyQmxvY2tlZAAAAAABAAAADHVzZXJfYmxvY2tlZAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAI=",
        "AAAABQAAAEZFdmVudCBlbWl0dGVkIHdoZW4gYSB1c2VyIGlzIHVuYmxvY2tlZCBhbmQgYWxsb3dlZCB0byB0cmFuc2ZlciB0b2tlbnMuAAAAAAAAAAAADVVzZXJVbmJsb2NrZWQAAAAAAAABAAAADnVzZXJfdW5ibG9ja2VkAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAC",
        "AAAAAgAAAEFTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYmxvY2tsaXN0IGV4dGVuc2lvbgAAAAAAAAAAAAATQmxvY2tMaXN0U3RvcmFnZUtleQAAAAABAAAAAQAAACdTdG9yZXMgdGhlIGJsb2NrZWQgc3RhdHVzIG9mIGFuIGFjY291bnQAAAAAB0Jsb2NrZWQAAAAAAQAAABM=",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWxsb3dhbmNlIGlzIGFwcHJvdmVkLgAAAAAAAAAHQXBwcm92ZQAAAAABAAAAB2FwcHJvdmUAAAAABAAAAAAAAAAFb3duZXIAAAAAAAATAAAAAQAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAASFFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSB0cmFuc2ZlcnJlZCBiZXR3ZWVuIGFkZHJlc3NlcyB3aXRob3V0IGEKbXV4ZWQgZGVzdGluYXRpb24uCgpQZXIgU0VQLTQxLCB0aGUgZXZlbnQgZGF0YSBpcyBhIGJhcmUgYGkxMjhgIHdoZW4gbm8gbXV4ZWQgYWRkcmVzcyBpcwppbnZvbHZlZC4gVGhlIGBkYXRhX2Zvcm1hdCA9ICJzaW5nbGUtdmFsdWUiYCBhdHRyaWJ1dGUgZW5zdXJlcyB0aGUKYGFtb3VudGAgZmllbGQgaXMgc2VyaWFsaXplZCBhcyBhIGJhcmUgdmFsdWUgcmF0aGVyIHRoYW4gYSBtYXAuAAAAAAAAAAAAAAhUcmFuc2ZlcgAAAAEAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAA=",
        "AAAABQAAAZdFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSB0cmFuc2ZlcnJlZCB0byBhIG11eGVkIGFkZHJlc3MuCgpQZXIgU0VQLTQxLCB3aGVuIHRoZSBkZXN0aW5hdGlvbiBpcyBhIFtgTXV4ZWRBZGRyZXNzYF0gdGhlIGV2ZW50IGRhdGEKY2FycmllcyBib3RoIHRoZSBhbW91bnQgYW5kIHRoZSBtdXhlZCBpZGVudGlmaWVyIHNvIHRoYXQgb2ZmLWNoYWluCmNvbnN1bWVycyBjYW4gYXR0cmlidXRlIHRoZSB0cmFuc2ZlciB0byB0aGUgY29ycmVjdCBzdWItYWNjb3VudC4KClVzZXMgYHRvcGljcyA9IFsidHJhbnNmZXIiXWAgc28gdGhhdCBib3RoIFtgVHJhbnNmZXJgXSBhbmQKW2BNdXhlZFRyYW5zZmVyYF0gc2hhcmUgdGhlIHNhbWUgYCJ0cmFuc2ZlciJgIGV2ZW50IHN5bWJvbCwgYXMgcmVxdWlyZWQKYnkgU0VQLTQxLgAAAAAAAAAADU11eGVkVHJhbnNmZXIAAAAAAAABAAAACHRyYW5zZmVyAAAABAAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAAC3RvX211eGVkX2lkAAAAA+gAAAAGAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAAEkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAADwAAAG5JbmRpY2F0ZXMgYW4gZXJyb3IgcmVsYXRlZCB0byB0aGUgY3VycmVudCBiYWxhbmNlIG9mIGFjY291bnQgZnJvbSB3aGljaAp0b2tlbnMgYXJlIGV4cGVjdGVkIHRvIGJlIHRyYW5zZmVycmVkLgAAAAAAE0luc3VmZmljaWVudEJhbGFuY2UAAAAAZAAAAGRJbmRpY2F0ZXMgYSBmYWlsdXJlIHdpdGggdGhlIGFsbG93YW5jZSBtZWNoYW5pc20gd2hlbiBhIGdpdmVuIHNwZW5kZXIKZG9lc24ndCBoYXZlIGVub3VnaCBhbGxvd2FuY2UuAAAAFUluc3VmZmljaWVudEFsbG93YW5jZQAAAAAAAGUAAABNSW5kaWNhdGVzIGFuIGludmFsaWQgdmFsdWUgZm9yIGBsaXZlX3VudGlsX2xlZGdlcmAgd2hlbiBzZXR0aW5nIGFuCmFsbG93YW5jZS4AAAAAAAAWSW52YWxpZExpdmVVbnRpbExlZGdlcgAAAAAAZgAAADJJbmRpY2F0ZXMgYW4gZXJyb3Igd2hlbiBhbiBpbnB1dCB0aGF0IG11c3QgYmUgPj0gMAAAAAAADExlc3NUaGFuWmVybwAAAGcAAAApSW5kaWNhdGVzIG92ZXJmbG93IHdoZW4gYWRkaW5nIHR3byB2YWx1ZXMAAAAAAAAMTWF0aE92ZXJmbG93AAAAaAAAACpJbmRpY2F0ZXMgYWNjZXNzIHRvIHVuaW5pdGlhbGl6ZWQgbWV0YWRhdGEAAAAAAA1VbnNldE1ldGFkYXRhAAAAAAAAaQAAAFJJbmRpY2F0ZXMgdGhhdCB0aGUgb3BlcmF0aW9uIHdvdWxkIGhhdmUgY2F1c2VkIGB0b3RhbF9zdXBwbHlgIHRvIGV4Y2VlZAp0aGUgYGNhcGAuAAAAAAALRXhjZWVkZWRDYXAAAAAAagAAADZJbmRpY2F0ZXMgdGhlIHN1cHBsaWVkIGBjYXBgIGlzIG5vdCBhIHZhbGlkIGNhcCB2YWx1ZS4AAAAAAApJbnZhbGlkQ2FwAAAAAABrAAAAHkluZGljYXRlcyB0aGUgQ2FwIHdhcyBub3Qgc2V0LgAAAAAACUNhcE5vdFNldAAAAAAAAGwAAAAmSW5kaWNhdGVzIHRoZSBTQUMgYWRkcmVzcyB3YXMgbm90IHNldC4AAAAAAAlTQUNOb3RTZXQAAAAAAABtAAAAMEluZGljYXRlcyBhIFNBQyBhZGRyZXNzIGRpZmZlcmVudCB0aGFuIGV4cGVjdGVkLgAAABJTQUNBZGRyZXNzTWlzbWF0Y2gAAAAAAG4AAABDSW5kaWNhdGVzIGEgbWlzc2luZyBmdW5jdGlvbiBwYXJhbWV0ZXIgaW4gdGhlIFNBQyBjb250cmFjdCBjb250ZXh0LgAAAAARU0FDTWlzc2luZ0ZuUGFyYW0AAAAAAABvAAAAREluZGljYXRlcyBhbiBpbnZhbGlkIGZ1bmN0aW9uIHBhcmFtZXRlciBpbiB0aGUgU0FDIGNvbnRyYWN0IGNvbnRleHQuAAAAEVNBQ0ludmFsaWRGblBhcmFtAAAAAAAAcAAAADFUaGUgdXNlciBpcyBub3QgYWxsb3dlZCB0byBwZXJmb3JtIHRoaXMgb3BlcmF0aW9uAAAAAAAADlVzZXJOb3RBbGxvd2VkAAAAAABxAAAANVRoZSB1c2VyIGlzIGJsb2NrZWQgYW5kIGNhbm5vdCBwZXJmb3JtIHRoaXMgb3BlcmF0aW9uAAAAAAAAC1VzZXJCbG9ja2VkAAAAAHI=",
        "AAAAAgAAAClTdG9yYWdlIGtleSBmb3IgYWNjZXNzaW5nIHRoZSBTQUMgYWRkcmVzcwAAAAAAAAAAAAAWU0FDQWRtaW5HZW5lcmljRGF0YUtleQAAAAAAAQAAAAAAAAAAAAAAA1NhYwA=",
        "AAAAAgAAAClTdG9yYWdlIGtleSBmb3IgYWNjZXNzaW5nIHRoZSBTQUMgYWRkcmVzcwAAAAAAAAAAAAAWU0FDQWRtaW5XcmFwcGVyRGF0YUtleQAAAAAAAQAAAAAAAAAAAAAAA1NhYwA=",
        "AAAAAQAAACRTdG9yYWdlIGNvbnRhaW5lciBmb3IgdG9rZW4gbWV0YWRhdGEAAAAAAAAACE1ldGFkYXRhAAAAAwAAAAAAAAAIZGVjaW1hbHMAAAAEAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQ",
        "AAAAAQAAACpTdG9yYWdlIGtleSB0aGF0IG1hcHMgdG8gW2BBbGxvd2FuY2VEYXRhYF0AAAAAAAAAAAAMQWxsb3dhbmNlS2V5AAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAdzcGVuZGVyAAAAABM=",
        "AAAAAQAAAINTdG9yYWdlIGNvbnRhaW5lciBmb3IgdGhlIGFtb3VudCBvZiB0b2tlbnMgZm9yIHdoaWNoIGFuIGFsbG93YW5jZSBpcyBncmFudGVkCmFuZCB0aGUgbGVkZ2VyIG51bWJlciBhdCB3aGljaCB0aGlzIGFsbG93YW5jZSBleHBpcmVzLgAAAAAAAAAADUFsbG93YW5jZURhdGEAAAAAAAACAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABA==",
        "AAAAAgAAADlTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgRnVuZ2libGVUb2tlbmAAAAAAAAAAAAAAEkZ1bmdpYmxlU3RvcmFnZUtleQAAAAAABAAAAAAAAAAAAAAABE1ldGEAAAAAAAAAAAAAAAtUb3RhbFN1cHBseQAAAAABAAAAAAAAAAdCYWxhbmNlAAAAAAEAAAATAAAAAQAAAAAAAAAJQWxsb3dhbmNlAAAAAAAAAQAAB9AAAAAMQWxsb3dhbmNlS2V5",
        "AAAAAgAAAAAAAAAAAAAAFVVwZ3JhZGVhYmxlU3RvcmFnZUtleQAAAAAAAAEAAAAAAAAAAAAAAA1TY2hlbWFWZXJzaW9uAAAA",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIG1lcmtsZSByb290IGlzIHNldC4AAAAAAAAAAAAHU2V0Um9vdAAAAAABAAAACHNldF9yb290AAAAAQAAAAAAAAAEcm9vdAAAAA4AAAAAAAAAAg==",
        "AAAABQAAACdFdmVudCBlbWl0dGVkIHdoZW4gYW4gaW5kZXggaXMgY2xhaW1lZC4AAAAAAAAAAApTZXRDbGFpbWVkAAAAAAABAAAAC3NldF9jbGFpbWVkAAAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAAFk1lcmtsZURpc3RyaWJ1dG9yRXJyb3IAAAAAAAMAAAAbVGhlIG1lcmtsZSByb290IGlzIG5vdCBzZXQuAAAAAApSb290Tm90U2V0AAAAAAUUAAAAJ1RoZSBwcm92aWRlZCBpbmRleCB3YXMgYWxyZWFkeSBjbGFpbWVkLgAAAAATSW5kZXhBbHJlYWR5Q2xhaW1lZAAAAAUVAAAAFVRoZSBwcm9vZiBpcyBpbnZhbGlkLgAAAAAAAAxJbnZhbGlkUHJvb2YAAAUW",
        "AAAAAgAAAD1TdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgTWVya2xlRGlzdHJpYnV0b3JgAAAAAAAAAAAAABtNZXJrbGVEaXN0cmlidXRvclN0b3JhZ2VLZXkAAAAAAgAAAAAAAAAoVGhlIE1lcmtsZSByb290IG9mIHRoZSBkaXN0cmlidXRpb24gdHJlZQAAAARSb290AAAAAQAAACNNYXBzIGFuIGluZGV4IHRvIGl0cyBjbGFpbWVkIHN0YXR1cwAAAAAHQ2xhaW1lZAAAAAABAAAABA==",
        "AAAAAgAAACpSb3VuZGluZyBkaXJlY3Rpb24gZm9yIGRpdmlzaW9uIG9wZXJhdGlvbnMAAAAAAAAAAAAIUm91bmRpbmcAAAADAAAAAAAAACVSb3VuZCB0b3dhcmQgbmVnYXRpdmUgaW5maW5pdHkgKGRvd24pAAAAAAAABUZsb29yAAAAAAAAAAAAACNSb3VuZCB0b3dhcmQgcG9zaXRpdmUgaW5maW5pdHkgKHVwKQAAAAAEQ2VpbAAAAAAAAAAeUm91bmQgdG93YXJkIHplcm8gKHRydW5jYXRpb24pAAAAAAAIVHJ1bmNhdGU=",
        "AAAABAAAAAAAAAAAAAAAFlNvcm9iYW5GaXhlZFBvaW50RXJyb3IAAAAAAAIAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAhPdmVyZmxvdwAABdwAAAAQRGl2aXNpb24gYnkgemVybwAAAA5EaXZpc2lvbkJ5WmVybwAAAAAF3Q==",
        "AAAABAAAAAAAAAAAAAAAC0NyeXB0b0Vycm9yAAAAAAMAAAApVGhlIG1lcmtsZSBwcm9vZiBsZW5ndGggaXMgb3V0IG9mIGJvdW5kcy4AAAAAAAAWTWVya2xlUHJvb2ZPdXRPZkJvdW5kcwAAAAAFeAAAACdUaGUgaW5kZXggb2YgdGhlIGxlYWYgaXMgb3V0IG9mIGJvdW5kcy4AAAAAFk1lcmtsZUluZGV4T3V0T2ZCb3VuZHMAAAAABXkAAAAYTm8gZGF0YSBpbiBoYXNoZXIgc3RhdGUuAAAAEEhhc2hlckVtcHR5U3RhdGUAAAV6",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAAAAAAAAAAGUGF1c2VkAAAAAAABAAAABnBhdXNlZAAAAAAAAAAAAAI=",
        "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHVucGF1c2VkLgAAAAAAAAAIVW5wYXVzZWQAAAABAAAACHVucGF1c2VkAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAADVBhdXNhYmxlRXJyb3IAAAAAAAACAAAANFRoZSBvcGVyYXRpb24gZmFpbGVkIGJlY2F1c2UgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAANRW5mb3JjZWRQYXVzZQAAAAAAA+gAAAA4VGhlIG9wZXJhdGlvbiBmYWlsZWQgYmVjYXVzZSB0aGUgY29udHJhY3QgaXMgbm90IHBhdXNlZC4AAAANRXhwZWN0ZWRQYXVzZQAAAAAAA+k=",
        "AAAAAgAAACJTdG9yYWdlIGtleSBmb3IgdGhlIHBhdXNhYmxlIHN0YXRlAAAAAAAAAAAAElBhdXNhYmxlU3RvcmFnZUtleQAAAAAAAQAAAAAAAAAySW5kaWNhdGVzIHdoZXRoZXIgdGhlIGNvbnRyYWN0IGlzIGluIHBhdXNlZCBzdGF0ZS4AAAAAAAZQYXVzZWQAAA==",
        "AAAABAAAACpFcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdm90ZXMgb3BlcmF0aW9ucy4AAAAAAAAAAAAKVm90ZXNFcnJvcgAAAAAABQAAABtUaGUgbGVkZ2VyIGlzIGluIHRoZSBmdXR1cmUAAAAADEZ1dHVyZUxvb2t1cAAAEAQAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAxNYXRoT3ZlcmZsb3cAABAFAAAAN0F0dGVtcHRpbmcgdG8gdHJhbnNmZXIgbW9yZSB2b3RpbmcgdW5pdHMgdGhhbiBhdmFpbGFibGUAAAAAF0luc3VmZmljaWVudFZvdGluZ1VuaXRzAAAAEAYAAAA/QXR0ZW1wdGluZyB0byBkZWxlZ2F0ZSB0byB0aGUgc2FtZSBkZWxlZ2F0ZSB0aGF0IGlzIGFscmVhZHkgc2V0AAAAAAxTYW1lRGVsZWdhdGUAABAHAAAAQEEgY2hlY2twb2ludCB0aGF0IHdhcyBleHBlY3RlZCB0byBleGlzdCB3YXMgbm90IGZvdW5kIGluIHN0b3JhZ2UAAAASQ2hlY2twb2ludE5vdEZvdW5kAAAAABAI",
        "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWNjb3VudCBjaGFuZ2VzIGl0cyBkZWxlZ2F0ZS4AAAAAAAAAAA9EZWxlZ2F0ZUNoYW5nZWQAAAAAAQAAABBkZWxlZ2F0ZV9jaGFuZ2VkAAAAAwAAACVUaGUgYWNjb3VudCB0aGF0IGNoYW5nZWQgaXRzIGRlbGVnYXRlAAAAAAAACWRlbGVnYXRvcgAAAAAAABMAAAABAAAAHlRoZSBwcmV2aW91cyBkZWxlZ2F0ZSAoaWYgYW55KQAAAAAADWZyb21fZGVsZWdhdGUAAAAAAAPoAAAAEwAAAAAAAAAQVGhlIG5ldyBkZWxlZ2F0ZQAAAAt0b19kZWxlZ2F0ZQAAAAATAAAAAAAAAAI=",
        "AAAABQAAADVFdmVudCBlbWl0dGVkIHdoZW4gYSBkZWxlZ2F0ZSdzIHZvdGluZyBwb3dlciBjaGFuZ2VzLgAAAAAAAAAAAAAURGVsZWdhdGVWb3Rlc0NoYW5nZWQAAAABAAAAFmRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQAAAAAAAMAAAAnVGhlIGRlbGVnYXRlIHdob3NlIHZvdGluZyBwb3dlciBjaGFuZ2VkAAAAAAhkZWxlZ2F0ZQAAABMAAAABAAAAGVRoZSBwcmV2aW91cyB2b3RpbmcgcG93ZXIAAAAAAAAOcHJldmlvdXNfdm90ZXMAAAAAAAoAAAAAAAAAFFRoZSBuZXcgdm90aW5nIHBvd2VyAAAACW5ld192b3RlcwAAAAAAAAoAAAAAAAAAAg==",
        "AAAAAQAAAElBIGNoZWNrcG9pbnQgcmVjb3JkaW5nIHZvdGluZyBwb3dlciBhdCBhIHNwZWNpZmljIGxlZGdlciBzZXF1ZW5jZSBudW1iZXIuAAAAAAAAAAAAAApDaGVja3BvaW50AAAAAAACAAAAO1RoZSBsZWRnZXIgc2VxdWVuY2UgbnVtYmVyIHdoZW4gdGhpcyBjaGVja3BvaW50IHdhcyBjcmVhdGVkAAAAAAZsZWRnZXIAAAAAAAQAAAAvVGhlIHZvdGluZyBwb3dlciBhdCB0aGlzIGxlZGdlciBzZXF1ZW5jZSBudW1iZXIAAAAABXZvdGVzAAAAAAAACg==",
        "AAAAAgAAAMNTZWxlY3RzIHRoZSBjaGVja3BvaW50IHRpbWVsaW5lIHRvIG9wZXJhdGUgb24uCgpFYWNoIHZhcmlhbnQgbWFwcyB0byBhIGRpZmZlcmVudCBzZXQgb2Ygc3RvcmFnZSBrZXlzIHNvIHRoYXQKcGVyLWFjY291bnQgdm90aW5nLXBvd2VyIGhpc3RvcnkgYW5kIGFnZ3JlZ2F0ZSB0b3RhbCBzdXBwbHkgaGlzdG9yeQphcmUga2VwdCBzZXBhcmF0ZS4AAAAAAAAAAA5DaGVja3BvaW50VHlwZQAAAAAAAgAAAAAAAAAjVGhlIGdsb2JhbCB0b3RhbCBzdXBwbHkgY2hlY2twb2ludC4AAAAAC1RvdGFsU3VwcGx5AAAAAAEAAAAxQSBwZXItYWNjb3VudCAoZGVsZWdhdGUpIHZvdGluZy1wb3dlciBjaGVja3BvaW50LgAAAAAAAAdBY2NvdW50AAAAAAEAAAAT",
        "AAAAAgAAAPdTdG9yYWdlIGtleXMgZm9yIHRoZSB2b3RlcyBtb2R1bGUuCgpPbmx5IGRlbGVnYXRlZCB2b3RpbmcgcG93ZXIgY291bnRzIGFzIHZvdGVzIChpLmUuLCBvbmx5IGRlbGVnYXRlZXMgY2FuCnZvdGUpLCBzbyB0aGUgc3RvcmFnZSBkZXNpZ24gdHJhY2tzIGRlbGVnYXRlcyBhbmQgdGhlaXIgY2hlY2twb2ludGVkCnZvdGluZyBwb3dlciBzZXBhcmF0ZWx5IGZyb20gdGhlIHJhdyB2b3RpbmcgdW5pdHMgaGVsZCBieSBlYWNoIGFjY291bnQuAAAAAAAAAAAPVm90ZXNTdG9yYWdlS2V5AAAAAAYAAAABAAAAHE1hcHMgYWNjb3VudCB0byBpdHMgZGVsZWdhdGUAAAAJRGVsZWdhdGVlAAAAAAAAAQAAABMAAAABAAAAJE51bWJlciBvZiBjaGVja3BvaW50cyBmb3IgYSBkZWxlZ2F0ZQAAAA5OdW1DaGVja3BvaW50cwAAAAAAAQAAABMAAAABAAAALUluZGl2aWR1YWwgY2hlY2twb2ludCBmb3IgYSBkZWxlZ2F0ZSBhdCBpbmRleAAAAAAAABJEZWxlZ2F0ZUNoZWNrcG9pbnQAAAAAAAIAAAATAAAABAAAAAAAAAAiTnVtYmVyIG9mIHRvdGFsIHN1cHBseSBjaGVja3BvaW50cwAAAAAAGU51bVRvdGFsU3VwcGx5Q2hlY2twb2ludHMAAAAAAAABAAAAK0luZGl2aWR1YWwgdG90YWwgc3VwcGx5IGNoZWNrcG9pbnQgYXQgaW5kZXgAAAAAFVRvdGFsU3VwcGx5Q2hlY2twb2ludAAAAAAAAAEAAAAEAAAAAQAAAERWb3RpbmcgdW5pdHMgaGVsZCBieSBhbiBhY2NvdW50ICh0cmFja2VkIHNlcGFyYXRlbHkgZnJvbSBkZWxlZ2F0aW9uKQAAAAtWb3RpbmdVbml0cwAAAAABAAAAEw==",
        "AAAABQAAACJFdmVudCBlbWl0dGVkIHdoZW4gYSB2b3RlIGlzIGNhc3QuAAAAAAAAAAAACFZvdGVDYXN0AAAAAQAAAAl2b3RlX2Nhc3QAAAAAAAAFAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAWVGhlIHR5cGUgb2Ygdm90ZSBjYXN0LgAAAAAACXZvdGVfdHlwZQAAAAAAAAQAAAAAAAAAFlRoZSB2b3RpbmcgcG93ZXIgdXNlZC4AAAAAAAZ3ZWlnaHQAAAAAAAoAAAAAAAAAJ1RoZSB2b3RlcidzIGV4cGxhbmF0aW9uIGZvciB0aGVpciB2b3RlLgAAAAAGcmVhc29uAAAAAAAQAAAAAAAAAAI=",
        "AAAABAAAAC1FcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gZ292ZXJub3Igb3BlcmF0aW9ucy4AAAAAAAAAAAAADUdvdmVybm9yRXJyb3IAAAAAAAAXAAAAG1RoZSBwcm9wb3NhbCB3YXMgbm90IGZvdW5kLgAAAAAQUHJvcG9zYWxOb3RGb3VuZAAAE4gAAAAcVGhlIHByb3Bvc2FsIGFscmVhZHkgZXhpc3RzLgAAABVQcm9wb3NhbEFscmVhZHlFeGlzdHMAAAAAABOJAAAAL1RoZSBwcm9wb3NlciBkb2VzIG5vdCBoYXZlIGVub3VnaCB2b3RpbmcgcG93ZXIuAAAAABlJbnN1ZmZpY2llbnRQcm9wb3NlclZvdGVzAAAAAAATigAAACFUaGUgcHJvcG9zYWwgY29udGFpbnMgbm8gYWN0aW9ucy4AAAAAAAANRW1wdHlQcm9wb3NhbAAAAAAAE4sAAABAVGhlIHRhcmdldHMsIGZ1bmN0aW9ucywgYW5kIGFyZ3MgdmVjdG9ycyBoYXZlIGRpZmZlcmVudCBsZW5ndGhzLgAAABVJbnZhbGlkUHJvcG9zYWxMZW5ndGgAAAAAABOMAAAAKFRoZSBwcm9wb3NhbCBpcyBub3QgaW4gdGhlIGFjdGl2ZSBzdGF0ZS4AAAARUHJvcG9zYWxOb3RBY3RpdmUAAAAAABONAAAAH1RoZSBwcm9wb3NhbCBoYXMgbm90IHN1Y2NlZWRlZC4AAAAAFVByb3Bvc2FsTm90U3VjY2Vzc2Z1bAAAAAAAE44AAAAhVGhlIHByb3Bvc2FsIGhhcyBub3QgYmVlbiBxdWV1ZWQuAAAAAAAAEVByb3Bvc2FsTm90UXVldWVkAAAAAAATjwAAACdUaGUgcHJvcG9zYWwgaGFzIGFscmVhZHkgYmVlbiBleGVjdXRlZC4AAAAAF1Byb3Bvc2FsQWxyZWFkeUV4ZWN1dGVkAAAAE5AAAABSVGhlIHByb3Bvc2FsIGlzIGluIGEgbm9uLWNhbmNlbGxhYmxlIHN0YXRlIChgQ2FuY2VsZWRgLCBgRXhwaXJlZGAsIG9yCmBFeGVjdXRlZGApLgAAAAAAFlByb3Bvc2FsTm90Q2FuY2VsbGFibGUAAAAAE5EAAAAiVGhlIHZvdGluZyBkZWxheSBoYXMgbm90IGJlZW4gc2V0LgAAAAAAEVZvdGluZ0RlbGF5Tm90U2V0AAAAAAATkgAAACNUaGUgdm90aW5nIHBlcmlvZCBoYXMgbm90IGJlZW4gc2V0LgAAAAASVm90aW5nUGVyaW9kTm90U2V0AAAAABOTAAAAKFRoZSBwcm9wb3NhbCB0aHJlc2hvbGQgaGFzIG5vdCBiZWVuIHNldC4AAAAXUHJvcG9zYWxUaHJlc2hvbGROb3RTZXQAAAATlAAAABpUaGUgbmFtZSBoYXMgbm90IGJlZW4gc2V0LgAAAAAACk5hbWVOb3RTZXQAAAAAE5UAAAAdVGhlIHZlcnNpb24gaGFzIG5vdCBiZWVuIHNldC4AAAAAAAANVmVyc2lvbk5vdFNldAAAAAAAE5YAAAAdQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZC4AAAAAAAAMTWF0aE92ZXJmbG93AAATlwAAAC9UaGUgYWNjb3VudCBoYXMgYWxyZWFkeSB2b3RlZCBvbiB0aGlzIHByb3Bvc2FsLgAAAAAMQWxyZWFkeVZvdGVkAAATmAAAAC5UaGUgdm90ZSB0eXBlIGlzIGludmFsaWQgKG11c3QgYmUgMCwgMSwgb3IgMikuAAAAAAAPSW52YWxpZFZvdGVUeXBlAAAAE5kAAAAcVGhlIHF1b3J1bSBoYXMgbm90IGJlZW4gc2V0LgAAAAxRdW9ydW1Ob3RTZXQAABOaAAAAR1RoZSB0b2tlbiBjb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIHNldCAoY2FuIG9ubHkgYmUgaW5pdGlhbGl6ZWQgb25jZSkuAAAAABdUb2tlbkNvbnRyYWN0QWxyZWFkeVNldAAAABObAAAAJFRoZSB0b2tlbiBjb250cmFjdCBoYXMgbm90IGJlZW4gc2V0LgAAABNUb2tlbkNvbnRyYWN0Tm90U2V0AAAAE5wAAAA8VGhlIHByb3Bvc2FsIGRlc2NyaXB0aW9uIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAEkRlc2NyaXB0aW9uVG9vTG9uZwAAAAATnQAAAClRdWV1aW5nIGlzIG5vdCBlbmFibGVkIGZvciB0aGlzIGdvdmVybm9yLgAAAAAAAA9RdWV1ZU5vdEVuYWJsZWQAAAATng==",
        "AAAAAwAABABUaGUgc3RhdGUgb2YgYSBwcm9wb3NhbCBpbiBpdHMgbGlmZWN5Y2xlLgoKU3RhdGVzIGFyZSBkaXZpZGVkIGludG8gdHdvIGNhdGVnb3JpZXM6CgojIyBUaW1lLWJhc2VkIHN0YXRlcyAoZGVyaXZlZCwgbmV2ZXIgc3RvcmVkIGV4cGxpY2l0bHkpCgpUaGVzZSBhcmUgY29tcHV0ZWQgYnkgW2BnZXRfcHJvcG9zYWxfc3RhdGUoKWBdIGZyb20gdGhlIGN1cnJlbnQgbGVkZ2VyCnJlbGF0aXZlIHRvIHRoZSBwcm9wb3NhbCdzIHZvdGluZyBzY2hlZHVsZS4gVGhleSBhcmUgb25seSByZXR1cm5lZCB3aGVuCm5vIGV4cGxpY2l0IHN0YXRlIGhhcyBiZWVuIHNldC4KCi0gW2BQZW5kaW5nYF0oUHJvcG9zYWxTdGF0ZTo6UGVuZGluZykg4oCUIHZvdGluZyBoYXMgbm90IHN0YXJ0ZWQgeWV0LgotIFtgQWN0aXZlYF0oUHJvcG9zYWxTdGF0ZTo6QWN0aXZlKSDigJQgdm90aW5nIGlzIG9uZ29pbmcuCi0gW2BEZWZlYXRlZGBdKFByb3Bvc2FsU3RhdGU6OkRlZmVhdGVkKSDigJQgdm90aW5nIGVuZGVkICoqd2l0aG91dCoqIHRoZQpjb3VudGluZyBsb2dpYyBtYXJraW5nIHRoZSBwcm9wb3NhbCBhcyBgU3VjY2VlZGVkYC4KCiMjIEV4cGxpY2l0IHN0YXRlcwoKU2V0IGV4cGxpY2l0bHkgYnkgdGhlIEdvdmVybm9yIG9yIGl0cyBleHRlbnNpb25zIGFuZCBwZXJzaXN0ZWQgaW4Kc3RvcmFnZS4gT25jZSBzZXQsIHRoZXkgdGFrZSBwcmVjZWRlbmNlIG92ZXIgYW55IHRpbWUtYmFzZWQgZGVyaXZhdGlvbi4KCi0gW2BDYW5jZWxlZGBdKFByb3Bvc2FsU3RhdGU6OkNhbmNlbGVkKSDigJQgc2V0IGJ5IHRoZSBHb3Zlcm5vci4KLSBbYFN1Y2NlZWRlZGBdKFByb3Bvc2FsU3RhdGU6OlN1Y2NlZWRlZCkg4oCUIHNldCBieSB0aGUgY291bnRpbmcgbG9naWMuCi0gW2BRdWV1ZWRgXShQcm9wb3NhbFN0YXRlOjpRdWV1ZWQpIC8gW2BFeHBpcmVkYF0oUHJvcG9zYWxTdGF0ZTo6RXhwaXJlZCkg4oCUCnNldCBieSBleHRlbnNpb25zIGxpa2UgYFRpbWVsb2NrQ29udHJvbGAuCi0gW2BFeGVjdXRlZGBdKFByb3Bvc2FsU3RhdGU6OkV4ZWN1AAAAAAAAAA1Qcm9wb3NhbFN0YXRlAAAAAAAACAAAADdUaGUgcHJvcG9zYWwgaXMgcGVuZGluZyBhbmQgdm90aW5nIGhhcyBub3Qgc3RhcnRlZCB5ZXQuAAAAAAdQZW5kaW5nAAAAAAAAAAAtVGhlIHByb3Bvc2FsIGlzIGFjdGl2ZSBhbmQgdm90aW5nIGlzIG9uZ29pbmcuAAAAAAAABkFjdGl2ZQAAAAAAAQAAAMhUaGUgcHJvcG9zYWwgd2FzIGRlZmVhdGVkIChkaWQgbm90IG1lZXQgcXVvcnVtIG9yIG1ham9yaXR5KS4gVGhpcyBpcwp0aGUgZGVmYXVsdCBvdXRjb21lIHdoZW4gdm90aW5nIGVuZHMgYW5kIHRoZSBjb3VudGluZyBsb2dpYyBoYXMKbm90IG1hcmtlZCB0aGUgcHJvcG9zYWwgYXMgW2BTdWNjZWVkZWRgXShQcm9wb3NhbFN0YXRlOjpTdWNjZWVkZWQpLgAAAAhEZWZlYXRlZAAAAAIAAAA1VGhlIHByb3Bvc2FsIGhhcyBiZWVuIGNhbmNlbGxlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAAAAAIQ2FuY2VsZWQAAAADAAAA3lRoZSBwcm9wb3NhbCBzdWNjZWVkZWQgYW5kIGNhbiBiZSBleGVjdXRlZC4gU2V0IGJ5IHRoZSBjb3VudGluZwpsb2dpYyB3aGVuIHRoZSBwcm9wb3NhbCBtZWV0cyB0aGUgcmVxdWlyZWQgcXVvcnVtIGFuZCB2b3RlCnRocmVzaG9sZHMuIElmIGEgcXVldWluZyBleHRlbnNpb24gaXMgZW5hYmxlZCwgdGhpcyBzdGF0ZSBtZWFucyB0aGUKcHJvcG9zYWwgaXMgcmVhZHkgdG8gYmUgcXVldWVkLgAAAAAACVN1Y2NlZWRlZAAAAAAAAAQAAABPVGhlIHByb3Bvc2FsIGlzIHF1ZXVlZCBmb3IgZXhlY3V0aW9uLiBTZXQgYnkgZXh0ZW5zaW9ucyBsaWtlCmBUaW1lbG9ja0NvbnRyb2xgLgAAAAAGUXVldWVkAAAAAAAFAAAAYVRoZSBwcm9wb3NhbCBoYXMgZXhwaXJlZCBhbmQgY2FuIG5vIGxvbmdlciBiZSBleGVjdXRlZC4gU2V0IGJ5CmV4dGVuc2lvbnMgbGlrZSBgVGltZWxvY2tDb250cm9sYC4AAAAAAAAHRXhwaXJlZAAAAAAGAAAANFRoZSBwcm9wb3NhbCBoYXMgYmVlbiBleGVjdXRlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAIRXhlY3V0ZWQAAAAH",
        "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIHF1b3J1bSB2YWx1ZSBpcyBjaGFuZ2VkLgAAAAAAAAAADVF1b3J1bUNoYW5nZWQAAAAAAAABAAAADnF1b3J1bV9jaGFuZ2VkAAAAAAACAAAAAAAAAApvbGRfcXVvcnVtAAAAAAAKAAAAAAAAAAAAAAAKbmV3X3F1b3J1bQAAAAAACgAAAAAAAAAC",
        "AAAABQAAAChFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBxdWV1ZWQuAAAAAAAAAA5Qcm9wb3NhbFF1ZXVlZAAAAAAAAQAAAA9wcm9wb3NhbF9xdWV1ZWQAAAAAAgAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAAAAAANldGEAAAAABAAAAAAAAAAC",
        "AAAABQAAAClFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjcmVhdGVkLgAAAAAAAAAAAAAPUHJvcG9zYWxDcmVhdGVkAAAAAAEAAAAQcHJvcG9zYWxfY3JlYXRlZAAAAAgAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAQAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAAAAAACWZ1bmN0aW9ucwAAAAAAA+oAAAARAAAAAAAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAAAAAADXZvdGVfc25hcHNob3QAAAAAAAAEAAAAAAAAAAAAAAAIdm90ZV9lbmQAAAAEAAAAAAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAC",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBleGVjdXRlZC4AAAAAAAAAAAAQUHJvcG9zYWxFeGVjdXRlZAAAAAEAAAARcHJvcG9zYWxfZXhlY3V0ZWQAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAC",
        "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjYW5jZWxsZWQuAAAAAAAAAAARUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAABAAAAEnByb3Bvc2FsX2NhbmNlbGxlZAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAg==",
        "AAAAAQAAACNDb3JlIHByb3Bvc2FsIGRhdGEgc3RvcmVkIG9uLWNoYWluLgAAAAAAAAAADFByb3Bvc2FsQ29yZQAAAAQAAAAmVGhlIGFkZHJlc3MgdGhhdCBjcmVhdGVkIHRoZSBwcm9wb3NhbC4AAAAAAAhwcm9wb3NlcgAAABMAAAAiVGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIHByb3Bvc2FsLgAAAAAABXN0YXRlAAAAAAAH0AAAAA1Qcm9wb3NhbFN0YXRlAAAAAAAAM1RoZSBsYXN0IGxlZGdlciB3aGVyZSB2b3RpbmcgaXMgYWN0aXZlIChpbmNsdXNpdmUpLgAAAAAIdm90ZV9lbmQAAAAEAAAAZ1RoZSBsZWRnZXIgYXQgd2hpY2ggdm90aW5nIHBvd2VyIGlzIHNuYXBzaG90dGVkLiBWb3Rpbmcgb3BlbnMgb24KdGhlIG5leHQgbGVkZ2VyIChgdm90ZV9zbmFwc2hvdCArIDFgKS4AAAAADXZvdGVfc25hcHNob3QAAAAAAAAE",
        "AAAAAQAAAERBIHF1b3J1bSBjaGVja3BvaW50IHJlY29yZGluZyB0aGUgcXVvcnVtIHZhbHVlIGF0IGEgc3BlY2lmaWMgbGVkZ2VyLgAAAAAAAAAQUXVvcnVtQ2hlY2twb2ludAAAAAIAAAAyVGhlIGxlZGdlciBhdCB3aGljaCB0aGlzIHF1b3J1bSB2YWx1ZSB0b29rIGVmZmVjdC4AAAAAAAZsZWRnZXIAAAAAAAQAAAARVGhlIHF1b3J1bSB2YWx1ZS4AAAAAAAAGcXVvcnVtAAAAAAAK",
        "AAAAAgAAACdTdG9yYWdlIGtleXMgZm9yIHRoZSBHb3Zlcm5vciBjb250cmFjdC4AAAAAAAAAABJHb3Zlcm5vclN0b3JhZ2VLZXkAAAAAAAsAAAAAAAAAGVRoZSBuYW1lIG9mIHRoZSBnb3Zlcm5vci4AAAAAAAAETmFtZQAAAAAAAAAlVGhlIHZlcnNpb24gb2YgdGhlIGdvdmVybm9yIGNvbnRyYWN0LgAAAAAAAAdWZXJzaW9uAAAAAAAAAAAcVGhlIHZvdGluZyBkZWxheSBpbiBsZWRnZXJzLgAAAAtWb3RpbmdEZWxheQAAAAAAAAAAHVRoZSB2b3RpbmcgcGVyaW9kIGluIGxlZGdlcnMuAAAAAAAADFZvdGluZ1BlcmlvZAAAAAAAAAApTWluaW11bSB2b3RpbmcgcG93ZXIgcmVxdWlyZWQgdG8gcHJvcG9zZS4AAAAAAAARUHJvcG9zYWxUaHJlc2hvbGQAAAAAAAABAAAAJVByb3Bvc2FsIGRhdGEgaW5kZXhlZCBieSBwcm9wb3NhbCBJRC4AAAAAAAAIUHJvcG9zYWwAAAABAAAD7gAAACAAAAAAAAAAHU51bWJlciBvZiBxdW9ydW0gY2hlY2twb2ludHMuAAAAAAAAFE51bVF1b3J1bUNoZWNrcG9pbnRzAAAAAQAAACZJbmRpdmlkdWFsIHF1b3J1bSBjaGVja3BvaW50IGF0IGluZGV4LgAAAAAAEFF1b3J1bUNoZWNrcG9pbnQAAAABAAAABAAAAAEAAAA0Vm90ZSB0YWxsaWVzIGZvciBhIHByb3Bvc2FsLCBpbmRleGVkIGJ5IHByb3Bvc2FsIElELgAAAAxQcm9wb3NhbFZvdGUAAAABAAAD7gAAACAAAAABAAAAK1doZXRoZXIgYW4gYWNjb3VudCBoYXMgdm90ZWQgb24gYSBwcm9wb3NhbC4AAAAACEhhc1ZvdGVkAAAAAgAAA+4AAAAgAAAAEwAAAAAAAABCVGhlIGFkZHJlc3Mgb2YgdGhlIHRva2VuIGNvbnRyYWN0IHRoYXQgaW1wbGVtZW50cyB0aGUgVm90ZXMgdHJhaXQuAAAAAAANVG9rZW5Db250cmFjdAAAAA==",
        "AAAAAQAAABxWb3RlIHRhbGxpZXMgZm9yIGEgcHJvcG9zYWwuAAAAAAAAABJQcm9wb3NhbFZvdGVDb3VudHMAAAAAAAMAAAAjVG90YWwgdm90aW5nIHBvd2VyIGNhc3QgYXMgYWJzdGFpbi4AAAAADWFic3RhaW5fdm90ZXMAAAAAAAAKAAAALVRvdGFsIHZvdGluZyBwb3dlciBjYXN0IGFnYWluc3QgdGhlIHByb3Bvc2FsLgAAAAAAAA1hZ2FpbnN0X3ZvdGVzAAAAAAAACgAAADFUb3RhbCB2b3RpbmcgcG93ZXIgY2FzdCBpbiBmYXZvciBvZiB0aGUgcHJvcG9zYWwuAAAAAAAACWZvcl92b3RlcwAAAAAAAAo=",
        "AAAABAAAAC1FcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdGltZWxvY2sgb3BlcmF0aW9ucy4AAAAAAAAAAAAADVRpbWVsb2NrRXJyb3IAAAAAAAAHAAAAIlRoZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBzY2hlZHVsZWQAAAAAABlPcGVyYXRpb25BbHJlYWR5U2NoZWR1bGVkAAAAAAAPoAAAADFUaGUgZGVsYXkgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtIHJlcXVpcmVkIGRlbGF5AAAAAAAAEUluc3VmZmljaWVudERlbGF5AAAAAAAPoQAAACpUaGUgb3BlcmF0aW9uIGlzIG5vdCBpbiB0aGUgZXhwZWN0ZWQgc3RhdGUAAAAAABVJbnZhbGlkT3BlcmF0aW9uU3RhdGUAAAAAAA+iAAAAMUEgcHJlZGVjZXNzb3Igb3BlcmF0aW9uIGhhcyBub3QgYmVlbiBleGVjdXRlZCB5ZXQAAAAAAAAVVW5leGVjdXRlZFByZWRlY2Vzc29yAAAAAAAPowAAADNUaGUgY2FsbGVyIGlzIG5vdCBhdXRob3JpemVkIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24AAAAADFVuYXV0aG9yaXplZAAAD6QAAAAiVGhlIG1pbmltdW0gZGVsYXkgaGFzIG5vdCBiZWVuIHNldAAAAAAADk1pbkRlbGF5Tm90U2V0AAAAAA+lAAAAJFRoZSBvcGVyYXRpb24gaGFzIG5vdCBiZWVuIHNjaGVkdWxlZAAAABVPcGVyYXRpb25Ob3RTY2hlZHVsZWQAAAAAAA+m",
        "AAAABQAAADBFdmVudCBlbWl0dGVkIHdoZW4gdGhlIG1pbmltdW0gZGVsYXkgaXMgY2hhbmdlZC4AAAAAAAAAD01pbkRlbGF5Q2hhbmdlZAAAAAABAAAAEW1pbl9kZWxheV9jaGFuZ2VkAAAAAAAAAgAAAAAAAAAJb2xkX2RlbGF5AAAAAAAABAAAAAAAAAAAAAAACW5ld19kZWxheQAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIGV4ZWN1dGVkLgAAAAAAAAART3BlcmF0aW9uRXhlY3V0ZWQAAAAAAAABAAAAEm9wZXJhdGlvbl9leGVjdXRlZAAAAAAABgAAAAAAAAACaWQAAAAAA+4AAAAgAAAAAQAAAAAAAAAGdGFyZ2V0AAAAAAATAAAAAQAAAAAAAAAIZnVuY3Rpb24AAAARAAAAAAAAAAAAAAAEYXJncwAAA+oAAAAAAAAAAAAAAAAAAAALcHJlZGVjZXNzb3IAAAAD7gAAACAAAAAAAAAAAAAAAARzYWx0AAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIGNhbmNlbGxlZC4AAAAAAAAAAAAAEk9wZXJhdGlvbkNhbmNlbGxlZAAAAAAAAQAAABNvcGVyYXRpb25fY2FuY2VsbGVkAAAAAAEAAAAAAAAAAmlkAAAAAAPuAAAAIAAAAAEAAAAC",
        "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIHNjaGVkdWxlZC4AAAAAAAAAAAAAEk9wZXJhdGlvblNjaGVkdWxlZAAAAAAAAQAAABNvcGVyYXRpb25fc2NoZWR1bGVkAAAAAAcAAAAAAAAAAmlkAAAAAAPuAAAAIAAAAAEAAAAAAAAABnRhcmdldAAAAAAAEwAAAAEAAAAAAAAACGZ1bmN0aW9uAAAAEQAAAAAAAAAAAAAABGFyZ3MAAAPqAAAAAAAAAAAAAAAAAAAAC3ByZWRlY2Vzc29yAAAAA+4AAAAgAAAAAAAAAAAAAAAEc2FsdAAAA+4AAAAgAAAAAAAAAAAAAAAFZGVsYXkAAAAAAAAEAAAAAAAAAAI=",
        "AAAAAQAAALtSZXByZXNlbnRzIGEgb3BlcmF0aW9uIHRvIGJlIGV4ZWN1dGVkIGJ5IHRoZSB0aW1lbG9jay4KCkFuIG9wZXJhdGlvbiBlbmNhcHN1bGF0ZXMgYWxsIHRoZSBpbmZvcm1hdGlvbiBuZWVkZWQgdG8gaW52b2tlIGEgZnVuY3Rpb24Kb24gYSB0YXJnZXQgY29udHJhY3QgYWZ0ZXIgdGhlIHRpbWVsb2NrIGRlbGF5IGhhcyBwYXNzZWQuAAAAAAAAAAAJT3BlcmF0aW9uAAAAAAAABQAAADBUaGUgc2VyaWFsaXplZCBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgZnVuY3Rpb24AAAAEYXJncwAAA+oAAAAAAAAAMlRoZSBmdW5jdGlvbiBuYW1lIHRvIGludm9rZSBvbiB0aGUgdGFyZ2V0IGNvbnRyYWN0AAAAAAAIZnVuY3Rpb24AAAARAAAAeUhhc2ggb2YgYSBwcmVkZWNlc3NvciBvcGVyYXRpb24gdGhhdCBtdXN0IGJlIGV4ZWN1dGVkIGZpcnN0LgpVc2UgQnl0ZXNOOjo8MzI+Ojpmcm9tX2FycmF5KCZbMHU4OyAzMl0pIGZvciBubyBwcmVkZWNlc3Nvci4AAAAAAAALcHJlZGVjZXNzb3IAAAAD7gAAACAAAABuQSBzYWx0IHZhbHVlIGZvciBvcGVyYXRpb24gdW5pcXVlbmVzcy4KQWxsb3dzIHNjaGVkdWxpbmcgdGhlIHNhbWUgb3BlcmF0aW9uIG11bHRpcGxlIHRpbWVzIHdpdGggZGlmZmVyZW50IElEcy4AAAAAAARzYWx0AAAD7gAAACAAAAAcVGhlIGNvbnRyYWN0IGFkZHJlc3MgdG8gY2FsbAAAAAZ0YXJnZXQAAAAAABM=",
        "AAAAAgAAADFUaGUgc3RhdGUgb2YgYW4gb3BlcmF0aW9uIGluIHRoZSB0aW1lbG9jayBzeXN0ZW0uAAAAAAAAAAAAAA5PcGVyYXRpb25TdGF0ZQAAAAAABAAAAAAAAAAgT3BlcmF0aW9uIGhhcyBub3QgYmVlbiBzY2hlZHVsZWQAAAAFVW5zZXQAAAAAAAAAAAAAOk9wZXJhdGlvbiBpcyBzY2hlZHVsZWQgYnV0IHRoZSBkZWxheSBwZXJpb2QgaGFzIG5vdCBwYXNzZWQAAAAAAAdXYWl0aW5nAAAAAAAAAAA0T3BlcmF0aW9uIGlzIHJlYWR5IHRvIGJlIGV4ZWN1dGVkIChkZWxheSBoYXMgcGFzc2VkKQAAAAVSZWFkeQAAAAAAAAAAAAAbT3BlcmF0aW9uIGhhcyBiZWVuIGV4ZWN1dGVkAAAAAAREb25l",
        "AAAAAgAAACVTdG9yYWdlIGtleXMgZm9yIHRoZSB0aW1lbG9jayBtb2R1bGUuAAAAAAAAAAAAABJUaW1lbG9ja1N0b3JhZ2VLZXkAAAAAAAIAAAAAAAAAJ01pbmltdW0gZGVsYXkgaW4gbGVkZ2VycyBmb3Igb3BlcmF0aW9ucwAAAAAITWluRGVsYXkAAAABAAAAtk1hcHMgb3BlcmF0aW9uIElEIHRvIHRoZSBsZWRnZXIgc2VxdWVuY2UgbnVtYmVyIHdoZW4gaXQgd2lsbCBiZSBpbiBhCltgT3BlcmF0aW9uU3RhdGU6OlJlYWR5YF0gc3RhdGUgKE5vdGU6IHZhbHVlIGlzIDAgZm9yCltgT3BlcmF0aW9uU3RhdGU6OlVuc2V0YF0sIDEgZm9yIFtgT3BlcmF0aW9uU3RhdGU6OkRvbmVgXSkuAAAAAAAPT3BlcmF0aW9uTGVkZ2VyAAAAAAEAAAPuAAAAIA==",
        "AAAAAgAAAAAAAAAAAAAABk9wS2luZAAAAAAAAQAAAAAAAAAAAAAACFdpdGhkcmF3",
        "AAAAAQAAAAAAAAAAAAAABlN0cmVhbQAAAAAADQAAAAAAAAAJZGVwb3NpdGVkAAAAAAAACwAAAAAAAAAGZW5kX3RzAAAAAAAGAAAAAAAAAA1pc19jYW5jZWxhYmxlAAAAAAAAAQAAAAAAAAALaXNfZGVwbGV0ZWQAAAAAAQAAAAAAAAAPaXNfdHJhbnNmZXJhYmxlAAAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACHJlZnVuZGVkAAAACwAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAVzaGFwZQAAAAAAB9AAAAALU3RyZWFtU2hhcGUAAAAAAAAAAAhzdGFydF90cwAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAMd2FzX2NhbmNlbGVkAAAAAQAAAAAAAAAJd2l0aGRyYXduAAAAAAAACw==",
        "AAAAAQAAAAAAAAAAAAAAB1RyYW5jaGUAAAAAAgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAJ0cwAAAAAABg==",
        "AAAAAQAAAAAAAAAAAAAAC0xpbmVhclNoYXBlAAAAAAMAAAAAAAAACGNsaWZmX3RzAAAABgAAAAAAAAAPdW5sb2NrX2F0X2NsaWZmAAAAAAsAAAAAAAAAD3VubG9ja19hdF9zdGFydAAAAAAL",
        "AAAAAgAAAAAAAAAAAAAAC1N0cmVhbVNoYXBlAAAAAAIAAAABAAAAAAAAAAZMaW5lYXIAAAAAAAEAAAfQAAAAC0xpbmVhclNoYXBlAAAAAAEAAAAAAAAACFRyYW5jaGVkAAAAAQAAB9AAAAANVHJhbmNoZWRTaGFwZQAAAA==",
        "AAAAAgAAAAAAAAAAAAAADFN0cmVhbVN0YXR1cwAAAAUAAAAAAAAAAAAAAAdQZW5kaW5nAAAAAAAAAAAAAAAACVN0cmVhbWluZwAAAAAAAAAAAAAAAAAAB1NldHRsZWQAAAAAAAAAAAAAAAAIQ2FuY2VsZWQAAAAAAAAAAAAAAAhEZXBsZXRlZA==",
        "AAAAAQAAAAAAAAAAAAAADVRyYW5jaGVkU2hhcGUAAAAAAAABAAAAAAAAAAh0cmFuY2hlcwAAA+oAAAfQAAAAB1RyYW5jaGUA",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAGQAAAFJJbnZhbGlkIGNhbGwg4oCUIGdlbmVyaWMgY2F0Y2gtYWxsIChhdm9pZCBpbiBuZXcgY29kZTsgcHJlZmVyIGEgc3BlY2lmaWMgdmFyaWFudCkuAAAAAAALSW52YWxpZENhbGwAAAAAAQAAABREZXBvc2l0IG11c3QgYmUgPiAwLgAAAAtaZXJvRGVwb3NpdAAAAAAKAAAAHmBzdGFydF90c2AgbXVzdCBiZSA8IGBlbmRfdHNgLgAAAAAADVN0YXJ0QWZ0ZXJFbmQAAAAAAAALAAAALWBjbGlmZl90c2AgbXVzdCBiZSBpbiBbYHN0YXJ0X3RzYCwgYGVuZF90c2BdLgAAAAAAAA9DbGlmZk91dE9mUmFuZ2UAAAAADAAAADxgdW5sb2NrX2F0X3N0YXJ0ICsgdW5sb2NrX2F0X2NsaWZmYCBtdXN0IGJlIOKJpCBgZGVwb3NpdGVkYC4AAAAUVW5sb2Nrc0V4Y2VlZERlcG9zaXQAAAANAAAAHkF0IGxlYXN0IG9uZSB0cmFuY2hlIHJlcXVpcmVkLgAAAAAACk5vVHJhbmNoZXMAAAAAAA4AAAAsVHJhbmNoZXMgbXVzdCBiZSBzdHJpY3RseSBhc2NlbmRpbmcgYnkgYHRzYC4AAAAUVHJhbmNoZXNOb3RBc2NlbmRpbmcAAAAPAAAALlN1bSBvZiB0cmFuY2hlIGFtb3VudHMgbXVzdCBlcXVhbCBgZGVwb3NpdGVkYC4AAAAAABJUcmFuY2hlU3VtTWlzbWF0Y2gAAAAAABAAAAAlVHJhbmNoZSBjb3VudCBleGNlZWRzIGBNQVhfVFJBTkNIRVNgLgAAAAAAAA9Ub29NYW55VHJhbmNoZXMAAAAAEQAAAEFgc3RhcnRfdHNgIChvciBmaXJzdCB0cmFuY2hlIHRzKSBtdXN0IGJlIOKJpSBjdXJyZW50IGxlZGdlciB0aW1lLgAAAAAAAAtTdGFydEluUGFzdAAAAAASAAAAGFN0cmVhbSBpZCBoYXMgbm8gcmVjb3JkLgAAAA5TdHJlYW1Ob3RGb3VuZAAAAAAAHgAAACdDYWxsZXIgaXMgbm90IHRoZSBzZW5kZXIgb2YgdGhlIHN0cmVhbS4AAAAACU5vdFNlbmRlcgAAAAAAAB8AAAA/Q2FsbGVyIGlzIG5vdCB0aGUgcmVjaXBpZW50IChORlQgb3duZXIpIG9yIGFuIGFwcHJvdmVkIHNwZW5kZXIuAAAAAAxOb3RSZWNpcGllbnQAAAAgAAAAQ1N0cmVhbSBpcyBub3QgY2FuY2VsYWJsZSAod2FzIHJlbm91bmNlZCBvciBjcmVhdGVkIG5vbi1jYW5jZWxhYmxlKS4AAAAADU5vdENhbmNlbGFibGUAAAAAAAAhAAAAG1N0cmVhbSBpcyBub3QgdHJhbnNmZXJhYmxlLgAAAAAPTm90VHJhbnNmZXJhYmxlAAAAACIAAAAhU3RyZWFtIGhhcyBhbHJlYWR5IGJlZW4gY2FuY2VsZWQuAAAAAAAAD0FscmVhZHlDYW5jZWxlZAAAAAAjAAAAIVN0cmVhbSBoYXMgYWxyZWFkeSBiZWVuIGRlcGxldGVkLgAAAAAAAA9BbHJlYWR5RGVwbGV0ZWQAAAAAJAAAAFBTdHJlYW0gaXMgaW4gYSBzdGF0dXMgdGhhdCBkb2VzIG5vdCBwZXJtaXQgdGhpcyBvcCAoZS5nLiwgYnVybiBiZWZvcmUgZGVwbGV0ZWQpLgAAAA1JbnZhbGlkU3RhdHVzAAAAAAAAJQAAAClSZXF1ZXN0ZWQgd2l0aGRyYXcgYW1vdW50ID4gd2l0aGRyYXdhYmxlLgAAAAAAABhJbnN1ZmZpY2llbnRXaXRoZHJhd2FibGUAAAAyAAAAJlJlcXVlc3RlZCB3aXRoZHJhdyBhbW91bnQgbXVzdCBiZSA+IDAuAAAAAAAMWmVyb1dpdGhkcmF3AAAAMwAAABhDYWxsZXIgaXMgbm90IHRoZSBhZG1pbi4AAAAITm90QWRtaW4AAABGAAAAMk9yYWNsZSBwcmljZSBpcyBzdGFsZSAob2xkZXIgdGhhbiBhbGxvd2VkIHdpbmRvdykuAAAAAAALT3JhY2xlU3RhbGUAAAAARwAAACVPcmFjbGUgcmV0dXJuZWQgYSBub24tcG9zaXRpdmUgcHJpY2UuAAAAAAAAEkludmFsaWRPcmFjbGVQcmljZQAAAAAASAAAAB1Vbmtub3duIG9wZXJhdGlvbiBlbnVtIHZhbHVlLgAAAAAAAAlVbmtub3duT3AAAAAAAABJAAAAHUludGVnZXIgb3ZlcmZsb3cgZHVyaW5nIG1hdGguAAAAAAAACE92ZXJmbG93AAAAWg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<string>,
        get_stream: this.txFromJSON<Stream>,
        comptroller: this.txFromJSON<string>,
        name: this.txFromJSON<string>,
        symbol: this.txFromJSON<string>,
        approve: this.txFromJSON<null>,
        balance: this.txFromJSON<u32>,
        owner_of: this.txFromJSON<string>,
        transfer: this.txFromJSON<null>,
        token_uri: this.txFromJSON<string>,
        get_approved: this.txFromJSON<Option<string>>,
        get_token_id: this.txFromJSON<u32>,
        total_supply: this.txFromJSON<u32>,
        transfer_from: this.txFromJSON<null>,
        approve_for_all: this.txFromJSON<null>,
        get_owner_token_id: this.txFromJSON<u32>,
        is_approved_for_all: this.txFromJSON<boolean>,
        status: this.txFromJSON<StreamStatus>,
        streamed_amount: this.txFromJSON<i128>,
        withdrawable_amount: this.txFromJSON<i128>,
        create_linear: this.txFromJSON<u32>,
        create_tranched: this.txFromJSON<u32>,
        burn: this.txFromJSON<null>,
        cancel: this.txFromJSON<null>,
        renounce: this.txFromJSON<null>,
        withdraw: this.txFromJSON<null>,
        withdraw_max: this.txFromJSON<null>,
        withdraw_max_and_transfer: this.txFromJSON<null>
  }
}