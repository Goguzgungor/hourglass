'use client';

// Thin wrapper around @creit.tech/stellar-wallets-kit. The 2.x version of the
// kit exposes everything as static methods on the `StellarWalletsKit` class —
// there is no instance to construct.

import {
  StellarWalletsKit,
  Networks,
} from '@creit.tech/stellar-wallets-kit';
import {
  FREIGHTER_ID,
  FreighterModule,
} from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { DEPLOYMENT } from './deployments';

let initialized = false;

/**
 * Initialise the kit exactly once per browser session. Safe to call from any
 * client component on mount.
 */
export function initKit(): void {
  if (initialized) return;
  initialized = true;

  // The standalone local network's passphrase is exactly Networks.STANDALONE,
  // but we pass DEPLOYMENT.networkPassphrase explicitly to stay correct on
  // testnet / public later.
  const network =
    DEPLOYMENT.networkPassphrase === Networks.STANDALONE
      ? Networks.STANDALONE
      : DEPLOYMENT.networkPassphrase === Networks.TESTNET
        ? Networks.TESTNET
        : DEPLOYMENT.networkPassphrase === Networks.PUBLIC
          ? Networks.PUBLIC
          : Networks.STANDALONE;

  StellarWalletsKit.init({
    network,
    selectedWalletId: FREIGHTER_ID,
    modules: [new FreighterModule()],
  });
}

export { StellarWalletsKit, FREIGHTER_ID };

/**
 * Sign a transaction XDR via the kit. Throws if not initialized.
 */
export async function signTransaction(
  xdr: string,
  address: string,
): Promise<{ signedTxXdr: string }> {
  const res = await StellarWalletsKit.signTransaction(xdr, {
    address,
    networkPassphrase: DEPLOYMENT.networkPassphrase,
  });
  return { signedTxXdr: res.signedTxXdr };
}
