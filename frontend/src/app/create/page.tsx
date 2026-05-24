'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-context';
import { useToast } from '@/lib/toast';
import { makeLockup } from '@/lib/sdk';
import { DEPLOYMENT, hasDeployment } from '@/lib/deployments';
import {
  datetimeLocalToUnix,
  formatDuration,
  formatStroops,
  isStellarAddress,
  parseXlmToStroops,
  truncAddress,
  unixToDatetimeLocal,
} from '@/lib/format';

/* ----------------------------------------------------------------- *
 * Defaults — recomputed once at mount so we don't churn the form.   *
 * ----------------------------------------------------------------- */

function defaults() {
  const now = Math.floor(Date.now() / 1000);
  const start = now + 60; // start in 1m
  const end = start + 3600; // 1h linear
  return {
    start: unixToDatetimeLocal(start),
    cliff: unixToDatetimeLocal(start), // no cliff
    end: unixToDatetimeLocal(end),
  };
}

export default function CreateStreamPage() {
  const router = useRouter();
  const { address, connect } = useWallet();
  const toast = useToast();

  const init = useMemo(defaults, []);

  // Form state
  const [recipient, setRecipient] = useState('');
  const [deposit, setDeposit] = useState('1');
  const [startStr, setStartStr] = useState(init.start);
  const [cliffStr, setCliffStr] = useState(init.cliff);
  const [endStr, setEndStr] = useState(init.end);
  const [unlockAtStart, setUnlockAtStart] = useState('0');
  const [unlockAtCliff, setUnlockAtCliff] = useState('0');
  const [cancelable, setCancelable] = useState(true);
  const [transferable, setTransferable] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* --------------- Derived (validated) inputs --------------- */
  const parsed = useMemo(() => {
    try {
      const depositStroops = parseXlmToStroops(deposit);
      const unlockStartStroops = parseXlmToStroops(unlockAtStart);
      const unlockCliffStroops = parseXlmToStroops(unlockAtCliff);
      const startTs = datetimeLocalToUnix(startStr);
      const cliffTs = datetimeLocalToUnix(cliffStr);
      const endTs = datetimeLocalToUnix(endStr);
      const duration = endTs - startTs;
      const hasCliff = cliffTs > startTs;
      return {
        ok: true as const,
        depositStroops,
        unlockStartStroops,
        unlockCliffStroops,
        startTs,
        cliffTs,
        endTs,
        duration,
        hasCliff,
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [deposit, unlockAtStart, unlockAtCliff, startStr, cliffStr, endStr]);

  /* --------------- Submission handler --------------- */
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hasDeployment()) {
      setError(
        'No on-chain deployment found. Run ./scripts/deploy-local.sh first.',
      );
      return;
    }
    if (!address) {
      setError('Connect a wallet first.');
      return;
    }
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!isStellarAddress(recipient)) {
      setError('Recipient must be a valid G… Stellar address.');
      return;
    }
    if (parsed.depositStroops <= 0n) {
      setError('Deposit must be > 0.');
      return;
    }
    if (parsed.endTs <= parsed.startTs) {
      setError('End must be strictly after start.');
      return;
    }
    if (parsed.cliffTs < parsed.startTs || parsed.cliffTs > parsed.endTs) {
      setError('Cliff must be between start and end (inclusive).');
      return;
    }
    if (
      parsed.unlockStartStroops + parsed.unlockCliffStroops >
      parsed.depositStroops
    ) {
      setError('Unlocks (start + cliff) cannot exceed the deposit.');
      return;
    }

    setSubmitting(true);
    try {
      const lockup = makeLockup(address);
      const tx = await lockup.create_linear({
        sender: address,
        recipient: recipient.trim(),
        token: DEPLOYMENT.nativeToken,
        deposited: parsed.depositStroops,
        start_ts: BigInt(parsed.startTs),
        cliff_ts: BigInt(parsed.cliffTs),
        end_ts: BigInt(parsed.endTs),
        unlock_at_start: parsed.unlockStartStroops,
        unlock_at_cliff: parsed.unlockCliffStroops,
        is_cancelable: cancelable,
        is_transferable: transferable,
      });
      const result = await tx.signAndSend();
      const streamId = result.result;
      toast.push({
        kicker: `Stream #${streamId} / created`,
        message: `${formatStroops(parsed.depositStroops)} XLM streaming to ${truncAddress(recipient.trim())}.`,
      });
      router.push(`/stream/${streamId}`);
    } catch (e) {
      console.error(e);
      setError((e as Error).message || 'Failed to create stream.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 sm:px-10 pt-16 sm:pt-24">
      <div className="max-w-[720px] mx-auto">
        {/* Eyebrow + headline */}
        <p className="eyebrow mb-8">
          <span className="text-sand">·</span>{' '}
          <span className="ml-1">Stage 0</span>{' '}
          <span className="mx-2 text-stroke-2">/</span> Create a linear stream
        </p>

        <h1 className="headline text-[clamp(2.75rem,7vw,5.5rem)] text-cream">
          Define the
          <br />
          <span className="text-sand-bright">schedule.</span>
        </h1>

        <p className="mt-8 max-w-[540px] text-lg leading-relaxed text-cream-muted">
          Lock a SEP-41 asset and release it on a precise vesting curve. The
          recipient withdraws by the second.
        </p>

        {!hasDeployment() && (
          <NoDeploymentWarning />
        )}

        <form className="mt-16 space-y-12" onSubmit={onSubmit} noValidate>
          {/* ---------------- 1. Token ---------------- */}
          <Field
            label="Token"
            hint="Native XLM via the local Stellar Asset Contract."
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 border border-sand px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-sand-bright rounded-none">
                <span className="size-[6px] bg-sand rounded-full" />
                XLM
              </span>
              <span className="font-mono text-xs text-cream-dim break-all">
                {DEPLOYMENT.nativeToken || '—'}
              </span>
            </div>
          </Field>

          {/* ---------------- 2. Recipient ---------------- */}
          <Field
            label="Recipient address"
            hint="56-character Stellar account public key (G…)."
          >
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="GABCD…"
              className={bareInputClass + ' font-mono'}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>

          {/* ---------------- 3. Deposit amount ---------------- */}
          <Field
            label="Deposit amount"
            hint="The full balance to lock in the stream."
          >
            <XlmInput value={deposit} onChange={setDeposit} />
          </Field>

          {/* ---------------- 4-6. Schedule ---------------- */}
          <div className="grid sm:grid-cols-3 gap-x-6 gap-y-12">
            <Field label="Start">
              <input
                type="datetime-local"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className={bareInputClass + ' font-mono'}
              />
            </Field>
            <Field
              label="Cliff"
              hint="Same time as start = no cliff."
            >
              <input
                type="datetime-local"
                value={cliffStr}
                onChange={(e) => setCliffStr(e.target.value)}
                className={bareInputClass + ' font-mono'}
              />
            </Field>
            <Field label="End">
              <input
                type="datetime-local"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className={bareInputClass + ' font-mono'}
              />
            </Field>
          </div>

          {/* ---------------- 7-8. Unlocks ---------------- */}
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-12">
            <Field
              label="Unlock at start"
              hint="Lump sum released the instant the stream begins."
            >
              <XlmInput value={unlockAtStart} onChange={setUnlockAtStart} />
            </Field>
            <Field
              label="Unlock at cliff"
              hint="Lump sum released when the cliff lands."
            >
              <XlmInput value={unlockAtCliff} onChange={setUnlockAtCliff} />
            </Field>
          </div>

          {/* ---------------- 9. Toggles ---------------- */}
          <div className="space-y-6">
            <ToggleRow
              label="Cancelable"
              hint="Sender can cancel and reclaim unstreamed funds. Can be renounced later."
              value={cancelable}
              onChange={setCancelable}
            />
            <ToggleRow
              label="Transferable"
              hint="Recipient can transfer the NFT receipt to a new owner."
              value={transferable}
              onChange={setTransferable}
            />
          </div>

          {/* ---------------- Spec preview ---------------- */}
          <SpecSummary
            parsed={parsed.ok ? parsed : null}
            cancelable={cancelable}
            transferable={transferable}
          />

          {/* ---------------- Errors ---------------- */}
          {error && (
            <p className="font-mono text-xs text-danger border-l-2 border-danger pl-4 py-2">
              {error}
            </p>
          )}

          {/* ---------------- Submit ---------------- */}
          {address ? (
            <button
              type="submit"
              disabled={submitting || !parsed.ok}
              className="
                w-full flex items-center justify-center gap-3
                bg-sand text-night px-7 py-4
                text-[11px] uppercase tracking-[0.18em] font-medium
                rounded-none border border-sand
                hover:bg-sand-bright hover:border-sand-bright
                disabled:opacity-50 disabled:cursor-not-allowed
                disabled:hover:bg-sand disabled:hover:border-sand
                transition-colors duration-200
              "
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <SubmittingDots /> Submitting…
                </span>
              ) : (
                <>
                  Sign and create stream
                  <span className="text-base leading-none">→</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={connect}
              className="
                w-full flex items-center justify-center gap-3
                text-sand px-7 py-4
                text-[11px] uppercase tracking-[0.18em] font-medium
                rounded-none border border-sand/60
                hover:border-sand hover:text-sand-bright hover:bg-sand/5
                transition-colors duration-200
              "
            >
              Connect wallet to continue
              <span className="text-base leading-none">→</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Subcomponents                                                    *
 * ----------------------------------------------------------------- */

const bareInputClass =
  'w-full bg-transparent border-0 border-b border-stroke px-0 py-2 text-cream ' +
  'placeholder:text-cream-dim/60 outline-none ' +
  'focus:border-sand transition-colors';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-cream-dim block mb-3">{label}</span>
      {children}
      {hint && (
        <span className="block mt-2 text-xs text-cream-dim/80">{hint}</span>
      )}
    </label>
  );
}

function XlmInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-stroke focus-within:border-sand transition-colors">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent border-0 px-0 py-2 text-cream outline-none font-mono"
        spellCheck={false}
        autoComplete="off"
      />
      <span className="font-mono text-xs text-cream-dim uppercase tracking-[0.18em]">
        XLM
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-6 py-3 border-t border-stroke/60">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={
          'relative w-12 h-8 shrink-0 border ' +
          (value
            ? 'border-sand bg-sand/10'
            : 'border-stroke bg-night hover:border-cream-dim') +
          ' transition-colors'
        }
      >
        <span
          className={
            'absolute top-1 w-4 h-6 transition-transform duration-200 rounded-none ' +
            (value
              ? 'translate-x-[26px] bg-sand'
              : 'translate-x-[2px] bg-stroke')
          }
        />
      </button>
      <div className="flex-1">
        <span className="eyebrow text-cream block">{label}</span>
        {hint && (
          <span className="block mt-1 text-xs text-cream-dim/80">{hint}</span>
        )}
      </div>
      <span
        className={
          'font-mono text-[11px] uppercase tracking-[0.18em] mt-1 ' +
          (value ? 'text-sand-bright' : 'text-cream-dim')
        }
      >
        {value ? 'On' : 'Off'}
      </span>
    </div>
  );
}

function SubmittingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="size-[5px] bg-night rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="size-[5px] bg-night rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="size-[5px] bg-night rounded-full animate-bounce" />
    </span>
  );
}

