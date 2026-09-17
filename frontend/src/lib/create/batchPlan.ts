//
// A batch run = the rows to create + the chunks (one create_batch transaction
// each) + a phase. `runReducer` is the only way state changes; the runner
// (Task 6) drives it and the hook (Task 13) persists it. Everything here is
// JSON-safe (amounts are decimal strings) so a run survives a page reload.

import type { ClassifiedError } from './errors';
import { MAX_ROWS_PER_RUN, type ValidatedRow } from './rows';
import { shiftSchedule, type Schedule } from './schedule';
import { readJson, type StorageLike } from './storage';

export { MAX_ROWS_PER_RUN };
export const DEFAULT_CHUNK_ROWS = 20;
export const CONTRACT_MAX_BATCH_ROWS = 100;
export const BATCH_RUN_KEY = 'hourglass:batchRun:v1';

export const INTERRUPTED_ERROR: ClassifiedError = {
  kind: 'network',
  message: 'Interrupted — check the explorer before retrying',
};

export type ChunkStatus = 'pending' | 'simulating' | 'signing' | 'submitting' | 'done' | 'failed';
export type RunPhase = 'running' | 'paused' | 'completed' | 'aborted';
export type PauseReason = 'rejected' | 'failed' | 'start_in_past' | 'user';

export type Chunk = {
  index: number;
  rowIds: string[];
  /** Schedule used for this chunk; shifted per chunk when the user shifts remaining rows. */
  schedule: Schedule;
  status: ChunkStatus;
  txHash?: string;
  streamIds?: number[];
  error?: ClassifiedError;
  attempts: number;
};

export type BatchRun = {
  id: string;
  createdAt: number;
  sender: string;
  token: string;
  cancelable: boolean;
  transferable: boolean;
  /** rowId → recipient + deposited stroops (decimal string). */
  rows: Record<string, { recipient: string; total: string }>;
  chunks: Chunk[];
  phase: RunPhase;
  pauseReason?: PauseReason;
};

export type RunAction =
  | { type: 'chunk_status'; index: number; status: ChunkStatus }
  | { type: 'chunk_done'; index: number; txHash: string; streamIds: number[] }
  | { type: 'chunk_failed'; index: number; error: ClassifiedError; pause: PauseReason }
  /** Signed; the hash is known before the send so a landed tx is never re-signed. */
  | { type: 'chunk_submitting'; index: number; txHash: string }
  /** "Discard this transaction and rebuild": drop a failed chunk's hash and start over. */
  | { type: 'chunk_forget_tx'; index: number }
  | { type: 'split_chunk'; index: number }
  | { type: 'shift_remaining'; seconds: number }
  | { type: 'resume' }
  | { type: 'pause' }
  | { type: 'abort' }
  | { type: 'complete' };

export function planRun(input: {
  sender: string;
  token: string;
  cancelable: boolean;
  transferable: boolean;
  schedule: Schedule;
  rows: ValidatedRow[];
  chunkRows?: number;
  nowMs: number;
}): BatchRun {
  const chunkRows = Math.min(CONTRACT_MAX_BATCH_ROWS, Math.max(1, input.chunkRows ?? DEFAULT_CHUNK_ROWS));
  const rows: BatchRun['rows'] = {};
  const ids: string[] = [];
  for (const r of input.rows) {
    if (!r.built || r.issues.some((i) => i.level === 'error')) continue;
    // Store the post-adjustment deposit so re-building the spec is exact.
    rows[r.id] = { recipient: r.recipient.trim(), total: r.built.deposited.toString() };
    ids.push(r.id);
  }
  const chunks: Chunk[] = [];
  for (let i = 0; i < ids.length; i += chunkRows) {
    chunks.push({
      index: chunks.length,
      rowIds: ids.slice(i, i + chunkRows),
      schedule: input.schedule,
      status: 'pending',
      attempts: 0,
    });
  }
  return {
    id: `run_${input.nowMs}`,
    createdAt: Math.floor(input.nowMs / 1000),
    sender: input.sender,
    token: input.token,
    cancelable: input.cancelable,
    transferable: input.transferable,
    rows,
    chunks,
    phase: 'running',
  };
}

/** Row ids that already became streams (chunks with status `done`), in chunk order. */
export function createdRowIds(run: BatchRun): string[] {
  return run.chunks.filter((c) => c.status === 'done').flatMap((c) => c.rowIds);
}

/**
 * What the preview panel should show while a run exists: every row's deposit,
 * the recipient count, and the schedule of the next chunk still to be created
 * (shifts apply to remaining chunks only) — or the last chunk's once all are done.
 */
export function runPreview(run: BatchRun): { schedule: Schedule; total: bigint; recipients: number } {
  const rows = Object.values(run.rows);
  const next = run.chunks.find((c) => c.status !== 'done') ?? run.chunks[run.chunks.length - 1];
  return {
    schedule: next.schedule,
    total: rows.reduce((acc, r) => acc + BigInt(r.total), 0n),
    recipients: rows.length,
  };
}

function updateChunk(run: BatchRun, index: number, patch: (c: Chunk) => Chunk): Chunk[] {
  return run.chunks.map((c) => (c.index === index ? patch(c) : c));
}

