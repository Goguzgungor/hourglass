'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-context';
import { useToast } from '@/lib/toast';
import { makeLockup } from '@/lib/sdk';
import { hasDeployment } from '@/lib/deployments';
import { TOKENS, findToken, type TokenInfo } from '@/lib/tokens';
import {
  datetimeLocalToUnix,
  formatDuration,
  formatStroops,
  isStellarAddress,
  parseXlmToStroops,
  truncAddress,
  unixToDatetimeLocal,
} from '@/lib/format';
import Toggle from '@/components/Toggle';
import CreatePreview from '@/components/CreatePreview';

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
  const [tokenId, setTokenId] = useState(TOKENS[0]?.id ?? '');
  const [recipient, setRecipient] = useState('');
  const [deposit, setDeposit] = useState('1');
  const [startStr, setStartStr] = useState(init.start);
  const [cliffStr, setCliffStr] = useState(init.cliff);
  const [endStr, setEndStr] = useState(init.end);
  const [unlockAtStart, setUnlockAtStart] = useState('0');
  const [unlockAtCliff, setUnlockAtCliff] = useState('0');
  const [cancelable, setCancelable] = useState(true);
  const [transferable, setTransferable] = useState(true);

  const selectedToken = findToken(tokenId);
  const symbol = selectedToken?.symbol ?? 'XLM';

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

    if (!tokenId) {
      setError('Select a token.');
      return;
    }

    setSubmitting(true);
    try {
      // Auto-bump start_ts if it's already (or nearly) in the past — gives the
      // user signing time without the contract rejecting with StartInPast (#18).
      // Preserves duration and cliff offset by shifting end_ts and cliff_ts by
      // the same delta.
      const nowSecs = Math.floor(Date.now() / 1000);
      const minBuffer = 30; // seconds
      let startTs = parsed.startTs;
      let cliffTs = parsed.cliffTs;
      let endTs = parsed.endTs;
      if (startTs <= nowSecs + 5) {
        const shift = nowSecs + minBuffer - startTs;
        const hadNoCliff = cliffTs <= parsed.startTs;
        startTs += shift;
        endTs += shift;
        cliffTs = hadNoCliff ? startTs : cliffTs + shift;
      }

      const lockup = makeLockup(address);
      const tx = await lockup.create_linear({
        sender: address,
        recipient: recipient.trim(),
        token: tokenId,
        deposited: parsed.depositStroops,
        start_ts: BigInt(startTs),
        cliff_ts: BigInt(cliffTs),
        end_ts: BigInt(endTs),
        unlock_at_start: parsed.unlockStartStroops,
        unlock_at_cliff: parsed.unlockCliffStroops,
        is_cancelable: cancelable,
        is_transferable: transferable,
      });
      const result = await tx.signAndSend();
      const streamId = result.result;
      toast.push({
        kicker: `Stream #${streamId} / created`,
        message: `${formatStroops(parsed.depositStroops)} ${symbol} streaming to ${truncAddress(recipient.trim())}.`,
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
    <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24 pt-10 sm:pt-16 md:pt-24 xl:pt-28">
      <div className="grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px] 2xl:grid-cols-[1fr_560px] gap-x-8 lg:gap-x-10 xl:gap-x-16 2xl:gap-x-20 gap-y-10 items-start">
        <div className="max-w-[720px] xl:max-w-[860px] 2xl:max-w-[1000px]">
        {/* Eyebrow + headline */}
        <p className="eyebrow mb-6 sm:mb-8 xl:text-[0.78rem] 2xl:text-[0.85rem]">
          <span className="text-sand">·</span>{' '}
          <span className="ml-1">Stage 0</span>{' '}
          <span className="mx-2 text-stroke-2">/</span> Create a linear stream
        </p>

        <h1 className="headline text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-[7rem] 2xl:text-[8.5rem] text-cream">
          Define the
          <br />
          <span className="text-sand-bright">schedule.</span>
        </h1>

        <p className="mt-6 sm:mt-8 xl:mt-10 max-w-[540px] xl:max-w-[640px] 2xl:max-w-[720px] text-base sm:text-lg xl:text-xl 2xl:text-2xl leading-relaxed text-cream-muted">
          Lock a SEP-41 asset and release it on a precise vesting curve. The
          recipient withdraws by the second.
        </p>

        {!hasDeployment() && (
          <NoDeploymentWarning />
        )}

        <form className="mt-10 sm:mt-16 space-y-10 sm:space-y-12" onSubmit={onSubmit} noValidate>
          {/* ---------------- 1. Token ---------------- */}
          <Field label="Token">
            <TokenPicker
              tokens={TOKENS}
              selectedId={tokenId}
              onSelect={setTokenId}
            />
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
            <AmountInput value={deposit} onChange={setDeposit} symbol={symbol} />
          </Field>

          {/* ---------------- 4-6. Schedule ---------------- */}
          <div className="grid sm:grid-cols-3 gap-x-6 gap-y-8 sm:gap-y-12">
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
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-8 sm:gap-y-12">
            <Field
              label="Unlock at start"
              hint="Lump sum released the instant the stream begins."
            >
              <AmountInput
                value={unlockAtStart}
                onChange={setUnlockAtStart}
                symbol={symbol}
              />
            </Field>
            <Field
              label="Unlock at cliff"
              hint="Lump sum released when the cliff lands."
            >
              <AmountInput
                value={unlockAtCliff}
                onChange={setUnlockAtCliff}
                symbol={symbol}
              />
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
            symbol={symbol}
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

        {/* Right-side preview pane — md+ only */}
        <aside className="hidden md:block md:sticky md:top-32">
          <p className="eyebrow text-cream-dim mb-4">· Preview</p>
          <CreatePreview
            parsed={parsed.ok ? parsed : null}
            recipient={recipient}
            symbol={symbol}
            glyphColor={selectedToken?.glyphColor}
            cancelable={cancelable}
            transferable={transferable}
          />
          <p className="mt-5 text-[11px] text-cream-dim/80 leading-relaxed">
            Curve sketch + spec sheet update live as you edit. The recipient
            will see exactly this schedule on-chain.
          </p>
        </aside>
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

function AmountInput({
  value,
  onChange,
  symbol,
}: {
  value: string;
  onChange: (s: string) => void;
  symbol: string;
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
        {symbol}
      </span>
    </div>
  );
}

const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;
function isContractId(s: string): boolean {
  return CONTRACT_ID_RE.test(s.trim());
}

function TokenPicker({
  tokens,
  selectedId,
  onSelect,
}: {
  tokens: TokenInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  // A token is "preset" if it appears in TOKENS; otherwise the user typed it
  // into the Custom field.
  const presetMatch = tokens.find((t) => t.id === selectedId);
  const initialIsCustom = !!selectedId && !presetMatch;

  const [isCustom, setIsCustom] = useState(initialIsCustom);
  const [customInput, setCustomInput] = useState(initialIsCustom ? selectedId : '');

  const trimmedCustom = customInput.trim();
  const customValid = trimmedCustom === '' || isContractId(trimmedCustom);

  function selectPreset(id: string) {
    setIsCustom(false);
    setCustomInput('');
    onSelect(id);
  }

  function activateCustom() {
    setIsCustom(true);
    // Push the current input as the active token (empty until they type)
    onSelect(trimmedCustom && isContractId(trimmedCustom) ? trimmedCustom : '');
  }

  function onCustomChange(v: string) {
    setCustomInput(v);
    if (v.trim() === '' || isContractId(v.trim())) {
      onSelect(v.trim());
    } else {
      onSelect('');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tokens.map((t) => {
          const isSelected = !isCustom && t.id === selectedId;
          return (
            <button
              key={t.id || t.symbol}
              type="button"
              onClick={() => selectPreset(t.id)}
              className={
                'inline-flex items-center gap-2 sm:px-4 py-2 px-3 rounded-none border transition-colors ' +
                (isSelected
                  ? 'border-sand bg-sand/10 text-sand-bright'
                  : 'border-stroke text-cream hover:border-stroke-2 hover:text-cream')
              }
              aria-pressed={isSelected}
            >
              <span
                className={
                  'size-[8px] rounded-full ' + (t.glyphColor || 'bg-sand')
                }
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
                {t.symbol}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={activateCustom}
          className={
            'inline-flex items-center gap-2 sm:px-4 py-2 px-3 rounded-none border transition-colors ' +
            (isCustom
              ? 'border-sand bg-sand/10 text-sand-bright'
              : 'border-stroke text-cream-dim hover:border-stroke-2 hover:text-cream')
          }
          aria-pressed={isCustom}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            + Custom
          </span>
        </button>
      </div>

      {isCustom ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.16em] text-cream-dim mb-2">
              SEP-41 token contract id
            </label>
            <input
              type="text"
              value={customInput}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder="C…"
              className={bareInputClass + ' font-mono'}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
            {!customValid && (
              <p className="mt-2 text-xs text-rose">
                Not a valid Stellar contract id (must be a 56-character C… strkey).
              </p>
            )}
            {customValid && trimmedCustom && (
              <p className="mt-2 text-xs text-success">
                Valid contract id — make sure your wallet and the recipient have a trustline if this is a classic-asset-backed SAC.
              </p>
            )}
          </div>
          <p className="text-xs text-cream-muted leading-relaxed">
            Paste the address of any SEP-41 compatible token deployed on this network.
          </p>
        </div>
      ) : (
        presetMatch && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim/80">
                SAC
              </span>
              <code className="font-mono text-xs text-cream-dim break-all">
                {presetMatch.id || '—'}
              </code>
              {presetMatch.id && <CopyButton text={presetMatch.id} />}
            </div>
            <p className="text-xs text-cream-muted leading-relaxed">
              {presetMatch.description}
            </p>
            {presetMatch.issuer && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim/80">
                  Issuer
                </span>
                <code className="font-mono text-xs text-cream-dim break-all">
                  {presetMatch.issuer}
                </code>
                <CopyButton text={presetMatch.issuer} />
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim hover:text-sand-bright transition-colors"
      aria-label="Copy"
    >
      {copied ? 'copied' : 'copy'}
    </button>
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
    <label className="flex items-center gap-5 py-4 border-t border-stroke/60 cursor-pointer select-none group">
      <Toggle checked={value} onChange={onChange} ariaLabel={label} />
      <div className="flex-1 min-w-0">
        <span className="eyebrow text-cream block group-hover:text-sand-bright transition-colors">
          {label}
        </span>
        {hint && (
          <span className="block mt-1 text-xs text-cream-dim/80 leading-snug">
            {hint}
          </span>
        )}
      </div>
      <span
        className={
          'font-mono text-[11px] uppercase tracking-[0.18em] shrink-0 ' +
          (value ? 'text-sand-bright' : 'text-cream-dim')
        }
      >
        {value ? 'On' : 'Off'}
      </span>
    </label>
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
  symbol,
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
  symbol: string;
}) {
  return (
    <div className="border-t border-stroke pt-8">
      <p className="eyebrow text-cream-dim mb-4">· Spec preview</p>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 font-mono text-xs">
        <dt className="text-cream-dim">deposit</dt>
        <dd className="text-cream">
          {parsed ? `${formatStroops(parsed.depositStroops)} ${symbol}` : '—'}
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
          {parsed
            ? `${formatStroops(parsed.unlockStartStroops)} ${symbol}`
            : '—'}
        </dd>
        <dt className="text-cream-dim">unlock @ cliff</dt>
        <dd className="text-cream">
          {parsed
            ? `${formatStroops(parsed.unlockCliffStroops)} ${symbol}`
            : '—'}
        </dd>
        <dt className="text-cream-dim">cancelable</dt>
        <dd className="text-cream">{cancelable ? 'yes' : 'no'}</dd>
        <dt className="text-cream-dim">transferable</dt>
        <dd className="text-cream">{transferable ? 'yes' : 'no'}</dd>
      </dl>
    </div>
  );
}

