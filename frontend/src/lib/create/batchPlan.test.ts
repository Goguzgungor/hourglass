import { describe, expect, it } from 'vitest';
import {
  BATCH_RUN_KEY,
  DEFAULT_CHUNK_ROWS,
  INTERRUPTED_ERROR,
  loadStoredRun,
  nextChunk,
  planRun,
  runProgress,
  runReducer,
  type BatchRun,
} from './batchPlan';
import { validateRows } from './rows';
import { scheduleStart, type Schedule } from './schedule';
import { memoryStorage } from './storage';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const G2 = 'GAWIFBYR7ATAATABJT5XT5PI3PQAUK4ZZF4EODQCWKINA3PTV43NWWAA';
const NOW = 1_800_000_000;
const schedule: Schedule = { shape: 'recurring', firstTs: NOW + 900, periodSecs: 86_400, count: 12 };

function rows(n: number) {
  return validateRows(
    Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, recipient: i % 2 ? G2 : G1, amount: '12', source: 'manual' as const })),
    { sender: null, schedule },
  );
}
function run(n: number, chunkRows?: number): BatchRun {
  return planRun({ sender: G1, token: 'CTOKEN', cancelable: true, transferable: false, schedule, rows: rows(n), chunkRows, nowMs: NOW * 1000 });
}

describe('planRun', () => {
  it('chunks 45 rows into 20/20/5 with the default chunk size', () => {
    const r = run(45);
    expect(DEFAULT_CHUNK_ROWS).toBe(20);
    expect(r.chunks.map((c) => c.rowIds.length)).toEqual([20, 20, 5]);
    expect(r.chunks.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(r.chunks.every((c) => c.status === 'pending' && c.attempts === 0 && c.schedule === schedule)).toBe(true);
    expect(r.id).toBe(`run_${NOW * 1000}`);
    expect(r.createdAt).toBe(NOW);
    expect(r.phase).toBe('running');
    expect(r.rows.r1).toEqual({ recipient: G1, total: '120000000' });
  });
  it('clamps chunkRows to 1..100 and skips rows without a built spec', () => {
    expect(run(5, 0).chunks.map((c) => c.rowIds.length)).toEqual([1, 1, 1, 1, 1]);
    expect(run(150, 1000).chunks.map((c) => c.rowIds.length)).toEqual([100, 50]);
    const bad = validateRows([{ id: 'x', recipient: 'bad', amount: '1', source: 'manual' }], { sender: null, schedule });
    const r = planRun({ sender: G1, token: 'C', cancelable: true, transferable: true, schedule, rows: [...rows(2), ...bad], nowMs: 1 });
    expect(Object.keys(r.rows)).toEqual(['r1', 'r2']);
    expect(r.chunks[0].rowIds).toEqual(['r1', 'r2']);
  });
});

describe('runReducer', () => {
  it('chunk_done marks done and completes the run when every chunk is done', () => {
    let r = run(25);
    r = runReducer(r, { type: 'chunk_status', index: 0, status: 'signing' });
    expect(r.chunks[0].status).toBe('signing');
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'aa', streamIds: [1, 2] });
    expect(r.chunks[0]).toMatchObject({ status: 'done', txHash: 'aa', streamIds: [1, 2] });
    expect(r.phase).toBe('running');
    r = runReducer(r, { type: 'chunk_done', index: 1, txHash: 'bb', streamIds: [3] });
    expect(r.phase).toBe('completed');
    expect(runProgress(r)).toEqual({ done: 2, total: 2, streams: 3 });
  });
  it('chunk_failed pauses with the reason and counts attempts', () => {
    let r = run(3);
    r = runReducer(r, { type: 'chunk_failed', index: 0, error: { kind: 'rejected', message: 'x' }, pause: 'rejected' });
    expect(r.phase).toBe('paused');
    expect(r.pauseReason).toBe('rejected');
    expect(r.chunks[0]).toMatchObject({ status: 'failed', attempts: 1, error: { kind: 'rejected' } });
    r = runReducer(r, { type: 'resume' });
    expect(r.phase).toBe('running');
    expect(r.pauseReason).toBeUndefined();
    expect(nextChunk(r)?.index).toBe(0);
  });
  it('split_chunk halves a chunk, resets it, and renumbers', () => {
    let r = run(45);
    r = runReducer(r, { type: 'chunk_failed', index: 1, error: { kind: 'resource', message: 'x' }, pause: 'failed' });
    r = runReducer(r, { type: 'split_chunk', index: 1 });
    expect(r.chunks.map((c) => c.rowIds.length)).toEqual([20, 10, 10, 5]);
    expect(r.chunks.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(r.chunks[1]).toMatchObject({ status: 'pending', attempts: 0 });
    expect(r.chunks[1].error).toBeUndefined();
    expect(r.chunks[1].rowIds).toEqual(['r21', 'r22', 'r23', 'r24', 'r25', 'r26', 'r27', 'r28', 'r29', 'r30']);
    // odd sizes: ceil / floor
    r = runReducer(r, { type: 'split_chunk', index: 3 });
    expect(r.chunks.map((c) => c.rowIds.length)).toEqual([20, 10, 10, 3, 2]);
  });
  it('split_chunk refuses 1-row and done chunks', () => {
    let r = run(1);
    expect(runReducer(r, { type: 'split_chunk', index: 0 })).toBe(r);
    r = run(4);
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [1, 2, 3, 4] });
    expect(runReducer(r, { type: 'split_chunk', index: 0 })).toBe(r);
  });
  it('shift_remaining shifts only non-done chunks and resumes', () => {
    let r = run(45);
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [] });
    r = runReducer(r, { type: 'chunk_failed', index: 1, error: { kind: 'contract', code: 18, name: 'StartInPast', message: 'm' }, pause: 'start_in_past' });
    r = runReducer(r, { type: 'shift_remaining', seconds: 900 });
    expect(r.phase).toBe('running');
    expect(scheduleStart(r.chunks[0].schedule)).toBe(NOW + 900);
    expect(scheduleStart(r.chunks[1].schedule)).toBe(NOW + 1800);
    expect(scheduleStart(r.chunks[2].schedule)).toBe(NOW + 1800);
    expect(r.chunks[1]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(r.chunks[1].error).toBeUndefined();
  });
  it('pause only affects a running run; abort and complete set phases', () => {
    let r = run(2);
    r = runReducer(r, { type: 'pause' });
    expect(r).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    expect(runReducer(r, { type: 'pause' })).toBe(r);
    expect(runReducer(r, { type: 'abort' }).phase).toBe('aborted');
    expect(runReducer(r, { type: 'complete' }).phase).toBe('completed');
  });
  it('nextChunk returns the first non-done chunk or null', () => {
    let r = run(45);
    expect(nextChunk(r)?.index).toBe(0);
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [] });
    expect(nextChunk(r)?.index).toBe(1);
    r = runReducer(r, { type: 'chunk_done', index: 1, txHash: 'h', streamIds: [] });
    r = runReducer(r, { type: 'chunk_done', index: 2, txHash: 'h', streamIds: [] });
    expect(nextChunk(r)).toBeNull();
  });
  it('shift_remaining is a no-op on completed and aborted runs', () => {
    const done = runReducer(run(1), { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [1] });
    expect(runReducer(done, { type: 'shift_remaining', seconds: 900 })).toBe(done);
    const aborted = runReducer(run(2), { type: 'abort' });
    expect(runReducer(aborted, { type: 'shift_remaining', seconds: 900 })).toBe(aborted);
  });
  it('chunk_failed on an unknown index leaves the run untouched', () => {
    const r = run(2);
    expect(runReducer(r, { type: 'chunk_failed', index: 7, error: { kind: 'network', message: 'x' }, pause: 'failed' })).toBe(r);
  });
});

