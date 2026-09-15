// frontend/src/components/create/ScheduleFields.tsx
'use client';

import type { Dispatch } from 'react';
import { MAX_TRANCHES } from '@/lib/create/schedule';
import type { FormAction, FormState } from '@/lib/create/formState';
import { Field, PctInput, bareInputClass, ghostButtonClass } from './fields';

type Props = { state: FormState; errors: Record<string, string>; dispatch: Dispatch<FormAction> };

export default function ScheduleFields({ state, errors, dispatch }: Props) {
  switch (state.shape) {
    case 'linear':
      return <LinearFields state={state} errors={errors} dispatch={dispatch} />;
    case 'tranched':
      return <TranchedFields state={state} errors={errors} dispatch={dispatch} />;
    case 'recurring':
      return <RecurringFields state={state} errors={errors} dispatch={dispatch} />;
  }
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className={bareInputClass + ' font-mono'} />;
}

function LinearFields({ state, errors, dispatch }: Props) {
  const l = state.linear;
  const set = (patch: Partial<FormState['linear']>) => dispatch({ type: 'set_linear', patch });
  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-3 gap-x-6 gap-y-8">
        <Field label="Start" error={errors.start}>
          <DateInput value={l.start} onChange={(v) => set({ start: v, ...(l.hasCliff ? {} : { cliff: v }) })} />
        </Field>
        <Field label="Cliff" hint={l.hasCliff ? undefined : 'No cliff — vesting starts immediately.'} error={errors.cliff}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-cream-dim">
              <input type="checkbox" checked={l.hasCliff} onChange={(e) => set({ hasCliff: e.target.checked, cliff: e.target.checked ? l.cliff : l.start })} />
              Use a cliff
            </label>
            {l.hasCliff && <DateInput value={l.cliff} onChange={(v) => set({ cliff: v })} />}
          </div>
        </Field>
        <Field label="End" error={errors.end}>
          <DateInput value={l.end} onChange={(v) => set({ end: v })} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-8">
        <Field label="Unlock at start" hint="Share of the total released the instant the stream begins." error={errors.unlockAtStartPct ?? errors.unlocks}>
          <PctInput value={l.unlockAtStartPct} onChange={(v) => set({ unlockAtStartPct: v })} />
        </Field>
        <Field label="Unlock at cliff" hint="Share of the total released when the cliff lands." error={errors.unlockAtCliffPct}>
          <PctInput value={l.unlockAtCliffPct} onChange={(v) => set({ unlockAtCliffPct: v })} />
        </Field>
      </div>
    </div>
  );
}

function TranchedFields({ state, errors, dispatch }: Props) {
  const t = state.tranched;
  return (
    <div className="space-y-8">
      <Field label="Start" hint="Reference time; tranche offsets count from here." error={errors.start}>
        <DateInput value={t.start} onChange={(v) => dispatch({ type: 'set_tranched_start', start: v })} />
      </Field>
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="eyebrow text-cream-dim">Tranches ({t.tranches.length})</span>
          <div className="flex gap-4">
            <button type="button" className={ghostButtonClass} onClick={() => dispatch({ type: 'split_tranches_evenly' })} disabled={t.tranches.length === 0}>
              Split evenly
            </button>
            <button type="button" className={ghostButtonClass} onClick={() => dispatch({ type: 'add_tranche' })} disabled={t.tranches.length >= MAX_TRANCHES}>
              + Tranche
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] font-mono text-xs">
            <thead className="text-cream-dim uppercase tracking-[0.12em] text-[10px]">
              <tr>
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">After start</th>
                <th className="text-left py-2 pr-3">Unit</th>
                <th className="text-left py-2 pr-3">Share</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {t.tranches.map((tr, i) => {
                const err = errors[`tranche.${tr.id}`];
                return (
                  <tr key={tr.id} className={'border-t border-stroke/60 align-top ' + (err ? 'bg-danger/5' : '')}>
                    <td className="py-2 pr-3 text-cream-dim">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <input type="text" inputMode="decimal" value={tr.offsetValue} onChange={(e) => dispatch({ type: 'update_tranche', id: tr.id, patch: { offsetValue: e.target.value } })} className={bareInputClass + ' w-24'} />
                    </td>
                    <td className="py-2 pr-3">
                      <select value={tr.offsetUnit} onChange={(e) => dispatch({ type: 'update_tranche', id: tr.id, patch: { offsetUnit: e.target.value as 'hours' | 'days' } })} className="bg-transparent border-b border-stroke text-cream py-2 outline-none">
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="w-24">
                        <PctInput value={tr.pct} onChange={(v) => dispatch({ type: 'update_tranche', id: tr.id, patch: { pct: v } })} />
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" className={ghostButtonClass} onClick={() => dispatch({ type: 'remove_tranche', id: tr.id })} aria-label={`Remove tranche ${i + 1}`}>
                        remove
                      </button>
                      {err && <p className="text-[10px] text-danger normal-case tracking-normal mt-1">{err}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {errors.tranches && <p className="mt-2 text-xs text-danger">{errors.tranches}</p>}
      </div>
    </div>
  );
}

function RecurringFields({ state, errors, dispatch }: Props) {
  const r = state.recurring;
  const set = (patch: Partial<FormState['recurring']>) => dispatch({ type: 'set_recurring', patch });
  return (
    <div className="grid sm:grid-cols-3 gap-x-6 gap-y-8">
      <Field label="First unlock" error={errors.start}>
        <DateInput value={r.first} onChange={(v) => set({ first: v })} />
      </Field>
      <Field label="Every" error={errors.period}>
        <div className="flex gap-3 items-baseline border-b border-stroke focus-within:border-sand">
          <input type="text" inputMode="decimal" value={r.periodValue} onChange={(e) => set({ periodValue: e.target.value })} className="flex-1 bg-transparent border-0 px-0 py-2 text-cream outline-none font-mono w-20" />
          <select value={r.periodUnit} onChange={(e) => set({ periodUnit: e.target.value as FormState['recurring']['periodUnit'] })} className="bg-transparent text-cream font-mono text-xs py-2 outline-none">
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
            <option value="weeks">weeks</option>
          </select>
        </div>
      </Field>
      <Field label="Count" hint="Number of unlocks (1–1000)." error={errors.count}>
        <input type="text" inputMode="numeric" value={r.count} onChange={(e) => set({ count: e.target.value })} className={bareInputClass + ' font-mono'} />
      </Field>
    </div>
  );
}
