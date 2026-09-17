'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import StatusPill from '@/components/StatusPill';
import { formatStroops, formatDuration, truncAddress } from '@/lib/format';
import { streamedFraction } from '@/lib/streaming';
import { findToken } from '@/lib/tokens';
import type { StreamDoc } from '@/lib/db';
import type { StreamStatus } from '@/lib/streaming';

export type ApiStream = StreamDoc & { status: StreamStatus; withdrawable_now: string };

export default function StreamRow({
  stream,
  nowSec,
  address,
}: {
  stream: ApiStream;
  nowSec: number;
  address: string;
}) {
  const side = stream.sender === address ? 'sender' : 'recipient';
  const status = stream.status;
  const fraction = useMemo(() => streamedFraction(stream, nowSec), [stream, nowSec]);

  const counterparty =
    side === 'sender' ? stream.recipient : stream.sender;
  const counterpartyLabel = side === 'sender' ? '→ to' : '← from';

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

  const modelBadge = stream.model.toUpperCase();

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

            {stream.model !== 'Tranched' ? (
              <p className="font-mono text-xl xl:text-2xl 2xl:text-3xl text-cream tabular truncate">
                {formatStroops(stream.deposited)}
                <span className="ml-2 text-[10px] xl:text-[11px] 2xl:text-[12px] uppercase tracking-[0.18em] text-cream-dim">
                  {findToken(stream.token)?.symbol ?? 'TOKEN'}
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
