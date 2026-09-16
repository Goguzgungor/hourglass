// frontend/src/app/create/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-context';
import { useToast } from '@/lib/toast';
import { makeLockup } from '@/lib/sdk';
import { DEPLOYMENT, hasDeployment } from '@/lib/deployments';
import { TOKENS, findToken } from '@/lib/tokens';
import { formatStroops, isStellarAddress, parseXlmToStroops, truncAddress } from '@/lib/format';
import { formReducer, initialFormState, parseForm } from '@/lib/create/formState';
import { hasRowErrors, rowsSummary, validateRows } from '@/lib/create/rows';
import { deriveTemplate } from '@/lib/create/schedule';
import { findTemplate } from '@/lib/create/templates';
import { useTemplates } from '@/lib/create/useTemplates';
import { DEFAULT_CHUNK_ROWS, planRun } from '@/lib/create/batchPlan';
import { useBatchRunner } from '@/lib/create/useBatchRunner';
import { submitSingle } from '@/lib/create/submit';
import { classifyTxError, describeError } from '@/lib/create/errors';
import { FEE_RESERVE_STROOPS, fetchTokenBalance } from '@/lib/create/balance';
import ConfirmDialog from '@/components/ConfirmDialog';
import CreatePreview from '@/components/CreatePreview';
import BatchProgress from '@/components/create/BatchProgress';
import CreateResult from '@/components/create/CreateResult';
import RecipientsSection from '@/components/create/RecipientsSection';
import ResumeBanner from '@/components/create/ResumeBanner';
import ScheduleFields from '@/components/create/ScheduleFields';
import ShapeTabs from '@/components/create/ShapeTabs';
import TemplateBar from '@/components/create/TemplateBar';
import TokenPicker from '@/components/create/TokenPicker';
import { Field, NoDeploymentWarning, SubmittingDots, ToggleRow, primaryButtonClass } from '@/components/create/fields';

const nowSec = () => Math.floor(Date.now() / 1000);

