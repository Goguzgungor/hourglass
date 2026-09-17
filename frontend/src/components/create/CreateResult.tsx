// frontend/src/components/create/CreateResult.tsx
'use client';

import Link from 'next/link';
import { runProgress, type BatchRun } from '@/lib/create/batchPlan';
import { txUrl } from '@/lib/explorer';
import { primaryButtonClass, secondaryButtonClass } from './fields';

export default function CreateResult({ run, busy, onReset }: { run: BatchRun; busy: boolean; onReset: () => void }) {
  const p = runProgress(run);
  const aborted = run.phase === 'aborted';
  const remaining = Object.keys(run.rows).length - p.streams;
  return (
    <section className="mt-10 space-y-8" aria-label="Batch result">
      <div>
        <p className={`eyebrow mb-2 ${aborted ? 'text-warning' : 'text-success'}`}>· {aborted ? 'Stopped' : 'Done'}</p>
        <p className="font-mono text-sm text-cream">
          {p.streams} stream{p.streams === 1 ? '' : 's'} created in {p.done} transaction{p.done === 1 ? '' : 's'}.
          {aborted && remaining > 0 && ` ${remaining} row${remaining === 1 ? ' was' : 's were'} not created.`}
        </p>
      </div>
      <ol className="border border-stroke divide-y divide-stroke/60 font-mono text-xs">
        {run.chunks
          .filter((c) => c.status === 'done')
          .map((c) => {
            const link = c.txHash ? txUrl(c.txHash) : null;
            return (
              <li key={c.index} className="px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-cream-dim">#{c.index + 1}</span>
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="text-sand hover:text-sand-bright underline-offset-2 hover:underline">
                      tx {c.txHash?.slice(0, 12)}…
                    </a>
                  ) : (
                    <span className="text-cream-dim">tx {c.txHash?.slice(0, 12) || '—'}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(c.streamIds ?? []).map((id) => (
                    <Link key={id} href={`/stream/${id}`} className="border border-stroke px-2 py-1 text-cream hover:border-sand hover:text-sand-bright transition-colors">
                      #{id}
                    </Link>
                  ))}
                </div>
              </li>
            );
          })}
      </ol>
      <div className="flex flex-wrap gap-4">
        <Link href="/dashboard" className={primaryButtonClass + ' sm:w-auto'}>
          Go to dashboard →
        </Link>
        <button type="button" className={secondaryButtonClass} onClick={onReset} disabled={busy}>
          Create another
        </button>
      </div>
    </section>
  );
}
