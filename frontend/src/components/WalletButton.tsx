'use client';

import { useWallet } from '@/lib/wallet-context';
import { truncAddress } from '@/lib/format';

export default function WalletButton() {
  const { address, pending, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button
        type="button"
        onClick={disconnect}
        disabled={pending}
        aria-label={`Disconnect wallet ${address}`}
        title={address}
        className="
          group inline-flex items-center gap-2 border border-stroke
          px-4 py-2 text-[11px] text-cream
          hover:border-sand hover:bg-sand/5
          transition-colors duration-200 rounded-none
          disabled:opacity-60
        "
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 bg-sand rounded-full animate-pulse opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sand" />
        </span>
        <span className="font-mono text-cream tracking-normal normal-case">
          {truncAddress(address)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={pending}
      aria-label="Connect wallet"
      className="
        group inline-flex items-center gap-2 border border-stroke
        px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-cream
        hover:border-sand hover:text-sand-bright
        transition-colors duration-200 rounded-none
        disabled:opacity-60
      "
    >
      <span className="size-[6px] bg-cream-dim group-hover:bg-sand transition-colors" />
      {pending ? 'Connecting…' : 'Connect'}
    </button>
  );
}
