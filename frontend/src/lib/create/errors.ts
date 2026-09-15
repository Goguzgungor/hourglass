//
// Turn whatever the wallet / stellar-sdk / RPC throws into one of four kinds
// the create flow can act on. Order matters: a contract code is the most
// specific signal, then a wallet rejection, then resource/size failures.

export type ClassifiedError =
  | { kind: 'rejected'; message: string }
  | { kind: 'resource'; message: string }
  | { kind: 'contract'; code: number; name: string; message: string }
  | { kind: 'network'; message: string };

export const CONTRACT_ERRORS: Record<number, { name: string; message: string }> = {
  1: { name: 'InvalidCall', message: 'The contract rejected the call.' },
  10: { name: 'ZeroDeposit', message: 'Every amount must be greater than zero.' },
  11: { name: 'StartAfterEnd', message: 'End must be after start.' },
  12: { name: 'CliffOutOfRange', message: 'Cliff must be between start and end.' },
  13: { name: 'UnlocksExceedDeposit', message: 'Unlocks exceed the deposit.' },
  14: { name: 'NoTranches', message: 'Add at least one tranche.' },
  15: { name: 'TranchesNotAscending', message: 'Tranche times must increase.' },
  16: { name: 'TrancheSumMismatch', message: 'Tranche amounts do not add up.' },
  17: { name: 'TooManyTranches', message: 'Too many tranches (max 100).' },
  18: { name: 'StartInPast', message: 'The start time is now in the past. Shift the schedule and retry.' },
  19: { name: 'EmptyBatch', message: 'The batch is empty.' },
  20: { name: 'BatchTooLarge', message: 'Too many rows in one transaction (max 100).' },
  21: { name: 'InvalidPeriod', message: 'Period must be at least 1 second.' },
  22: { name: 'InvalidCount', message: 'Count must be at least 1.' },
  30: { name: 'StreamNotFound', message: 'Stream not found.' },
  31: { name: 'NotSender', message: 'Only the sender can do this.' },
  32: { name: 'NotRecipient', message: 'Only the recipient can do this.' },
  33: { name: 'NotCancelable', message: 'This stream is not cancelable.' },
  34: { name: 'NotTransferable', message: 'This stream is not transferable.' },
  35: { name: 'AlreadyCanceled', message: 'This stream was already canceled.' },
  36: { name: 'AlreadyDepleted', message: 'This stream is already depleted.' },
  37: { name: 'InvalidStatus', message: 'The stream is in the wrong state for this action.' },
  50: { name: 'InsufficientWithdrawable', message: 'Not enough withdrawable balance.' },
  51: { name: 'ZeroWithdraw', message: 'Nothing to withdraw.' },
  70: { name: 'NotAdmin', message: 'Admin only.' },
  71: { name: 'OracleStale', message: 'The price oracle is stale.' },
  72: { name: 'InvalidOraclePrice', message: 'The price oracle returned an invalid price.' },
  73: { name: 'UnknownOp', message: 'Unknown operation.' },
  90: { name: 'Overflow', message: 'Arithmetic overflow.' },
};

const REJECTED_RE = /user (rejected|declined|denied)|rejected by user|cancell?ed by user|User declined|declined the request/i;
const RESOURCE_RE =
  /ExceededLimit|exceeds? (the )?(resource|size|budget)|resource limit|TxSorobanInvalid|txSorobanInvalid|TX_SOROBAN_INVALID/i;
const CONTRACT_RE = /Error\(Contract, #(\d+)\)/;

function collectText(e: unknown): string {
  if (e === undefined || e === null) return '';
  if (typeof e === 'string') return e;
  const o = e as { message?: unknown; simulation?: { error?: unknown }; sendTransactionResponse?: { errorResult?: unknown } };
  const parts: string[] = [];
  if (typeof o.message === 'string') parts.push(o.message);
  if (o.simulation && typeof o.simulation.error === 'string') parts.push(o.simulation.error);
  if (o.sendTransactionResponse?.errorResult !== undefined) {
    try {
      parts.push(JSON.stringify(o.sendTransactionResponse.errorResult));
    } catch {
      /* ignore */
    }
  }
  if (parts.length === 0) parts.push(String(e));
  return parts.join('\n');
}

export function classifyTxError(e: unknown): ClassifiedError {
  const text = collectText(e);
  const contract = CONTRACT_RE.exec(text);
  if (contract) {
    const code = Number(contract[1]);
    const known = CONTRACT_ERRORS[code];
    return {
      kind: 'contract',
      code,
      name: known?.name ?? 'Unknown',
      message: known?.message ?? `Contract error #${code} (Unknown)`,
    };
  }
  if (REJECTED_RE.test(text)) return { kind: 'rejected', message: text.trim().slice(0, 200) };
  if (RESOURCE_RE.test(text)) return { kind: 'resource', message: text.trim().slice(0, 200) };
  const trimmed = text.trim();
  return { kind: 'network', message: (trimmed || 'Unknown error').slice(0, 200) };
}

export function describeError(err: ClassifiedError): string {
  switch (err.kind) {
    case 'rejected':
      return 'Signature rejected in the wallet.';
    case 'resource':
      return 'This transaction is too large for the network limits.';
    case 'contract':
      return err.message;
    case 'network':
      return err.message;
  }
}
