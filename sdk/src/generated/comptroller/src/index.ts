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
        fee_for: this.txFromJSON<i128>,
        upgrade: this.txFromJSON<null>,
        set_admin: this.txFromJSON<null>,
        fee_collector: this.txFromJSON<string>,
        get_fee_usd_micros: this.txFromJSON<i128>,
        set_fee_usd_micros: this.txFromJSON<null>
  }
}