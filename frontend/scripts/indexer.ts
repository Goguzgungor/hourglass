/**
 * Hourglass indexer runner.
 *
 * Polls Soroban RPC for lockup events (cursor-paged, lossless), materializes
 * streams + actions into MongoDB, and periodically reconciles the `streams`
 * collection against the chain via the NFT enumeration so restarts and RPC
 * retention gaps self-heal. Logic lives in src/lib/indexer/*; this file only
 * wires configuration and runs the loop.
 *
 * Env: INDEXER_POLL_MS (3000) · INDEXER_RECONCILE_MS (600000) ·
 *      INDEXER_MAX_PAGES (20) · MONGODB_URL · MONGODB_DB
 */

import 'dotenv/config';
import { rpc as StellarRpc } from '@stellar/stellar-sdk';

import { ensureIndexes } from '../src/lib/db';
import { DEPLOYMENT } from '../src/lib/deployments';
import { makeChainReader } from '../src/lib/indexer/chain';
import { envInt } from '../src/lib/indexer/config';
import { parseEvent } from '../src/lib/indexer/events';
import { fetchAndIngest, handleEvent } from '../src/lib/indexer/ingest';
import { reconcile } from '../src/lib/indexer/reconcile';
import { MongoIndexerStore } from '../src/lib/indexer/store';

// Validated: a typo'd env var falls back to the default instead of turning the
// loop into a NaN busy-spin (`setTimeout(NaN)` fires immediately).
const POLL_MS = envInt('INDEXER_POLL_MS', 3_000);
const RECONCILE_MS = envInt('INDEXER_RECONCILE_MS', 600_000);
const MAX_PAGES = envInt('INDEXER_MAX_PAGES', 20);
const PAGE_LIMIT = 100;
const STARTUP_BUFFER_LEDGERS = 100;
const RECONCILE_CONCURRENCY = 5;

const CONTRACT = DEPLOYMENT.lockup;
const nowSec = () => Math.floor(Date.now() / 1000);

async function main(): Promise<void> {
  if (!CONTRACT) {
    console.error('[indexer] no lockup contract id in deployment — run scripts/deploy-local.sh or deploy-testnet.sh first');
    process.exit(1);
  }
  console.log(`[indexer] starting against ${DEPLOYMENT.rpcUrl}, contract ${CONTRACT}`);
  console.log(
    `[indexer] config: pollMs=${POLL_MS} reconcileMs=${RECONCILE_MS} maxPages=${MAX_PAGES}`
    + ` pageLimit=${PAGE_LIMIT} startupBufferLedgers=${STARTUP_BUFFER_LEDGERS}`
    + ` reconcileConcurrency=${RECONCILE_CONCURRENCY}`,
  );

  const server = new StellarRpc.Server(DEPLOYMENT.rpcUrl, { allowHttp: DEPLOYMENT.rpcUrl.startsWith('http://') });
  const chain = makeChainReader({
    lockup: CONTRACT,
    networkPassphrase: DEPLOYMENT.networkPassphrase,
    rpcUrl: DEPLOYMENT.rpcUrl,
    deployer: DEPLOYMENT.deployer,
  });
  const store = new MongoIndexerStore();

  await ensureIndexes();
  const migrated = await store.backfillParticipants();
  if (migrated > 0) console.log(`[indexer] backfilled participants on ${migrated} action(s)`);
  const dated = await store.backfillCreatedAt();
  if (dated > 0) console.log(`[indexer] backfilled created_at on ${dated} stream(s)`);

  const runReconcile = async (why: string) => {
    try {
      const r = await reconcile(chain, store, { contractId: CONTRACT, now: nowSec, concurrency: RECONCILE_CONCURRENCY });
      console.log(`[indexer] reconcile (${why}): live=${r.live} upserted=${r.upserted} depleted=${r.depleted}`);
    } catch (err) {
      console.error('[indexer] reconcile failed:', err);
    }
  };

  // Registered before the startup reconcile: that pass can take a while against
  // a large contract, and a Ctrl-C during it must still be honoured.
  let shuttingDown = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[indexer] ${sig} received — shutting down after the current tick`);
    });
  }

  await runReconcile('startup');
  let lastReconcile = Date.now();

  while (!shuttingDown) {
    // Reconcile is the self-healing path, so it must NOT be a casualty of a
    // failing ingest: the tick's try/catch covers `fetchAndIngest` only, and
    // the scheduling decision below runs either way.
    let reconcileDue = false;
    try {
      const r = await fetchAndIngest(
        server,
        store,
        { contractId: CONTRACT, pageLimit: PAGE_LIMIT, maxPages: MAX_PAGES, startupBufferLedgers: STARTUP_BUFFER_LEDGERS },
        async (e) => {
          const p = parseEvent(e);
          if (!p) return;
          console.log(`[indexer] ${p.action} stream=${p.streamId} ledger=${p.ledger} tx=${p.tx_hash.slice(0, 8)}…`);
          // Deliberately NOT wrapped in try/catch: a failing event must abort the
          // page before its cursor is saved, so the page is re-fetched next tick
          // (idempotent). Swallowing here would advance past the lost event.
          await handleEvent(p, { chain, store, contractId: CONTRACT, now: nowSec });
        },
      );
      if (r.events > 0) console.log(`[indexer] ingested ${r.events} event(s) over ${r.pages} page(s)`);
      if (r.reset) {
        console.warn('[indexer] cursor predates RPC retention — reset; reconciling');
        reconcileDue = true;
      }
    } catch (err) {
      console.error('[indexer] tick failed:', err);
    }

    if (reconcileDue || Date.now() - lastReconcile >= RECONCILE_MS) {
      await runReconcile(reconcileDue ? 'retention-reset' : 'periodic');
      lastReconcile = Date.now();
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log('[indexer] stopped');
  process.exit(0);
}

main().catch((err) => {
  console.error('[indexer] fatal:', err);
  process.exit(1);
});
