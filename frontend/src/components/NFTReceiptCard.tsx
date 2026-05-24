'use client';

import HourglassIcon from '@/components/HourglassIcon';
import Constellation from '@/components/Constellation';
import StatusPill, { type StreamStatusTag } from '@/components/StatusPill';
import { formatStroops, truncAddress } from '@/lib/format';
import { DEPLOYMENT } from '@/lib/deployments';

type Props = {
  streamId: number;
  owner: string | null;
  deposited: bigint;
  is_transferable: boolean;
  status: StreamStatusTag;
  /** 0..1, controls how much sand is left in the upper bulb. */
  fill?: number;
};

/**
 * NFTReceiptCard — an editorial, sharp-cornered receipt for the NFT wrapping a
 * single stream. Stays inside the Hourglass language: midnight ground, sand
 * accents, Fraunces italic headline, Geist Mono technical data, faint
 * constellation pattern in the corners. No 3D, no rounded shells.
 */
export default function NFTReceiptCard({
  streamId,
  owner,
  deposited,
  is_transferable,
  status,
  fill = 0.5,
}: Props) {
  // Short network label — derived from the deployment passphrase so it never
  // gets stale relative to whatever network the contract is actually live on.
  const networkLabel = networkShortLabel(DEPLOYMENT.networkPassphrase);

  return (
    <div
      className={
        'relative bg-midnight border border-stroke rounded-sm p-6 aspect-[3/4] ' +
        'overflow-hidden transition-transform duration-300 hover:-translate-y-px ' +
        'hover:border-sand/60 group'
      }
    >
      {/* Sand glow shell on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          boxShadow: 'inset 0 0 80px -20px var(--sand-deep)',
        }}
      />

      {/* Faint constellations in the corners — Orion belt motif reused from
          the landing page. Held low, opacity 0.2 so they whisper. */}
      <Constellation
        className="pointer-events-none absolute top-2 right-2 opacity-20"
        width={70}
        height={50}
      />
      <Constellation
        className="pointer-events-none absolute bottom-2 left-2 opacity-15 -scale-x-100"
        width={70}
        height={50}
      />

      {/* Top row: wordmark + status pill */}
      <div className="relative flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-[0.22em] text-cream-dim leading-tight">
            Hourglass
          </span>
          <span className="text-[9px] uppercase tracking-[0.22em] text-sand leading-tight">
            Receipt
          </span>
        </div>
        <StatusPill status={status} size="sm" />
      </div>

      {/* Center: large hourglass with subtle halo */}
      <div className="relative mt-2 flex flex-col items-center">
        <div className="relative">
          <span
            aria-hidden
            className="absolute inset-0 -m-2 rounded-full"
            style={{
              background:
                'radial-gradient(circle, var(--sand-deep) 0%, transparent 70%)',
              opacity: 0.18,
              filter: 'blur(8px)',
            }}
          />
          <HourglassIcon size={84} fill={fill} animated />
        </div>

        {/* Stream id — the headline */}
        <p className="mt-5 font-display italic text-[2.5rem] leading-none text-sand-bright">
          #{streamId}
        </p>

        {/* Amount */}
        <p className="mt-3 font-mono text-sm text-cream tabular">
          {formatStroops(deposited)}{' '}
          <span className="ml-1 text-[10px] uppercase tracking-[0.18em] text-cream-dim">
            XLM
          </span>
        </p>
      </div>

      {/* OWNED BY */}
      <div className="relative mt-5 text-center">
        <p className="text-[9px] uppercase tracking-[0.22em] text-cream-dim">
          Owned by
        </p>
        <p
          className="mt-1 font-mono text-xs text-cream tabular truncate"
          title={owner ?? undefined}
        >
          {owner ? truncAddress(owner) : '—'}
        </p>
      </div>

      {/* Bottom strip: transferable + chain */}
      <div className="absolute left-6 right-6 bottom-6 grid grid-cols-2 gap-4 border-t border-stroke/60 pt-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.22em] text-cream-dim">
            Transferable
          </p>
          <p
            className={
              'mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] ' +
              (is_transferable ? 'text-teal-bright' : 'text-cream-dim')
            }
          >
            {is_transferable ? 'YES' : 'NO'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-[0.22em] text-cream-dim">
            Chain
          </p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-cream">
            {networkLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Short label derived from a Stellar network passphrase. */
function networkShortLabel(passphrase: string): string {
  const p = passphrase.toLowerCase();
  if (p.includes('public')) return 'Mainnet';
  if (p.includes('test')) return 'Testnet';
  if (p.includes('futurenet')) return 'Futurenet';
  if (p.includes('standalone')) return 'Standalone';
  return 'Stellar';
}
