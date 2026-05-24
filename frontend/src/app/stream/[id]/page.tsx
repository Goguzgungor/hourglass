'use client';

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import HourglassIcon from '@/components/HourglassIcon';
import { useWallet } from '@/lib/wallet-context';
import { useToast } from '@/lib/toast';
import { makeLockup } from '@/lib/sdk';
import { DEPLOYMENT, hasDeployment } from '@/lib/deployments';
import {
  formatStroops,
  formatTimestamp,
  formatDuration,
  truncAddress,
} from '@/lib/format';
import type { Stream, StreamStatus } from 'hourglass/lockup';

/* ----------------------------------------------------------------- *
 * Helpers                                                          *
 * ----------------------------------------------------------------- */

type Status = 'PENDING' | 'STREAMING' | 'SETTLED' | 'CANCELED' | 'DEPLETED';

function statusTag(s: StreamStatus): Status {
  return s.tag.toUpperCase() as Status;
}

function shapeLabel(s: Stream): 'LINEAR' | 'TRANCHED' {
  return s.shape.tag === 'Linear' ? 'LINEAR' : 'TRANCHED';
}

/* ----------------------------------------------------------------- *
 * Top-level page                                                   *
 * ----------------------------------------------------------------- */

export default function StreamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const streamId = Number.parseInt(id, 10);

  if (!Number.isFinite(streamId) || streamId < 1) {
    return <NotFoundView id={id} />;
  }
  if (!hasDeployment()) {
    return <NoDeploymentView />;
  }

  return <StreamDetail streamId={streamId} />;
}

/* ----------------------------------------------------------------- *
 * Detail view                                                      *
 * ----------------------------------------------------------------- */

