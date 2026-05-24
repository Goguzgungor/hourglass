'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import WalletButton from '@/components/WalletButton';
import AmountTile from '@/components/AmountTile';
import StatusPill, { type StreamStatusTag } from '@/components/StatusPill';
import { useWallet } from '@/lib/wallet-context';
import {
  formatStroops,
  formatDuration,
  truncAddress,
} from '@/lib/format';
import type { StreamDoc } from '@/lib/db';

/* ----------------------------------------------------------------- *
 * Types                                                            *
 * ----------------------------------------------------------------- */

interface StatsResponse {
  total: number;
  active: number;
  inactive: number;
  locked: string;
}

type Status = StreamStatusTag;

function deriveStatus(s: StreamDoc, nowSec: number): Status {
  if (s.is_depleted) return 'DEPLETED';
  if (s.was_canceled) return 'CANCELED';
  if (nowSec < s.start_ts) return 'PENDING';
  if (nowSec >= s.end_ts) return 'SETTLED';
  return 'STREAMING';
}

/** Proportion of the deposit that has streamed already, clamped to [0,1]. */
function streamedFraction(s: StreamDoc, nowSec: number): number {
  try {
    const dep = BigInt(s.deposited);
    if (dep <= 0n) return 0;
    const duration = Math.max(1, s.end_ts - s.start_ts);
    const elapsed = Math.min(duration, Math.max(0, nowSec - s.start_ts));
    return elapsed / duration;
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
    <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24 pt-10 sm:pt-16 md:pt-24 xl:pt-28 pb-16">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-8 sm:mb-10">
        <p className="eyebrow xl:text-[0.78rem] 2xl:text-[0.85rem]">
          <span className="text-sand">·</span>{' '}
          <span className="ml-1">Dashboard</span>{' '}
          <span className="mx-2 text-stroke-2">/</span>
          Your streams
        </p>
      </div>

      {!address ? (
        <DisconnectedView pending={pending} />
      ) : (
        <ConnectedView address={address} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Disconnected: editorial empty state                              *
 * ----------------------------------------------------------------- */

function DisconnectedView({ pending: _pending }: { pending: boolean }): ReactNode {
  return (
    <div className="mt-12 sm:mt-20 xl:mt-28 mx-auto max-w-[560px] xl:max-w-[720px] 2xl:max-w-[840px] text-center">
      <h1 className="headline text-4xl sm:text-5xl md:text-6xl xl:text-7xl 2xl:text-8xl text-cream leading-[0.95]">
        A ledger,
        <br />
        <span className="text-sand-bright">awaiting an owner.</span>
      </h1>
      <p className="mt-6 sm:mt-8 xl:mt-10 xl:text-lg 2xl:text-xl text-cream-muted leading-relaxed">
        Connect a wallet to see the streams you’ve sent and the streams flowing
        toward you.
      </p>
      <div className="mt-8 sm:mt-10 flex justify-center">
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
  const [nowSec, setNowSec] = useState<number>(() =>
    Math.floor(Date.now() / 1000),
  );

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

  useEffect(() => {
    void load();
    const handle = setInterval(() => void load(), 5_000);
    return () => clearInterval(handle);
  }, [load]);

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
        <div className="mt-8 border border-warning/40 bg-warning/5 px-5 py-4 rounded-sm">
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

      <div className="mt-10 sm:mt-14 xl:mt-20 grid md:grid-cols-2 md:divide-x md:divide-stroke gap-y-10 sm:gap-y-12 xl:gap-x-6 2xl:gap-x-10">
        <Column
          label="Outgoing"
          subLabel="You are the sender"
          streams={outgoing}
          loading={loading}
          nowSec={nowSec}
          side="sender"
        />
        <Column
          label="Incoming"
          subLabel="You are the recipient"
          streams={incoming}
          loading={loading}
          nowSec={nowSec}
          side="recipient"
        />
      </div>

      {empty && <EmptyEditorial />}
    </>
  );
}

/* ----------------------------------------------------------------- *
 * Stats strip — now uses AmountTile for visual consistency.        *
 * ----------------------------------------------------------------- */

function StatsStrip({ stats }: { stats: StatsResponse | null }): ReactNode {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:gap-4 2xl:gap-5">
      <AmountTile
        label="Indexed"
        amount={stats === null ? '—' : String(stats.total)}
        unit="streams"
        accent="cream"
      />
      <AmountTile
        label="In flight"
        amount={stats === null ? '—' : String(stats.active)}
        unit="active"
        accent="teal"
        pulse={stats !== null && stats.active > 0}
      />
      <AmountTile
        label="Locked"
        amount={stats === null ? '—' : formatStroops(stats.locked)}
        unit="XLM"
        accent="sand"
      />
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
}: {
  label: string;
  subLabel: string;
  streams: StreamDoc[] | null;
  loading: boolean;
  nowSec: number;
  side: 'sender' | 'recipient';
}): ReactNode {
  return (
    <section className="md:px-8 xl:px-10 2xl:px-14 first:md:pl-0 last:md:pr-0">
      <div className="flex items-baseline justify-between mb-6 xl:mb-8">
        <p className="eyebrow text-cream xl:text-[0.78rem] 2xl:text-[0.85rem]">{label}</p>
        <p className="text-[10px] xl:text-[11px] 2xl:text-[12px] uppercase tracking-[0.18em] text-cream-dim/70">
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
          className="py-5 border-b border-stroke/40 space-y-3"
        >
          <div className="h-3 w-44 bg-stroke/30 animate-pulse rounded-sm" />
          <div className="h-6 w-56 bg-stroke/30 animate-pulse rounded-sm" />
          <div className="h-2 w-full bg-stroke/20 animate-pulse rounded-sm" />
        </li>
      ))}
    </ul>
  );
}

