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
import { parseEvent } from '../src/lib/indexer/events';
import { fetchAndIngest, handleEvent } from '../src/lib/indexer/ingest';
import { reconcile } from '../src/lib/indexer/reconcile';
import { MongoIndexerStore } from '../src/lib/indexer/store';

const POLL_MS = Number(process.env.INDEXER_POLL_MS ?? 3000);
const RECONCILE_MS = Number(process.env.INDEXER_RECONCILE_MS ?? 600_000);
const MAX_PAGES = Number(process.env.INDEXER_MAX_PAGES ?? 20);
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

  const runReconcile = async (why: string) => {
    try {
      const r = await reconcile(chain, store, { contractId: CONTRACT, now: nowSec, concurrency: RECONCILE_CONCURRENCY });
      console.log(`[indexer] reconcile (${why}): live=${r.live} upserted=${r.upserted} depleted=${r.depleted}`);
    } catch (err) {
      console.error('[indexer] reconcile failed:', err);
    }
  };
  await runReconcile('startup');
  let lastReconcile = Date.now();

  let shuttingDown = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[indexer] ${sig} received — shutting down after the current tick`);
    });
  }

  while (!shuttingDown) {
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
        await runReconcile('retention-reset');
        lastReconcile = Date.now();
      } else if (Date.now() - lastReconcile >= RECONCILE_MS) {
        await runReconcile('periodic');
        lastReconcile = Date.now();
      }
    } catch (err) {
      console.error('[indexer] tick failed:', err);
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
