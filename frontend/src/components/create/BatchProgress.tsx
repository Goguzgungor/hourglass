// frontend/src/components/create/BatchProgress.tsx
'use client';

import { describeError } from '@/lib/create/errors';
import { runProgress, type BatchRun, type Chunk } from '@/lib/create/batchPlan';
import { accountUrl, txUrl } from '@/lib/explorer';
import { ghostButtonClass, secondaryButtonClass } from './fields';

type Props = {
  run: BatchRun;
  busy: boolean;
  persisted: boolean;
  onPause: () => void;
  onContinue: () => void;
  onShift: () => void;
  onAbort: () => void;
};

const STATUS_LABEL: Record<Chunk['status'], string> = {
  pending: 'waiting',
  simulating: 'simulating…',
  signing: 'sign in your wallet',
  submitting: 'submitting…',
  done: 'done',
  failed: 'failed',
};

function stepText(run: BatchRun): string {
  const p = runProgress(run);
  const active = run.chunks.find((c) => c.status === 'simulating' || c.status === 'signing' || c.status === 'submitting');
  if (run.phase === 'running' && active) {
    return `Transaction ${active.index + 1} of ${p.total} — ${active.rowIds.length} streams — ${STATUS_LABEL[active.status]}`;
  }
  if (run.phase === 'paused') {
    switch (run.pauseReason) {
      case 'rejected':
        return 'Signature rejected. Nothing was sent for this transaction.';
      case 'start_in_past':
        return 'The start time has passed while signing. Shift the remaining rows and continue.';
      case 'user':
        return 'Paused. Continue when you are ready.';
      default:
        return 'A transaction failed. Retry or stop.';
    }
  }
  return `${p.done} of ${p.total} transactions done — ${p.streams} streams created.`;
}

export default function BatchProgress({ run, busy, persisted, onPause, onContinue, onShift, onAbort }: Props) {
  const p = runProgress(run);
  const failed = run.chunks.find((c) => c.status === 'failed');
  const interrupted = failed?.error?.message.startsWith('Interrupted');
  const explorerAccount = accountUrl(run.sender);
  const shiftedCount = run.chunks.filter((c) => c.status !== 'done').reduce((n, c) => n + c.rowIds.length, 0);

  return (
    <section className="mt-10 space-y-8" aria-label="Batch progress">
      <div>
        <p className="eyebrow text-cream-dim mb-2">· Creating {Object.keys(run.rows).length} streams</p>
        <p className="font-mono text-sm text-cream" aria-live="polite">
          {stepText(run)}
        </p>
        {!persisted && <p className="mt-2 text-xs text-warning">Progress will not survive a page reload in this browser.</p>}
        <p className="mt-2 text-xs text-cream-dim/80">Each transaction is signed separately. Streams created by a signed transaction are final.</p>
      </div>

      <ol className="border border-stroke divide-y divide-stroke/60 font-mono text-xs">
        {run.chunks.map((c) => {
          const link = c.txHash ? txUrl(c.txHash) : null;
          return (
            <li key={c.index} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="text-cream-dim w-8">#{c.index + 1}</span>
              <span className="text-cream w-28">{c.rowIds.length} streams</span>
              <span
                className={
                  'w-40 ' +
                  (c.status === 'done' ? 'text-success' : c.status === 'failed' ? 'text-danger' : c.status === 'pending' ? 'text-cream-dim' : 'text-sand-bright')
                }
              >
                {STATUS_LABEL[c.status]}
              </span>
              {c.streamIds && c.streamIds.length > 0 && (
                <span className="text-cream-dim">
                  ids {c.streamIds[0]}–{c.streamIds[c.streamIds.length - 1]}
                </span>
              )}
              {c.txHash &&
                (link ? (
                  <a href={link} target="_blank" rel="noreferrer" className="text-sand hover:text-sand-bright underline-offset-2 hover:underline">
                    tx {c.txHash.slice(0, 8)}…
                  </a>
                ) : (
                  <span className="text-cream-dim">tx {c.txHash.slice(0, 8)}…</span>
                ))}
              {c.status === 'failed' && c.error && <span className="basis-full text-danger">{describeError(c.error)}</span>}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-4">
        {run.phase === 'running' && (
          <button type="button" className={secondaryButtonClass} onClick={onPause} disabled={!busy}>
            Pause after this transaction
          </button>
        )}
        {run.phase === 'paused' && run.pauseReason === 'start_in_past' && (
          <button type="button" className={secondaryButtonClass} onClick={onShift}>
            Shift {shiftedCount} remaining rows by +15 min and continue
          </button>
        )}
        {run.phase === 'paused' && run.pauseReason !== 'start_in_past' && (
          <button type="button" className={secondaryButtonClass} onClick={onContinue}>
            {run.pauseReason === 'user' ? 'Continue' : 'Retry'}
          </button>
        )}
        {run.phase !== 'completed' && (
          <button type="button" className={ghostButtonClass} onClick={onAbort}>
            Stop here ({p.done} done)
          </button>
        )}
      </div>

      {interrupted && (
        <p className="text-xs text-warning">
          This transaction may have been sent before the page closed. Check the sender account on the explorer
          {explorerAccount && (
            <>
              {' '}
              (
              <a href={explorerAccount} target="_blank" rel="noreferrer" className="underline">
                open
              </a>
              )
            </>
          )}{' '}
          before retrying, or the streams could be created twice.
        </p>
      )}
    </section>
  );
}
