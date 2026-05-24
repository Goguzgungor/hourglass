import type { Metadata } from 'next';
import { Geist, Geist_Mono, Fraunces } from 'next/font/google';
import Wordmark from '@/components/Wordmark';
import WalletButton from '@/components/WalletButton';
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
  metadataBase: new URL('http://localhost:3000'),
  icons: { icon: '/favicon.ico' },
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
            <div className="mx-auto max-w-[1280px] px-6 sm:px-10 pt-7 flex items-center justify-between">
              <Wordmark />
              <nav className="flex items-center gap-7">
                <a
                  href="/create"
                  className="hidden sm:inline-block text-[11px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Create
                </a>
                <a
                  href="/#principles"
                  className="hidden sm:inline-block text-[11px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Principles
                </a>
                <a
                  href="/#surface"
                  className="hidden sm:inline-block text-[11px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Specification
                </a>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-block text-[11px] uppercase tracking-[0.18em] text-cream-dim hover:text-cream transition-colors"
                >
                  Source
                </a>
                <WalletButton />
              </nav>
            </div>
          </header>

          <main className="flex-1 relative z-10">{children}</main>

          <footer className="relative z-10 mt-32">
            <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
              <hr className="hairline" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-6 text-[11px] uppercase tracking-[0.18em] text-cream-dim">
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
