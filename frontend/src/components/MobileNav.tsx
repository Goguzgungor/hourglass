'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: '/create', label: 'Create' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/#principles', label: 'Principles' },
  { href: '/#surface', label: 'Specification' },
  { href: 'https://github.com', label: 'Source', external: true },
];

/**
 * Mobile-only nav surface: hamburger icon (44x44 hit area) that toggles a
 * fullscreen overlay panel containing the same nav links the desktop header
 * shows inline. Closes on link click, Esc, or backdrop tap.
 *
 * Rendered only at <md by the parent layout — markup is therefore `md:hidden`
 * on both the trigger and the overlay so the desktop nav remains untouched.
 */
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close whenever the route changes (e.g. clicking a same-section anchor).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll + Esc-to-close while the overlay is up.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center w-11 h-11 -mr-2 text-cream-dim hover:text-cream transition-colors"
      >
        <IconHamburger />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="md:hidden fixed inset-0 z-40 bg-night/95 backdrop-blur-sm flex flex-col"
          onClick={() => setOpen(false)}
        >
          {/* Top bar — wordmark spacer + dedicated close button. */}
          <div
            className="flex items-center justify-end px-4 sm:px-6 pt-5 sm:pt-7"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center w-11 h-11 -mr-2 text-cream-dim hover:text-cream transition-colors"
            >
              <IconClose />
            </button>
          </div>

          <nav
            className="flex-1 flex flex-col items-center justify-center gap-7 px-8"
            onClick={(e) => e.stopPropagation()}
          >
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target={l.external ? '_blank' : undefined}
                rel={l.external ? 'noreferrer' : undefined}
                onClick={() => setOpen(false)}
                className="font-display italic text-3xl text-cream tracking-[-0.01em] hover:text-sand-bright transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <p
            className="pb-10 text-center text-[10px] uppercase tracking-[0.22em] text-cream-dim"
            onClick={(e) => e.stopPropagation()}
          >
            Hourglass <span className="text-stroke-2">·</span> v0.1.0-mvp
          </p>
        </div>
      )}
    </>
  );
}

/* ---------- icons ---------- */

function IconHamburger() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M3 7h18M3 12h18M3 17h18" strokeLinecap="square" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="square" />
    </svg>
  );
}
