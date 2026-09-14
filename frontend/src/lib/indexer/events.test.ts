import { Keypair, nativeToScVal, xdr, type rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { parseEvent } from './events';

const addr = Keypair.random().publicKey();
const sym = (s: string) => nativeToScVal(s, { type: 'symbol' });

function ev(topic: xdr.ScVal[], value: xdr.ScVal, over: Partial<rpc.Api.EventResponse> = {}): rpc.Api.EventResponse {
  return {
    id: '0001',
    type: 'contract',
    ledger: 4_671_200,
    ledgerClosedAt: '2026-09-14T10:15:00Z',
    contractId: undefined,
    topic,
    value,
    txHash: 'ab'.repeat(32),
    transactionIndex: 3,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    ...over,
  } as unknown as rpc.Api.EventResponse;
}

describe('parseEvent', () => {
  it('parses a withdrawn event with (amount, caller) data', () => {
    const value = xdr.ScVal.scvVec([
      nativeToScVal(1_000n, { type: 'i128' }),
      nativeToScVal(addr, { type: 'address' }),
    ]);
    const p = parseEvent(ev([sym('stream'), sym('withdrawn'), nativeToScVal(7, { type: 'u32' }), nativeToScVal(addr, { type: 'address' })], value));
    expect(p).not.toBeNull();
    expect(p!.action).toBe('withdrawn');
    expect(p!.streamId).toBe(7);
    expect(p!.topics[3]).toBe(addr);
    expect(p!.data).toEqual([1_000n, addr]);
    expect(p!.log_index).toBe(3_000_000);
    expect(p!.ts).toBe(Math.floor(Date.parse('2026-09-14T10:15:00Z') / 1000));
  });
  it('ignores events from other domains or unknown actions', () => {
    expect(parseEvent(ev([sym('transfer'), sym('x')], nativeToScVal(0, { type: 'u32' })))).toBeNull();
    expect(parseEvent(ev([sym('stream'), sym('exploded'), nativeToScVal(1, { type: 'u32' })], nativeToScVal(0, { type: 'u32' })))).toBeNull();
  });
  it('rejects a non-integer stream id', () => {
    expect(parseEvent(ev([sym('stream'), sym('renounced'), sym('nope')], nativeToScVal(0, { type: 'u32' })))).toBeNull();
  });
});
