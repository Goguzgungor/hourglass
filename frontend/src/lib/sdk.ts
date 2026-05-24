'use client';

// Helpers to build typed Hourglass SDK clients on top of the deployment + the
// connected wallet. The generated SDK bindings declare contract methods on the
// Client class at runtime (via ContractSpec), but only expose `fromJSON` in
// the `.d.ts`. We re-declare the actual method shapes here so the rest of the
// app can use them with full type safety.

import { lockup as lockupSdk } from 'hourglass';
import type { Stream, StreamStatus } from 'hourglass/lockup';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import { DEPLOYMENT } from './deployments';
import { signTransaction } from './wallet';

/* ------------------------------------------------------------------ *
 * Typed surface of the Lockup contract — narrow to what we actually  *
 * call from the UI. Mirrors the Rust contract method signatures.    *
 * ------------------------------------------------------------------ */

export interface LockupClient {
  // ---- views ----
  get_stream(args: { stream_id: number }): Promise<AssembledTransaction<Stream>>;
  status(args: { stream_id: number }): Promise<AssembledTransaction<StreamStatus>>;
  streamed_amount(args: {
    stream_id: number;
  }): Promise<AssembledTransaction<bigint>>;
  withdrawable_amount(args: {
    stream_id: number;
  }): Promise<AssembledTransaction<bigint>>;
  owner_of(args: { token_id: number }): Promise<AssembledTransaction<string>>;
  // ---- mutating ----
  create_linear(args: {
    sender: string;
    recipient: string;
    token: string;
    deposited: bigint;
    start_ts: bigint;
    cliff_ts: bigint;
    end_ts: bigint;
    unlock_at_start: bigint;
    unlock_at_cliff: bigint;
    is_cancelable: boolean;
    is_transferable: boolean;
  }): Promise<AssembledTransaction<number>>;
  withdraw_max(args: {
    stream_id: number;
    to: string;
  }): Promise<AssembledTransaction<null>>;
  cancel(args: { stream_id: number }): Promise<AssembledTransaction<null>>;
  renounce(args: { stream_id: number }): Promise<AssembledTransaction<null>>;
  burn(args: { stream_id: number }): Promise<AssembledTransaction<null>>;
}

/**
 * Build a Lockup client. Pass the connected wallet's `address` so that mutating
 * methods can sign transactions; views (`get_stream`, `withdrawable_amount`,
 * etc.) work even when no wallet is connected since simulation is free.
 */
export function makeLockup(address?: string | null): LockupClient {
  // The generated Client class types only `fromJSON`; the real methods are
  // attached dynamically by ContractSpec. We cast through `unknown` to surface
  // the typed interface declared above.
  const client = new lockupSdk.Client({
    contractId: DEPLOYMENT.lockup,
    networkPassphrase: DEPLOYMENT.networkPassphrase,
    rpcUrl: DEPLOYMENT.rpcUrl,
    // The local quickstart RPC is plain HTTP — opt in. (Stellar SDK v15+
    // refuses to talk to non-https endpoints unless this is set.)
    allowHttp: DEPLOYMENT.rpcUrl.startsWith('http://'),
    publicKey: address ?? undefined,
    ...(address
      ? {
          signTransaction: async (xdr: string) => {
            const { signedTxXdr } = await signTransaction(xdr, address);
            return { signedTxXdr };
          },
        }
      : {}),
  });
  return client as unknown as LockupClient;
}
