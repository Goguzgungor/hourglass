//
// The only place that talks to the lockup client for creation. Single mode
// calls the shape-specific method; batch mode prepares/sends create_batch.

import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import type { CreateRow, CreateSpec, LockupClient } from '@/lib/sdk';
import { buildSpec, type BuiltSpec, type Schedule } from './schedule';

type Flags = { cancelable: boolean; transferable: boolean };

export function toCreateRow(recipient: string, built: BuiltSpec, flags: Flags): CreateRow {
  return { recipient, is_cancelable: flags.cancelable, is_transferable: flags.transferable, spec: built.spec };
}

export function txHashOf(sent: {
  sendTransactionResponse?: { hash: string };
  getTransactionResponse?: { txHash?: string };
}): string {
  return sent.sendTransactionResponse?.hash ?? sent.getTransactionResponse?.txHash ?? '';
}

export async function submitSingle(
  lockup: LockupClient,
  args: { sender: string; recipient: string; token: string; schedule: Schedule; total: bigint } & Flags,
): Promise<{ streamId: number; txHash: string }> {
  const built = buildSpec(args.schedule, args.total);
  const common = {
    sender: args.sender,
    recipient: args.recipient,
    token: args.token,
    is_cancelable: args.cancelable,
    is_transferable: args.transferable,
  };
  const tx = await createTx(lockup, common, built.spec);
  // The SDK does not throw on a failed simulation until `simulationData` is read
  // (sign/signAndSend do it); read it here so build-phase errors are visible to the runner.
  void tx.simulationData;
  const sent = await tx.signAndSend();
  return { streamId: sent.result, txHash: txHashOf(sent) };
}

type Common = { sender: string; recipient: string; token: string; is_cancelable: boolean; is_transferable: boolean };

function createTx(lockup: LockupClient, common: Common, spec: CreateSpec): Promise<AssembledTransaction<number>> {
  switch (spec.tag) {
    case 'Linear': {
      const p = spec.values[0];
      return lockup.create_linear({
        ...common,
        deposited: p.deposited,
        start_ts: p.start_ts,
        cliff_ts: p.cliff_ts,
        end_ts: p.end_ts,
        unlock_at_start: p.unlock_at_start,
        unlock_at_cliff: p.unlock_at_cliff,
      });
    }
    case 'Tranched':
      return lockup.create_tranched({ ...common, tranches: [...spec.values[0].tranches] });
    case 'Recurring': {
      const p = spec.values[0];
      return lockup.create_recurring({
        ...common,
        amount_per_period: p.amount_per_period,
        period_secs: p.period_secs,
        count: p.count,
        first_ts: p.first_ts,
      });
    }
  }
}

export async function prepareBatch(
  lockup: LockupClient,
  args: { sender: string; token: string; schedule: Schedule; rows: Array<{ recipient: string; total: bigint }> } & Flags,
): Promise<AssembledTransaction<number[]>> {
  const flags = { cancelable: args.cancelable, transferable: args.transferable };
  const rows = args.rows.map((r) => toCreateRow(r.recipient, buildSpec(args.schedule, r.total), flags));
  const tx = await lockup.create_batch({ sender: args.sender, token: args.token, rows });
  // The SDK does not throw on a failed simulation until `simulationData` is read
  // (sign/signAndSend do it); read it here so build-phase errors are visible to the runner.
  void tx.simulationData;
  return tx;
}

export async function sendPrepared(
  tx: AssembledTransaction<number[]>,
): Promise<{ txHash: string; streamIds: number[] }> {
  const sent = await tx.signAndSend();
  return { txHash: txHashOf(sent), streamIds: [...sent.result] };
}
