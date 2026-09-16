import { describe, expect, it } from 'vitest';
import { rpc, xdr } from '@stellar/stellar-sdk';
import type { LockupClient } from '@/lib/sdk';
import type { Schedule } from './schedule';
import { prepareBatch, resolveBatchTx, sendSigned, signPrepared, submitSingle, toCreateRow, txHashOf } from './submit';
import { buildSpec } from './schedule';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const G2 = 'GAWIFBYR7ATAATABJT5XT5PI3PQAUK4ZZF4EODQCWKINA3PTV43NWWAA';
const NOW = 1_800_000_000;
const linear: Schedule = { shape: 'linear', startTs: NOW + 900, cliffTs: NOW + 1000, endTs: NOW + 90_000, unlockAtStartBps: 1000, unlockAtCliffBps: 0 };
const tranched: Schedule = { shape: 'tranched', startTs: NOW + 900, tranches: [{ ts: NOW + 1000, bps: 5000 }, { ts: NOW + 2000, bps: 5000 }] };
const recurring: Schedule = { shape: 'recurring', firstTs: NOW + 900, periodSecs: 60, count: 4 };

function fakeLockup(result: unknown, hash = 'deadbeef') {
  const calls: Array<{ method: string; args: unknown }> = [];
  const tx = {
    signed: undefined as undefined | { hash: () => Buffer },
    signAndSend: async () => ({ result, sendTransactionResponse: { hash } }),
    async sign() {
      this.signed = { hash: () => Buffer.from(hash, 'hex') };
    },
    async send() {
      if (!this.signed) throw new Error('The transaction has not yet been signed.');
      return { result, sendTransactionResponse: { hash } };
    },
  };
  const mk = (method: string) => async (args: unknown) => {
    calls.push({ method, args });
    return tx;
  };
  const client = {
    create_linear: mk('create_linear'),
    create_tranched: mk('create_tranched'),
    create_recurring: mk('create_recurring'),
    create_batch: mk('create_batch'),
  } as unknown as LockupClient;
  return { client, calls, tx };
}

describe('submitSingle', () => {
  it('dispatches linear', async () => {
    const { client, calls } = fakeLockup(7);
    const out = await submitSingle(client, { sender: G1, recipient: G2, token: 'C', schedule: linear, total: 100n, cancelable: true, transferable: false });
    expect(out).toEqual({ streamId: 7, txHash: 'deadbeef' });
    expect(calls).toEqual([{
      method: 'create_linear',
      args: {
        sender: G1, recipient: G2, token: 'C', is_cancelable: true, is_transferable: false,
        deposited: 100n, start_ts: BigInt(NOW + 900), cliff_ts: BigInt(NOW + 1000), end_ts: BigInt(NOW + 90_000), unlock_at_start: 10n, unlock_at_cliff: 0n,
      },
    }]);
  });
  it('dispatches tranched and recurring', async () => {
    const t = fakeLockup(8);
    await submitSingle(t.client, { sender: G1, recipient: G2, token: 'C', schedule: tranched, total: 100n, cancelable: true, transferable: true });
    expect(t.calls[0].method).toBe('create_tranched');
    expect((t.calls[0].args as { tranches: unknown }).tranches).toEqual([{ amount: 50n, ts: BigInt(NOW + 1000) }, { amount: 50n, ts: BigInt(NOW + 2000) }]);
    const r = fakeLockup(9);
    await submitSingle(r.client, { sender: G1, recipient: G2, token: 'C', schedule: recurring, total: 100n, cancelable: false, transferable: true });
    expect(r.calls[0]).toEqual({
      method: 'create_recurring',
      args: { sender: G1, recipient: G2, token: 'C', is_cancelable: false, is_transferable: true, amount_per_period: 25n, period_secs: 60n, count: 4, first_ts: BigInt(NOW + 900) },
    });
  });
});

