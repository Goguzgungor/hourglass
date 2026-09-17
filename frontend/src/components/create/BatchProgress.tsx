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
  /** "Discard this transaction and rebuild" for a failed chunk that still carries a tx hash. */
  onForgetTx: (index: number) => void;
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

function stepText(run: BatchRun, unresolved: boolean): string {
  const p = runProgress(run);
  const active = run.chunks.find((c) => c.status === 'simulating' || c.status === 'signing' || c.status === 'submitting');
  if (run.phase === 'running' && active) {
    return `Transaction ${active.index + 1} of ${p.total} — ${plural(active.rowIds.length, 'stream')} — ${STATUS_LABEL[active.status]}`;
  }
  if (run.phase === 'paused') {
    if (unresolved) return 'A transaction was signed but its result is not known yet. Check it before continuing.';
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
  return `${p.done} of ${p.total} ${p.total === 1 ? 'transaction' : 'transactions'} done — ${plural(p.streams, 'stream')} created.`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function BatchProgress({ run, busy, persisted, onPause, onContinue, onShift, onForgetTx, onAbort }: Props) {
  const p = runProgress(run);
  const failed = run.chunks.find((c) => c.status === 'failed');
  // Signed and possibly sent: the runner looks the tx up before anything is rebuilt.
  const unresolved = !!failed?.txHash;
  const explorerAccount = accountUrl(run.sender);
  const shiftedCount = run.chunks.filter((c) => c.status !== 'done').reduce((n, c) => n + c.rowIds.length, 0);

  return (
    <section className="mt-10 space-y-8" aria-label="Batch progress">
      <div>
        <p className="eyebrow text-cream-dim mb-2">· Creating {plural(Object.keys(run.rows).length, 'stream')}</p>
        <p className="font-mono text-sm text-cream" aria-live="polite">
          {stepText(run, unresolved)}
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
              <span className="text-cream w-28">{plural(c.rowIds.length, 'stream')}</span>
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
                  {c.streamIds.length === 1 ? `id ${c.streamIds[0]}` : `ids ${c.streamIds[0]}–${c.streamIds[c.streamIds.length - 1]}`}
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
            {unresolved ? 'Check transaction and continue' : run.pauseReason === 'user' ? 'Continue' : 'Retry'}
          </button>
        )}
        {run.phase === 'paused' && failed && unresolved && (
          <button type="button" className={ghostButtonClass} onClick={() => onForgetTx(failed.index)}>
            Discard this transaction and rebuild
          </button>
        )}
        {run.phase !== 'completed' && (
          <button type="button" className={ghostButtonClass} onClick={onAbort}>
            Stop here ({p.done} done)
          </button>
        )}
      </div>

      {unresolved && (
        <p className="text-xs text-warning">
          Transaction {(failed?.index ?? 0) + 1} was signed and may have reached the network. &ldquo;Check transaction and continue&rdquo; looks it
          up and carries on from its result; only discard it if the explorer
          {explorerAccount && (
            <>
              {' '}
              (
              <a href={explorerAccount} target="_blank" rel="noreferrer" className="underline">
                sender account
              </a>
              )
            </>
          )}{' '}
          shows it never landed — rebuilding a landed transaction would create the streams twice.
        </p>
      )}
    </section>
  );
}
