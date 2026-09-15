//
// Drives a BatchRun chunk by chunk: simulate (build) → sign+send → record.
// Pure with respect to the world: everything effectful is injected through
// `RunnerDeps`, and state only changes through `dispatch`. `dispatch` MUST be
// synchronous (update a ref, not React state) so `getRun()` sees the change.

import { nextChunk, type BatchRun, type Chunk, type PauseReason, type RunAction } from './batchPlan';
import { classifyTxError, type ClassifiedError } from './errors';

/** Opaque prepared transaction handed from `buildChunk` to `sendChunk`. */
export type PreparedTx = unknown;

export type RunnerDeps = {
  /** Simulate the chunk's create_batch; throws on simulation failure. */
  buildChunk: (run: BatchRun, chunk: Chunk) => Promise<PreparedTx>;
  /** Sign and send; resolves with the tx hash and created stream ids. */
  sendChunk: (tx: PreparedTx) => Promise<{ txHash: string; streamIds: number[] }>;
  dispatch: (a: RunAction) => void;
  getRun: () => BatchRun;
  persist: (run: BatchRun) => void;
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

  while (!signal.aborted) {
    const run = deps.getRun();
    if (run.phase !== 'running') return;
    const chunk = nextChunk(run);
    if (!chunk) {
      step({ type: 'complete' });
      return;
    }

    step({ type: 'chunk_status', index: chunk.index, status: 'simulating' });
    let tx: PreparedTx;
    try {
      tx = await deps.buildChunk(deps.getRun(), chunk);
    } catch (e) {
      const err = classifyTxError(e);
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
    try {
      const { txHash, streamIds } = await deps.sendChunk(tx);
      step({ type: 'chunk_done', index: chunk.index, txHash, streamIds });
    } catch (e) {
      const err = classifyTxError(e);
      step({ type: 'chunk_failed', index: chunk.index, error: err, pause: pauseReasonFor(err) });
      return;
    }
  }
}
