// Build-time deployment manifest. Populated by `scripts/sync-deployment.mjs`
// from `<repo>/deployments/local.json`. If that file is missing, the placeholder
// has empty contract ids and the UI will show a "no deployment" notice on the
// pages that depend on the contracts.

import deployment from './deployment.json';

export const DEPLOYMENT = {
  network: deployment.network,
  rpcUrl: deployment.rpc_url,
  networkPassphrase: deployment.network_passphrase,
  comptroller: deployment.comptroller,
  lockup: deployment.lockup,
  nativeToken: deployment.native_token,
  deployer: deployment.deployer,
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
