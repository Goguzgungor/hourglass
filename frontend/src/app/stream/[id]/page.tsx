'use client';

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
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

import StreamRiver from '@/components/StreamRiver';
import ScheduleTimeline from '@/components/ScheduleTimeline';
import AmountTile from '@/components/AmountTile';
import LiveCounter from '@/components/LiveCounter';
import WithdrawButton from '@/components/WithdrawButton';
import StatusPill, { type StreamStatusTag } from '@/components/StatusPill';

/* ----------------------------------------------------------------- *
 * Helpers                                                          *
 * ----------------------------------------------------------------- */

type Status = StreamStatusTag;

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
  const [withdrawableTs, setWithdrawableTs] = useState<number>(Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const lockup = makeLockup(address);
      const streamTx = await lockup.get_stream({ stream_id: streamId });
      const s = streamTx.result as Stream | undefined;
      if (!s || !s.token || !s.sender) {
        setMissing(true);
        return;
      }
      const statusTx = await lockup.status({ stream_id: streamId });
      const wdTx = await lockup.withdrawable_amount({ stream_id: streamId });
      setStream(s);
      setStatus(statusTag(statusTx.result));
      setWithdrawable(BigInt(wdTx.result));
      setWithdrawableTs(Date.now());
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

  // Poll withdrawable every 3s while streaming.
  useEffect(() => {
    if (!stream || status !== 'STREAMING') return;
    const handle = setInterval(async () => {
      try {
        const lockup = makeLockup(address);
        const wdTx = await lockup.withdrawable_amount({ stream_id: streamId });
        setWithdrawable(BigInt(wdTx.result));
        setWithdrawableTs(Date.now());
        const statusTx = await lockup.status({ stream_id: streamId });
        setStatus(statusTag(statusTx.result));
      } catch {
        /* transient */
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
      withdrawableTs={withdrawableTs}
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
  withdrawableTs,
  reload,
}: {
  streamId: number;
  stream: Stream;
  status: Status;
  withdrawable: bigint;
  withdrawableTs: number;
  reload: () => Promise<void>;
}) {
  const { address } = useWallet();
  const toast = useToast();

  const startTs = Number(stream.start_ts);
  const endTs = Number(stream.end_ts);
  const cliffTs = Number(
    stream.shape.tag === 'Linear'
      ? stream.shape.values[0].cliff_ts
      : stream.start_ts,
  );
  const hasCliff = stream.shape.tag === 'Linear' && cliffTs > startTs;
  const duration = Math.max(0, endTs - startTs);

  const isSender = !!address && address === stream.sender;
  const isRecipient = !!address && address === stream.recipient;

  const deposited = BigInt(stream.deposited);
  const withdrawn = BigInt(stream.withdrawn);
  const refunded = BigInt(stream.refunded);
  const streamed = withdrawn + withdrawable;
  const remaining = deposited - withdrawn - refunded;

  // Per-second rate (stroops/sec), used by LiveCounter for interpolation.
  // For linear streams: deposited / (end_ts - cliff_ts).
  const ratePerSec = useMemo(() => {
    if (status !== 'STREAMING') return 0n;
    const rateDenom =
      stream.shape.tag === 'Linear'
        ? Math.max(1, endTs - cliffTs)
        : Math.max(1, endTs - startTs);
    if (deposited <= 0n || rateDenom <= 0) return 0n;
    return deposited / BigInt(rateDenom);
  }, [deposited, endTs, cliffTs, startTs, stream.shape.tag, status]);

  // Upper bound for the live counter: never project beyond what is owed.
  const counterTarget = deposited - withdrawn;

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

  const isCanceled = status === 'CANCELED' || stream.was_canceled === true;
  const isDepleted = status === 'DEPLETED' || stream.is_depleted === true;

  return (
    <div className="mx-auto max-w-[1280px] px-6 sm:px-10 pt-10 sm:pt-16 pb-16">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
        <p className="eyebrow">
          <span className="text-sand">·</span>{' '}
          <span className="ml-1">Stream #{streamId}</span>{' '}
          <span className="mx-2 text-stroke-2">/</span>
          {shapeLabel(stream)}
        </p>
        <StatusPill status={status} />
      </div>

      {/* Headline */}
      <h1 className="headline text-[clamp(2.25rem,5.5vw,4.5rem)] text-cream">
        Streaming {formatStroops(deposited)}
        <span className="ml-3 font-mono text-base text-cream-dim uppercase tracking-[0.18em] not-italic">
          XLM
        </span>
      </h1>
      <p className="mt-4 max-w-[760px] text-[15px] leading-relaxed text-cream-muted">
        from{' '}
        <CopyableAddress addr={stream.sender} />
        {' '}to{' '}
        <CopyableAddress addr={stream.recipient} />
        {' '}over {formatDuration(duration)}.
      </p>

      {/* Headline banner — StreamRiver */}
      <div className="mt-10 reveal">
        <StreamRiver
          start_ts={startTs}
          cliff_ts={cliffTs}
          end_ts={endTs}
          deposited={deposited}
          withdrawn={withdrawn}
          withdrawable={withdrawable}
          refunded={refunded}
          is_canceled={isCanceled}
          is_depleted={isDepleted}
        />
      </div>

      {/* Stats grid */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 reveal" style={{ animationDelay: '80ms' }}>
        <AmountTile
          label="Deposited"
          amount={formatStroops(deposited)}
          accent="cream"
          tooltip="Total amount locked when the stream was created."
        />
        <AmountTile
          label="Streamed"
          amount={formatStroops(streamed)}
          accent="sand"
          tooltip="What has unlocked so far, including already-withdrawn funds."
        />
        <AmountTile
          label="Withdrawable now"
          amount={formatStroops(withdrawable)}
          accent="teal"
          pulse
          tooltip="Available for the recipient to claim right now."
        />
        <AmountTile
          label="Withdrawn"
          amount={formatStroops(withdrawn)}
          accent="cream-muted"
          tooltip="What the recipient has already pulled from the stream."
        />
        {refunded > 0n && (
          <AmountTile
            label="Refunded"
            amount={formatStroops(refunded)}
            accent="rose"
            tooltip="Returned to the sender after a cancelation."
          />
        )}
      </div>

      {/* Schedule timeline */}
      <div className="mt-8 reveal" style={{ animationDelay: '120ms' }}>
        <ScheduleTimeline
          start_ts={startTs}
          cliff_ts={hasCliff ? cliffTs : startTs}
          end_ts={endTs}
        />
      </div>

      {/* Live counter + Withdraw */}
      <section className="mt-12 grid md:grid-cols-12 gap-y-6 md:gap-x-10 items-end">
        <div className="md:col-span-7">
          <p className="eyebrow text-cream-dim mb-3">· Available to claim</p>
          <LiveCounter
            currentValue={withdrawable}
            targetValue={counterTarget > 0n ? counterTarget : withdrawable}
            rate={ratePerSec}
            lastUpdateMs={withdrawableTs}
            format={(n) => formatStroops(n)}
          />
          <p className="mt-3 font-mono text-xs text-cream-dim flex items-center gap-2">
            <span className="text-teal-bright">+</span>
            {formatStroops(ratePerSec)}{' '}
            <span className="uppercase tracking-[0.18em] text-cream-dim/80">
              XLM / sec
            </span>
            {status === 'STREAMING' && (
              <>
                <span className="text-stroke-2">·</span>
                <span className="inline-flex items-center gap-1.5 text-teal-bright">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 bg-teal-bright rounded-full animate-ping opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-bright" />
                  </span>
                  Live
                </span>
              </>
            )}
          </p>
        </div>
        <div className="md:col-span-5 flex md:justify-end">
          <WithdrawButton
            variant="primary"
            disabled={!canWithdraw || pendingAction !== null}
            loading={pendingAction === 'withdraw'}
            onClick={callWithdraw}
          >
            {canWithdraw
              ? `Withdraw ${formatStroops(withdrawable)} XLM →`
              : isRecipient
                ? 'Nothing to withdraw yet'
                : 'Recipient only'}
          </WithdrawButton>
        </div>
      </section>

      {/* Metadata grid */}
      <section className="mt-16 border-t border-stroke pt-10">
        <p className="eyebrow text-cream-dim mb-6">· Receipt</p>
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-0">
          <Meta label="Sender">
            <CopyableAddress addr={stream.sender} />
          </Meta>
          <Meta label="Recipient">
            <CopyableAddress addr={stream.recipient} />
          </Meta>
          <Meta label="Token">
            <span className="font-mono text-xs text-cream-dim break-all">
              {truncAddress(stream.token)}
            </span>
          </Meta>
          <Meta label="Stream ID">
            <span className="font-mono text-xs text-cream">#{streamId}</span>
          </Meta>
          <Meta label="Start">
            <span className="font-mono text-xs text-cream">
              {formatTimestamp(startTs)}
            </span>
          </Meta>
          <Meta label="End">
            <span className="font-mono text-xs text-cream">
              {formatTimestamp(endTs)}
            </span>
          </Meta>
          <Meta label="Cliff">
            <span className="font-mono text-xs text-cream">
              {hasCliff ? formatTimestamp(cliffTs) : '— (no cliff)'}
            </span>
          </Meta>
          <Meta label="Duration">
            <span className="font-mono text-xs text-cream">
              {formatDuration(duration)}
            </span>
          </Meta>
          <Meta label="Cancelable">
            <Yesno value={stream.is_cancelable} />
          </Meta>
          <Meta label="Transferable" last>
            <Yesno value={stream.is_transferable} />
          </Meta>
        </div>
      </section>

      {/* Sender actions */}
      {isSender && (
        <section className="mt-16 border-t border-stroke pt-10">
          <p className="eyebrow text-cream-dim mb-6">· Sender actions</p>
          <div className="flex flex-col md:flex-row gap-3">
            <WithdrawButton
              variant="danger"
              fullWidthMobile
              disabled={!canCancel || pendingAction !== null}
              loading={pendingAction === 'cancel'}
              onClick={callCancel}
            >
              Cancel stream
            </WithdrawButton>
            <WithdrawButton
              variant="secondary"
              fullWidthMobile
              disabled={!canRenounce || pendingAction !== null}
              loading={pendingAction === 'renounce'}
              onClick={() => setRenounceModal(true)}
            >
              Renounce cancelability
            </WithdrawButton>
          </div>
        </section>
      )}

      {!address && (
        <p className="mt-6 text-xs text-cream-dim">
          Connect a wallet to interact with this stream.
        </p>
      )}

      {/* Activity */}
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
              className="text-[11px] uppercase tracking-[0.18em] px-5 py-2 border border-stroke text-cream-dim hover:text-cream hover:border-cream-dim transition-colors rounded-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={callRenounce}
              className="text-[11px] uppercase tracking-[0.18em] px-5 py-2 border border-warning text-warning hover:bg-warning/10 transition-colors rounded-sm"
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

function Meta({
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
        'grid grid-cols-[120px_1fr] items-baseline gap-x-4 py-3 ' +
        (last ? '' : 'border-b border-stroke/40')
      }
    >
      <dt className="eyebrow text-cream-dim">{label}</dt>
      <dd className="text-left">{children}</dd>
    </div>
  );
}

function Yesno({ value }: { value: boolean }) {
  return (
    <span
      className={
        'font-mono text-xs uppercase tracking-[0.18em] ' +
        (value ? 'text-teal-bright' : 'text-cream-dim')
      }
    >
      {value ? 'Yes' : 'No'}
    </span>
  );
}

function CopyableAddress({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={addr}
      className="font-mono text-xs text-cream hover:text-sand-bright transition-colors inline-flex items-center gap-2 align-baseline"
    >
      {truncAddress(addr)}
      <span
        className={
          'text-[9px] uppercase tracking-[0.18em] ' +
          (copied ? 'text-teal-bright' : 'text-cream-dim')
        }
      >
        {copied ? 'copied' : 'copy'}
      </span>
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
        className="max-w-[440px] w-full mx-6 bg-midnight border border-stroke p-8 rounded-sm"
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
            let value: unknown = null;
            try {
              value = scValToNative(ev.value);
            } catch {
              /* noop */
            }
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
    <section className="mt-16 border-t border-stroke pt-10">
      <p className="eyebrow text-cream-dim mb-6">· Activity</p>
      {error && (
        <p className="font-mono text-xs text-rose border-l-2 border-rose pl-4 py-2">
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
              <span className="eyebrow text-teal-bright">{ev.kind}</span>
              <span className="font-mono text-xs text-cream-dim break-all">
                tx {ev.txHash.slice(0, 8)}…
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
      <div className="border border-warning/40 bg-warning/5 px-6 py-5 rounded-sm">
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
    <div className="mx-auto max-w-[1280px] px-6 sm:px-10 pt-16">
      <p className="eyebrow">
        <span className="text-sand">·</span>{' '}
        <span className="ml-1">Stream #{id}</span>{' '}
        <span className="mx-2 text-stroke-2">/</span> loading…
      </p>
      <div className="mt-10 h-[280px] border border-stroke bg-midnight/50 animate-pulse rounded-sm" />
      <div className="mt-6 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 border border-stroke bg-midnight/40 animate-pulse rounded-sm"
          />
        ))}
      </div>
    </div>
  );
}
