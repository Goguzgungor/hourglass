import type { Metadata } from 'next';
import { Geist, Geist_Mono, Fraunces } from 'next/font/google';
import Wordmark from '@/components/Wordmark';
import WalletButton from '@/components/WalletButton';
import MobileNav from '@/components/MobileNav';
import Providers from '@/components/Providers';
import './globals.css';

// Body / UI face
const geistSans = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-sans',
  display: 'swap',
});

// Numeric / address face
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-geist-mono',
  display: 'swap',
});

// Editorial display face — variable, with optical-size + softness axes
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hourglass — Time, distilled into payment',
  description:
    'Stream SEP-41 tokens to a recipient on a precise schedule. Vest, pay, grant — by the second. Built on Stellar / Soroban.',
  metadataBase: new URL('https://hourglassprotocol.org'),
  openGraph: {
    title: 'Hourglass — Token streaming on Stellar',
    description:
      'Stream SEP-41 tokens to a recipient on a precise schedule. Vest, pay, grant — by the second.',
    url: 'https://hourglassprotocol.org',
    siteName: 'Hourglass',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Hourglass — Token streaming on Stellar',
    description:
      'Stream SEP-41 tokens on a precise vesting schedule. Built on Soroban.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // The Stellar Wallets Kit injects its own CSS variables onto <html>
      // when it boots in the client, which produces a benign hydration
      // mismatch on top-level attributes. Suppress for `html` only.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}
    >
      <body className="bg-night text-cream antialiased min-h-dvh flex flex-col">
        <Providers>
          <header className="relative z-20">
            <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24 pt-5 sm:pt-7 xl:pt-9 flex items-center justify-between gap-3">
              <Wordmark />
              <nav className="flex items-center gap-4 md:gap-7 xl:gap-9 2xl:gap-11">
                <a
                  href="/create"
                  className="hidden md:inline-block text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Create
                </a>
                <a
                  href="/dashboard"
                  className="hidden md:inline-block text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Dashboard
                </a>
                <a
                  href="/#principles"
                  className="hidden md:inline-block text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Principles
                </a>
                <a
                  href="/#surface"
                  className="hidden md:inline-block text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Specification
                </a>
                <a
                  href="https://github.com/Goguzgungor/hourglass"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden md:inline-block text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Source
                </a>
                <WalletButton />
                <MobileNav />
              </nav>
            </div>
          </header>

          <main className="flex-1 relative z-10">{children}</main>

          <footer className="relative z-10 mt-24 sm:mt-32">
            <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24">
              <hr className="hairline" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-6 xl:py-8 text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] text-cream-dim">
                <span>
                  Hourglass <span className="text-stroke-2">·</span> Token
                  streaming on Stellar{' '}
                  <span className="text-stroke-2">·</span> v0.1.0-mvp
                </span>
                <span className="font-mono normal-case tracking-normal text-cream-dim/70">
                  Apache-2.0
                </span>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
