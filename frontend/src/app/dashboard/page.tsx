'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import HourglassIcon from '@/components/HourglassIcon';
import WalletButton from '@/components/WalletButton';
import { useWallet } from '@/lib/wallet-context';
import {
  formatStroops,
  formatDuration,
  truncAddress,
} from '@/lib/format';
import type { StreamDoc } from '@/lib/db';

/* ----------------------------------------------------------------- *
 * Types — the dashboard talks to Mongo via /api/streams + /api/stats *
 * so we use the canonical StreamDoc shape but cast through `unknown`  *
 * because the API serializes numbers as numbers and i128s as decimal  *
 * strings (i.e. exactly what StreamDoc declares).                     *
 * ----------------------------------------------------------------- */

interface StatsResponse {
  total: number;
  active: number;
  inactive: number;
  locked: string;
}

type Status =
  | 'PENDING'
  | 'STREAMING'
  | 'SETTLED'
  | 'CANCELED'
  | 'DEPLETED';

function deriveStatus(s: StreamDoc, nowSec: number): Status {
  if (s.is_depleted) return 'DEPLETED';
  if (s.was_canceled) return 'CANCELED';
  if (nowSec < s.start_ts) return 'PENDING';
  if (nowSec >= s.end_ts) return 'SETTLED';
  return 'STREAMING';
}

function remainingFraction(s: StreamDoc): number {
  try {
    const dep = BigInt(s.deposited);
    if (dep <= 0n) return 0;
    const claimed = BigInt(s.withdrawn) + BigInt(s.refunded);
    const remaining = dep - claimed;
    if (remaining <= 0n) return 0;
    return Math.max(
      0,
      Math.min(1, Number((remaining * 10_000n) / dep) / 10_000),
    );
  } catch {
    return 0;
  }
}

/* ----------------------------------------------------------------- *
 * Top-level page                                                   *
 * ----------------------------------------------------------------- */

