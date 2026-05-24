// Token registry — derived from the active deployment manifest.
//
// Tokens with no contract id in the current deployment are silently omitted
// (so local networks that only have XLM gracefully show a single tile).

import { DEPLOYMENT } from './deployments';

export type TokenInfo = {
  id: string; // SAC contract id
  symbol: string;
  name: string;
  decimals: number;
  issuer?: string; // for classic-asset-backed SACs
  glyphColor: string; // tailwind bg-* class
  description: string;
};

export const TOKENS: TokenInfo[] = [
  {
    id: DEPLOYMENT.nativeToken,
    symbol: 'XLM',
    name: 'Native XLM',
    decimals: 7,
    glyphColor: 'bg-sand',
    description: 'Native XLM via the Stellar Asset Contract.',
  },
  ...(DEPLOYMENT.hgtToken
    ? [
        {
          id: DEPLOYMENT.hgtToken,
          symbol: 'HGT',
          name: 'Hourglass Test',
          decimals: 7,
          issuer: DEPLOYMENT.hgtIssuer,
          glyphColor: 'bg-violet',
          description: 'Our test asset on Stellar testnet.',
        },
      ]
    : []),
  ...(DEPLOYMENT.usdcToken
    ? [
        {
          id: DEPLOYMENT.usdcToken,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 7,
          issuer: DEPLOYMENT.usdcIssuer,
          glyphColor: 'bg-teal',
          description: 'Circle USDC on Stellar testnet.',
        },
      ]
    : []),
];

export function findToken(contractId: string | undefined | null): TokenInfo | undefined {
  if (!contractId) return undefined;
  return TOKENS.find((t) => t.id === contractId);
}
