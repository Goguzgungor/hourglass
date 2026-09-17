import { describe, expect, it } from 'vitest';
import { KIND_COLOR, KIND_LABEL, filterHistoryRows, toHistoryRow, type HistoryItem } from './history';
import { ACTION_KINDS } from './filters';

const ME = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const OTHER = 'GAWIFBYR7ATAATABJT5XT5PI3PQAUK4ZZF4EODQCWKINA3PTV43NWWAA';
const THIRD = 'GAFD2RMEQCGQ2BRXPFVECOUT3AT7UIZWPMSJRZFFHH5CI2TTTGKAQNNQ';

function item(over: Partial<HistoryItem>): HistoryItem {
  return {
    _id: 'x', stream_id: 7, action: 'created', ts: 1_800_000_000, ledger: 1, tx_hash: 'ab'.repeat(32), log_index: 3, participants: [ME, OTHER],
    stream: { id: 7, model: 'Linear', token: 'CTOKEN', sender: ME, recipient: OTHER, deposited: '1000' },
    ...over,
  } as HistoryItem;
}

describe('toHistoryRow', () => {
  it('created: amount = deposited, counterparty = the other party, mine when I am the actor', () => {
    const r = toHistoryRow(item({ actor: ME }), ME);
    expect(r).toEqual({ id: `${'ab'.repeat(32)}:3`, kind: 'created', ts: 1_800_000_000, streamId: 7, model: 'Linear', token: 'CTOKEN', amount: 1000n, secondary: null, counterparty: OTHER, actor: ME, mine: true, txHash: 'ab'.repeat(32) });
    expect(toHistoryRow(item({ actor: ME }), OTHER).counterparty).toBe(ME);
    expect(toHistoryRow(item({ actor: ME }), OTHER).mine).toBe(false);
  });
  it('withdrawn: amount, counterparty = `to` when it is not me', () => {
    const r = toHistoryRow(item({ action: 'withdrawn', amount: '250', actor: OTHER, to: THIRD }), ME);
    expect(r).toMatchObject({ kind: 'withdrawn', amount: 250n, counterparty: THIRD, actor: OTHER, mine: false });
    expect(toHistoryRow(item({ action: 'withdrawn', amount: '250', actor: OTHER, to: OTHER }), ME).counterparty).toBe(OTHER);
  });
  it('canceled: amount = sender_refund, secondary = recipient_balance', () => {
    const r = toHistoryRow(item({ action: 'canceled', actor: ME, sender_refund: '600', recipient_balance: '400' }), ME);
    expect(r).toMatchObject({ kind: 'canceled', amount: 600n, secondary: 400n, counterparty: OTHER, mine: true });
  });
  it('transferred: counterparty = new_owner; renounced/burned: no amount', () => {
    expect(toHistoryRow(item({ action: 'transferred', actor: OTHER, new_owner: THIRD }), ME)).toMatchObject({ kind: 'transferred', amount: null, counterparty: THIRD });
    // old owner (the actor) looking at their own transfer → the new owner
    expect(toHistoryRow(item({ action: 'transferred', actor: ME, new_owner: THIRD }), ME)).toMatchObject({ counterparty: THIRD, mine: true });
    // new owner looking at the transfer they received → the old owner, never themselves
    const received = item({ action: 'transferred', actor: OTHER, new_owner: ME, stream: { id: 7, model: 'Linear', token: 'CTOKEN', sender: THIRD, recipient: ME, deposited: '1000' } });
    expect(toHistoryRow(received, ME)).toMatchObject({ counterparty: OTHER, mine: false });
    expect(toHistoryRow(item({ action: 'renounced', actor: ME }), ME)).toMatchObject({ kind: 'renounced', amount: null, secondary: null });
    expect(toHistoryRow(item({ action: 'burned', actor: OTHER }), ME)).toMatchObject({ kind: 'burned', amount: null, counterparty: OTHER });
  });
  it('tolerates a missing stream summary and bad numbers', () => {
    const r = toHistoryRow(item({ stream: null, amount: 'nope', action: 'withdrawn' }), ME);
    expect(r).toMatchObject({ streamId: 7, model: null, token: null, amount: null, counterparty: OTHER });
  });
});

describe('filterHistoryRows / tables', () => {
  it('empty kinds = all; otherwise only the listed kinds', () => {
    const rows = ACTION_KINDS.map((k) => toHistoryRow(item({ action: k }), ME));
    expect(filterHistoryRows(rows, [])).toHaveLength(6);
    expect(filterHistoryRows(rows, ['withdrawn', 'burned']).map((r) => r.kind)).toEqual(['withdrawn', 'burned']);
  });
  it('every kind has a colour and a label', () => {
    for (const k of ACTION_KINDS) {
      expect(KIND_COLOR[k]).toMatch(/^bg-/);
      expect(KIND_LABEL[k].length).toBeGreaterThan(0);
    }
  });
});