function StreamRow({
  stream,
  nowSec,
  side,
}: {
  stream: StreamDoc;
  nowSec: number;
  side: 'sender' | 'recipient';
}): ReactNode {
  const status = deriveStatus(stream, nowSec);
  const fraction = useMemo(() => streamedFraction(stream, nowSec), [stream, nowSec]);

  const counterparty =
    side === 'sender' ? stream.recipient : stream.sender;
  const counterpartyLabel = side === 'sender' ? 'to' : 'from';

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

  const modelBadge = stream.model === 'Linear' ? 'LINEAR' : 'TRANCHED';

  // Time hint has a mono live segment in the STREAMING/PENDING case.
  const splitHint = timeHint.match(/^(.*?)(\d+[a-z][a-z\s\d]*[a-z])$/);
  const hintPrefix = splitHint?.[1] ?? timeHint;
  const hintMono = splitHint?.[2] ?? '';

  // Pill color for the progress bar's filled portion
  const barFill =
    status === 'CANCELED'
      ? 'bg-rose'
      : status === 'STREAMING'
        ? 'bg-gradient-to-r from-sand-deep to-sand-bright'
        : status === 'SETTLED'
          ? 'bg-teal-deep'
          : status === 'DEPLETED'
            ? 'bg-stroke-2'
            : 'bg-stroke-2';

  return (
    <li className="border-b border-stroke/40">
      <Link
        href={`/stream/${stream._id}`}
        className="
          group block py-5 xl:py-7 2xl:py-8 px-2 -mx-2 rounded-sm
          transition-colors hover:bg-midnight-2/70
        "
      >
        <div className="grid grid-cols-[1fr_auto] gap-x-4 items-start">
          <div className="min-w-0">
            <p className="eyebrow text-cream-dim mb-2 xl:mb-3 flex flex-wrap items-center gap-x-2 xl:text-[0.78rem] 2xl:text-[0.85rem]">
              <span className="text-sand">·</span>
              <span>Stream #{stream._id}</span>
              <span className="text-stroke-2">/</span>
              <span>{modelBadge}</span>
            </p>

            {stream.model === 'Linear' ? (
              <p className="font-mono text-xl xl:text-2xl 2xl:text-3xl text-cream tabular truncate">
                {formatStroops(stream.deposited)}
                <span className="ml-2 text-[10px] xl:text-[11px] 2xl:text-[12px] uppercase tracking-[0.18em] text-cream-dim">
                  XLM
                </span>
              </p>
            ) : (
              <p className="headline-roman text-xl xl:text-2xl 2xl:text-3xl text-cream italic">
                Tranched stream
              </p>
            )}

            <p className="mt-2 xl:mt-3 text-[12px] xl:text-[13px] 2xl:text-[14px] text-cream-muted truncate">
              {counterpartyLabel}{' '}
              <span className="font-mono text-cream">
                {truncAddress(counterparty)}
              </span>{' '}
              <span className="text-stroke-2">·</span>{' '}
              <span className="text-cream-dim">{hintPrefix}</span>
              {hintMono && (
                <span className="font-mono tabular text-cream">{hintMono}</span>
              )}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusPill status={status} size="sm" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative mt-4 h-2 w-full bg-night border border-stroke overflow-hidden rounded-sm">
          <div
            className={'absolute inset-y-0 left-0 ' + barFill}
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
          {/* Hover sheen */}
          <div
            aria-hidden
            className="
              pointer-events-none absolute inset-y-0 left-0 w-1/4
              bg-gradient-to-r from-transparent via-white/30 to-transparent
              opacity-0 group-hover:opacity-100
            "
            style={{
              animation: 'shimmer-x 1.4s ease-out infinite',
            }}
          />
        </div>
      </Link>
    </li>
  );
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
