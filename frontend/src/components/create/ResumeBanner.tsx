// frontend/src/components/create/ResumeBanner.tsx
'use client';

import { runProgress, type BatchRun } from '@/lib/create/batchPlan';
import { ghostButtonClass, secondaryButtonClass } from './fields';

export default function ResumeBanner({ run, onResume, onDiscard }: { run: BatchRun; onResume: () => void; onDiscard: () => void }) {
  const p = runProgress(run);
  const when = new Date(run.createdAt * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const left = p.total - p.done;
  return (
    <div className="mt-10 border border-warning/40 bg-warning/5 px-5 py-4 space-y-3">
      <p className="eyebrow text-warning">· Unfinished batch</p>
      <p className="text-sm text-cream-muted leading-relaxed">
        {run.phase === 'completed'
          ? `A batch from ${when} finished (${p.streams} streams).`
          : `A batch from ${when} is unfinished — ${left} of ${p.total} transaction${p.total === 1 ? '' : 's'} left (${p.streams} streams created so far).`}
      </p>
      <div className="flex flex-wrap gap-4">
        <button type="button" className={secondaryButtonClass} onClick={onResume}>
          {run.phase === 'completed' ? 'Show result' : 'Resume'}
        </button>
        <button type="button" className={ghostButtonClass} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
