'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { initKit, signTransaction, StellarWalletsKit } from './wallet';

const STORAGE_KEY = 'hourglass:wallet:address';

type WalletState = {
  /** The connected Stellar account public key, or `null` if not connected. */
  address: string | null;
  /** True while the kit modal is open or a connect/disconnect is in flight. */
  pending: boolean;
  /** Open the kit modal and request an address. */
  connect: () => Promise<void>;
  /** Forget the current connection. */
  disconnect: () => Promise<void>;
  /** Sign a transaction XDR using the connected wallet. */
  sign: (xdr: string) => Promise<{ signedTxXdr: string }>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Initialise the kit + restore any persisted session on first mount.
  useEffect(() => {
    initKit();
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && /^G[A-Z2-7]{55}$/.test(stored)) {
        setAddress(stored);
      }
    } catch {
      // localStorage may be unavailable (SSR? Strict mode?); silent fallback.
    }
  }, []);

  const connect = useCallback(async () => {
    setPending(true);
    try {
      const { address: addr } = await StellarWalletsKit.authModal();
      setAddress(addr);
      try {
        window.localStorage.setItem(STORAGE_KEY, addr);
      } catch {
        /* noop */
      }
    } catch (err) {
      // User dismissed the modal — surface to console so devs can debug.
      console.warn('[wallet] connect aborted', err);
    } finally {
      setPending(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setPending(true);
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      /* noop */
    }
    setAddress(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    setPending(false);
  }, []);

  const sign = useCallback(
    async (xdr: string) => {
      if (!address) throw new Error('No wallet connected');
      return signTransaction(xdr, address);
    },
    [address],
  );

  const value = useMemo<WalletState>(
    () => ({ address, pending, connect, disconnect, sign }),
    [address, pending, connect, disconnect, sign],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}