function NoDeploymentWarning() {
  return (
    <div className="mt-10 border border-warning/40 bg-warning/5 px-5 py-4">
      <p className="eyebrow text-warning mb-2">· No on-chain deployment</p>
      <p className="text-sm text-cream-muted leading-relaxed">
        The build placeholder is empty. Run{' '}
        <span className="font-mono text-cream">
          ./scripts/quickstart-up.sh
        </span>{' '}
        then{' '}
        <span className="font-mono text-cream">
          ./scripts/deploy-local.sh
        </span>{' '}
        from the repo root, then restart the dev server.
      </p>
    </div>
  );
}

function SpecSummary({
  parsed,
  cancelable,
  transferable,
}: {
  parsed: {
    depositStroops: bigint;
    unlockStartStroops: bigint;
    unlockCliffStroops: bigint;
    duration: number;
    hasCliff: boolean;
    cliffTs: number;
    startTs: number;
  } | null;
  cancelable: boolean;
  transferable: boolean;
}) {
  return (
    <div className="border-t border-stroke pt-8">
      <p className="eyebrow text-cream-dim mb-4">· Spec preview</p>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 font-mono text-xs">
        <dt className="text-cream-dim">deposit</dt>
        <dd className="text-cream">
          {parsed ? `${formatStroops(parsed.depositStroops)} XLM` : '—'}
        </dd>
        <dt className="text-cream-dim">duration</dt>
        <dd className="text-cream">
          {parsed && parsed.duration > 0
            ? formatDuration(parsed.duration)
            : '—'}
        </dd>
        <dt className="text-cream-dim">cliff</dt>
        <dd className="text-cream">
          {parsed
            ? parsed.hasCliff
              ? `+${formatDuration(parsed.cliffTs - parsed.startTs)}`
              : 'none (cliff = start)'
            : '—'}
        </dd>
        <dt className="text-cream-dim">unlock @ start</dt>
        <dd className="text-cream">
          {parsed ? `${formatStroops(parsed.unlockStartStroops)} XLM` : '—'}
        </dd>
        <dt className="text-cream-dim">unlock @ cliff</dt>
        <dd className="text-cream">
          {parsed ? `${formatStroops(parsed.unlockCliffStroops)} XLM` : '—'}
        </dd>
        <dt className="text-cream-dim">cancelable</dt>
        <dd className="text-cream">{cancelable ? 'yes' : 'no'}</dd>
        <dt className="text-cream-dim">transferable</dt>
        <dd className="text-cream">{transferable ? 'yes' : 'no'}</dd>
      </dl>
    </div>
  );
}

