'use client';

import { type ReactNode } from 'react';
import { WalletProvider } from '@/lib/wallet-context';
import { ToastProvider } from '@/lib/toast';

/**
 * Single client-side provider bundle so the server `RootLayout` can stay
 * server-rendered.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <ToastProvider>{children}</ToastProvider>
    </WalletProvider>
  );
}
