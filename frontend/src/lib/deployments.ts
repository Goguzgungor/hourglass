// Build-time deployment manifest. Populated by `scripts/sync-deployment.mjs`
// from `<repo>/deployments/<NETWORK>.json` (defaults to `local`). If that file
// is missing, the placeholder has empty contract ids and the UI will show a
// "no deployment" notice on the pages that depend on the contracts.
//
// Optional asset fields (`hgt_*`, `usdc_*`) are only present on testnet/mainnet
// deployments. Local deployments only have `native_token`, so the token picker
// gracefully shows only XLM there.

import deployment from './deployment.json';

type DeploymentJson = {
  network: string;
  rpc_url: string;
  network_passphrase: string;
  horizon_url?: string;
  comptroller: string;
  lockup: string;
  native_token: string;
  deployer: string;
  hgt_token?: string;
  hgt_issuer?: string;
  usdc_token?: string;
  usdc_issuer?: string;
};

const d = deployment as DeploymentJson;

export const DEPLOYMENT = {
  network: d.network,
  rpcUrl: d.rpc_url,
  networkPassphrase: d.network_passphrase,
  horizonUrl: d.horizon_url ?? '',
  comptroller: d.comptroller,
  lockup: d.lockup,
  nativeToken: d.native_token,
  deployer: d.deployer,
  hgtToken: d.hgt_token,
  hgtIssuer: d.hgt_issuer,
  usdcToken: d.usdc_token,
  usdcIssuer: d.usdc_issuer,
} as const;

export type Deployment = typeof DEPLOYMENT;

/** True iff the deployment file has real contract ids populated. */
export function hasDeployment(): boolean {
  return (
    DEPLOYMENT.lockup.length > 0 &&
    DEPLOYMENT.comptroller.length > 0 &&
    DEPLOYMENT.nativeToken.length > 0
  );
}
