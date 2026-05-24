'use client';

import { DEPLOYMENT } from '@/lib/deployments';

/**
 * Network-aware status strip used under the landing hero CTAs.
 *
 * The leading green dot + "live" semantics are preserved across all networks;
 * the trailing text + explorer link is derived from the active deployment's
 * network passphrase so the strip stays accurate as we ship to testnet /
 * mainnet without code changes.
 */
export default function NetworkBadge() {
  const passphrase = DEPLOYMENT.networkPassphrase ?? '';

  type Variant = {
    label: string;
    detail: string;
    href?: string;
  };

  let variant: Variant;
  if (passphrase.includes('Test SDF')) {
    variant = {
      label: 'Testnet live',
      detail: 'stellar.expert',
      href: 'https://stellar.expert/explorer/testnet',
    };
  } else if (passphrase.includes('Public Global Stellar')) {
    variant = {
      label: 'Mainnet live',
      detail: 'stellar.expert',
      href: 'https://stellar.expert/explorer/public',
    };
  } else if (passphrase.includes('Standalone Network')) {
    variant = {
      label: 'Local live',
      detail: 'Local quickstart at :8000',
    };
  } else if (passphrase) {
    variant = {
      label: 'Network',
      detail:
        passphrase.length > 38
          ? `${passphrase.slice(0, 35)}…`
          : passphrase,
    };
  } else {
    variant = {
      label: 'Offline',
      detail: 'No deployment loaded',
    };
  }

  return (
    <div className="mt-8 sm:mt-10 xl:mt-12 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] text-cream-dim">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 bg-success rounded-full animate-ping opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
      </span>
      {variant.label}
      <span className="hidden sm:inline text-stroke-2">·</span>
      {variant.href ? (
        <a
          href={variant.href}
          target="_blank"
          rel="noreferrer"
          className="font-mono normal-case tracking-normal text-cream-dim hover:text-sand-bright transition-colors underline-offset-2 hover:underline"
        >
          {variant.detail}
        </a>
      ) : (
        <span className="font-mono normal-case tracking-normal text-cream-dim">
          {variant.detail}
        </span>
      )}
    </div>
  );
}