describe('loadStoredRun', () => {
  it('returns null for missing/invalid/aborted runs', () => {
    const s = memoryStorage();
    expect(loadStoredRun(null)).toBeNull();
    expect(loadStoredRun(s)).toBeNull();
    s.setItem(BATCH_RUN_KEY, '{"nope":1}');
    expect(loadStoredRun(s)).toBeNull();
    s.setItem(BATCH_RUN_KEY, JSON.stringify(runReducer(run(2), { type: 'abort' })));
    expect(loadStoredRun(s)).toBeNull();
  });
  it('normalises an interrupted run: running → paused, in-flight chunks reset', () => {
    const s = memoryStorage();
    let r = run(45);
    r = runReducer(r, { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [1] });
    r = runReducer(r, { type: 'chunk_status', index: 1, status: 'signing' });
    r = runReducer(r, { type: 'chunk_status', index: 2, status: 'simulating' });
    s.setItem(BATCH_RUN_KEY, JSON.stringify(r));
    const loaded = loadStoredRun(s)!;
    expect(loaded.phase).toBe('paused');
    expect(loaded.pauseReason).toBe('failed');
    expect(loaded.chunks[0].status).toBe('done');
    expect(loaded.chunks[1]).toMatchObject({ status: 'failed', error: INTERRUPTED_ERROR });
    expect(loaded.chunks[2].status).toBe('pending');
  });
  it('keeps completed and paused runs as they are', () => {
    const s = memoryStorage();
    const paused = runReducer(run(2), { type: 'chunk_failed', index: 0, error: { kind: 'rejected', message: 'x' }, pause: 'rejected' });
    s.setItem(BATCH_RUN_KEY, JSON.stringify(paused));
    expect(loadStoredRun(s)).toEqual(paused);
    const done = runReducer(run(1), { type: 'chunk_done', index: 0, txHash: 'h', streamIds: [1] });
    s.setItem(BATCH_RUN_KEY, JSON.stringify(done));
    expect(loadStoredRun(s)?.phase).toBe('completed');
  });
});
