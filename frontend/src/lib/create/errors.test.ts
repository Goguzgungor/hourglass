import { describe, expect, it } from 'vitest';
import { CONTRACT_ERRORS, SAC_ERRORS, classifyTxError, describeError } from './errors';

const LOCKUP = 'CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

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
  it('reads a code raised by another contract (the token) as a token error when the lockup id is known', () => {
    const msg = `Transaction simulation failed: "HostError: Error(Contract, #10)\n\nEvent log (newest first):\n   0: [Diagnostic Event] contract:${TOKEN}, topics:[error, Error(Contract, #10)], data:["resulting balance is not within the allowed range", 1, -2, 3]`;
    expect(classifyTxError(new Error(msg), { lockupId: LOCKUP })).toEqual({ kind: 'contract', code: 10, name: 'TokenContractError', message: 'Insufficient token balance.' });
    expect(classifyTxError(new Error(msg.replace(/#10/g, '#13')), { lockupId: LOCKUP })).toEqual({
      kind: 'contract', code: 13, name: 'TokenContractError', message: SAC_ERRORS[13],
    });
    expect(classifyTxError(new Error(msg.replace(/#10/g, '#99')), { lockupId: LOCKUP })).toMatchObject({ name: 'TokenContractError', code: 99, message: 'Token contract error #99' });
    // without the lockup id the code is read from the lockup table (today's behaviour)
    expect(classifyTxError(new Error(msg))).toMatchObject({ name: 'ZeroDeposit', code: 10 });
    expect(classifyTxError(new Error(msg), {})).toMatchObject({ name: 'ZeroDeposit', code: 10 });
    // a diagnostic from the lockup itself stays a lockup error
    expect(classifyTxError(new Error(msg.replace(TOKEN, LOCKUP)), { lockupId: LOCKUP })).toMatchObject({ name: 'ZeroDeposit', code: 10 });
    // no diagnostics at all: plain code → lockup table
    expect(classifyTxError(new Error('Error(Contract, #13)'), { lockupId: LOCKUP })).toMatchObject({ name: 'UnlocksExceedDeposit' });
  });
  it('describeError renders a one-line human message', () => {
    expect(describeError({ kind: 'rejected', message: 'x' })).toBe('Signature rejected in the wallet.');
    expect(describeError({ kind: 'contract', code: 18, name: 'StartInPast', message: CONTRACT_ERRORS[18].message })).toBe(CONTRACT_ERRORS[18].message);
    expect(describeError({ kind: 'resource', message: 'x' })).toMatch(/too large/);
    expect(describeError({ kind: 'network', message: 'boom' })).toBe('boom');
  });
});

// Real vectors captured on testnet 2026-09-16 via
// `npx tsx scripts/capture-create-errors.ts` (simulation only, no signing, no
// secret key) against lockup CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL.
// Both lines are the raw `Error.message`, truncated to 600 chars by the
// script, embedded here verbatim (not re-typed from memory).
describe('captured on testnet 2026-09-16', () => {
  it('classifies the real StartInPast (#18) simulation failure (create_linear, start_ts 100s in the past)', () => {
    const msg = `Transaction simulation failed: "HostError: Error(Contract, #18)

Event log (newest first):
   0: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[error, Error(Contract, #18)], data:"escalating error to VM trap from failed host function call: fail_with_error"
   1: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[error, Error(Contract, #18)], data:["failing with contract error", 18]
   2: [Diagnostic Event] topics:[fn_call, CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, create_linear], data:[GBX`;
    expect(classifyTxError(new Error(msg))).toMatchObject({ kind: 'contract', code: 18, name: 'StartInPast' });
    expect(classifyTxError(new Error(msg), { lockupId: LOCKUP })).toMatchObject({ kind: 'contract', code: 18, name: 'StartInPast' });
  });

  // Captured 2026-09-16 the same way (simulation of `create_linear` with a
  // deposit far above the deployer's XLM balance; token = native SAC
  // CDLZFC…GCYSC). Note the ordering: the lockup's own "escalating error" and
  // "contract call failed" events (with the SAME code, #10) come BEFORE the
  // token's — so classification must not stop at the first error event.
  // Embedded verbatim, cut after the token `fn_call` event (event 3).
  it('classifies the real SAC BalanceError (#10) raised inside create_linear as a token error, not ZeroDeposit', () => {
    const msg = `Transaction simulation failed: "HostError: Error(Contract, #10)

Event log (newest first):
   0: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[error, Error(Contract, #10)], data:"escalating error to VM trap from failed host function call: call"
   1: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[error, Error(Contract, #10)], data:["contract call failed", transfer, [GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2, CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, 9000000000000000]]
   2: [Failed Diagnostic Event (not emitted)] contract:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, topics:[error, Error(Contract, #10)], data:["resulting balance is not within the allowed range", 20000000, -8999912569521706, 9223372036854775807]
   3: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[fn_call, CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, transfer], data:[GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2, CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, 9000000000000000]`;
    expect(classifyTxError(new Error(msg), { lockupId: LOCKUP })).toEqual({ kind: 'contract', code: 10, name: 'TokenContractError', message: 'Insufficient token balance.' });
    expect(describeError(classifyTxError(new Error(msg), { lockupId: LOCKUP }))).toBe('Insufficient token balance.');
    // today's behaviour without the id (the collision this guards against)
    expect(classifyTxError(new Error(msg))).toMatchObject({ code: 10, name: 'ZeroDeposit' });
  });

  // The second capture (`create_batch` with 100 rows) failed simulation with
  // a host-level budget error rather than returning "simulation OK" — the
  // 100-row batch alone (before signing/sending) already exceeds Soroban's
  // simulation resource budget. It classifies as `resource` because
  // "ExceededLimit" is already one of `RESOURCE_RE`'s alternatives; no
  // regex change was needed.
  it('classifies the real batch-of-100 resource failure (create_batch, Budget ExceededLimit)', () => {
    const msg = `Transaction simulation failed: "HostError: Error(Budget, ExceededLimit)
DebugInfo not available
"`;
    expect(classifyTxError(new Error(msg)).kind).toBe('resource');
  });
});
