// frontend/src/components/create/BatchTable.tsx
'use client';

import { formatStroops } from '@/lib/format';
import type { RowIssue, ValidatedRow } from '@/lib/create/rows';
import { bareInputClass, ghostButtonClass } from './fields';

type Props = {
  rows: ValidatedRow[];
  symbol: string;
  onUpdate: (id: string, patch: { recipient?: string; amount?: string }) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onClear: () => void;
};

function worst(issues: RowIssue[]): RowIssue['level'] | null {
  if (issues.some((i) => i.level === 'error')) return 'error';
  if (issues.some((i) => i.level === 'warning')) return 'warning';
  if (issues.length) return 'info';
  return null;
}

const LEVEL_CLASS: Record<RowIssue['level'], string> = {
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-cream-dim',
};
const LEVEL_GLYPH: Record<RowIssue['level'], string> = { error: '✗', warning: '!', info: 'i' };

function derived(row: ValidatedRow, symbol: string): string {
  if (!row.built) return '—';
  const spec = row.built.spec;
  switch (spec.tag) {
    case 'Linear': {
      const p = spec.values[0];
      const up = p.unlock_at_start + p.unlock_at_cliff;
      return up > 0n ? `${formatStroops(up)} ${symbol} unlocked up front` : 'continuous';
    }
    case 'Tranched': {
      const t = spec.values[0].tranches;
      return `${t.length} tranches, first ${formatStroops(t[0].amount)} ${symbol}`;
    }
    case 'Recurring': {
      const p = spec.values[0];
      return `${formatStroops(p.amount_per_period)} ${symbol} × ${p.count}`;
    }
  }
}

export default function BatchTable({ rows, symbol, onUpdate, onRemove, onAdd, onClear }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow text-cream-dim">Rows ({rows.length})</span>
        <div className="flex gap-4">
          <button type="button" className={ghostButtonClass} onClick={onAdd}>
            + Row
          </button>
          <button type="button" className={ghostButtonClass} onClick={onClear} disabled={rows.length === 0}>
            Clear all
          </button>
        </div>
      </div>
      <div className="overflow-x-auto border border-stroke">
        <table className="w-full min-w-[720px] font-mono text-xs">
          <thead className="text-cream-dim uppercase tracking-[0.12em] text-[10px] bg-night/40">
            <tr>
              <th className="text-left py-2 px-3 w-10">#</th>
              <th className="text-left py-2 px-3">Recipient</th>
              <th className="text-left py-2 px-3 w-40">Amount ({symbol})</th>
              <th className="text-left py-2 px-3">Schedule</th>
              <th className="py-2 px-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 px-3 text-center text-cream-dim">
                  No rows yet — add one or paste a list below.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const level = worst(r.issues);
              return (
                <tr key={r.id} className={'border-t border-stroke/60 align-top ' + (level === 'error' ? 'bg-danger/5' : '')}>
                  <td className="py-2 px-3 text-cream-dim">
                    {level ? (
                      <span className={LEVEL_CLASS[level]} title={r.issues.map((x) => x.message).join(' ')}>
                        {LEVEL_GLYPH[level]}
                      </span>
                    ) : (
                      <span className="text-success">✓</span>
                    )}{' '}
                    {i + 1}
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={r.recipient}
                      onChange={(e) => onUpdate(r.id, { recipient: e.target.value })}
                      placeholder="G…"
                      spellCheck={false}
                      autoComplete="off"
                      className={bareInputClass + ' min-w-[360px]'}
                      aria-label={`Recipient ${i + 1}`}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => onUpdate(r.id, { amount: e.target.value })}
                      className={bareInputClass}
                      aria-label={`Amount ${i + 1}`}
                    />
                  </td>
                  <td className="py-2 px-3 text-cream-dim">
                    <div>{derived(r, symbol)}</div>
                    {r.issues.map((x) => (
                      <div key={x.code} className={'text-[10px] mt-1 ' + LEVEL_CLASS[x.level]}>
                        {x.message}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button type="button" className={ghostButtonClass} onClick={() => onRemove(r.id)} aria-label={`Remove row ${i + 1}`}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
