// Read-only view of the lockup contract via the generated SDK client.

import { lockup as lockupSdk } from 'hourglass';
import type { StreamDoc } from '../db';

interface ShapeLinearChain { tag: 'Linear'; values: readonly [{ cliff_ts: bigint | number; unlock_at_start: bigint; unlock_at_cliff: bigint }] }
interface ShapeTranchedChain { tag: 'Tranched'; values: readonly [{ tranches: Array<{ amount: bigint; ts: bigint | number }> }] }
interface ShapeRecurringChain { tag: 'Recurring'; values: readonly [{ first_ts: bigint | number; period_secs: bigint | number; count: number; amount_per_period: bigint }] }

export interface StreamChain {
  sender: string; recipient: string; token: string;
  start_ts: bigint | number; end_ts: bigint | number;
  deposited: bigint; withdrawn: bigint; refunded: bigint;
  is_cancelable: boolean; is_transferable: boolean; was_canceled: boolean; is_depleted: boolean;
  shape: ShapeLinearChain | ShapeTranchedChain | ShapeRecurringChain;
}

export interface ChainReader {
  /** `null` when the stream record does not exist (never created, or burned). */
  getStream(id: number): Promise<StreamChain | null>;
  totalSupply(): Promise<number>;
  getTokenId(index: number): Promise<number>;
}

/** Pure mapping of an on-chain record to the materialized document fields. */
export function mapStream(s: StreamChain): Partial<StreamDoc> {
  let shapeFields: Partial<StreamDoc>;
  if (s.shape.tag === 'Linear') {
    shapeFields = {
      model: 'Linear',
      cliff_ts: Number(s.shape.values[0].cliff_ts),
      unlock_at_start: String(s.shape.values[0].unlock_at_start),
      unlock_at_cliff: String(s.shape.values[0].unlock_at_cliff),
    };
  } else if (s.shape.tag === 'Tranched') {
    shapeFields = {
      model: 'Tranched',
      tranches: s.shape.values[0].tranches.map((t) => ({ amount: String(t.amount), ts: Number(t.ts) })),
    };
  } else if (s.shape.tag === 'Recurring') {
    shapeFields = {
      model: 'Recurring',
      first_ts: Number(s.shape.values[0].first_ts),
      period_secs: Number(s.shape.values[0].period_secs),
      count: Number(s.shape.values[0].count),
      amount_per_period: String(s.shape.values[0].amount_per_period),
    };
  } else {
    throw new Error(`unknown stream shape: ${JSON.stringify(s.shape)}`);
  }
  return {
    sender: String(s.sender),
    recipient: String(s.recipient),
    token: String(s.token),
    start_ts: Number(s.start_ts),
    end_ts: Number(s.end_ts),
    deposited: String(s.deposited),
    withdrawn: String(s.withdrawn),
    refunded: String(s.refunded),
    is_cancelable: Boolean(s.is_cancelable),
    is_transferable: Boolean(s.is_transferable),
    was_canceled: Boolean(s.was_canceled),
    is_depleted: Boolean(s.is_depleted),
    ...shapeFields,
  };
}

type ViewClient = {
  get_stream(a: { stream_id: number }): Promise<{ result: unknown }>;
  total_supply(): Promise<{ result: unknown }>;
  get_token_id(a: { index: number }): Promise<{ result: unknown }>;
};

function isNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err);
  return msg.includes('StreamNotFound') || msg.includes('#30') || msg.toLowerCase().includes('not found');
}

export function makeChainReader(d: { lockup: string; networkPassphrase: string; rpcUrl: string; deployer: string }): ChainReader {
  const client = new lockupSdk.Client({
    contractId: d.lockup,
    networkPassphrase: d.networkPassphrase,
    rpcUrl: d.rpcUrl,
    publicKey: d.deployer,
    allowHttp: d.rpcUrl.startsWith('http://'),
  }) as unknown as ViewClient;
  return {
    async getStream(id) {
      try {
        const tx = await client.get_stream({ stream_id: id });
        const s = tx.result as StreamChain | undefined;
        return s && s.sender ? s : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async totalSupply() {
      return Number((await client.total_supply()).result);
    },
    async getTokenId(index) {
      return Number((await client.get_token_id({ index })).result);
    },
  };
}
