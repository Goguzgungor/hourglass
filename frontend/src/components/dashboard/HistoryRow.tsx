'use client';
import Link from 'next/link';
import { KIND_COLOR, KIND_LABEL, type HistoryRow } from '@/lib/dashboard/history';
import { txUrl } from '@/lib/explorer';
import { formatDuration, formatStroops, formatTimestamp, truncAddress } from '@/lib/format';
import { findToken } from '@/lib/tokens';

export default function HistoryRowView({ row, nowSec }: { row: HistoryRow; nowSec: number }) {
  const sym = row.token ? (findToken(row.token)?.symbol ?? truncAddress(row.token)) : '';
  const link = txUrl(row.txHash);
  const ago = nowSec >= row.ts ? `${formatDuration(nowSec - row.ts)} ago` : 'just now';
  return (
    <li className="grid grid-cols-[12px_1fr_auto] gap-x-3 items-baseline py-3 border-b border-stroke/40">
      <span aria-hidden className={`mt-1 size-[8px] rounded-full ${KIND_COLOR[row.kind]}`} />
      <div className="min-w-0 font-mono text-xs">
        <p className="text-cream">
          <span className="uppercase tracking-[0.16em] text-[10px] text-cream-dim mr-2">{KIND_LABEL[row.kind]}</span>
          <Link href={`/stream/${row.streamId}`} className="text-sand hover:text-sand-bright">#{row.streamId}</Link>
          {row.model && <span className="text-cream-dim"> · {row.model}</span>}
          {row.amount !== null && (
            <span className="ml-2 text-sand-bright">
              {row.kind === 'canceled' ? 'refund ' : ''}{formatStroops(row.amount)} {sym}
            </span>
          )}
          {row.kind === 'canceled' && row.secondary !== null && <span className="text-cream-dim"> · {formatStroops(row.secondary)} {sym} left to recipient</span>}
        </p>
        <p className="mt-1 text-[11px] text-cream-dim truncate">
          {row.mine ? 'by you' : row.actor ? `by ${truncAddress(row.actor)}` : ''}
          {row.counterparty && <span> · {row.kind === 'transferred' ? 'to' : 'with'} {truncAddress(row.counterparty)}</span>}
        </p>
      </div>
      <div className="text-right font-mono text-[10px] text-cream-dim">
        <span title={formatTimestamp(row.ts)}>{ago}</span>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="block text-sand hover:text-sand-bright">tx ↗</a>
        )}
      </div>
    </li>
  );
}
