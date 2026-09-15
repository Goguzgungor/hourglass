import { describe, expect, it } from 'vitest';
import type { StreamDoc } from '../db';
import { walletStats } from './walletStats';

const ME = 'GME';
function doc(over: Partial<StreamDoc>): StreamDoc {
  return {
    _id: 1, contract: 'C', sender: 'GX', recipient: 'GY', token: 'CXLM', model: 'Linear',
    start_ts: 1_000, end_ts: 2_000, cliff_ts: 1_000, unlock_at_start: '0', unlock_at_cliff: '0',
    deposited: '1000', withdrawn: '0', refunded: '0',
    is_cancelable: true, is_transferable: true, was_canceled: false, is_depleted: false,
    created_at: 900, updated_at: 900, ...over,
  } as StreamDoc;
}

describe('walletStats', () => {
  it('splits sent vs received and sums per token', () => {
    const streams = [
      doc({ _id: 1, sender: ME, deposited: '1000', withdrawn: '200', refunded: '0' }),          // sent, STREAMING @1500
      doc({ _id: 2, sender: ME, token: 'CUSD', deposited: '500', was_canceled: true, refunded: '300', withdrawn: '200' }), // sent, CANCELED
      doc({ _id: 3, recipient: ME, deposited: '1000', withdrawn: '100' }),                      // received, withdrawable 400 @1500
      doc({ _id: 4, recipient: ME, sender: ME, deposited: '10', end_ts: 1_200 }),               // both roles, SETTLED
    ];
    const s = walletStats(ME, streams, 1_500);
    expect(s.counts).toEqual({ sending: 3, receiving: 2, by_status: { PENDING: 0, STREAMING: 2, SETTLED: 1, CANCELED: 1, DEPLETED: 0 } });
    const xlm = s.by_token.find((t) => t.token === 'CXLM')!;
    expect(xlm).toEqual({ token: 'CXLM', sent_deposited: '1010', sent_locked: '810', received_withdrawn: '100', received_withdrawable_now: '410' });
    const usd = s.by_token.find((t) => t.token === 'CUSD')!;
    expect(usd).toEqual({ token: 'CUSD', sent_deposited: '500', sent_locked: '0', received_withdrawn: '0', received_withdrawable_now: '0' });
  });
  it('clamps sent_locked when withdrawn + refunded overshoot deposited', () => {
    const s = walletStats(ME, [doc({ sender: ME, deposited: '1000', withdrawn: '800', refunded: '400' })], 1_500);
    expect(s.by_token[0].sent_locked).toBe('0');
  });
  it('counts no locked amount for a depleted stream with a stale withdrawn', () => {
    const s = walletStats(ME, [doc({ sender: ME, deposited: '1000', withdrawn: '0', refunded: '0', is_depleted: true })], 1_500);
    expect(s.by_token[0]).toMatchObject({ sent_deposited: '1000', sent_locked: '0' });
  });
  it('is exact past 2^53', () => {
    const big = '100000000000000000000'; // 1e20
    const s = walletStats(ME, [doc({ sender: ME, recipient: ME, deposited: big, withdrawn: '0', refunded: '0' })], 1_500);
    expect(s.by_token[0]).toMatchObject({
      sent_deposited: big,
      sent_locked: big,
      // linear 1000→2000, half elapsed at 1500
      received_withdrawable_now: '50000000000000000000',
    });
  });
});