export default function DashboardPage(): ReactNode {
  const { address, pending } = useWallet();
  return (
    <div className="mx-auto max-w-[1280px] px-6 sm:px-10 pt-16 sm:pt-24 pb-16">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-10">
        <p className="eyebrow">
          <span className="text-sand">·</span>{' '}
          <span className="ml-1">Dashboard</span>{' '}
          <span className="mx-2 text-stroke-2">/</span>
          Your streams
        </p>
      </div>

      {!address ? <DisconnectedView pending={pending} /> : <ConnectedView address={address} />}
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Disconnected: editorial empty state                              *
 * ----------------------------------------------------------------- */

function DisconnectedView({ pending: _pending }: { pending: boolean }): ReactNode {
  return (
    <div className="mt-20 mx-auto max-w-[560px] text-center">
      <h1 className="headline text-5xl sm:text-6xl text-cream leading-[0.95]">
        A ledger,
        <br />
        <span className="text-sand-bright">awaiting an owner.</span>
      </h1>
      <p className="mt-8 text-cream-muted leading-relaxed">
        Connect a wallet to see the streams you’ve sent and the streams flowing
        toward you.
      </p>
      <div className="mt-10 flex justify-center">
        <WalletButton />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Connected: fetch + render the two columns                        *
 * ----------------------------------------------------------------- */

function ConnectedView({ address }: { address: string }): ReactNode {
  const [outgoing, setOutgoing] = useState<StreamDoc[] | null>(null);
  const [incoming, setIncoming] = useState<StreamDoc[] | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  const load = useCallback(async () => {
    try {
      const [outRes, inRes, statsRes] = await Promise.all([
        fetch(`/api/streams?sender=${encodeURIComponent(address)}`, {
          cache: 'no-store',
        }),
        fetch(`/api/streams?recipient=${encodeURIComponent(address)}`, {
          cache: 'no-store',
        }),
        fetch('/api/stats', { cache: 'no-store' }),
      ]);
      const outJson = (await outRes.json()) as { streams?: StreamDoc[] };
      const inJson = (await inRes.json()) as { streams?: StreamDoc[] };
      const statsJson = (await statsRes.json()) as StatsResponse;
      setOutgoing(outJson.streams ?? []);
      setIncoming(inJson.streams ?? []);
      setStats(statsJson);
      setError(null);
    } catch (err) {
      setError((err as Error).message ?? String(err));
    }
  }, [address]);

  // Initial fetch + periodic refresh (the indexer updates Mongo every few
  // seconds, so re-polling the API keeps the dashboard ~live).
  useEffect(() => {
    void load();
    const handle = setInterval(() => void load(), 5_000);
    return () => clearInterval(handle);
  }, [load]);

  // A separate, fast tick just for re-deriving STREAMING/SETTLED labels.
  useEffect(() => {
    const handle = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(handle);
  }, []);

  const loading = outgoing === null || incoming === null;
  const empty = !loading && outgoing!.length === 0 && incoming!.length === 0;

  return (
    <>
      {/* Stats strip */}
      <StatsStrip stats={stats} />

      {error && (
        <div className="mt-8 border border-warning/40 bg-warning/5 px-5 py-4">
          <p className="eyebrow text-warning mb-2">· Indexer offline?</p>
          <p className="text-xs text-cream-muted leading-relaxed">
            Could not reach the indexer API. Make sure the indexer is running
            (<span className="font-mono text-cream">npm run indexer</span>) and
            that Mongo is up.
          </p>
          <p className="mt-3 font-mono text-[11px] text-cream-dim break-all">
            {error}
          </p>
        </div>
      )}

      {/* Two columns */}
      <div className="mt-14 grid md:grid-cols-2 md:divide-x md:divide-stroke gap-y-12">
        <Column
          label="Outgoing"
          subLabel="You are the sender"
          streams={outgoing}
          loading={loading}
          nowSec={nowSec}
          side="sender"
          address={address}
        />
        <Column
          label="Incoming"
          subLabel="You are the recipient"
          streams={incoming}
          loading={loading}
          nowSec={nowSec}
          side="recipient"
          address={address}
        />
      </div>

      {empty && <EmptyEditorial />}
    </>
  );
}

/* ----------------------------------------------------------------- *
 * Stats strip                                                      *
 * ----------------------------------------------------------------- */

function StatsStrip({ stats }: { stats: StatsResponse | null }): ReactNode {
  return (
    <div className="grid grid-cols-3 border-t border-b border-stroke divide-x divide-stroke">
      <Stat
        label="Indexed"
        value={stats === null ? '—' : String(stats.total)}
        kicker="streams"
      />
      <Stat
        label="In flight"
        value={stats === null ? '—' : String(stats.active)}
        kicker="active"
      />
      <Stat
        label="Locked"
        value={stats === null ? '—' : formatStroops(stats.locked)}
        kicker="XLM"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  kicker,
}: {
  label: string;
  value: string;
  kicker: string;
}): ReactNode {
  return (
    <div className="py-6 px-6 first:pl-0 last:pr-0">
      <p className="eyebrow text-cream-dim mb-3">{label}</p>
      <p className="font-mono text-2xl text-cream tabular">{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim/70">
        {kicker}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Columns + row                                                    *
 * ----------------------------------------------------------------- */

function Column({
  label,
  subLabel,
  streams,
  loading,
  nowSec,
  side,
  address,
}: {
  label: string;
  subLabel: string;
  streams: StreamDoc[] | null;
  loading: boolean;
  nowSec: number;
  side: 'sender' | 'recipient';
  address: string;
}): ReactNode {
  return (
    <section className="md:px-8 first:md:pl-0 last:md:pr-0">
      <div className="flex items-baseline justify-between mb-6">
        <p className="eyebrow text-cream">{label}</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-cream-dim/70">
          {subLabel}
        </p>
      </div>

      {loading && <RowSkeletons />}

      {!loading && streams!.length === 0 && (
        <p className="text-xs text-cream-dim py-6 border-t border-stroke/40">
          No {label.toLowerCase()} streams yet.
        </p>
      )}

      {!loading && streams!.length > 0 && (
        <ul className="border-t border-stroke/40">
          {streams!.map((s) => (
            <StreamRow
              key={s._id}
              stream={s}
              nowSec={nowSec}
              side={side}
              address={address}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RowSkeletons(): ReactNode {
  return (
    <ul className="border-t border-stroke/40">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="grid grid-cols-[1fr_56px] gap-x-4 items-center py-5 border-b border-stroke/40"
        >
          <div className="space-y-2">
            <div className="h-3 w-32 bg-stroke/30 animate-pulse" />
            <div className="h-5 w-44 bg-stroke/30 animate-pulse" />
            <div className="h-3 w-56 bg-stroke/20 animate-pulse" />
          </div>
          <div className="opacity-30 justify-self-end">
            <HourglassIcon size={36} fill={0.5} animated={false} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StreamRow({
  stream,
  nowSec,
  side,
  address: _address,
}: {
  stream: StreamDoc;
  nowSec: number;
  side: 'sender' | 'recipient';
  address: string;
}): ReactNode {
  const status = deriveStatus(stream, nowSec);
  const fraction = useMemo(() => remainingFraction(stream), [stream]);

  // Counter-party (we already know one side is `address`).
  const counterparty =
    side === 'sender' ? stream.recipient : stream.sender;
  const counterpartyLabel = side === 'sender' ? 'to' : 'from';

  // Time hint depends on status.
  let timeHint = '';
  if (status === 'PENDING') {
    timeHint = `starts in ${formatDuration(stream.start_ts - nowSec)}`;
  } else if (status === 'STREAMING') {
    timeHint = `ends in ${formatDuration(stream.end_ts - nowSec)}`;
  } else if (status === 'SETTLED') {
    timeHint = `ended ${formatDuration(nowSec - stream.end_ts)} ago`;
  } else if (status === 'CANCELED') {
    timeHint = 'canceled';
  } else {
    timeHint = 'depleted';
  }

  const modelBadge =
    stream.model === 'Linear' ? 'LINEAR' : 'TRANCHED';

  return (
    <li className="border-b border-stroke/40">
      <Link
        href={`/stream/${stream._id}`}
        className="
          group grid grid-cols-[1fr_56px] gap-x-4 items-center py-5
          transition-colors hover:bg-sand/[0.03]
        "
      >
        <div className="min-w-0">
          <p className="eyebrow text-cream-dim mb-2 flex flex-wrap items-center gap-x-2">
            <span className="text-sand">·</span>
            <span>Stream #{stream._id}</span>
            <span className="text-stroke-2">/</span>
            <span>{modelBadge}</span>
            <span className="text-stroke-2">/</span>
            <StatusInline status={status} />
          </p>

          {stream.model === 'Linear' ? (
            <p className="font-mono text-xl text-cream tabular truncate">
              {formatStroops(stream.deposited)}
              <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-cream-dim">
                XLM
              </span>
            </p>
          ) : (
            <p className="headline-roman text-xl text-cream italic">
              Tranched stream
            </p>
          )}

          <p className="mt-2 text-[12px] text-cream-muted truncate">
            {counterpartyLabel}{' '}
            <span className="font-mono text-cream">
              {truncAddress(counterparty)}
            </span>{' '}
            <span className="text-stroke-2">·</span>{' '}
            <span className="text-cream-dim">{timeHint}</span>
          </p>
        </div>

        <div className="justify-self-end opacity-90 group-hover:opacity-100 transition-opacity">
          <HourglassIcon
            size={36}
            fill={fraction}
            animated={status === 'STREAMING'}
          />
        </div>
      </Link>
    </li>
  );
}

function StatusInline({ status }: { status: Status }): ReactNode {
  const tone: Record<Status, string> = {
    PENDING: 'text-cream-dim',
    STREAMING: 'text-sand-bright',
    SETTLED: 'text-success',
    CANCELED: 'text-warning',
    DEPLETED: 'text-cream-dim line-through',
  };
  return <span className={tone[status]}>{status}</span>;
}

/* ----------------------------------------------------------------- *
 * Final editorial empty state                                      *
 * ----------------------------------------------------------------- */

function EmptyEditorial(): ReactNode {
  return (
    <div className="mt-20 mx-auto max-w-[520px] text-center">
      <p className="eyebrow text-cream-dim mb-4">· Quiet ledger</p>
      <h2 className="headline text-3xl text-cream leading-snug">
        Nothing is flowing yet.
      </h2>
      <p className="mt-6 text-sm text-cream-muted">
        The indexer hasn’t seen any streams involving this wallet. Start by
        creating one.
      </p>
      <Link
        href="/create"
        className="mt-8 inline-block text-[11px] uppercase tracking-[0.18em] text-sand hover:text-sand-bright transition-colors border-b border-sand/60 hover:border-sand pb-1"
      >
        Create your first stream →
      </Link>
    </div>
  );
}
