// frontend/src/components/create/RecipientsSection.tsx
'use client';

import type { Dispatch } from 'react';
import type { FormAction, FormState } from '@/lib/create/formState';
import { MAX_ROWS_PER_RUN, rowsSummary, type ValidatedRow } from '@/lib/create/rows';
import { formatStroops } from '@/lib/format';
import BatchTable from './BatchTable';
import CsvImport from './CsvImport';
import { AmountInput, Field, bareInputClass } from './fields';

type Props = {
  state: FormState;
  dispatch: Dispatch<FormAction>;
  validated: ValidatedRow[];
  symbol: string;
  singleErrors: { recipient?: string; amount?: string };
};

export default function RecipientsSection({ state, dispatch, validated, symbol, singleErrors }: Props) {
  const summary = rowsSummary(validated);
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Recipients mode">
        {(['single', 'batch'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={state.mode === m}
            onClick={() => dispatch({ type: 'set_mode', mode: m })}
            className={
              'px-4 py-2 rounded-none border font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ' +
              (state.mode === m ? 'border-sand bg-sand/10 text-sand-bright' : 'border-stroke text-cream hover:border-stroke-2')
            }
          >
            {m === 'single' ? 'Single recipient' : 'Batch'}
          </button>
        ))}
      </div>

      {state.mode === 'single' ? (
        <div className="grid sm:grid-cols-[1fr_200px] gap-x-6 gap-y-8">
          <Field label="Recipient address" hint="56-character Stellar account public key (G…)." error={singleErrors.recipient}>
            <input
              type="text"
              value={state.single.recipient}
              onChange={(e) => dispatch({ type: 'set_single', patch: { recipient: e.target.value } })}
              placeholder="GABCD…"
              className={bareInputClass + ' font-mono'}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Total amount" hint="What the recipient receives in full." error={singleErrors.amount}>
            <AmountInput value={state.single.amount} onChange={(v) => dispatch({ type: 'set_single', patch: { amount: v } })} symbol={symbol} />
          </Field>
        </div>
      ) : (
        <div className="space-y-8">
          <BatchTable
            rows={validated}
            symbol={symbol}
            onUpdate={(id, patch) => dispatch({ type: 'update_row', id, patch })}
            onRemove={(id) => dispatch({ type: 'remove_row', id })}
            onAdd={() => dispatch({ type: 'add_row' })}
            onClear={() => dispatch({ type: 'clear_rows' })}
          />
          <CsvImport onImport={(text) => dispatch({ type: 'import_rows', text })} lastImport={state.batch.lastImport} />
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs border-t border-stroke pt-4">
            <div>
              <dt className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">Rows</dt>
              <dd className="text-cream">
                {summary.count} / {MAX_ROWS_PER_RUN}
              </dd>
            </div>
            <div>
              <dt className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">Total</dt>
              <dd className="text-sand-bright">
                {formatStroops(summary.total)} {symbol}
                {summary.adjustment < 0n && <span className="block text-[10px] text-cream-dim">adjusted {formatStroops(summary.adjustment)}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">Errors</dt>
              <dd className={summary.errors ? 'text-danger' : 'text-cream'}>{summary.errors}</dd>
            </div>
            <div>
              <dt className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">Warnings</dt>
              <dd className={summary.warnings ? 'text-warning' : 'text-cream'}>{summary.warnings}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
