import { describe, expect, it } from 'vitest';
import { CONTRACT_ERRORS, classifyTxError, describeError } from './errors';

// Real strings are appended in Task 15 (captured on testnet); these mirror the
// stellar-sdk contract client's known message shapes.
describe('classifyTxError', () => {
  it('extracts contract error codes from simulation failures', () => {
    const e = new Error('Transaction simulation failed: "HostError: Error(Contract, #18)\n\nEvent log (newest first): ..."');
    expect(classifyTxError(e)).toEqual({ kind: 'contract', code: 18, name: 'StartInPast', message: CONTRACT_ERRORS[18].message });
    expect(classifyTxError(new Error('Error(Contract, #20)'))).toMatchObject({ kind: 'contract', code: 20, name: 'BatchTooLarge' });
    expect(classifyTxError(new Error('Error(Contract, #999)'))).toMatchObject({ kind: 'contract', code: 999, name: 'Unknown', message: 'Contract error #999 (Unknown)' });
  });
  it('detects a rejected signature', () => {
    for (const m of ['User rejected the request', 'Transaction rejected by user', 'User declined access', 'cancelled by user']) {
      expect(classifyTxError(new Error(m)).kind).toBe('rejected');
    }
  });
  it('detects resource / size failures from simulation and send', () => {
    expect(classifyTxError(new Error('Transaction simulation failed: "HostError: Error(Budget, ExceededLimit)"')).kind).toBe('resource');
    expect(classifyTxError(new Error('Sending the transaction to the network failed!\n{"status":"ERROR","errorResult":{"_switch":{"name":"txSorobanInvalid","value":-17}}}')).kind).toBe('resource');
    expect(classifyTxError(new Error('transaction submission failed: TxSorobanInvalid')).kind).toBe('resource');
    expect(classifyTxError(new Error('resource limit exceeded')).kind).toBe('resource');
  });
  it('contract errors win over resource words in the same message', () => {
    expect(classifyTxError(new Error('Error(Contract, #10) ... ExceededLimit')).kind).toBe('contract');
  });
  it('falls back to network with a trimmed message', () => {
    const c = classifyTxError(new Error('  Failed to fetch  '));
    expect(c).toEqual({ kind: 'network', message: 'Failed to fetch' });
    expect(classifyTxError('plain string')).toEqual({ kind: 'network', message: 'plain string' });
    expect(classifyTxError(undefined)).toEqual({ kind: 'network', message: 'Unknown error' });
    const long = classifyTxError(new Error('x'.repeat(300)));
    expect(long.message.length).toBe(200);
  });
  it('reads nested sdk fields when present', () => {
    const e = Object.assign(new Error('Transaction simulation failed'), { simulation: { error: 'HostError: Error(Contract, #13)' } });
    expect(classifyTxError(e)).toMatchObject({ kind: 'contract', code: 13 });
  });
  it('does not mistake XDR encoding range errors for resource failures', () => {
    expect(classifyTxError(new RangeError('value too large for i64: 100000000000000000000000'))).toEqual({
      kind: 'network',
      message: 'value too large for i64: 100000000000000000000000',
    });
  });
  it('reads a structured sendTransactionResponse.errorResult and survives circular objects', () => {
    const structured = Object.assign(new Error('Sending the transaction to the network failed!'), {
      sendTransactionResponse: { errorResult: { _switch: { name: 'txSorobanInvalid', value: -17 } } },
    });
    expect(classifyTxError(structured).kind).toBe('resource');
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const bad = Object.assign(new Error('Failed to fetch'), { sendTransactionResponse: { errorResult: circular } });
    expect(classifyTxError(bad)).toEqual({ kind: 'network', message: 'Failed to fetch' });
  });
  it('describeError renders a one-line human message', () => {
    expect(describeError({ kind: 'rejected', message: 'x' })).toBe('Signature rejected in the wallet.');
    expect(describeError({ kind: 'contract', code: 18, name: 'StartInPast', message: CONTRACT_ERRORS[18].message })).toBe(CONTRACT_ERRORS[18].message);
    expect(describeError({ kind: 'resource', message: 'x' })).toMatch(/too large/);
    expect(describeError({ kind: 'network', message: 'boom' })).toBe('boom');
  });
});
