// frontend/scripts/capture-create-errors.ts
//
// Prints the raw error strings the stellar-sdk contract client produces on
// testnet for two create-flow failure modes, using simulation only (no
// signature, no secret key). Run: `npx tsx scripts/capture-create-errors.ts`
import { readFileSync } from 'node:fs';
import { lockup } from 'hourglass';

type Dep = { lockup: string; network_passphrase: string; rpc_url: string; deployer: string; native_token: string };
const dep = JSON.parse(readFileSync(new URL('../../deployments/testnet.json', import.meta.url), 'utf8')) as Dep;

type Methods = {
  create_linear(args: Record<string, unknown>): Promise<unknown>;
  create_batch(args: Record<string, unknown>): Promise<unknown>;
};
const client = new lockup.Client({
  contractId: dep.lockup,
  networkPassphrase: dep.network_passphrase,
  rpcUrl: dep.rpc_url,
  publicKey: dep.deployer,
}) as unknown as Methods;

const now = BigInt(Math.floor(Date.now() / 1000));

async function attempt(label: string, fn: () => Promise<unknown>) {
  try {
    const tx = await fn();
    // `AssembledTransaction.build()` awaits `simulate()`, but `simulate()`
    // itself never throws on a simulation failure — it just stores the
    // failed result on `.simulation`. Reading `.result` doesn't raise it
    // either: on a *contract* error (a declared error code, e.g. #18) that
    // getter swallows the failure and returns a decoded `Err(...)` value.
    // `.simulationData` is what `sign()`/`signAndSend()` reads internally
    // (see node_modules/@stellar/stellar-sdk lib/contract/assembled_transaction.js),
    // and it throws the raw `SimulationFailed` error for both contract
    // panics and host/budget errors — so touch that instead to reproduce
    // exactly what the real create flow sees when signing.
    void (tx as { simulationData?: unknown }).simulationData;
    console.log(`${label}: simulation OK`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${label}: ${JSON.stringify(msg.slice(0, 600))}`);
  }
}

// Wrapped in an async main() rather than using top-level await: this package
// has no `"type": "module"` in package.json, so tsx/esbuild transforms `.ts`
// files to CommonJS, which does not support top-level await (matches the
// existing convention in scripts/indexer.ts).
async function main() {
  await attempt('start_in_past (#18)', () =>
    client.create_linear({
      sender: dep.deployer,
      recipient: dep.deployer,
      token: dep.native_token,
      deposited: 10_000_000n,
      start_ts: now - 100n,
      cliff_ts: now - 100n,
      end_ts: now + 1000n,
      unlock_at_start: 0n,
      unlock_at_cliff: 0n,
      is_cancelable: true,
      is_transferable: true,
    }),
  );

  await attempt('batch 100 rows', () =>
    client.create_batch({
      sender: dep.deployer,
      token: dep.native_token,
      rows: Array.from({ length: 100 }, () => ({
        recipient: dep.deployer,
        is_cancelable: true,
        is_transferable: true,
        spec: {
          tag: 'Linear',
          values: [{ start_ts: now + 900n, cliff_ts: now + 900n, end_ts: now + 90_000n, deposited: 1_000_000n, unlock_at_start: 0n, unlock_at_cliff: 0n }],
        },
      })),
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
