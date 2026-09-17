// frontend/src/components/dashboard/StatsStrip.tsx
'use client';

import AmountTile from '@/components/AmountTile';
import type { WalletStats } from '@/lib/api/walletStats';
import { formatStroops, truncAddress } from '@/lib/format';
import { findToken } from '@/lib/tokens';

function sym(token: string): string {
  return findToken(token)?.symbol ?? truncAddress(token);
}

/** API money is a decimal string; a malformed one counts as nothing rather than crashing the strip. */
function safeBig(s: string): bigint {
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

export default function StatsStrip({ stats }: { stats: WalletStats | null }) {
  const bs = stats?.counts.by_status;
  const breakdown = bs
    ? `${bs.STREAMING} streaming · ${bs.PENDING} pending · ${bs.SETTLED} settled · ${bs.CANCELED} canceled · ${bs.DEPLETED} depleted`
    : undefined;
  const tokens = (stats?.by_token ?? []).filter((t) => safeBig(t.sent_locked) > 0n || safeBig(t.received_withdrawable_now) > 0n);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:gap-4">
        <AmountTile label="Sending" amount={stats ? String(stats.counts.sending) : '—'} unit="streams" accent="sand" />
        <AmountTile label="Receiving" amount={stats ? String(stats.counts.receiving) : '—'} unit="streams" accent="teal" pulse={!!bs && bs.STREAMING > 0} />
        <AmountTile label="By status" amount={stats ? String(stats.counts.by_status.STREAMING) : '—'} unit="streaming" accent="cream" caption={breakdown} />
      </div>
      {tokens.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 xl:gap-4">
          {tokens.map((t) => (
            <div key={t.token} className="border border-stroke bg-night/40 px-4 py-3 font-mono text-xs">
              <p className="eyebrow text-cream-dim mb-2">· {sym(t.token)}</p>
              <p className="text-cream">
                locked <span className="text-sand-bright">{formatStroops(safeBig(t.sent_locked))}</span>
                <span className="text-cream-dim"> as sender</span>
              </p>
              <p className="text-cream mt-1">
                claimable <span className="text-teal-bright">{formatStroops(safeBig(t.received_withdrawable_now))}</span>
                <span className="text-cream-dim"> as recipient</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
