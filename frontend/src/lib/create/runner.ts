//
// Drives a BatchRun chunk by chunk: simulate (build) → sign → send → record.
// Pure with respect to the world: everything effectful is injected through
// `RunnerDeps`, and state only changes through `dispatch`. `dispatch` MUST be
// synchronous (update a ref, not React state) so `getRun()` sees the change.
//
// Signing and sending are separate steps so the tx hash is recorded (and
// persisted) before the network sees the transaction. A chunk that carries a
// hash is looked up with `resolveChunk` before anything is rebuilt: a send
// that threw after the tx was accepted, or a page closed mid-submit, must
// never lead to the same rows being signed twice.

import { nextChunk, type BatchRun, type Chunk, type PauseReason, type RunAction } from './batchPlan';
import { classifyTxError, describeError, type ClassifiedError } from './errors';

/** Opaque prepared transaction handed from `buildChunk` to `signChunk`/`sendChunk`. */
export type PreparedTx = unknown;

/** What became of a previously submitted chunk transaction. */
export type ChunkResolution = { status: 'success'; streamIds: number[] } | { status: 'failed' } | { status: 'not_found' };

export type RunnerDeps = {
  /** Simulate the chunk's create_batch; throws on simulation failure. */
  buildChunk: (run: BatchRun, chunk: Chunk) => Promise<PreparedTx>;
  /** Sign in the wallet; resolves with the hash the network will know the tx by. */
  signChunk: (tx: PreparedTx) => Promise<{ txHash: string }>;
  /** Send the signed tx and wait for it; resolves with the hash and created stream ids. */
  sendChunk: (tx: PreparedTx) => Promise<{ txHash: string; streamIds: number[] }>;
  /** Look up a previously submitted tx. */
  resolveChunk: (txHash: string) => Promise<ChunkResolution>;
  /** Lockup contract id, so token-contract error codes are not read as lockup errors. */
  lockupId?: string;
  dispatch: (a: RunAction) => void;
  getRun: () => BatchRun;
  persist: (run: BatchRun) => void;
};

export const TX_NOT_FOUND_ERROR: ClassifiedError = {
  kind: 'network',
  message: 'Transaction not found yet — wait a minute and retry, or check the explorer before rebuilding.',
};

export function pauseReasonFor(err: ClassifiedError): PauseReason {
  if (err.kind === 'rejected') return 'rejected';
  if (err.kind === 'contract' && err.code === 18) return 'start_in_past';
  return 'failed';
}

export async function runBatch(deps: RunnerDeps, signal: AbortSignal): Promise<void> {
  const step = (a: RunAction) => {
    deps.dispatch(a);
    deps.persist(deps.getRun());
  };
  const classify = (e: unknown) => classifyTxError(e, { lockupId: deps.lockupId });

  while (!signal.aborted) {
    const run = deps.getRun();
    if (run.phase !== 'running') return;
    const chunk = nextChunk(run);
    if (!chunk) {
      step({ type: 'complete' });
      return;
    }

    // Signed before: find out what happened to that tx before touching the wallet again.
    if (chunk.txHash && (chunk.status === 'failed' || chunk.status === 'submitting')) {
      let resolved: ChunkResolution;
      try {
        resolved = await deps.resolveChunk(chunk.txHash);
      } catch {
        resolved = { status: 'not_found' };
      }
      if (resolved.status === 'success') {
        step({ type: 'chunk_done', index: chunk.index, txHash: chunk.txHash, streamIds: resolved.streamIds });
        continue;
      }
      if (resolved.status === 'not_found') {
        step({ type: 'chunk_failed', index: chunk.index, error: TX_NOT_FOUND_ERROR, pause: 'failed' });
        return;
      }
      // The tx failed on-chain: nothing was created, safe to rebuild.
      step({ type: 'chunk_forget_tx', index: chunk.index });
    }

    step({ type: 'chunk_status', index: chunk.index, status: 'simulating' });
    let tx: PreparedTx;
    try {
      tx = await deps.buildChunk(deps.getRun(), chunk);
    } catch (e) {
      const err = classify(e);
      if (err.kind === 'resource' && chunk.rowIds.length > 1) {
        step({ type: 'split_chunk', index: chunk.index });
        continue;
      }
      step({ type: 'chunk_failed', index: chunk.index, error: err, pause: pauseReasonFor(err) });
      return;
    }

    // The user may have paused (or the page unmounted) while we simulated.
    if (signal.aborted || deps.getRun().phase !== 'running') {
      step({ type: 'chunk_status', index: chunk.index, status: 'pending' });
      return;
    }

    step({ type: 'chunk_status', index: chunk.index, status: 'signing' });
    let txHash: string;
    try {
      ({ txHash } = await deps.signChunk(tx));
    } catch (e) {
      const err = classify(e);
      step({ type: 'chunk_failed', index: chunk.index, error: err, pause: pauseReasonFor(err) });
      return;
    }

    // Persisted with the hash before the send: from here on the tx may exist on-chain.
    step({ type: 'chunk_submitting', index: chunk.index, txHash });
    try {
      const sent = await deps.sendChunk(tx);
      step({ type: 'chunk_done', index: chunk.index, txHash: sent.txHash || txHash, streamIds: sent.streamIds });
    } catch (e) {
      // Keep the hash: the next attempt resolves it instead of re-signing.
      const message = describeError(classify(e));
      step({ type: 'chunk_failed', index: chunk.index, error: { kind: 'network', message }, pause: 'failed' });
      return;
    }
  }
}
