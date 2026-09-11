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




export type DataKey = {tag: "Admin", values: void} | {tag: "FeeCollector", values: void} | {tag: "FeeUsdMicros", values: readonly [u32]} | {tag: "Oracle", values: void} | {tag: "OracleMaxStaleness", values: void};


/**
 * Price snapshot returned by the oracle adapter.
 * `price_x14` is XLM-per-USD scaled by 1e14 (matches Reflector's published scale).
 * `ts_secs` is the unix-seconds timestamp of the snapshot.
 */
export interface PriceSnapshot {
  price_x14: i128;
  ts_secs: u64;
}

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


/**
 * One row of a `create_batch` call.
 */
export interface CreateRow {
  is_cancelable: boolean;
  is_transferable: boolean;
  recipient: string;
  spec: CreateSpec;
}

/**
 * Shape-specific create parameters (no recipient / flags).
 */
export type CreateSpec = {tag: "Linear", values: readonly [LinearParams]} | {tag: "Tranched", values: readonly [TranchedParams]} | {tag: "Recurring", values: readonly [RecurringParams]};


export interface LinearShape {
  cliff_ts: u64;
  unlock_at_cliff: i128;
  unlock_at_start: i128;
}

export type StreamShape = {tag: "Linear", values: readonly [LinearShape]} | {tag: "Tranched", values: readonly [TranchedShape]} | {tag: "Recurring", values: readonly [RecurringShape]};


export interface LinearParams {
  cliff_ts: u64;
  deposited: i128;
  end_ts: u64;
  start_ts: u64;
  unlock_at_cliff: i128;
  unlock_at_start: i128;
}

export type StreamStatus = {tag: "Pending", values: void} | {tag: "Streaming", values: void} | {tag: "Settled", values: void} | {tag: "Canceled", values: void} | {tag: "Depleted", values: void};


export interface TranchedShape {
  tranches: Array<Tranche>;
}


/**
 * N equal unlocks of `amount_per_period`, the first at `first_ts`, then every
 * `period_secs`. `stream.start_ts == first_ts`,
 * `stream.end_ts == first_ts + (count - 1) * period_secs`,
 * `stream.deposited == amount_per_period * count`.
 */
export interface RecurringShape {
  amount_per_period: i128;
  count: u32;
  first_ts: u64;
  period_secs: u64;
}


export interface TranchedParams {
  tranches: Array<Tranche>;
}


