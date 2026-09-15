import { describe, expect, it } from 'vitest';
import { recipientAt } from './store';

const transfers = [
  { ts: 100, log_index: 1, actor: 'R1', new_owner: 'R2' },
  { ts: 200, log_index: 1, actor: 'R2', new_owner: 'R3' },
];

describe('recipientAt', () => {
  it('uses the previous owner of the first transfer after the action', () => {
    expect(recipientAt({ ts: 50, log_index: 0 }, transfers, 'R3')).toBe('R1');
    expect(recipientAt({ ts: 150, log_index: 0 }, transfers, 'R3')).toBe('R2');
  });
  it('falls back to the current recipient after the last transfer', () => {
    expect(recipientAt({ ts: 250, log_index: 0 }, transfers, 'R3')).toBe('R3');
    expect(recipientAt({ ts: 250, log_index: 0 }, [], 'R9')).toBe('R9');
  });
  it('orders by log_index within the same ledger timestamp', () => {
    expect(recipientAt({ ts: 100, log_index: 0 }, transfers, 'R3')).toBe('R1');
    expect(recipientAt({ ts: 100, log_index: 1 }, transfers, 'R3')).toBe('R2');
  });
});
