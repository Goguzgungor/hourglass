import { describe, expect, it } from 'vitest';
import { planRun, runReducer, type BatchRun, type Chunk, type RunAction } from './batchPlan';
import { validateRows } from './rows';
import { scheduleStart, type Schedule } from './schedule';
import { pauseReasonFor, runBatch, type RunnerDeps } from './runner';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const NOW = 1_800_000_000;
const schedule: Schedule = { shape: 'linear', startTs: NOW + 900, cliffTs: NOW + 900, endTs: NOW + 90_000, unlockAtStartBps: 0, unlockAtCliffBps: 0 };

function makeRun(n: number, chunkRows = 2): BatchRun {
  const rows = validateRows(
    Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, recipient: G1, amount: '1', source: 'manual' as const })),
    { sender: null, schedule },
  );
  return planRun({ sender: G1, token: 'C', cancelable: true, transferable: true, schedule, rows, chunkRows, nowMs: 1 });
}

type Harness = {
  deps: RunnerDeps;
  run: () => BatchRun;
  builds: Chunk[];
  sends: number;
  persisted: number;
  actions: RunAction[];
};

function harness(
  initial: BatchRun,
  opts: {
    buildError?: (chunk: Chunk, attempt: number) => unknown;
    sendError?: (chunk: Chunk, attempt: number) => unknown;
    onBuild?: (h: Harness) => void;
  } = {},
): Harness {
  let run = initial;
  const h: Harness = { builds: [], sends: 0, persisted: 0, actions: [], run: () => run, deps: undefined as never };
  const attempts = new Map<string, number>();
  h.deps = {
    buildChunk: async (_run, chunk) => {
      h.builds.push(chunk);
      const key = chunk.rowIds.join(',');
      const n = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, n);
      const err = opts.buildError?.(chunk, n);
      if (err) throw err;
      opts.onBuild?.(h);
      return { chunk };
    },
    sendChunk: async (tx) => {
      const chunk = (tx as { chunk: Chunk }).chunk;
      h.sends++;
      const err = opts.sendError?.(chunk, chunk.attempts + 1);
      if (err) throw err;
      return { txHash: `hash${chunk.index}`, streamIds: chunk.rowIds.map((_, i) => chunk.index * 100 + i) };
    },
    dispatch: (a) => {
      h.actions.push(a);
      run = runReducer(run, a);
    },
    getRun: () => run,
    persist: () => {
      h.persisted++;
    },
  };
  return h;
}

describe('runBatch', () => {
  it('runs every chunk to completion and persists after each transition', async () => {
    const h = harness(makeRun(5)); // 2/2/1
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(r.phase).toBe('completed');
    expect(r.chunks.map((c) => c.status)).toEqual(['done', 'done', 'done']);
    expect(r.chunks.map((c) => c.txHash)).toEqual(['hash0', 'hash1', 'hash2']);
    expect(r.chunks[1].streamIds).toEqual([100, 101]);
    expect(h.builds).toHaveLength(3);
    expect(h.sends).toBe(3);
    expect(h.persisted).toBe(h.actions.length);
    expect(h.actions.map((a) => a.type)).toEqual([
      'chunk_status', 'chunk_status', 'chunk_done',
      'chunk_status', 'chunk_status', 'chunk_done',
      'chunk_status', 'chunk_status', 'chunk_done',
    ]);
  });
  it('splits a chunk that does not fit and continues', async () => {
    const h = harness(makeRun(4, 4), {
      buildError: (chunk) => (chunk.rowIds.length === 4 ? new Error('Transaction simulation failed: "HostError: Error(Budget, ExceededLimit)"') : undefined),
    });
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(r.phase).toBe('completed');
    expect(r.chunks.map((c) => c.rowIds.length)).toEqual([2, 2]);
    expect(h.actions.filter((a) => a.type === 'split_chunk')).toHaveLength(1);
    expect(h.sends).toBe(2);
  });
  it('fails a 1-row chunk that does not fit and pauses', async () => {
    const h = harness(makeRun(1, 1), { buildError: () => new Error('txSorobanInvalid') });
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(r.phase).toBe('paused');
    expect(r.pauseReason).toBe('failed');
    expect(r.chunks[0]).toMatchObject({ status: 'failed', attempts: 1, error: { kind: 'resource' } });
    expect(h.sends).toBe(0);
  });
  it('pauses on a rejected signature and resumes from the same chunk', async () => {
    let reject = true;
    const h = harness(makeRun(3), { sendError: (chunk) => (chunk.index === 0 && reject ? new Error('User rejected the request') : undefined) });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run()).toMatchObject({ phase: 'paused', pauseReason: 'rejected' });
    expect(h.run().chunks[0]).toMatchObject({ status: 'failed', attempts: 1 });
    reject = false;
    h.deps.dispatch({ type: 'resume' });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run().phase).toBe('completed');
    expect(h.sends).toBe(3); // chunk 0 twice, chunk 1 once
  });
  it('pauses with start_in_past on contract #18, then shift + rerun completes', async () => {
    let past = true;
    const h = harness(makeRun(2, 1), {
      sendError: () => (past ? new Error('Transaction simulation failed: "HostError: Error(Contract, #18)"') : undefined),
    });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run().pauseReason).toBe('start_in_past');
    past = false;
    h.deps.dispatch({ type: 'shift_remaining', seconds: 900 });
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(r.phase).toBe('completed');
    expect(r.chunks.every((c) => scheduleStart(c.schedule) === NOW + 1800)).toBe(true);
  });
  it('does nothing when aborted or not running', async () => {
    const ac = new AbortController();
    ac.abort();
    const h = harness(makeRun(2));
    await runBatch(h.deps, ac.signal);
    expect(h.builds).toHaveLength(0);
    const h2 = harness(runReducer(makeRun(2), { type: 'pause' }));
    await runBatch(h2.deps, new AbortController().signal);
    expect(h2.builds).toHaveLength(0);
  });
  it('a pause requested during simulation returns the chunk to pending without sending', async () => {
    const h = harness(makeRun(2, 1), { onBuild: (hh) => hh.deps.dispatch({ type: 'pause' }) });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.sends).toBe(0);
    expect(h.run().chunks[0].status).toBe('pending');
    expect(h.run().phase).toBe('paused');
  });
  it('pauseReasonFor maps error kinds', () => {
    expect(pauseReasonFor({ kind: 'rejected', message: '' })).toBe('rejected');
    expect(pauseReasonFor({ kind: 'contract', code: 18, name: 'StartInPast', message: '' })).toBe('start_in_past');
    expect(pauseReasonFor({ kind: 'contract', code: 10, name: 'ZeroDeposit', message: '' })).toBe('failed');
    expect(pauseReasonFor({ kind: 'network', message: '' })).toBe('failed');
  });
});
