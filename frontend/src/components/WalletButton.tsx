'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/lib/wallet-context';
import { truncAddress } from '@/lib/format';
import { DEPLOYMENT } from '@/lib/deployments';

export default function WalletButton() {
  const { address, pending, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  function explorerHref(): string | null {
    if (!address) return null;
    const passphrase = DEPLOYMENT.networkPassphrase ?? '';
    if (passphrase.includes('Public Global Stellar')) {
      return `https://stellar.expert/explorer/public/account/${address}`;
    }
    if (passphrase.includes('Test SDF')) {
      return `https://stellar.expert/explorer/testnet/account/${address}`;
    }
    return null;
  }

  if (!address) {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={pending}
        aria-label="Connect wallet"
        className="
          group inline-flex items-center gap-2 border border-stroke
          px-3 sm:px-4 min-h-[40px] text-[11px] uppercase tracking-[0.18em] text-cream
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

  const expHref = explorerHref();

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={address}
        className={
          'group inline-flex items-center gap-2 border px-3 sm:px-4 min-h-[40px] text-[11px] text-cream ' +
          'transition-colors duration-200 rounded-none ' +
          (open
            ? 'border-sand bg-sand/10'
            : 'border-stroke hover:border-sand hover:bg-sand/5')
        }
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 bg-sand rounded-full animate-pulse opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sand" />
        </span>
        <span className="font-mono text-cream tracking-normal normal-case">
          {truncAddress(address)}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 10 6"
          className={
            'w-2.5 h-1.5 text-cream-dim transition-transform duration-150 ' +
            (open ? 'rotate-180' : '')
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M1 1l4 4 4-4" strokeLinecap="square" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Wallet"
          className="
            absolute right-0 top-full mt-2 z-50 w-[320px]
            max-w-[calc(100vw-2rem)]
            bg-midnight border border-stroke
            shadow-[0_18px_60px_-12px_rgba(0,0,0,0.6)]
          "
        >
          {/* Address + copy */}
          <div className="px-5 pt-4 pb-4 border-b border-stroke/60">
            <p className="eyebrow text-cream-dim text-[10px]">
              <span className="text-sand">·</span> Wallet
            </p>
            <div className="mt-3 flex items-start gap-3">
              <p className="font-mono text-[11px] leading-snug text-cream break-all flex-1">
                {address}
              </p>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy address"
                className="
                  shrink-0 inline-flex items-center gap-1.5
                  border border-stroke hover:border-sand
                  text-[10px] uppercase tracking-[0.16em]
                  text-cream-dim hover:text-sand-bright
                  px-2 py-1 transition-colors
                "
              >
                {copied ? (
                  <>
                    <CheckIcon /> Copied
                  </>
                ) : (
                  <>
                    <CopyIcon /> Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick actions */}
          <div className="px-2 py-2 flex flex-col">
            {expHref && (
              <a
                href={expHref}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  flex items-center justify-between gap-3
                  px-3 py-2 text-[11px] uppercase tracking-[0.18em]
                  text-cream hover:bg-midnight-2 hover:text-sand-bright
                  transition-colors
                "
              >
                <span className="inline-flex items-center gap-2">
                  <ExternalIcon /> View on Stellar Expert
                </span>
                <span className="text-cream-dim text-[9px]">↗</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
              className="
                text-left px-3 py-2 text-[11px] uppercase tracking-[0.18em]
                text-cream-dim hover:text-rose hover:bg-rose/5
                transition-colors
              "
            >
              <span className="inline-flex items-center gap-2">
                <DisconnectIcon /> Disconnect
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- icons (inline, ~12px) ---------- */

function CopyIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <path d="M3 8H2V2H8V3" strokeLinecap="square" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M2 6.5L5 9.5L10 3" strokeLinecap="square" />
    </svg>
  );
}
function ExternalIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M3 9L9 3M5 3h4v4" strokeLinecap="square" />
    </svg>
  );
}
function DisconnectIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M5 1H2v10h3M8 4l3 2l-3 2M11 6H5" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
