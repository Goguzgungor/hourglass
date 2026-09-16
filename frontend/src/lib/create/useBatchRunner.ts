// frontend/src/lib/create/useBatchRunner.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import type { LockupClient } from '@/lib/sdk';
import { BATCH_RUN_KEY, loadStoredRun, runReducer, type BatchRun, type RunAction } from './batchPlan';
import { runBatch } from './runner';
import { safeStorage, writeJson } from './storage';
import { prepareBatch, sendPrepared } from './submit';

/**
 * Owns the live BatchRun: a ref (so the runner's synchronous `dispatch` and
 * `getRun` agree), mirrored into React state for rendering, and persisted to
 * sessionStorage after every transition.
 */
export function useBatchRunner(getLockup: () => LockupClient | null) {
  const storage = useMemo(() => safeStorage('session'), []);
  const [run, setRun] = useState<BatchRun | null>(null);
  /** An unfinished run found in storage at mount (drives the ResumeBanner). */
  const [stored, setStored] = useState<BatchRun | null>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef<BatchRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    setStored(loadStoredRun(storage));
  }, [storage]);

  const persist = useCallback(
    (r: BatchRun) => {
      writeJson(storage, BATCH_RUN_KEY, r);
    },
    [storage],
  );

  const dispatch = useCallback((a: RunAction) => {
    if (!runRef.current) return;
    runRef.current = runReducer(runRef.current, a);
    setRun(runRef.current);
  }, []);

  const loop = useCallback(async () => {
    const lockup = getLockup();
    if (!lockup || !runRef.current || inFlightRef.current) return;
    const ac = new AbortController();
    abortRef.current = ac;
    inFlightRef.current = true;
    setBusy(true);
    // Snapshot for a loop that outlives discard(): it must see a non-running run and stop.
    let last: BatchRun = runRef.current;
    const alive = () => runRef.current !== null;
    try {
      await runBatch(
        {
          buildChunk: (r, chunk) =>
            prepareBatch(lockup, {
              sender: r.sender,
              token: r.token,
              schedule: chunk.schedule,
              cancelable: r.cancelable,
              transferable: r.transferable,
              rows: chunk.rowIds.map((id) => ({ recipient: r.rows[id].recipient, total: BigInt(r.rows[id].total) })),
            }),
          sendChunk: (tx) => sendPrepared(tx as AssembledTransaction<number[]>),
          dispatch: (a) => {
            if (alive()) dispatch(a);
          },
          getRun: () => {
            if (alive()) last = runRef.current as BatchRun;
            return alive() ? last : { ...last, phase: 'aborted' };
          },
          persist: (r) => {
            if (alive()) persist(r);
          },
        },
        ac.signal,
      );
    } finally {
      inFlightRef.current = false;
      if (abortRef.current === ac) setBusy(false);
    }
  }, [getLockup, dispatch, persist]);

  const sync = useCallback(() => {
    if (runRef.current) persist(runRef.current);
  }, [persist]);

  const start = useCallback(
    (initial: BatchRun) => {
      runRef.current = initial;
      setRun(initial);
      setStored(null);
      persist(initial);
      void loop();
    },
    [loop, persist],
  );
  const resume = useCallback(() => {
    dispatch({ type: 'resume' });
    sync();
    if (!inFlightRef.current) void loop();
  }, [dispatch, sync, loop]);
  const pause = useCallback(() => {
    dispatch({ type: 'pause' });
    sync();
  }, [dispatch, sync]);
  const shift = useCallback(
    (seconds: number) => {
      dispatch({ type: 'shift_remaining', seconds });
      sync();
      if (!inFlightRef.current) void loop();
    },
    [dispatch, sync, loop],
  );
  const abort = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'abort' });
    sync();
  }, [dispatch, sync]);
  /** Take over a stored run (from the ResumeBanner); stays paused until `resume`. */
  const load = useCallback(
    (r: BatchRun) => {
      runRef.current = r;
      setRun(r);
      setStored(null);
      persist(r);
    },
    [persist],
  );
  const discard = useCallback(() => {
    abortRef.current?.abort();
    runRef.current = null;
    setRun(null);
    setStored(null);
    storage?.removeItem(BATCH_RUN_KEY);
  }, [storage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { run, stored, busy, persisted: storage !== null, start, resume, pause, shift, abort, load, discard };
}
