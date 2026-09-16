import { describe, expect, it } from 'vitest';
import { planRun, runReducer, type BatchRun, type Chunk, type RunAction } from './batchPlan';
import { validateRows } from './rows';
import { scheduleStart, type Schedule } from './schedule';
import { TX_NOT_FOUND_ERROR, pauseReasonFor, runBatch, type ChunkResolution, type RunnerDeps } from './runner';

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
  signs: number;
  sends: number;
  resolves: string[];
  persisted: number;
  actions: RunAction[];
};

function harness(
  initial: BatchRun,
  opts: {
    buildError?: (chunk: Chunk, attempt: number) => unknown;
    signError?: (chunk: Chunk) => unknown;
    sendError?: (chunk: Chunk) => unknown;
    /** What `resolveChunk` answers (or throws, when given an Error). */
    resolve?: (txHash: string) => ChunkResolution | Error;
    onBuild?: (h: Harness) => void;
  } = {},
): Harness {
  let run = initial;
  const h: Harness = { builds: [], signs: 0, sends: 0, resolves: [], persisted: 0, actions: [], run: () => run, deps: undefined as never };
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
    signChunk: async (tx) => {
      const chunk = (tx as { chunk: Chunk }).chunk;
      h.signs++;
      const err = opts.signError?.(chunk);
      if (err) throw err;
      return { txHash: `hash${chunk.index}` };
    },
    sendChunk: async (tx) => {
      const chunk = (tx as { chunk: Chunk }).chunk;
      h.sends++;
      const err = opts.sendError?.(chunk);
      if (err) throw err;
      return { txHash: `hash${chunk.index}`, streamIds: chunk.rowIds.map((_, i) => chunk.index * 100 + i) };
    },
    resolveChunk: async (txHash) => {
      h.resolves.push(txHash);
      const r = opts.resolve?.(txHash) ?? { status: 'not_found' };
      if (r instanceof Error) throw r;
      return r;
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

/** A 2-chunk run whose first chunk was signed and sent, but the send threw (hash retained). */
async function afterSendFailure(sendError = new Error('Waited 300 seconds for transaction to complete, but it did not.')) {
  let fail = true;
  const h = harness(makeRun(3), { sendError: (chunk) => (chunk.index === 0 && fail ? sendError : undefined) });
  await runBatch(h.deps, new AbortController().signal);
  fail = false;
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
    expect(h.signs).toBe(3);
    expect(h.sends).toBe(3);
    expect(h.resolves).toEqual([]);
    expect(h.persisted).toBe(h.actions.length);
    expect(h.actions.map((a) => a.type)).toEqual([
      'chunk_status', 'chunk_status', 'chunk_submitting', 'chunk_done',
      'chunk_status', 'chunk_status', 'chunk_submitting', 'chunk_done',
      'chunk_status', 'chunk_status', 'chunk_submitting', 'chunk_done',
    ]);
    expect(h.actions.slice(0, 4)).toEqual([
      { type: 'chunk_status', index: 0, status: 'simulating' },
      { type: 'chunk_status', index: 0, status: 'signing' },
      { type: 'chunk_submitting', index: 0, txHash: 'hash0' },
      { type: 'chunk_done', index: 0, txHash: 'hash0', streamIds: [0, 1] },
    ]);
  });
  it('a run with no chunks completes immediately', async () => {
    const h = harness(makeRun(0));
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run().phase).toBe('completed');
    expect(h.actions).toEqual([{ type: 'complete' }]);
    expect(h.builds).toHaveLength(0);
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
    expect(h.signs).toBe(0);
    expect(h.sends).toBe(0);
  });
  it('a build-time throw that reads as a rejection pauses with rejected', async () => {
    const h = harness(makeRun(2, 1), { buildError: () => new Error('User rejected the request') });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run()).toMatchObject({ phase: 'paused', pauseReason: 'rejected' });
    expect(h.run().chunks[0]).toMatchObject({ status: 'failed', error: { kind: 'rejected' } });
    expect(h.run().chunks[0].txHash).toBeUndefined();
    expect(h.signs).toBe(0);
  });
  it('pauses on a rejected signature (no hash recorded) and resumes from the same chunk', async () => {
    let reject = true;
    const h = harness(makeRun(3), { signError: (chunk) => (chunk.index === 0 && reject ? new Error('User rejected the request') : undefined) });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run()).toMatchObject({ phase: 'paused', pauseReason: 'rejected' });
    expect(h.run().chunks[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(h.run().chunks[0].txHash).toBeUndefined();
    expect(h.actions.some((a) => a.type === 'chunk_submitting')).toBe(false);
    expect(h.sends).toBe(0);
    reject = false;
    h.deps.dispatch({ type: 'resume' });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run().phase).toBe('completed');
    expect(h.resolves).toEqual([]); // nothing to look up: the rejected chunk never got a hash
    expect(h.signs).toBe(3); // chunk 0 twice, chunk 1 once
    expect(h.sends).toBe(2);
  });
  it('pauses with start_in_past on contract #18 at build time, then shift + rerun completes', async () => {
    let past = true;
    const h = harness(makeRun(2, 1), {
      buildError: () => (past ? new Error('Transaction simulation failed: "HostError: Error(Contract, #18)"') : undefined),
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
  it('a pause requested during simulation returns the chunk to pending without signing', async () => {
    const h = harness(makeRun(2, 1), { onBuild: (hh) => hh.deps.dispatch({ type: 'pause' }) });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.signs).toBe(0);
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

describe('runBatch — a signed transaction is never re-signed', () => {
  it('a send that throws after signing pauses with the hash retained', async () => {
    const h = await afterSendFailure();
    const r = h.run();
    expect(r).toMatchObject({ phase: 'paused', pauseReason: 'failed' });
    expect(r.chunks[0]).toMatchObject({ status: 'failed', txHash: 'hash0', attempts: 1, error: { kind: 'network' } });
    expect(r.chunks[0].error?.message).toMatch(/300 seconds/);
    expect(h.actions.map((a) => a.type)).toEqual(['chunk_status', 'chunk_status', 'chunk_submitting', 'chunk_failed']);
    expect(h.signs).toBe(1);
    expect(h.sends).toBe(1);
  });
  it('a contract error surfaced by the send is still recorded as network (the hash decides on resume)', async () => {
    const h = await afterSendFailure(new Error('Transaction failed! Error(Contract, #18)'));
    expect(h.run().pauseReason).toBe('failed');
    expect(h.run().chunks[0]).toMatchObject({ status: 'failed', txHash: 'hash0', error: { kind: 'network' } });
  });
  it('resume → resolve success → chunk_done without a new build or signature', async () => {
    const h = await afterSendFailure();
    h.deps.resolveChunk = async (txHash) => {
      h.resolves.push(txHash);
      return { status: 'success', streamIds: [7, 8] };
    };
    h.deps.dispatch({ type: 'resume' });
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(h.resolves).toEqual(['hash0']);
    expect(r.chunks[0]).toMatchObject({ status: 'done', txHash: 'hash0', streamIds: [7, 8] });
    expect(r.chunks[0].error).toBeUndefined();
    expect(r.phase).toBe('completed');
    expect(h.builds.map((c) => c.index)).toEqual([0, 1]); // chunk 0 built once (before the failure), never again
    expect(h.signs).toBe(2);
    expect(h.sends).toBe(2);
  });
  it('resume → resolve failed → chunk_forget_tx, then rebuilt, re-signed and sent', async () => {
    const h = await afterSendFailure();
    h.deps.resolveChunk = async (txHash) => {
      h.resolves.push(txHash);
      return { status: 'failed' };
    };
    h.deps.dispatch({ type: 'resume' });
    await runBatch(h.deps, new AbortController().signal);
    const r = h.run();
    expect(h.resolves).toEqual(['hash0']);
    expect(h.actions.filter((a) => a.type === 'chunk_forget_tx')).toEqual([{ type: 'chunk_forget_tx', index: 0 }]);
    expect(r.phase).toBe('completed');
    expect(r.chunks[0]).toMatchObject({ status: 'done', txHash: 'hash0', streamIds: [0, 1] });
    expect(h.builds.map((c) => c.index)).toEqual([0, 0, 1]);
    expect(h.signs).toBe(3);
    expect(h.sends).toBe(3);
  });
  it('resume → resolve not_found → paused again with the hash kept and no build', async () => {
    const h = await afterSendFailure();
    const buildsBefore = h.builds.length;
    h.deps.dispatch({ type: 'resume' });
    await runBatch(h.deps, new AbortController().signal); // harness default answer: not_found
    const r = h.run();
    expect(h.resolves).toEqual(['hash0']);
    expect(r).toMatchObject({ phase: 'paused', pauseReason: 'failed' });
    expect(r.chunks[0]).toMatchObject({ status: 'failed', txHash: 'hash0', attempts: 2, error: TX_NOT_FOUND_ERROR });
    expect(h.builds).toHaveLength(buildsBefore);
    expect(h.signs).toBe(1);
  });
  it('a throwing resolveChunk is treated as not_found', async () => {
    const h = await afterSendFailure();
    h.deps.resolveChunk = async () => {
      throw new Error('Failed to fetch');
    };
    h.deps.dispatch({ type: 'resume' });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.run().chunks[0]).toMatchObject({ status: 'failed', txHash: 'hash0', error: TX_NOT_FOUND_ERROR });
    expect(h.signs).toBe(1);
  });
  it('after "discard this transaction" (chunk_forget_tx) the chunk is rebuilt without a lookup', async () => {
    const h = await afterSendFailure();
    h.deps.dispatch({ type: 'chunk_forget_tx', index: 0 });
    expect(h.run().chunks[0]).toMatchObject({ status: 'pending' });
    expect(h.run().chunks[0].txHash).toBeUndefined();
    h.deps.dispatch({ type: 'resume' });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.resolves).toEqual([]);
    expect(h.run().phase).toBe('completed');
    expect(h.builds.map((c) => c.index)).toEqual([0, 0, 1]);
  });
  it('a stored run interrupted mid-submit (failed + hash) is looked up before anything is signed', async () => {
    let r = makeRun(3);
    r = runReducer(r, { type: 'chunk_status', index: 0, status: 'signing' });
    r = runReducer(r, { type: 'chunk_submitting', index: 0, txHash: 'stored0' });
    r = runReducer(r, { type: 'chunk_failed', index: 0, error: { kind: 'network', message: 'Interrupted' }, pause: 'failed' });
    r = runReducer(r, { type: 'resume' });
    const h = harness(r, { resolve: () => ({ status: 'success', streamIds: [1, 2] }) });
    await runBatch(h.deps, new AbortController().signal);
    expect(h.resolves).toEqual(['stored0']);
    expect(h.run().chunks[0]).toMatchObject({ status: 'done', txHash: 'stored0', streamIds: [1, 2] });
    expect(h.builds.map((c) => c.index)).toEqual([1]);
    expect(h.run().phase).toBe('completed');
  });
});
