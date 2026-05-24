'use client';

/**
 * Stage 1 stub for the wallet button. The actual wiring to
 * @creit.tech/stellar-wallets-kit lands in Stage 2.
 */
export default function WalletButton() {
  return (
    <button
      type="button"
      className="
        group inline-flex items-center gap-2 border border-stroke
        px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-cream
        hover:border-sand hover:text-sand-bright
        transition-colors duration-200 rounded-none
      "
      onClick={() => {
        // intentionally no-op for Stage 1
      }}
      aria-label="Connect wallet (coming soon)"
    >
      <span className="size-[6px] bg-cream-dim group-hover:bg-sand transition-colors" />
      Connect
    </button>
  );
}
