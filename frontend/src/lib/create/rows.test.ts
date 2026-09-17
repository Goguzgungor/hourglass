import { describe, expect, it } from 'vitest';
import { MAX_ROWS_PER_RUN, hasRowErrors, parseRows, rowsSummary, validateRows, type RowInput } from './rows';
import type { Schedule } from './schedule';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const G2 = 'GAWIFBYR7ATAATABJT5XT5PI3PQAUK4ZZF4EODQCWKINA3PTV43NWWAA';
const G3 = 'GAFD2RMEQCGQ2BRXPFVECOUT3AT7UIZWPMSJRZFFHH5CI2TTTGKAQNNQ';
const NOW = 1_800_000_000;
const recurring: Schedule = { shape: 'recurring', firstTs: NOW + 900, periodSecs: 86_400, count: 12 };
const linear: Schedule = { shape: 'linear', startTs: NOW + 900, cliffTs: NOW + 900, endTs: NOW + 90_000, unlockAtStartBps: 0, unlockAtCliffBps: 0 };

describe('parseRows', () => {
  it('accepts comma, semicolon, tab and whitespace separators and strips quotes', () => {
    const text = [`${G1},10`, `${G2};2.5`, `${G3}\t3`, `"${G1}"   4`].join('\n');
    const { rows, skipped } = parseRows(text, 1);
    expect(skipped).toEqual([]);
    expect(rows.map((r) => [r.id, r.recipient, r.amount, r.source, r.line])).toEqual([
      ['r1', G1, '10', 'import', 1],
      ['r2', G2, '2.5', 'import', 2],
      ['r3', G3, '3', 'import', 3],
      ['r4', G1, '4', 'import', 4],
    ]);
  });
  it('skips a header line, comments, blanks, and lines without an amount; ignores extra columns', () => {
    const text = `recipient,amount,name\r\n\r\n# payroll\n${G1},10,Alice\n${G2}\n${G3},,Bob\n`;
    const { rows, skipped } = parseRows(text, 5);
    expect(rows.map((r) => [r.id, r.recipient, r.amount])).toEqual([['r5', G1, '10']]);
    expect(skipped).toEqual([
      { line: 1, reason: 'header' },
      { line: 5, reason: 'missing_amount' },
      { line: 6, reason: 'missing_amount' },
    ]);
  });
  it('keeps a bad address on a non-first line as a row (validation flags it later)', () => {
    const { rows } = parseRows(`${G1},1\nnot-an-address,2`, 1);
    expect(rows).toHaveLength(2);
  });
  it('stops at the run limit and reports the remainder', () => {
    const lines = Array.from({ length: 12 }, () => `${G1},1`).join('\n');
    const { rows, skipped } = parseRows(lines, 1, MAX_ROWS_PER_RUN - 10);
    expect(rows).toHaveLength(10);
    expect(skipped).toEqual([{ line: 11, reason: 'limit' }, { line: 12, reason: 'limit' }]);
  });
});

describe('validateRows', () => {
  const row = (id: string, recipient: string, amount: string): RowInput => ({ id, recipient, amount, source: 'manual' });
  it('flags invalid addresses and amounts', () => {
    const out = validateRows(
      [row('a', 'bad', '1'), row('b', G1, 'abc'), row('c', G1, '0'), row('d', G1, '-1'), row('e', G1, '1,000'), row('f', G1, '1.12345678')],
      { sender: null, schedule: linear },
    );
    expect(out.map((r) => r.issues.map((i) => i.code))).toEqual([
      ['invalid_address'], ['invalid_amount'], ['amount_not_positive'], ['amount_not_positive'], ['invalid_amount'], ['invalid_amount'],
    ]);
    expect(out[0].total).toBe(1_0000000n);
    expect(out[0].built).toBeDefined();
    expect(out[1].total).toBeUndefined();
  });
  it('warns on duplicates and self-streams, infos on rounding, errors when too small', () => {
    const out = validateRows(
      // 120 and 12 XLM divide evenly by count=12, so no rounding info on a/b
      [row('a', G1, '120'), row('b', G1, '12'), row('c', G2, '0.0000025'), row('d', G3, '0.0000005')],
      { sender: G1, schedule: recurring },
    );
    expect(out[0].issues.map((i) => [i.level, i.code])).toEqual([[ 'warning', 'duplicate_recipient'], ['warning', 'self_recipient']]);
    expect(out[1].issues.map((i) => i.code)).toEqual(['duplicate_recipient', 'self_recipient']);
    expect(out[2].issues.map((i) => [i.level, i.code])).toEqual([['info', 'rounding_adjusted']]);
    expect(out[2].built?.adjustment).toBe(-1n); // 25 stroops → 2 per period × 12 = 24
    expect(out[3].issues.map((i) => [i.level, i.code])).toEqual([['error', 'amount_too_small']]);
    expect(out[3].built).toBeUndefined();
  });
  it('skips spec building when the schedule is null', () => {
    const out = validateRows([row('a', G1, '1')], { sender: null, schedule: null });
    expect(out[0].issues).toEqual([]);
    expect(out[0].total).toBe(1_0000000n);
    expect(out[0].built).toBeUndefined();
  });
  it('does not count error rows when detecting duplicates', () => {
    const out = validateRows(
      [row('a', G1, '10'), row('b', G1, '0.0000005'), row('c', 'bad', '1')],
      { sender: null, schedule: recurring },
    );
    expect(out[0].issues.map((i) => i.code)).toEqual(['rounding_adjusted']);
    expect(out[1].issues.map((i) => i.code)).toEqual(['amount_too_small']);
    expect(out[2].issues.map((i) => i.code)).toEqual(['invalid_address', 'rounding_adjusted']);
  });
});

describe('rowsSummary / hasRowErrors', () => {
  it('totals deposited amounts and adjustments', () => {
    const rows = validateRows(
      [
        { id: 'a', recipient: G1, amount: '120', source: 'manual' },
        { id: 'b', recipient: G2, amount: '0.0000025', source: 'manual' },
        { id: 'c', recipient: 'bad', amount: '1', source: 'manual' },
        { id: 'd', recipient: G3, amount: '12', source: 'manual' },
      ],
      { sender: G3, schedule: recurring },
    );
    const s = rowsSummary(rows);
    expect(s.count).toBe(4);
    expect(s.valid).toBe(3);
    expect(s.errors).toBe(1);
    expect(s.warnings).toBe(1);
    expect(s.total).toBe(1_200_000_000n + 24n + 120_000_000n); // b: 25 stroops deposited as 24 (12 × 2)
    expect(s.adjustment).toBe(-1n);
    expect(hasRowErrors(rows)).toBe(true);
  });
});