export function runReducer(run: BatchRun, a: RunAction): BatchRun {
  switch (a.type) {
    case 'chunk_status':
      return { ...run, chunks: updateChunk(run, a.index, (c) => ({ ...c, status: a.status })) };
    case 'chunk_done': {
      const chunks = updateChunk(run, a.index, (c) => ({
        ...c,
        status: 'done',
        txHash: a.txHash,
        streamIds: a.streamIds,
        error: undefined,
      }));
      if (run.phase === 'aborted') return { ...run, chunks };
      const allDone = chunks.every((c) => c.status === 'done');
      return allDone ? { ...run, chunks, phase: 'completed', pauseReason: undefined } : { ...run, chunks };
    }
    case 'chunk_failed': {
      if (!run.chunks.some((c) => c.index === a.index)) return run;
      if (run.phase === 'aborted') {
        return { ...run, chunks: updateChunk(run, a.index, (c) => ({ ...c, status: 'failed', error: a.error, attempts: c.attempts + 1 })) };
      }
      return {
        ...run,
        phase: 'paused',
        pauseReason: a.pause,
        chunks: updateChunk(run, a.index, (c) => ({ ...c, status: 'failed', error: a.error, attempts: c.attempts + 1 })),
      };
    }
    case 'chunk_submitting':
      if (!run.chunks.some((c) => c.index === a.index)) return run;
      return { ...run, chunks: updateChunk(run, a.index, (c) => ({ ...c, status: 'submitting', txHash: a.txHash })) };
    case 'chunk_forget_tx': {
      const c = run.chunks.find((x) => x.index === a.index);
      if (!c || c.status !== 'failed') return run;
      return { ...run, chunks: updateChunk(run, a.index, (x) => ({ ...x, status: 'pending', txHash: undefined, error: undefined })) };
    }
    case 'split_chunk': {
      const i = run.chunks.findIndex((c) => c.index === a.index);
      if (i === -1) return run;
      const c = run.chunks[i];
      if (c.status === 'done' || c.rowIds.length < 2) return run;
      const half = Math.ceil(c.rowIds.length / 2);
      const first: Chunk = { ...c, rowIds: c.rowIds.slice(0, half), status: 'pending', attempts: 0, error: undefined };
      const second: Chunk = { ...c, rowIds: c.rowIds.slice(half), status: 'pending', attempts: 0, error: undefined };
      const chunks = [...run.chunks.slice(0, i), first, second, ...run.chunks.slice(i + 1)].map((x, idx) => ({
        ...x,
        index: idx,
      }));
      return { ...run, chunks };
    }
    case 'shift_remaining': {
      if (run.phase !== 'running' && run.phase !== 'paused') return run;
      return {
        ...run,
        phase: 'running',
        pauseReason: undefined,
        chunks: run.chunks.map((c) =>
          c.status === 'done'
            ? c
            : { ...c, schedule: shiftSchedule(c.schedule, a.seconds), status: 'pending', error: undefined },
        ),
      };
    }
    case 'resume':
      return { ...run, phase: 'running', pauseReason: undefined };
    case 'pause':
      return run.phase === 'running' ? { ...run, phase: 'paused', pauseReason: 'user' } : run;
    case 'abort':
      return { ...run, phase: 'aborted' };
    case 'complete':
      return { ...run, phase: 'completed', pauseReason: undefined };
  }
}

export function nextChunk(run: BatchRun): Chunk | null {
  return run.chunks.find((c) => c.status !== 'done') ?? null;
}

export function runProgress(run: BatchRun): { done: number; total: number; streams: number } {
  let done = 0;
  let streams = 0;
  for (const c of run.chunks) {
    if (c.status === 'done') done++;
    streams += c.streamIds?.length ?? 0;
  }
  return { done, total: run.chunks.length, streams };
}

const PHASES: RunPhase[] = ['running', 'paused', 'completed', 'aborted'];
const STATUSES: ChunkStatus[] = ['pending', 'simulating', 'signing', 'submitting', 'done', 'failed'];

export function isBatchRun(x: unknown): x is BatchRun {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.sender === 'string' &&
    typeof o.token === 'string' &&
    typeof o.rows === 'object' &&
    o.rows !== null &&
    PHASES.includes(o.phase as RunPhase) &&
    Array.isArray(o.chunks) &&
    o.chunks.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        Array.isArray((c as Chunk).rowIds) &&
        STATUSES.includes((c as Chunk).status) &&
        typeof (c as Chunk).schedule === 'object',
    )
  );
}

/**
 * Read the persisted run. Aborted / unreadable → null. A run that was
 * `running` when the tab closed becomes `paused`. A chunk that was only
 * simulating or waiting for the wallet's signature goes back to `pending`
 * (nothing was sent: the wallet signs, we submit); a chunk caught while
 * submitting becomes `failed` with `INTERRUPTED_ERROR` and keeps its hash so
 * the runner looks the transaction up before anything is rebuilt.
 */
export function loadStoredRun(storage: StorageLike | null): BatchRun | null {
  const raw = readJson<unknown>(storage, BATCH_RUN_KEY);
  if (!isBatchRun(raw)) return null;
  if (raw.phase === 'aborted') return null;
  if (raw.phase === 'completed') return raw;
  const chunks = raw.chunks.map((c): Chunk => {
    if (c.status === 'simulating' || c.status === 'signing') return { ...c, status: 'pending' };
    if (c.status === 'submitting') return { ...c, status: 'failed', error: INTERRUPTED_ERROR };
    return c;
  });
  return {
    ...raw,
    chunks,
    phase: 'paused',
    pauseReason: raw.phase === 'running' ? 'failed' : raw.pauseReason,
  };
}