export interface RecurringParams {
  amount_per_period: i128;
  count: u32;
  first_ts: u64;
  period_secs: u64;
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
   * Batch must contain at least one row.
   */
  19: {message:"EmptyBatch"},
  /**
   * Batch row count exceeds `MAX_BATCH_ROWS`.
   */
  20: {message:"BatchTooLarge"},
  /**
   * `period_secs` must be > 0.
   */
  21: {message:"InvalidPeriod"},
  /**
   * `count` must be >= 1.
   */
  22: {message:"InvalidCount"},
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
        {admin, fee_collector, oracle, max_staleness_secs}: {admin: string, fee_collector: string, oracle: string, max_staleness_secs: u32},
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
    return ContractClient.deploy({admin, fee_collector, oracle, max_staleness_secs}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMRmVlQ29sbGVjdG9yAAAAAQAAADdQZXItb3AgVVNEIGZlZSBpbiBtaWNyby1VU0QgKGkuZS4sIDFfMDAwXzAwMCA9PSAkMS4wMCkuAAAAAAxGZWVVc2RNaWNyb3MAAAABAAAABAAAAAAAAAAYT3JhY2xlIGNvbnRyYWN0IGFkZHJlc3MuAAAABk9yYWNsZQAAAAAAAAAAAC9NYXggYWNjZXB0ZWQgb3JhY2xlIHN0YWxlbmVzcyAobGVkZ2VyIHNlY29uZHMpLgAAAAAST3JhY2xlTWF4U3RhbGVuZXNzAAA=",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAIFSZXR1cm5zIHRoZSBYTE0tc3Ryb29wcyBhIGNhbGxlciBtdXN0IHBheSB0byBwZXJmb3JtIGBvcGAsIGdpdmVuIHRoZQpjdXJyZW50IG9yYWNsZSBxdW90ZS4gUmV2ZXJ0cyBpZiBvcmFjbGUgaXMgc3RhbGUgb3IgaW52YWxpZC4AAAAAAAAHZmVlX2ZvcgAAAAABAAAAAAAAAAJvcAAAAAAH0AAAAAZPcEtpbmQAAAAAAAEAAAAL",
        "AAAAAAAAACZVcGdyYWRlIHRoZSBydW5uaW5nIHdhc20uIEFkbWluLWdhdGVkLgAAAAAAB3VwZ3JhZGUAAAAAAQAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAA==",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAADRPbmUtc2hvdCBpbml0aWFsaXplci4gSWRlbXBvdGVudDogcGFuaWNzIG9uIHJlLWluaXQuAAAADV9fY29uc3RydWN0b3IAAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADWZlZV9jb2xsZWN0b3IAAAAAAAATAAAAAAAAAAZvcmFjbGUAAAAAABMAAAAAAAAAEm1heF9zdGFsZW5lc3Nfc2VjcwAAAAAABAAAAAA=",
        "AAAAAAAAAAAAAAANZmVlX2NvbGxlY3RvcgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAASZ2V0X2ZlZV91c2RfbWljcm9zAAAAAAABAAAAAAAAAAJvcAAAAAAH0AAAAAZPcEtpbmQAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAASc2V0X2ZlZV91c2RfbWljcm9zAAAAAAACAAAAAAAAAAJvcAAAAAAH0AAAAAZPcEtpbmQAAAAAAAAAAAAGbWljcm9zAAAAAAALAAAAAA==",
        "AAAAAQAAALhQcmljZSBzbmFwc2hvdCByZXR1cm5lZCBieSB0aGUgb3JhY2xlIGFkYXB0ZXIuCmBwcmljZV94MTRgIGlzIFhMTS1wZXItVVNEIHNjYWxlZCBieSAxZTE0IChtYXRjaGVzIFJlZmxlY3RvcidzIHB1Ymxpc2hlZCBzY2FsZSkuCmB0c19zZWNzYCBpcyB0aGUgdW5peC1zZWNvbmRzIHRpbWVzdGFtcCBvZiB0aGUgc25hcHNob3QuAAAAAAAAAA1QcmljZVNuYXBzaG90AAAAAAAAAgAAAAAAAAAJcHJpY2VfeDE0AAAAAAAACwAAAAAAAAAHdHNfc2VjcwAAAAAG",
        "AAAAAgAAAAAAAAAAAAAABk9wS2luZAAAAAAAAQAAAAAAAAAAAAAACFdpdGhkcmF3",
        "AAAAAQAAAAAAAAAAAAAABlN0cmVhbQAAAAAADQAAAAAAAAAJZGVwb3NpdGVkAAAAAAAACwAAAAAAAAAGZW5kX3RzAAAAAAAGAAAAAAAAAA1pc19jYW5jZWxhYmxlAAAAAAAAAQAAAAAAAAALaXNfZGVwbGV0ZWQAAAAAAQAAAAAAAAAPaXNfdHJhbnNmZXJhYmxlAAAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACHJlZnVuZGVkAAAACwAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAVzaGFwZQAAAAAAB9AAAAALU3RyZWFtU2hhcGUAAAAAAAAAAAhzdGFydF90cwAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAMd2FzX2NhbmNlbGVkAAAAAQAAAAAAAAAJd2l0aGRyYXduAAAAAAAACw==",
        "AAAAAQAAAAAAAAAAAAAAB1RyYW5jaGUAAAAAAgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAJ0cwAAAAAABg==",
        "AAAAAQAAACFPbmUgcm93IG9mIGEgYGNyZWF0ZV9iYXRjaGAgY2FsbC4AAAAAAAAAAAAACUNyZWF0ZVJvdwAAAAAAAAQAAAAAAAAADWlzX2NhbmNlbGFibGUAAAAAAAABAAAAAAAAAA9pc190cmFuc2ZlcmFibGUAAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAEc3BlYwAAB9AAAAAKQ3JlYXRlU3BlYwAA",
        "AAAAAgAAADhTaGFwZS1zcGVjaWZpYyBjcmVhdGUgcGFyYW1ldGVycyAobm8gcmVjaXBpZW50IC8gZmxhZ3MpLgAAAAAAAAAKQ3JlYXRlU3BlYwAAAAAAAwAAAAEAAAAAAAAABkxpbmVhcgAAAAAAAQAAB9AAAAAMTGluZWFyUGFyYW1zAAAAAQAAAAAAAAAIVHJhbmNoZWQAAAABAAAH0AAAAA5UcmFuY2hlZFBhcmFtcwAAAAAAAQAAAAAAAAAJUmVjdXJyaW5nAAAAAAAAAQAAB9AAAAAPUmVjdXJyaW5nUGFyYW1zAA==",
        "AAAAAQAAAAAAAAAAAAAAC0xpbmVhclNoYXBlAAAAAAMAAAAAAAAACGNsaWZmX3RzAAAABgAAAAAAAAAPdW5sb2NrX2F0X2NsaWZmAAAAAAsAAAAAAAAAD3VubG9ja19hdF9zdGFydAAAAAAL",
        "AAAAAgAAAAAAAAAAAAAAC1N0cmVhbVNoYXBlAAAAAAMAAAABAAAAAAAAAAZMaW5lYXIAAAAAAAEAAAfQAAAAC0xpbmVhclNoYXBlAAAAAAEAAAAAAAAACFRyYW5jaGVkAAAAAQAAB9AAAAANVHJhbmNoZWRTaGFwZQAAAAAAAAEAAAAAAAAACVJlY3VycmluZwAAAAAAAAEAAAfQAAAADlJlY3VycmluZ1NoYXBlAAA=",
        "AAAAAQAAAAAAAAAAAAAADExpbmVhclBhcmFtcwAAAAYAAAAAAAAACGNsaWZmX3RzAAAABgAAAAAAAAAJZGVwb3NpdGVkAAAAAAAACwAAAAAAAAAGZW5kX3RzAAAAAAAGAAAAAAAAAAhzdGFydF90cwAAAAYAAAAAAAAAD3VubG9ja19hdF9jbGlmZgAAAAALAAAAAAAAAA91bmxvY2tfYXRfc3RhcnQAAAAACw==",
        "AAAAAgAAAAAAAAAAAAAADFN0cmVhbVN0YXR1cwAAAAUAAAAAAAAAAAAAAAdQZW5kaW5nAAAAAAAAAAAAAAAACVN0cmVhbWluZwAAAAAAAAAAAAAAAAAAB1NldHRsZWQAAAAAAAAAAAAAAAAIQ2FuY2VsZWQAAAAAAAAAAAAAAAhEZXBsZXRlZA==",
        "AAAAAQAAAAAAAAAAAAAADVRyYW5jaGVkU2hhcGUAAAAAAAABAAAAAAAAAAh0cmFuY2hlcwAAA+oAAAfQAAAAB1RyYW5jaGUA",
        "AAAAAQAAAONOIGVxdWFsIHVubG9ja3Mgb2YgYGFtb3VudF9wZXJfcGVyaW9kYCwgdGhlIGZpcnN0IGF0IGBmaXJzdF90c2AsIHRoZW4gZXZlcnkKYHBlcmlvZF9zZWNzYC4gYHN0cmVhbS5zdGFydF90cyA9PSBmaXJzdF90c2AsCmBzdHJlYW0uZW5kX3RzID09IGZpcnN0X3RzICsgKGNvdW50IC0gMSkgKiBwZXJpb2Rfc2Vjc2AsCmBzdHJlYW0uZGVwb3NpdGVkID09IGFtb3VudF9wZXJfcGVyaW9kICogY291bnRgLgAAAAAAAAAADlJlY3VycmluZ1NoYXBlAAAAAAAEAAAAAAAAABFhbW91bnRfcGVyX3BlcmlvZAAAAAAAAAsAAAAAAAAABWNvdW50AAAAAAAABAAAAAAAAAAIZmlyc3RfdHMAAAAGAAAAAAAAAAtwZXJpb2Rfc2VjcwAAAAAG",
        "AAAAAQAAAAAAAAAAAAAADlRyYW5jaGVkUGFyYW1zAAAAAAABAAAAAAAAAAh0cmFuY2hlcwAAA+oAAAfQAAAAB1RyYW5jaGUA",
        "AAAAAQAAAAAAAAAAAAAAD1JlY3VycmluZ1BhcmFtcwAAAAAEAAAAAAAAABFhbW91bnRfcGVyX3BlcmlvZAAAAAAAAAsAAAAAAAAABWNvdW50AAAAAAAABAAAAAAAAAAIZmlyc3RfdHMAAAAGAAAAAAAAAAtwZXJpb2Rfc2VjcwAAAAAG",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAHQAAAFJJbnZhbGlkIGNhbGwg4oCUIGdlbmVyaWMgY2F0Y2gtYWxsIChhdm9pZCBpbiBuZXcgY29kZTsgcHJlZmVyIGEgc3BlY2lmaWMgdmFyaWFudCkuAAAAAAALSW52YWxpZENhbGwAAAAAAQAAABREZXBvc2l0IG11c3QgYmUgPiAwLgAAAAtaZXJvRGVwb3NpdAAAAAAKAAAAHmBzdGFydF90c2AgbXVzdCBiZSA8IGBlbmRfdHNgLgAAAAAADVN0YXJ0QWZ0ZXJFbmQAAAAAAAALAAAALWBjbGlmZl90c2AgbXVzdCBiZSBpbiBbYHN0YXJ0X3RzYCwgYGVuZF90c2BdLgAAAAAAAA9DbGlmZk91dE9mUmFuZ2UAAAAADAAAADxgdW5sb2NrX2F0X3N0YXJ0ICsgdW5sb2NrX2F0X2NsaWZmYCBtdXN0IGJlIOKJpCBgZGVwb3NpdGVkYC4AAAAUVW5sb2Nrc0V4Y2VlZERlcG9zaXQAAAANAAAAHkF0IGxlYXN0IG9uZSB0cmFuY2hlIHJlcXVpcmVkLgAAAAAACk5vVHJhbmNoZXMAAAAAAA4AAAAsVHJhbmNoZXMgbXVzdCBiZSBzdHJpY3RseSBhc2NlbmRpbmcgYnkgYHRzYC4AAAAUVHJhbmNoZXNOb3RBc2NlbmRpbmcAAAAPAAAALlN1bSBvZiB0cmFuY2hlIGFtb3VudHMgbXVzdCBlcXVhbCBgZGVwb3NpdGVkYC4AAAAAABJUcmFuY2hlU3VtTWlzbWF0Y2gAAAAAABAAAAAlVHJhbmNoZSBjb3VudCBleGNlZWRzIGBNQVhfVFJBTkNIRVNgLgAAAAAAAA9Ub29NYW55VHJhbmNoZXMAAAAAEQAAAEFgc3RhcnRfdHNgIChvciBmaXJzdCB0cmFuY2hlIHRzKSBtdXN0IGJlIOKJpSBjdXJyZW50IGxlZGdlciB0aW1lLgAAAAAAAAtTdGFydEluUGFzdAAAAAASAAAAJEJhdGNoIG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgcm93LgAAAApFbXB0eUJhdGNoAAAAAAATAAAAKUJhdGNoIHJvdyBjb3VudCBleGNlZWRzIGBNQVhfQkFUQ0hfUk9XU2AuAAAAAAAADUJhdGNoVG9vTGFyZ2UAAAAAAAAUAAAAGmBwZXJpb2Rfc2Vjc2AgbXVzdCBiZSA+IDAuAAAAAAANSW52YWxpZFBlcmlvZAAAAAAAABUAAAAVYGNvdW50YCBtdXN0IGJlID49IDEuAAAAAAAADEludmFsaWRDb3VudAAAABYAAAAYU3RyZWFtIGlkIGhhcyBubyByZWNvcmQuAAAADlN0cmVhbU5vdEZvdW5kAAAAAAAeAAAAJ0NhbGxlciBpcyBub3QgdGhlIHNlbmRlciBvZiB0aGUgc3RyZWFtLgAAAAAJTm90U2VuZGVyAAAAAAAAHwAAAD9DYWxsZXIgaXMgbm90IHRoZSByZWNpcGllbnQgKE5GVCBvd25lcikgb3IgYW4gYXBwcm92ZWQgc3BlbmRlci4AAAAADE5vdFJlY2lwaWVudAAAACAAAABDU3RyZWFtIGlzIG5vdCBjYW5jZWxhYmxlICh3YXMgcmVub3VuY2VkIG9yIGNyZWF0ZWQgbm9uLWNhbmNlbGFibGUpLgAAAAANTm90Q2FuY2VsYWJsZQAAAAAAACEAAAAbU3RyZWFtIGlzIG5vdCB0cmFuc2ZlcmFibGUuAAAAAA9Ob3RUcmFuc2ZlcmFibGUAAAAAIgAAACFTdHJlYW0gaGFzIGFscmVhZHkgYmVlbiBjYW5jZWxlZC4AAAAAAAAPQWxyZWFkeUNhbmNlbGVkAAAAACMAAAAhU3RyZWFtIGhhcyBhbHJlYWR5IGJlZW4gZGVwbGV0ZWQuAAAAAAAAD0FscmVhZHlEZXBsZXRlZAAAAAAkAAAAUFN0cmVhbSBpcyBpbiBhIHN0YXR1cyB0aGF0IGRvZXMgbm90IHBlcm1pdCB0aGlzIG9wIChlLmcuLCBidXJuIGJlZm9yZSBkZXBsZXRlZCkuAAAADUludmFsaWRTdGF0dXMAAAAAAAAlAAAAKVJlcXVlc3RlZCB3aXRoZHJhdyBhbW91bnQgPiB3aXRoZHJhd2FibGUuAAAAAAAAGEluc3VmZmljaWVudFdpdGhkcmF3YWJsZQAAADIAAAAmUmVxdWVzdGVkIHdpdGhkcmF3IGFtb3VudCBtdXN0IGJlID4gMC4AAAAAAAxaZXJvV2l0aGRyYXcAAAAzAAAAGENhbGxlciBpcyBub3QgdGhlIGFkbWluLgAAAAhOb3RBZG1pbgAAAEYAAAAyT3JhY2xlIHByaWNlIGlzIHN0YWxlIChvbGRlciB0aGFuIGFsbG93ZWQgd2luZG93KS4AAAAAAAtPcmFjbGVTdGFsZQAAAABHAAAAJU9yYWNsZSByZXR1cm5lZCBhIG5vbi1wb3NpdGl2ZSBwcmljZS4AAAAAAAASSW52YWxpZE9yYWNsZVByaWNlAAAAAABIAAAAHVVua25vd24gb3BlcmF0aW9uIGVudW0gdmFsdWUuAAAAAAAACVVua25vd25PcAAAAAAAAEkAAAAdSW50ZWdlciBvdmVyZmxvdyBkdXJpbmcgbWF0aC4AAAAAAAAIT3ZlcmZsb3cAAABa" ]),
      options
    )
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<string>,
        fee_for: this.txFromJSON<i128>,
        upgrade: this.txFromJSON<null>,
        set_admin: this.txFromJSON<null>,
        fee_collector: this.txFromJSON<string>,
        get_fee_usd_micros: this.txFromJSON<i128>,
        set_fee_usd_micros: this.txFromJSON<null>
  }
}