export default function CreateStreamPage() {
  const router = useRouter();
  const { address, connect } = useWallet();
  const toast = useToast();
  const templates = useTemplates();

  const [state, dispatch] = useReducer(formReducer, undefined, () => initialFormState(nowSec(), TOKENS));
  // Re-validate the start margin every 30 s so a form left open does not submit a stale start.
  const [tick, setTick] = useState(nowSec);
  useEffect(() => {
    const id = setInterval(() => setTick(nowSec()), 30_000);
    return () => clearInterval(id);
  }, []);

  const parsed = useMemo(() => parseForm(state, tick), [state, tick]);
  const schedule = parsed.valid ? parsed.schedule : null;
  const selectedToken = findToken(state.token);
  const symbol = selectedToken?.symbol ?? 'TOKEN';

  const validated = useMemo(
    () => (state.mode === 'batch' ? validateRows(state.batch.rows, { sender: address, schedule }) : []),
    [state.mode, state.batch.rows, address, schedule],
  );
  const summary = useMemo(() => rowsSummary(validated), [validated]);
  const batchTxs = Math.ceil(validated.filter((r) => r.built).length / DEFAULT_CHUNK_ROWS);

  const singleTotal = useMemo(() => {
    try {
      const v = parseXlmToStroops(state.single.amount);
      return v > 0n && !/\.\d{8,}/.test(state.single.amount) ? v : null;
    } catch {
      return null;
    }
  }, [state.single.amount]);
  const singleErrors = {
    recipient: state.single.recipient && !isStellarAddress(state.single.recipient) ? 'Recipient must be a valid G… Stellar address.' : undefined,
    amount: state.single.amount && singleTotal === null ? 'Enter an amount greater than 0 (up to 7 decimals).' : undefined,
  };

  const getLockup = useCallback(() => (address ? makeLockup(address) : null), [address]);
  const runner = useBatchRunner(getLockup);

  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { total: bigint; rows: number; txs: number; note: string | null }>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (runner.run) setStarting(false);
  }, [runner.run]);

  /* ---------------- templates ---------------- */
  const knownTokens = useMemo(() => TOKENS.map((t) => t.id), []);
  function applyTemplate(id: string) {
    const t = findTemplate(templates.user, id);
    if (t) dispatch({ type: 'apply_template', template: t, nowSec: nowSec(), knownTokens });
  }
  function draft(name: string, id?: string) {
    if (!parsed.schedule) return null;
    return {
      id,
      name,
      schedule: deriveTemplate(parsed.schedule, nowSec()),
      token: selectedToken ? state.token : undefined,
      cancelable: state.cancelable,
      transferable: state.transferable,
    };
  }
  function saveNewTemplate(name: string): string | null {
    const d = draft(name);
    if (!d) return 'Fix the schedule before saving it as a template.';
    const r = templates.save(d, nowSec());
    if (!r.ok) return r.reason;
    dispatch({ type: 'template_saved', templateId: r.template.id });
    toast.push({ kicker: 'Template saved', message: r.template.name });
    return null;
  }
  function updateSelectedTemplate(): string | null {
    const cur = state.templateId ? findTemplate(templates.user, state.templateId) : undefined;
    if (!cur || cur.builtIn) return 'Select one of your templates first.';
    const d = draft(cur.name, cur.id);
    if (!d) return 'Fix the schedule before saving it as a template.';
    const r = templates.save(d, nowSec());
    if (!r.ok) return r.reason;
    dispatch({ type: 'template_saved', templateId: cur.id });
    return null;
  }
  function renameTemplate(id: string, name: string): string | null {
    const r = templates.rename(id, name);
    return r.ok ? null : r.reason;
  }
  function deleteTemplate(id: string) {
    if (templates.remove(id) && state.templateId === id) dispatch({ type: 'clear_template' });
  }

  /* ---------------- guards shared by both modes ---------------- */
  function guard(): boolean {
    setError(null);
    if (!hasDeployment()) {
      setError('No on-chain deployment found. Run ./scripts/deploy-local.sh first.');
      return false;
    }
    if (!address) {
      setError('Connect a wallet first.');
      return false;
    }
    if (!schedule) {
      setError(Object.values(parsed.errors)[0] ?? 'Fix the schedule first.');
      return false;
    }
    if (!state.token) {
      setError('Select a token.');
      return false;
    }
    return true;
  }

  /* ---------------- single ---------------- */
  async function onSubmitSingle() {
    if (!guard() || !address || !schedule) return;
    const recipient = state.single.recipient.trim();
    if (!isStellarAddress(recipient)) {
      setError('Recipient must be a valid G… Stellar address.');
      return;
    }
    if (singleTotal === null) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setSubmitting(true);
    try {
      const { streamId } = await submitSingle(makeLockup(address), {
        sender: address,
        recipient,
        token: state.token,
        schedule,
        total: singleTotal,
        cancelable: state.cancelable,
        transferable: state.transferable,
      });
      toast.push({
        kicker: `Stream #${streamId} / created`,
        message: `${formatStroops(singleTotal)} ${symbol} streaming to ${truncAddress(recipient)}.`,
      });
      router.push(`/stream/${streamId}`);
    } catch (e) {
      console.error(e);
      setError(describeError(classifyTxError(e, { lockupId: DEPLOYMENT.lockup })));
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- batch ---------------- */
  async function onPreflightBatch() {
    if (!guard() || !address) return;
    if (validated.length === 0) {
      setError('Add at least one row.');
      return;
    }
    if (hasRowErrors(validated)) {
      setError('Fix the rows marked ✗ first.');
      return;
    }
    setChecking(true);
    try {
      const balance = selectedToken ? await fetchTokenBalance(DEPLOYMENT.horizonUrl, address, selectedToken) : null;
      if (balance !== null && summary.total > balance) {
        setError(`Insufficient balance: need ${formatStroops(summary.total)} ${symbol}, have ${formatStroops(balance)} ${symbol}.`);
        return;
      }
      let note: string | null = null;
      if (balance === null) note = 'Could not verify your balance.';
      else if (selectedToken?.symbol === 'XLM' && balance - summary.total < FEE_RESERVE_STROOPS) {
        note = 'Less than 5 XLM would remain for fees and reserves.';
      }
      setConfirm({ total: summary.total, rows: validated.length, txs: batchTxs, note });
    } finally {
      setChecking(false);
    }
  }
  function onConfirmBatch() {
    if (starting) return;
    if (!address || !schedule) {
      setConfirm(null);
      setError(!address ? 'Wallet disconnected — connect it and try again.' : 'The schedule is no longer valid (the start time may have passed). Review it and try again.');
      return;
    }
    setStarting(true);
    const run = planRun({
      sender: address,
      token: state.token,
      cancelable: state.cancelable,
      transferable: state.transferable,
      schedule,
      rows: validated,
      nowMs: Date.now(),
    });
    setConfirm(null);
    runner.start(run);
  }
  function onContinueBatch() {
    setError(null);
    if (!address) {
      setError('Connect your wallet to continue the batch.');
      return;
    }
    runner.resume();
  }
  function onShiftBatch() {
    setError(null);
    if (!address) {
      setError('Connect your wallet to continue the batch.');
      return;
    }
    runner.shift(900);
  }
  /** User confirmed the signed tx never landed: drop its hash and rebuild it from the same rows. */
  function onForgetBatchTx(index: number) {
    setError(null);
    if (!address) {
      setError('Connect your wallet to continue the batch.');
      return;
    }
    runner.forgetTx(index);
    runner.resume();
  }

  const run = runner.run;
  const batchDisabled = validated.length === 0 || hasRowErrors(validated) || !schedule || checking;

  return (
    <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24 pt-10 sm:pt-16 md:pt-24 xl:pt-28">
      <div className="grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px] 2xl:grid-cols-[1fr_560px] gap-x-8 lg:gap-x-10 xl:gap-x-16 2xl:gap-x-20 gap-y-10 items-start">
        <div className="max-w-[720px] xl:max-w-[860px] 2xl:max-w-[1000px]">
          <p className="eyebrow mb-6 sm:mb-8 xl:text-[0.78rem] 2xl:text-[0.85rem]">
            <span className="text-sand">·</span> <span className="ml-1">Create</span>{' '}
            <span className="mx-2 text-stroke-2">/</span> {state.mode === 'batch' ? 'Batch' : 'Stream'}
          </p>
          <h1 className="headline text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-[7rem] 2xl:text-[8.5rem] text-cream">
            Define the
            <br />
            <span className="text-sand-bright">schedule.</span>
          </h1>
          <p className="mt-6 sm:mt-8 xl:mt-10 max-w-[540px] xl:max-w-[640px] 2xl:max-w-[720px] text-base sm:text-lg xl:text-xl 2xl:text-2xl leading-relaxed text-cream-muted">
            Lock a SEP-41 asset and release it on a precise vesting curve — to one recipient or to a whole list.
          </p>

          {!hasDeployment() && <NoDeploymentWarning />}

          {runner.stored && !run && (
            <ResumeBanner run={runner.stored} onResume={() => runner.load(runner.stored as NonNullable<typeof runner.stored>)} onDiscard={runner.discard} />
          )}

          {run ? (
            run.phase === 'completed' || run.phase === 'aborted' ? (
              <CreateResult run={run} onReset={runner.discard} />
            ) : (
              <>
                {error && <p className="mt-10 font-mono text-xs text-danger border-l-2 border-danger pl-4 py-2">{error}</p>}
                <BatchProgress
                  run={run}
                  busy={runner.busy}
                  persisted={runner.persisted}
                  onPause={runner.pause}
                  onContinue={onContinueBatch}
                  onShift={onShiftBatch}
                  onForgetTx={onForgetBatchTx}
                  onAbort={runner.abort}
                />
              </>
            )
          ) : (
            <form
              className="mt-10 sm:mt-16 space-y-10 sm:space-y-12"
              onSubmit={(e) => {
                e.preventDefault();
                if (state.mode === 'single') void onSubmitSingle();
                else void onPreflightBatch();
              }}
              noValidate
            >
              <TemplateBar
                builtIn={templates.builtIn}
                user={templates.user}
                selectedId={state.templateId}
                dirty={state.templateDirty}
                canSave={templates.canSave}
                onApply={applyTemplate}
                onClear={() => dispatch({ type: 'clear_template' })}
                onSaveNew={saveNewTemplate}
                onUpdate={updateSelectedTemplate}
                onRename={renameTemplate}
                onDelete={deleteTemplate}
              />

              <Field label="Token">
                <TokenPicker tokens={TOKENS} selectedId={state.token} onSelect={(id) => dispatch({ type: 'set_token', token: id })} />
              </Field>

              <div>
                <span className="eyebrow text-cream-dim block mb-3">Shape</span>
                <ShapeTabs shape={state.shape} onChange={(shape) => dispatch({ type: 'set_shape', shape })} />
              </div>

              <ScheduleFields state={state} errors={parsed.errors} dispatch={dispatch} />

              <div>
                <span className="eyebrow text-cream-dim block mb-3">Recipients</span>
                <RecipientsSection state={state} dispatch={dispatch} validated={validated} symbol={symbol} singleErrors={singleErrors} />
              </div>

              <div className="space-y-6">
                <ToggleRow
                  label="Cancelable"
                  hint="Sender can cancel and reclaim unstreamed funds. Can be renounced later."
                  value={state.cancelable}
                  onChange={(v) => dispatch({ type: 'set_flag', flag: 'cancelable', value: v })}
                />
                <ToggleRow
                  label="Transferable"
                  hint="Recipient can transfer the NFT receipt to a new owner."
                  value={state.transferable}
                  onChange={(v) => dispatch({ type: 'set_flag', flag: 'transferable', value: v })}
                />
              </div>

              {error && <p className="font-mono text-xs text-danger border-l-2 border-danger pl-4 py-2">{error}</p>}

              {address ? (
                <button
                  type="submit"
                  disabled={submitting || (state.mode === 'single' ? !schedule : batchDisabled)}
                  className={primaryButtonClass}
                >
                  {submitting || checking ? (
                    <span className="flex items-center gap-2">
                      <SubmittingDots /> {checking ? 'Checking…' : 'Submitting…'}
                    </span>
                  ) : state.mode === 'single' ? (
                    <>
                      Sign and create stream <span className="text-base leading-none">→</span>
                    </>
                  ) : (
                    <>
                      Create {summary.valid} stream{summary.valid === 1 ? '' : 's'} in {batchTxs} transaction{batchTxs === 1 ? '' : 's'}{' '}
                      <span className="text-base leading-none">→</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={connect}
                  className="w-full flex items-center justify-center gap-3 text-sand px-7 py-4 text-[11px] uppercase tracking-[0.18em] font-medium rounded-none border border-sand/60 hover:border-sand hover:text-sand-bright hover:bg-sand/5 transition-colors duration-200"
                >
                  Connect wallet to continue <span className="text-base leading-none">→</span>
                </button>
              )}
            </form>
          )}
        </div>

        <aside className="hidden md:block md:sticky md:top-32">
          <p className="eyebrow text-cream-dim mb-4">· Preview</p>
          <CreatePreview
            schedule={parsed.schedule}
            total={state.mode === 'single' ? singleTotal : summary.total > 0n ? summary.total : null}
            recipients={state.mode === 'single' ? 1 : validated.length}
            recipient={state.mode === 'single' ? state.single.recipient : undefined}
            symbol={symbol}
            glyphColor={selectedToken?.glyphColor}
            cancelable={state.cancelable}
            transferable={state.transferable}
          />
          <p className="mt-5 text-[11px] text-cream-dim/80 leading-relaxed">
            Curve sketch + spec sheet update live as you edit. Recipients will see exactly this schedule on-chain.
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onDismiss={() => setConfirm(null)}
        onConfirm={onConfirmBatch}
        kicker="Confirm batch"
        title={`Create ${confirm?.rows ?? 0} streams?`}
        confirmLabel={`Sign ${confirm?.txs ?? 0} transaction${(confirm?.txs ?? 0) === 1 ? '' : 's'}`}
        busy={starting || checking}
      >
        {confirm && (
          <div className="space-y-3 text-sm text-cream-muted leading-relaxed">
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 font-mono text-xs">
              <dt className="text-cream-dim">token</dt>
              <dd className="text-cream">{symbol}</dd>
              <dt className="text-cream-dim">shape</dt>
              <dd className="text-cream">{state.shape}</dd>
              <dt className="text-cream-dim">recipients</dt>
              <dd className="text-cream">{confirm.rows}</dd>
              <dt className="text-cream-dim">total</dt>
              <dd className="text-sand-bright">
                {formatStroops(confirm.total)} {symbol}
                {summary.adjustment < 0n && <span className="text-cream-dim"> (adjusted {formatStroops(summary.adjustment)})</span>}
              </dd>
              <dt className="text-cream-dim">transactions</dt>
              <dd className="text-cream">{confirm.txs}</dd>
            </dl>
            {confirm.note && <p className="text-warning text-xs">{confirm.note}</p>}
            <p className="text-xs">Each transaction is signed separately; streams created by a signed transaction are final.</p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