function StreamDetail({ streamId }: { streamId: number }) {
  const { address } = useWallet();

  const [stream, setStream] = useState<Stream | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [withdrawable, setWithdrawable] = useState<bigint>(0n);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  // First load + reloader.
  const load = useCallback(async () => {
    try {
      const lockup = makeLockup(address);
      const streamTx = await lockup.get_stream({ stream_id: streamId });
      const s = streamTx.result as Stream | undefined;
      // A non-existent stream id surfaces in several shapes depending on the
      // contract's panic style and the SDK version: an HostError with code
      // "Error(Contract, #30)", a thrown SDK simulation error, or an
      // undefined/null result. Normalise all three to a NOT_FOUND view.
      if (!s || !s.token || !s.sender) {
        setMissing(true);
        return;
      }
      const statusTx = await lockup.status({ stream_id: streamId });
      const wdTx = await lockup.withdrawable_amount({ stream_id: streamId });
      setStream(s);
      setStatus(statusTag(statusTx.result));
      setWithdrawable(BigInt(wdTx.result));
      setMissing(false);
      setLoadError(null);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      if (
        msg.includes('StreamNotFound') ||
        msg.includes('#30') ||
        msg.includes('Error(Contract, #30)') ||
        msg.toLowerCase().includes('not found')
      ) {
        setMissing(true);
      } else {
        setLoadError(msg);
      }
    }
  }, [address, streamId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll withdrawable amount every 3s while streaming.
  useEffect(() => {
    if (!stream || status !== 'STREAMING') return;
    const handle = setInterval(async () => {
      try {
        const lockup = makeLockup(address);
        const wdTx = await lockup.withdrawable_amount({ stream_id: streamId });
        setWithdrawable(BigInt(wdTx.result));
        // Also refresh status — it may transition to SETTLED while we poll.
        const statusTx = await lockup.status({ stream_id: streamId });
        setStatus(statusTag(statusTx.result));
      } catch {
        /* transient — silent */
      }
    }, 3000);
    return () => clearInterval(handle);
  }, [stream, status, streamId, address]);

  if (missing) return <StreamNotFoundView id={streamId} />;
  if (loadError) return <RpcErrorView message={loadError} />;
  if (!stream || !status) return <SkeletonView id={streamId} />;

  return (
    <LoadedStream
      streamId={streamId}
      stream={stream}
      status={status}
      withdrawable={withdrawable}
      reload={load}
    />
  );
}

/* ----------------------------------------------------------------- *
 * Loaded view                                                      *
 * ----------------------------------------------------------------- */

function LoadedStream({
  streamId,
  stream,
  status,
  withdrawable,
  reload,
}: {
  streamId: number;
  stream: Stream;
  status: Status;
  withdrawable: bigint;
  reload: () => Promise<void>;
}) {
  const { address } = useWallet();
  const toast = useToast();

  // Derive a 0..1 fraction of remaining (i.e. sand still in the top bulb).
  const remainingFraction = useMemo(() => {
    if (stream.deposited <= 0n) return 0;
    const claimed = BigInt(stream.withdrawn) + BigInt(stream.refunded);
    const remaining = BigInt(stream.deposited) - claimed;
    if (remaining <= 0n) return 0;
    const pct = Number((remaining * 10_000n) / BigInt(stream.deposited)) / 10_000;
    return Math.max(0, Math.min(1, pct));
  }, [stream]);

  const startTs = Number(stream.start_ts);
  const endTs = Number(stream.end_ts);
  const cliffTs = Number(stream.shape.tag === 'Linear'
    ? stream.shape.values[0].cliff_ts
    : stream.start_ts);
  const hasCliff =
    stream.shape.tag === 'Linear' && cliffTs > startTs;
  const duration = Math.max(0, endTs - startTs);

  const isSender = !!address && address === stream.sender;
  const isRecipient = !!address && address === stream.recipient;

  const [pendingAction, setPendingAction] = useState<
    null | 'withdraw' | 'cancel' | 'renounce'
  >(null);

  const callWithdraw = async () => {
    if (!isRecipient) return;
    setPendingAction('withdraw');
    try {
      const lockup = makeLockup(address);
      const tx = await lockup.withdraw_max({
        stream_id: streamId,
        to: stream.recipient,
      });
      await tx.signAndSend();
      toast.push({
        kicker: `Stream #${streamId} / withdrawn`,
        message: `${formatStroops(withdrawable)} XLM sent to ${truncAddress(stream.recipient)}.`,
      });
      await reload();
    } catch (e) {
      console.error(e);
      toast.push({
        kicker: 'Withdraw failed',
        message: (e as Error).message,
      });
    } finally {
      setPendingAction(null);
    }
  };

  const callCancel = async () => {
    if (!isSender) return;
    setPendingAction('cancel');
    try {
      const lockup = makeLockup(address);
      const tx = await lockup.cancel({ stream_id: streamId });
      await tx.signAndSend();
      toast.push({
        kicker: `Stream #${streamId} / canceled`,
        message: 'Unstreamed balance returned to sender.',
      });
      await reload();
    } catch (e) {
      console.error(e);
      toast.push({
        kicker: 'Cancel failed',
        message: (e as Error).message,
      });
    } finally {
      setPendingAction(null);
    }
  };

  const [renounceModal, setRenounceModal] = useState(false);
  const callRenounce = async () => {
    if (!isSender) return;
    setRenounceModal(false);
    setPendingAction('renounce');
    try {
      const lockup = makeLockup(address);
      const tx = await lockup.renounce({ stream_id: streamId });
      await tx.signAndSend();
      toast.push({
        kicker: `Stream #${streamId} / renounced`,
        message: 'Cancelability permanently removed.',
      });
      await reload();
    } catch (e) {
      console.error(e);
      toast.push({
        kicker: 'Renounce failed',
        message: (e as Error).message,
      });
    } finally {
      setPendingAction(null);
    }
  };

  const canWithdraw = isRecipient && withdrawable > 0n;
  const canCancel =
    isSender &&
    (status === 'PENDING' || status === 'STREAMING') &&
    stream.is_cancelable;
  const canRenounce = isSender && stream.is_cancelable;

  return (
    <div className="mx-auto max-w-[1280px] px-6 sm:px-10 pt-16 sm:pt-24 pb-16">
      {/* Eyebrow + status */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-6">
        <p className="eyebrow">
          <span className="text-sand">·</span>{' '}
          <span className="ml-1">Stream #{streamId}</span>{' '}
          <span className="mx-2 text-stroke-2">/</span>
          {shapeLabel(stream)}
        </p>
        <StatusPill status={status} />
      </div>

      {/* Headline */}
      <h1 className="headline text-[clamp(2.5rem,6vw,5rem)] text-cream">
        {formatStroops(stream.deposited)}
        <span className="ml-3 font-mono text-base text-cream-dim uppercase tracking-[0.18em] not-italic">
          XLM
        </span>
      </h1>
      <p className="mt-6 max-w-[640px] text-lg leading-relaxed text-cream-muted">
        Streaming from{' '}
        <span className="font-mono text-cream">
          {truncAddress(stream.sender)}
        </span>{' '}
        to{' '}
        <span className="font-mono text-cream">
          {truncAddress(stream.recipient)}
        </span>{' '}
        over {formatDuration(duration)}.
      </p>

      {/* Two-column grid: hourglass + key/value */}
      <div className="mt-14 grid md:grid-cols-12 gap-x-10 gap-y-12">
        {/* Left — hourglass */}
        <div className="md:col-span-5 flex flex-col items-center md:items-start">
          <div className="reveal">
            <HourglassIcon size={240} fill={remainingFraction} animated />
          </div>
          <div className="mt-8 text-center md:text-left w-full">
            <p className="eyebrow text-cream-dim mb-3">Withdrawable now</p>
            <p className="headline text-5xl text-sand-bright leading-none">
              {formatStroops(withdrawable)}
              <span className="ml-3 font-mono text-xs text-cream-dim uppercase tracking-[0.18em] not-italic align-baseline">
                XLM
              </span>
            </p>
            {status === 'STREAMING' && (
              <p className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-cream-dim">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 bg-success rounded-full animate-ping opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                Live · updates every 3s
              </p>
            )}
          </div>
        </div>

        {/* Right — k/v list */}
        <div className="md:col-span-7">
          <Row label="Sender">
            <CopyableAddress addr={stream.sender} />
          </Row>
          <Row label="Recipient">
            <CopyableAddress addr={stream.recipient} />
          </Row>
          <Row label="Token">
            <span className="font-mono text-xs text-cream-dim break-all">
              {truncAddress(stream.token)}
            </span>
          </Row>
          <Row label="Start">
            <span className="font-mono text-sm text-cream">
              {formatTimestamp(startTs)}
            </span>
          </Row>
          <Row label="Cliff">
            <span className="font-mono text-sm text-cream">
              {hasCliff ? formatTimestamp(cliffTs) : '—'}
            </span>
          </Row>
          <Row label="End">
            <span className="font-mono text-sm text-cream">
              {formatTimestamp(endTs)}
            </span>
          </Row>
          <Row label="Deposited">
            <span className="font-mono text-sm text-cream">
              {formatStroops(stream.deposited)} XLM
            </span>
          </Row>
          <Row label="Withdrawn so far">
            <span className="font-mono text-sm text-cream">
              {formatStroops(stream.withdrawn)} XLM
            </span>
          </Row>
          <Row label="Refunded">
            <span className="font-mono text-sm text-cream">
              {formatStroops(stream.refunded)} XLM
            </span>
          </Row>
          <Row label="Cancelable">
            <Yesno value={stream.is_cancelable} />
          </Row>
          <Row label="Transferable" last>
            <Yesno value={stream.is_transferable} />
          </Row>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-16 border-t border-stroke pt-10">
        <p className="eyebrow text-cream-dim mb-6">· Actions</p>
        <div className="flex flex-col md:flex-row gap-3">
          <ActionButton
            variant="primary"
            disabled={!canWithdraw || pendingAction !== null}
            pending={pendingAction === 'withdraw'}
            onClick={callWithdraw}
          >
            Withdraw {canWithdraw && `· ${formatStroops(withdrawable)} XLM`}
          </ActionButton>
          <ActionButton
            variant="secondary"
            disabled={!canCancel || pendingAction !== null}
            pending={pendingAction === 'cancel'}
            onClick={callCancel}
          >
            Cancel stream
          </ActionButton>
          <ActionButton
            variant="tertiary"
            disabled={!canRenounce || pendingAction !== null}
            pending={pendingAction === 'renounce'}
            onClick={() => setRenounceModal(true)}
          >
            Renounce cancelability
          </ActionButton>
        </div>
        {!address && (
          <p className="mt-4 text-xs text-cream-dim">
            Connect a wallet to interact with this stream.
          </p>
        )}
      </div>

      {/* Events */}
      <EventsLog streamId={streamId} />

      {renounceModal && (
        <Modal onDismiss={() => setRenounceModal(false)}>
          <p className="eyebrow text-warning mb-3">· Confirm</p>
          <h3 className="headline-roman text-2xl text-cream mb-4">
            Renounce cancelability?
          </h3>
          <p className="text-sm text-cream-muted leading-relaxed mb-8">
            This is irreversible — the stream becomes permanently uncancelable.
            Continue?
          </p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setRenounceModal(false)}
              className="text-[11px] uppercase tracking-[0.18em] px-5 py-2 border border-stroke text-cream-dim hover:text-cream hover:border-cream-dim transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={callRenounce}
              className="text-[11px] uppercase tracking-[0.18em] px-5 py-2 border border-warning text-warning hover:bg-warning/10 transition-colors"
            >
              Renounce →
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Subcomponents                                                    *
 * ----------------------------------------------------------------- */

function StatusPill({ status }: { status: Status }) {
  const styles: Record<Status, { color: string; pulse: boolean; line?: boolean }> = {
    PENDING: { color: 'text-cream-dim border-cream-dim/40', pulse: false },
    STREAMING: { color: 'text-sand-bright border-sand', pulse: true },
    SETTLED: { color: 'text-success border-success/60', pulse: false },
    CANCELED: { color: 'text-warning border-warning/60', pulse: false },
    DEPLETED: {
      color: 'text-cream-dim border-cream-dim/40',
      pulse: false,
      line: true,
    },
  };
  const s = styles[status];
  return (
    <span
      className={
        'inline-flex items-center gap-2 border px-3 py-1 text-[10px] uppercase tracking-[0.22em] rounded-none ' +
        s.color
      }
    >
      {s.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 bg-sand rounded-full animate-ping opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sand" />
        </span>
      )}
      <span className={s.line ? 'line-through' : ''}>{status}</span>
    </span>
  );
}

function Row({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={
        'grid grid-cols-[140px_1fr] items-baseline gap-x-6 py-3 ' +
        (last ? '' : 'border-b border-stroke/40')
      }
    >
      <dt className="eyebrow text-cream-dim">{label}</dt>
      <dd className="text-right md:text-left">{children}</dd>
    </div>
  );
}

function Yesno({ value }: { value: boolean }) {
  return (
    <span
      className={
        'font-mono text-xs uppercase tracking-[0.18em] ' +
        (value ? 'text-sand-bright' : 'text-cream-dim')
      }
    >
      {value ? 'Yes' : 'No'}
    </span>
  );
}

function CopyableAddress({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={addr}
      className="font-mono text-sm text-cream hover:text-sand-bright transition-colors inline-flex items-center gap-2"
    >
      {truncAddress(addr)}
      <span
        className={
          'text-[10px] uppercase tracking-[0.18em] ' +
          (copied ? 'text-success' : 'text-cream-dim')
        }
      >
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}

function ActionButton({
  variant,
  disabled,
  pending,
  onClick,
  children,
}: {
  variant: 'primary' | 'secondary' | 'tertiary';
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 px-6 py-3 text-[11px] uppercase tracking-[0.18em] font-medium rounded-none border transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex-1';
  const styles = {
    primary:
      'bg-sand text-night border-sand hover:bg-sand-bright hover:border-sand-bright disabled:hover:bg-sand disabled:hover:border-sand',
    secondary:
      'text-sand border-sand/60 hover:border-sand hover:text-sand-bright hover:bg-sand/5',
    tertiary:
      'text-cream-dim border-stroke hover:border-cream-dim hover:text-cream',
  } as const;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${styles[variant]}`}
    >
      {pending ? '…' : children}
    </button>
  );
}

function Modal({
  children,
  onDismiss,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="max-w-[440px] w-full mx-6 bg-midnight border border-stroke p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Events log                                                       *
 * ----------------------------------------------------------------- */

type EventRow = {
  id: string;
  kind: string;
  ts: string;
  txHash: string;
};

function EventsLog({ streamId }: { streamId: number }) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { rpc } = await import('@stellar/stellar-sdk');
        const server = new rpc.Server(DEPLOYMENT.rpcUrl, { allowHttp: true });
        // Try a generous backwindow — Soroban RPC keeps recent ledgers only.
        const latest = await server.getLatestLedger();
        const startLedger = Math.max(1, latest.sequence - 200_000);
        const res = await server.getEvents({
          startLedger,
          filters: [
            {
              type: 'contract',
              contractIds: [DEPLOYMENT.lockup],
            },
          ],
          limit: 200,
        });
        if (cancelled) return;
        // Decode topics to names — first topic is usually a symbol like "created".
        const { scValToNative } = await import('@stellar/stellar-sdk');
        const rows: EventRow[] = res.events
          .map((ev) => {
            const decodedTopics: unknown[] = ev.topic.map((t) => {
              try {
                return scValToNative(t);
              } catch {
                return null;
              }
            });
            const kind = String(decodedTopics[0] ?? '?');
            // Heuristic: stream id is typically among the topics or in the value.
            // We surface every event for the contract; per-stream filtering would
            // need decoded value parsing. For MVP, tag the row with the kind.
            let value: unknown = null;
            try {
              value = scValToNative(ev.value);
            } catch {
              /* noop */
            }
            // Try to find the streamId in topics or value.
            const inTopics = decodedTopics.some(
              (t) => typeof t === 'number' && t === streamId,
            );
            const inValue =
              (typeof value === 'number' && value === streamId) ||
              (typeof value === 'object' &&
                value !== null &&
                JSON.stringify(value).includes(`"stream_id":${streamId}`));
            if (!inTopics && !inValue) return null;
            return {
              id: ev.id,
              kind: kind.toUpperCase(),
              ts: ev.ledgerClosedAt,
              txHash: ev.txHash,
            };
          })
          .filter((r): r is EventRow => r !== null);
        setEvents(rows);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  return (
    <div className="mt-16 border-t border-stroke pt-10">
      <p className="eyebrow text-cream-dim mb-6">· Events</p>
      {error && (
        <p className="font-mono text-xs text-danger border-l-2 border-danger pl-4 py-2">
          RPC error: {error}
        </p>
      )}
      {events === null && !error && (
        <p className="text-xs text-cream-dim">Loading events…</p>
      )}
      {events && events.length === 0 && (
        <p className="text-xs text-cream-dim">
          No events for this stream yet.
        </p>
      )}
      {events && events.length > 0 && (
        <ul className="space-y-0">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="grid grid-cols-[180px_140px_1fr] items-baseline gap-x-6 py-3 border-b border-stroke/40"
            >
              <span className="font-mono text-xs text-cream-dim">
                {new Date(ev.ts).toLocaleString(undefined, {
                  month: 'short',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className="eyebrow text-sand">{ev.kind}</span>
              <span className="font-mono text-xs text-cream-dim break-all">
                tx {ev.txHash.slice(0, 8)}…
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Error / placeholder views                                        *
 * ----------------------------------------------------------------- */

function NotFoundView({ id }: { id: string }) {
  return (
    <div className="mx-auto max-w-[720px] px-6 sm:px-10 pt-32 text-center">
      <h1 className="headline text-6xl text-cream">No stream at #{id}.</h1>
      <p className="mt-8 text-cream-muted">
        Stream ids start at 1 and increase by one per creation.
      </p>
      <Link
        href="/create"
        className="mt-12 inline-block text-[11px] uppercase tracking-[0.18em] text-sand hover:text-sand-bright transition-colors border-b border-sand/60 hover:border-sand pb-1"
      >
        ← Back to create
      </Link>
    </div>
  );
}

function StreamNotFoundView({ id }: { id: number }) {
  return <NotFoundView id={String(id)} />;
}

function NoDeploymentView() {
  return (
    <div className="mx-auto max-w-[720px] px-6 sm:px-10 pt-32 text-center">
      <p className="eyebrow text-warning mb-6">· No deployment</p>
      <h1 className="headline text-5xl text-cream mb-8">
        The contract isn’t live yet.
      </h1>
      <p className="text-cream-muted leading-relaxed">
        Run{' '}
        <span className="font-mono text-cream">
          ./scripts/quickstart-up.sh
        </span>{' '}
        and{' '}
        <span className="font-mono text-cream">
          ./scripts/deploy-local.sh
        </span>{' '}
        from the repo root, then restart the dev server.
      </p>
    </div>
  );
}

function RpcErrorView({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-[720px] px-6 sm:px-10 pt-32">
      <div className="border border-warning/40 bg-warning/5 px-6 py-5">
        <p className="eyebrow text-warning mb-3">· RPC unreachable</p>
        <p className="text-sm text-cream-muted leading-relaxed">
          Could not reach{' '}
          <span className="font-mono text-cream">{DEPLOYMENT.rpcUrl}</span>.
        </p>
        <p className="mt-4 font-mono text-xs text-cream-dim break-all">
          {message}
        </p>
      </div>
    </div>
  );
}

function SkeletonView({ id }: { id: number }) {
  return (
    <div className="mx-auto max-w-[1280px] px-6 sm:px-10 pt-24">
      <p className="eyebrow">
        <span className="text-sand">·</span>{' '}
        <span className="ml-1">Stream #{id}</span>{' '}
        <span className="mx-2 text-stroke-2">/</span> loading…
      </p>
      <div className="mt-12 grid md:grid-cols-12 gap-x-10">
        <div className="md:col-span-5 flex justify-center md:justify-start opacity-40">
          <HourglassIcon size={240} fill={0.5} animated />
        </div>
        <div className="md:col-span-7 space-y-3 mt-8 md:mt-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-6 border-b border-stroke/40 animate-pulse bg-stroke/20"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
