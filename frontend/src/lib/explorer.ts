import { DEPLOYMENT } from './deployments';

export function explorerBase(): string | null {
  if (DEPLOYMENT.network === 'mainnet' || DEPLOYMENT.network === 'public') return 'https://stellar.expert/explorer/public';
  if (DEPLOYMENT.network === 'testnet') return 'https://stellar.expert/explorer/testnet';
  return null;
}

export function txUrl(hash: string): string | null {
  const b = explorerBase();
  return b && hash ? `${b}/tx/${hash}` : null;
}

export function accountUrl(address: string): string | null {
  const b = explorerBase();
  return b && address ? `${b}/account/${address}` : null;
}
