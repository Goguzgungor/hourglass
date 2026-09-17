//
// /api/history items → view rows. Pure.

import type { ActionDoc } from '@/lib/db';
import type { ActionKind } from './filters';

export type HistoryItem = ActionDoc & {
  stream: { id: number; model: 'Linear' | 'Tranched' | 'Recurring'; token: string; sender: string; recipient: string; deposited: string } | null;
};

export type HistoryRow = {
  id: string;
  kind: ActionKind;
  ts: number;
  streamId: number;
  model: 'Linear' | 'Tranched' | 'Recurring' | null;
  token: string | null;
  /** created: deposited · withdrawn: amount · canceled: sender refund */
  amount: bigint | null;
  /** canceled: what stayed withdrawable for the recipient */
  secondary: bigint | null;
  /** The other party relative to `address`. */
  counterparty: string | null;
  actor: string | null;
  mine: boolean;
  txHash: string;
};

export const KIND_LABEL: Record<ActionKind, string> = {
  created: 'Created',
  withdrawn: 'Withdrawn',
  canceled: 'Canceled',
  renounced: 'Renounced',
  transferred: 'Transferred',
  burned: 'Burned',
};

export const KIND_COLOR: Record<ActionKind, string> = {
  created: 'bg-sand',
  withdrawn: 'bg-teal',
  canceled: 'bg-rose',
  renounced: 'bg-violet',
  transferred: 'bg-cream',
  burned: 'bg-cream-dim',
};

function big(v: string | undefined): bigint | null {
  if (v === undefined) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

function otherParty(item: HistoryItem, address: string): string | null {
  const s = item.stream;
  if (item.action === 'transferred') {
    // Old owner's view: the new owner. New owner's view: whoever transferred
    // it (the stream doc's recipient is already the new owner by now).
    if (item.new_owner && item.new_owner !== address) return item.new_owner;
    if (item.actor && item.actor !== address) return item.actor;
  }
  if (item.action === 'withdrawn' && item.to && item.to !== address) return item.to;
  if (s) {
    if (s.sender === address) return s.recipient;
    if (s.recipient === address) return s.sender;
    return s.recipient;
  }
  const others = item.participants.filter((p) => p !== address);
  return others[0] ?? null;
}

export function toHistoryRow(item: HistoryItem, address: string): HistoryRow {
  const kind = item.action as ActionKind;
  let amount: bigint | null = null;
  let secondary: bigint | null = null;
  switch (kind) {
    case 'created':
      amount = big(item.stream?.deposited);
      break;
    case 'withdrawn':
      amount = big(item.amount);
      break;
    case 'canceled':
      amount = big(item.sender_refund);
      secondary = big(item.recipient_balance);
      break;
    default:
      break;
  }
  return {
    id: `${item.tx_hash}:${item.log_index}`,
    kind,
    ts: item.ts,
    streamId: item.stream_id,
    model: item.stream?.model ?? null,
    token: item.stream?.token ?? null,
    amount,
    secondary,
    counterparty: otherParty(item, address),
    actor: item.actor ?? null,
    mine: item.actor === address,
    txHash: item.tx_hash,
  };
}

export function filterHistoryRows(rows: HistoryRow[], kinds: ActionKind[]): HistoryRow[] {
  return kinds.length ? rows.filter((r) => kinds.includes(r.kind)) : rows;
}