describe('prepareBatch / signPrepared / sendSigned / toCreateRow', () => {
  it('builds one CreateRow per row with the shared flags and schedule', async () => {
    const { client, calls, tx } = fakeLockup([11, 12]);
    const prepared = await prepareBatch(client, {
      sender: G1, token: 'C', schedule: recurring, cancelable: true, transferable: false,
      rows: [{ recipient: G2, total: 100n }, { recipient: G1, total: 40n }],
    });
    expect(prepared).toBe(tx);
    expect(calls[0].method).toBe('create_batch');
    const args = calls[0].args as { sender: string; token: string; rows: unknown[] };
    expect(args.sender).toBe(G1);
    expect(args.rows).toEqual([
      toCreateRow(G2, buildSpec(recurring, 100n), { cancelable: true, transferable: false }),
      toCreateRow(G1, buildSpec(recurring, 40n), { cancelable: true, transferable: false }),
    ]);
    expect((args.rows[0] as { spec: { tag: string } }).spec.tag).toBe('Recurring');
    // sign first (hash known before anything is sent), then send
    await expect(sendSigned(prepared)).rejects.toThrow(/not yet been signed/);
    expect(await signPrepared(prepared)).toEqual({ txHash: 'deadbeef' });
    expect(await sendSigned(prepared)).toEqual({ txHash: 'deadbeef', streamIds: [11, 12] });
  });
  it('signPrepared propagates a wallet rejection and reports an empty hash when nothing was signed', async () => {
    const rejecting = { sign: async () => { throw new Error('User rejected the request'); }, signed: undefined };
    await expect(signPrepared(rejecting as unknown as Parameters<typeof signPrepared>[0])).rejects.toThrow(/rejected/);
    const silent = { sign: async () => {}, signed: undefined };
    expect(await signPrepared(silent as unknown as Parameters<typeof signPrepared>[0])).toEqual({ txHash: '' });
  });
  it('txHashOf falls back to getTransactionResponse.txHash then empty', () => {
    expect(txHashOf({ sendTransactionResponse: { hash: 'a' } })).toBe('a');
    expect(txHashOf({ getTransactionResponse: { txHash: 'b' } })).toBe('b');
    expect(txHashOf({})).toBe('');
  });
  it('prepareBatch surfaces a failed simulation instead of returning the tx', async () => {
    const boom = new Error('Transaction simulation failed: "HostError: Error(Budget, ExceededLimit)"');
    const client = {
      create_batch: async () => ({
        get simulationData() {
          throw boom;
        },
        signAndSend: async () => ({ result: [] }),
      }),
    } as unknown as LockupClient;
    await expect(
      prepareBatch(client, { sender: G1, token: 'C', schedule: recurring, cancelable: true, transferable: true, rows: [{ recipient: G2, total: 100n }] }),
    ).rejects.toBe(boom);
  });
});

describe('resolveBatchTx', () => {
  const returnValue = xdr.ScVal.scvVoid(); // stands in for the on-chain Vec<u32>; decoding is the spec's job
  const decoded: Array<{ name: string; val: unknown }> = [];
  const lockup = {
    spec: {
      funcResToNative: (name: string, val: unknown) => {
        decoded.push({ name, val });
        return [21, 22];
      },
    },
  } as unknown as LockupClient;
  const answer = (r: { status: rpc.Api.GetTransactionStatus; returnValue?: xdr.ScVal }) => async (hash: string) => {
    expect(hash).toBe('abc');
    return r;
  };
  it('SUCCESS → decodes the stream ids through the create_batch spec', async () => {
    decoded.length = 0;
    expect(await resolveBatchTx(lockup, 'abc', answer({ status: rpc.Api.GetTransactionStatus.SUCCESS, returnValue }))).toEqual({ status: 'success', streamIds: [21, 22] });
    expect(decoded).toEqual([{ name: 'create_batch', val: returnValue }]);
  });
  it('SUCCESS without a return value → success with no ids', async () => {
    expect(await resolveBatchTx(lockup, 'abc', answer({ status: rpc.Api.GetTransactionStatus.SUCCESS }))).toEqual({ status: 'success', streamIds: [] });
  });
  it('FAILED → failed; NOT_FOUND → not_found; an RPC error propagates', async () => {
    expect(await resolveBatchTx(lockup, 'abc', answer({ status: rpc.Api.GetTransactionStatus.FAILED }))).toEqual({ status: 'failed' });
    expect(await resolveBatchTx(lockup, 'abc', answer({ status: rpc.Api.GetTransactionStatus.NOT_FOUND }))).toEqual({ status: 'not_found' });
    await expect(resolveBatchTx(lockup, 'abc', async () => { throw new Error('Failed to fetch'); })).rejects.toThrow('Failed to fetch');
  });
});
