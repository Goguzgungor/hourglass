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
  isStellarAddress,
  truncAddress,
} from '@/lib/format';
import type { Stream, StreamStatus } from 'hourglass/lockup';
import type { StreamShape as ViewShape } from '@/components/LiveCounter';

import CelestialDial from '@/components/CelestialDial';
import EmissionChart from '@/components/EmissionChart';
import TabBar from '@/components/TabBar';
import DialActionGrid from '@/components/DialActionGrid';
import AttributePill from '@/components/AttributePill';
import Toggle from '@/components/Toggle';
import ScheduleTimeline from '@/components/ScheduleTimeline';
import AmountTile from '@/components/AmountTile';
import StatusPill, { type StreamStatusTag } from '@/components/StatusPill';
import NFTReceiptCard from '@/components/NFTReceiptCard';

/* ----------------------------------------------------------------- *
 * Helpers                                                          *
 * ----------------------------------------------------------------- */

type Status = StreamStatusTag;

function statusTag(s: StreamStatus): Status {
  return s.tag.toUpperCase() as Status;
}

type ShapeLabel = 'LINEAR' | 'TRANCHED' | 'RECURRING';

function shapeLabel(s: Stream): ShapeLabel {
  if (s.shape.tag === 'Linear') return 'LINEAR';
  if (s.shape.tag === 'Tranched') return 'TRANCHED';
  return 'RECURRING';
}

function shapeTitle(s: Stream): string {
  const l = shapeLabel(s);
  return l === 'LINEAR' ? 'Linear' : l === 'RECURRING' ? 'Recurring' : 'Tranched';
}

/**
 * View-model shape consumed by CelestialDial / LiveCounter / EmissionChart.
 */
function viewShape(s: Stream): ViewShape {
  if (s.shape.tag === 'Linear') {
    return {
      tag: 'Linear',
      cliff_ts: Number(s.shape.values[0].cliff_ts),
      unlock_at_start: BigInt(s.shape.values[0].unlock_at_start),
      unlock_at_cliff: BigInt(s.shape.values[0].unlock_at_cliff),
    };
  }
  if (s.shape.tag === 'Tranched') {
    return {
      tag: 'Tranched',
      tranches: s.shape.values[0].tranches.map((t) => ({
        amount: BigInt(t.amount),
        ts: Number(t.ts),
      })),
    };
  }
  const r = s.shape.values[0];
  return {
    tag: 'Recurring',
    first_ts: Number(r.first_ts),
    period_secs: Number(r.period_secs),
    count: Number(r.count),
    amount_per_period: BigInt(r.amount_per_period),
  };
}

const RENDERED_UNLOCKS = 24;

/** First `n` unlocks of a recurring shape as tranche points (for the unlock list). */
function recurringPreview(
  r: Extract<ViewShape, { tag: 'Recurring' }>,
  n: number = RENDERED_UNLOCKS,
): Array<{ amount: bigint; ts: number }> {
  const shown = Math.min(n, r.count);
  return Array.from({ length: shown }, (_, i) => ({ amount: r.amount_per_period, ts: r.first_ts + i * r.period_secs }));
}

/**
 * Up to `n` chart points sampled evenly across a recurring schedule (always
 * including the last unlock). Amounts are cumulative differences, so summing
 * them reproduces the total at each sampled point and `deposited` at the end.
 */
function recurringChartTranches(
  r: Extract<ViewShape, { tag: 'Recurring' }>,
  n: number = RENDERED_UNLOCKS,
): Array<{ amount: bigint; ts: number }> {
  const shown = Math.min(n, r.count);
  if (shown <= 0) return [];
  const out: Array<{ amount: bigint; ts: number }> = [];
  let prev = -1;
  for (let i = 0; i < shown; i++) {
    // last sample is always the final unlock (index count-1)
    const k = i === shown - 1 ? r.count - 1 : Math.floor(((i + 1) * r.count) / shown) - 1;
    const idx = Math.max(k, prev + 1);
    out.push({ amount: r.amount_per_period * BigInt(idx - prev), ts: r.first_ts + idx * r.period_secs });
    prev = idx;
  }
  return out;
}

/**
 * Approximate "sand remaining" fill for the NFT receipt hourglass icon.
 * 1.0 → full upper bulb (pending), 0.0 → fully drained (settled/depleted).
 */
function fillFromStatus(
  status: Status,
  withdrawn: bigint,
  deposited: bigint,
): number {
  if (status === 'PENDING') return 1;
  if (status === 'DEPLETED' || status === 'SETTLED') return 0;
  if (deposited <= 0n) return 0.5;
  const drained = Number(withdrawn) / Number(deposited);
  return Math.max(0, Math.min(1, 1 - drained));
}

/* ----------------------------------------------------------------- *
 * Inline icons (no extra dependency)                                *
 * ----------------------------------------------------------------- */

function IconWithdraw() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCancel() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 5l14 14M19 5L5 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRenounce() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9.5-4.6-1.2-8-5-8-9.5V7l8-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5 5l14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTransfer() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 11h13m0 0l-4-4m4 4l-4 4M21 13H8m0 0l4-4m-4 4l4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAtSign() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-3.5 7.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShape() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 18L11 7l5 6 5-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCoin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 9h4a2 2 0 010 4h-4m0-4v6m0-2h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconHash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDeposit() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v9m0 0l-3-3m3 3l3-3M5 16v3a2 2 0 002 2h10a2 2 0 002-2v-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck({ value }: { value: boolean }) {
  return value ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l5 5L20 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
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
 * Detail view (data + polling)                                     *
 * ----------------------------------------------------------------- */

function StreamDetail({ streamId }: { streamId: number }) {
  const { address } = useWallet();

  const [stream, setStream] = useState<Stream | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [withdrawable, setWithdrawable] = useState<bigint>(0n);
  const [withdrawableTs, setWithdrawableTs] = useState<number>(Date.now());
  const [nftOwner, setNftOwner] = useState<string | null>(null);
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
      // NFT owner — token_id is the same as the stream id (one NFT per
      // stream). If the stream was burned this throws; treat as "no owner".
      try {
        const ownerTx = await lockup.owner_of({ token_id: streamId });
        setNftOwner(String(ownerTx.result));
      } catch {
        setNftOwner(null);
      }
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
      nftOwner={nftOwner}
      reload={load}
    />
  );
}

/* ----------------------------------------------------------------- *
 * Loaded view                                                      *
 * ----------------------------------------------------------------- */

type TabId = 'stream' | 'schedule' | 'emission' | 'nft' | 'events';
const TAB_IDS: TabId[] = ['stream', 'schedule', 'emission', 'nft', 'events'];

function isTabId(v: string): v is TabId {
  return (TAB_IDS as readonly string[]).includes(v);
}

function LoadedStream({
  streamId,
  stream,
  status,
  withdrawable,
  withdrawableTs,
  nftOwner,
  reload,
}: {
  streamId: number;
  stream: Stream;
  status: Status;
  withdrawable: bigint;
  withdrawableTs: number;
  nftOwner: string | null;
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
  const vshape = useMemo(() => viewShape(stream), [stream]);

  const isSender = !!address && address === stream.sender;
  const isRecipient = !!address && address === stream.recipient;

  const deposited = BigInt(stream.deposited);
  const withdrawn = BigInt(stream.withdrawn);
  const refunded = BigInt(stream.refunded);
  const streamed = withdrawn + withdrawable;

  // Per-second linear rate (stroops/sec). For Linear: net deposit minus
  // lump-sum unlocks, divided by the vesting span [cliff, end). For Tranched:
  // average rate over the full window — informational only since tranched
  // streams emit in discrete jumps, not continuously.
  const ratePerSec = useMemo(() => {
    if (status !== 'STREAMING') return 0n;
    if (stream.shape.tag === 'Linear') {
      const span = Math.max(1, endTs - cliffTs);
      const unlockStart = BigInt(stream.shape.values[0].unlock_at_start);
      const unlockCliff = BigInt(stream.shape.values[0].unlock_at_cliff);
      const base = deposited - unlockStart - unlockCliff;
      if (base <= 0n) return 0n;
      return base / BigInt(span);
    }
    const span = Math.max(1, endTs - startTs);
    if (deposited <= 0n) return 0n;
    return deposited / BigInt(span);
  }, [deposited, endTs, cliffTs, startTs, stream.shape, status]);

  const [pendingAction, setPendingAction] = useState<
    null | 'withdraw' | 'cancel' | 'renounce' | 'transfer'
  >(null);

  /* ---------- mutations ---------- */

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

  const [transferModal, setTransferModal] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const callTransfer = async () => {
    if (!isRecipient) return;
    setPendingAction('transfer');
    try {
      const lockup = makeLockup(address);
      const tx = await lockup.withdraw_max_and_transfer({
        stream_id: streamId,
        new_owner: transferTo.trim(),
      });
      await tx.signAndSend();
      toast.push({
        kicker: `Stream #${streamId} / transferred`,
        message: `Recipient set to ${truncAddress(transferTo.trim())}.`,
      });
      setTransferModal(false);
      setTransferTo('');
      await reload();
    } catch (e) {
      console.error(e);
      toast.push({
        kicker: 'Transfer failed',
        message: (e as Error).message,
      });
    } finally {
      setPendingAction(null);
    }
  };

  /* ---------- NFT tab transfer form ---------- */

  const [nftTransferTo, setNftTransferTo] = useState('');
  const [nftWithdrawFirst, setNftWithdrawFirst] = useState(false);
  const [nftTransferError, setNftTransferError] = useState<string | null>(null);

  const isNftOwner = !!address && !!nftOwner && address === nftOwner;
  const trimmedNftTo = nftTransferTo.trim();
  const nftToValid =
    trimmedNftTo.length === 0 ||
    (isStellarAddress(trimmedNftTo) && trimmedNftTo !== nftOwner);
  const canSubmitNftTransfer =
    isNftOwner &&
    !!stream.is_transferable &&
    isStellarAddress(trimmedNftTo) &&
    trimmedNftTo !== nftOwner &&
    pendingAction === null;

  const callNftTransfer = async () => {
    if (!canSubmitNftTransfer || !nftOwner) return;
    setNftTransferError(null);
    setPendingAction('transfer');
    try {
      const lockup = makeLockup(address);
      if (nftWithdrawFirst) {
        const tx = await lockup.withdraw_max_and_transfer({
          stream_id: streamId,
          new_owner: trimmedNftTo,
        });
        await tx.signAndSend();
      } else {
        const tx = await lockup.transfer({
          from: nftOwner,
          to: trimmedNftTo,
          token_id: streamId,
        });
        await tx.signAndSend();
      }
      toast.push({
        kicker: `Stream #${streamId} / NFT transferred`,
        message: `Owner set to ${truncAddress(trimmedNftTo)}.`,
      });
      setNftTransferTo('');
      setNftWithdrawFirst(false);
      await reload();
    } catch (e) {
      console.error(e);
      const msg = (e as Error).message ?? String(e);
      setNftTransferError(msg);
      toast.push({
        kicker: 'NFT transfer failed',
        message: msg,
      });
    } finally {
      setPendingAction(null);
    }
  };

  /* ---------- gating ---------- */

  const canWithdraw = isRecipient && withdrawable > 0n && pendingAction === null;
  const canCancel =
    isSender &&
    (status === 'PENDING' || status === 'STREAMING') &&
    stream.is_cancelable &&
    pendingAction === null;
  const canRenounce = isSender && stream.is_cancelable && pendingAction === null;
  const canTransfer = isRecipient && stream.is_transferable && pendingAction === null;

  const isCanceled = status === 'CANCELED' || stream.was_canceled === true;
  const isDepleted = status === 'DEPLETED' || stream.is_depleted === true;

  /* ---------- tabs + url hash ---------- */

  const [activeTab, setActiveTab] = useState<TabId>('stream');
  // On mount, read hash.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = window.location.hash.replace(/^#/, '');
    if (isTabId(h)) setActiveTab(h);
  }, []);
  const onTabChange = (id: string) => {
    if (!isTabId(id)) return;
    setActiveTab(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.hash = id;
      window.history.replaceState(null, '', url.toString());
    }
  };

  /* ---------- subhead ---------- */

  const subheadEnding = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    if (status === 'PENDING' && startTs > nowSec) {
      return ` · begins in ${formatDuration(startTs - nowSec)}`;
    }
    if (status === 'STREAMING' && endTs > nowSec) {
      return ` · ends in ${formatDuration(endTs - nowSec)}`;
    }
    if (status === 'SETTLED') {
      return ' · stream completed';
    }
    if (status === 'CANCELED') return ' · canceled';
    if (status === 'DEPLETED') return ' · depleted';
    return ` · ${formatDuration(duration)} total`;
  }, [status, startTs, endTs, duration]);

  return (
    <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24 pt-8 sm:pt-12 md:pt-16 xl:pt-20 pb-16">
      {/* Eyebrow + Status */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
        <p className="eyebrow xl:text-[0.78rem] 2xl:text-[0.85rem]">
          <span className="text-sand">·</span>{' '}
          <span className="ml-1">Stream #{streamId}</span>{' '}
          <span className="mx-2 text-stroke-2">/</span>
          {shapeLabel(stream)}
        </p>
        <span className="ml-auto">
          <StatusPill status={status} />
        </span>
      </div>

      {/* Title */}
      <h1 className="headline text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-[6rem] text-cream break-words">
        Streaming {formatStroops(deposited)}
        <span className="ml-3 font-mono text-sm sm:text-base xl:text-lg 2xl:text-xl text-cream-dim uppercase tracking-[0.18em] not-italic">
          XLM
        </span>
      </h1>
      <p className="mt-4 xl:mt-6 max-w-[760px] xl:max-w-[940px] 2xl:max-w-[1120px] text-sm sm:text-[15px] xl:text-base 2xl:text-lg leading-relaxed text-cream-muted break-words">
        from{' '}
        <CopyableAddress addr={stream.sender} />
        {' '}to{' '}
        <CopyableAddress addr={stream.recipient} />
        <span className="text-cream-dim">{subheadEnding}</span>
      </p>

      {/* Two-column layout */}
      <div className="mt-10 sm:mt-12 xl:mt-16 grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_380px] 2xl:grid-cols-[1fr_440px] gap-10 lg:gap-12 xl:gap-16">
        {/* LEFT: dial + actions + tabs */}
        <section>
          <div className="reveal mx-auto max-w-[520px] xl:max-w-[600px] 2xl:max-w-[680px]">
            <CelestialDial
              deposited={deposited}
              withdrawn={withdrawn}
              withdrawable={withdrawable}
              refunded={refunded}
              start_ts={startTs}
              cliff_ts={hasCliff ? cliffTs : startTs}
              end_ts={endTs}
              status={status}
              shape={vshape}
              tokenSymbol="XLM"
            />
          </div>

          {/* Withdraw context line — only when recipient + can't withdraw. */}
          {isRecipient && withdrawable === 0n && status === 'STREAMING' && (
            <p className="mt-6 text-center text-[11px] uppercase tracking-[0.18em] text-cream-dim">
              Nothing to claim yet
            </p>
          )}

          <div className="mt-8 reveal" style={{ animationDelay: '80ms' }}>
            <DialActionGrid
              actions={[
                {
                  id: 'withdraw',
                  label: 'Withdraw',
                  icon: <IconWithdraw />,
                  enabled: canWithdraw,
                  primary: true,
                  loading: pendingAction === 'withdraw',
                  onClick: callWithdraw,
                  tooltip: canWithdraw
                    ? `Claim ${formatStroops(withdrawable)} XLM`
                    : isRecipient
                      ? 'Nothing to claim yet'
                      : 'Recipient only',
                },
                {
                  id: 'cancel',
                  label: 'Cancel',
                  icon: <IconCancel />,
                  enabled: canCancel,
                  loading: pendingAction === 'cancel',
                  onClick: callCancel,
                  tooltip: canCancel ? 'Stop streaming, refund the rest to sender' : 'Sender only',
                },
                {
                  id: 'renounce',
                  label: 'Renounce',
                  icon: <IconRenounce />,
                  enabled: canRenounce,
                  loading: pendingAction === 'renounce',
                  onClick: () => setRenounceModal(true),
                  tooltip: canRenounce ? 'Permanently remove cancelability' : 'Sender only',
                },
                {
                  id: 'transfer',
                  label: 'Transfer',
                  icon: <IconTransfer />,
                  enabled: canTransfer,
                  loading: pendingAction === 'transfer',
                  onClick: () => setTransferModal(true),
                  tooltip: canTransfer ? 'Send the NFT receipt to a new recipient' : 'Recipient only',
                },
              ]}
            />
          </div>

          {/* Tabs */}
          <div className="mt-12">
            <TabBar
              tabs={[
                { id: 'stream', label: 'Stream' },
                { id: 'schedule', label: 'Schedule' },
                { id: 'emission', label: 'Emission' },
                { id: 'nft', label: 'NFT' },
                { id: 'events', label: 'Events' },
              ]}
              active={activeTab}
              onChange={onTabChange}
            />

            {/* Tab content */}
            {activeTab === 'stream' && (
              <div
                className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 xl:gap-4 2xl:gap-5 reveal"
                style={{ animationDelay: '60ms' }}
              >
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
                  label="Withdrawable"
                  amount={formatStroops(withdrawable)}
                  accent={isCanceled ? 'rose' : 'teal'}
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
            )}

            {activeTab === 'schedule' && (
              <div className="mt-8 reveal" style={{ animationDelay: '60ms' }}>
                <ScheduleTimeline
                  start_ts={startTs}
                  cliff_ts={hasCliff ? cliffTs : startTs}
                  end_ts={endTs}
                />
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-0">
                  <DateCell label="Started" ts={startTs} accent="sand" />
                  <DateCell
                    label="Cliff"
                    ts={hasCliff ? cliffTs : null}
                    accent="violet"
                  />
                  <DateCell label="Ends" ts={endTs} accent="cream-muted" />
                </div>
                <div className="mt-8 pt-6 border-t border-stroke/40 flex items-baseline gap-3 flex-wrap">
                  <p className="eyebrow text-cream-dim">Duration</p>
                  <p className="font-display italic text-3xl text-cream">
                    {formatDuration(duration)}
                  </p>
                  {hasCliff && (
                    <p className="font-mono text-xs text-cream-dim">
                      +{formatDuration(cliffTs - startTs)} cliff
                    </p>
                  )}
                </div>
                {(vshape.tag === 'Tranched' || vshape.tag === 'Recurring') && (() => {
                  const points = vshape.tag === 'Tranched' ? vshape.tranches : recurringPreview(vshape);
                  const hidden = vshape.tag === 'Recurring' ? Math.max(0, vshape.count - points.length) : 0;
                  return (
                    <div className="mt-8 pt-6 border-t border-stroke/40">
                      <p className="eyebrow text-cream-dim mb-4">{vshape.tag === 'Recurring' ? 'Unlocks' : 'Tranches'}</p>
                      <ul className="space-y-0">
                        {points.map((t, i) => (
                          <li
                            key={i}
                            className="grid grid-cols-[28px_1fr] sm:grid-cols-[28px_1fr_180px] items-baseline gap-x-4 gap-y-1 py-3 border-b border-stroke/40 last:border-b-0"
                          >
                            <span className="font-mono text-xs text-cream-dim tabular">
                              #{i + 1}
                            </span>
                            <span className="font-mono text-sm text-sand-bright tabular break-words">
                              +{formatStroops(t.amount)}{' '}
                              <span className="text-[10px] uppercase tracking-[0.18em] text-cream-dim ml-1">
                                XLM
                              </span>
                            </span>
                            <span className="font-mono text-xs text-cream-dim col-start-2 sm:col-start-3 text-left sm:text-right">
                              {formatTimestamp(t.ts)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {hidden > 0 && vshape.tag === 'Recurring' && (
                        <p className="mt-3 text-xs text-cream-dim">
                          and {hidden} more unlock{hidden === 1 ? '' : 's'} every {formatDuration(vshape.period_secs)} until {formatTimestamp(vshape.first_ts + (vshape.count - 1) * vshape.period_secs)}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab === 'emission' && (
              <div className="mt-8 reveal" style={{ animationDelay: '60ms' }}>
                <EmissionChart
                  model={vshape.tag === 'Linear' ? 'Linear' : 'Tranched'}
                  start_ts={startTs}
                  cliff_ts={hasCliff ? cliffTs : undefined}
                  end_ts={endTs}
                  deposited={deposited}
                  unlock_at_start={vshape.tag === 'Linear' ? vshape.unlock_at_start : 0n}
                  unlock_at_cliff={vshape.tag === 'Linear' ? vshape.unlock_at_cliff : 0n}
                  tranches={vshape.tag === 'Tranched' ? vshape.tranches : vshape.tag === 'Recurring' ? recurringChartTranches(vshape) : []}
                  tokenSymbol="XLM"
                />
                <p className="mt-4 font-mono text-xs text-cream-dim">
                  <span className="text-teal-bright">+</span>
                  {formatStroops(ratePerSec)} XLM
                  <span className="ml-2 uppercase tracking-[0.18em]">per second</span>
                </p>
              </div>
            )}

            {activeTab === 'nft' && (
              <div
                className="mt-6 sm:mt-8 grid grid-cols-1 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] gap-10 lg:gap-12 reveal"
                style={{ animationDelay: '60ms' }}
              >
                {/* LEFT: explanation + transfer form */}
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-cream-dim">
                    <span className="text-sand">·</span> This stream is an NFT
                  </p>
                  <h2 className="mt-3 font-display italic text-[clamp(1.75rem,3vw,2.25rem)] leading-tight text-cream">
                    A transferable receipt for the right to claim{' '}
                    {formatStroops(deposited)} XLM.
                  </h2>
                  <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-cream-muted">
                    Each stream is wrapped in an on-chain non-fungible token
                    implementing the OpenZeppelin
                    <span className="font-mono text-sand"> NonFungibleToken</span>{' '}
                    trait with the
                    <span className="font-mono text-sand"> Enumerable</span>{' '}
                    extension. Transferring the NFT transfers the right to all
                    future withdrawals.
                  </p>

                  {/* Attribute strip */}
                  <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-stroke pt-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-cream-dim">
                        Token ID
                      </p>
                      <p className="mt-1 font-mono text-cream text-lg tabular">
                        #{streamId}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-cream-dim">
                        Standard
                      </p>
                      <p className="mt-1 font-mono text-cream text-sm">
                        OZ NonFungibleToken · Enumerable
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-cream-dim">
                        Current Owner
                      </p>
                      <p
                        className={
                          'mt-1 font-mono text-sm tabular ' +
                          (nftOwner && nftOwner !== stream.recipient
                            ? 'text-rose'
                            : 'text-cream')
                        }
                        title={nftOwner ?? undefined}
                      >
                        {nftOwner ? truncAddress(nftOwner) : '—'}
                      </p>
                      {nftOwner && nftOwner !== stream.recipient && (
                        <p className="mt-0.5 text-rose text-[11px]">
                          ⚠ Differs from stream recipient
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-violet">
                        Transferable
                      </p>
                      <p
                        className={
                          'mt-1 font-mono uppercase tracking-[0.18em] text-xs ' +
                          (stream.is_transferable
                            ? 'text-teal-bright'
                            : 'text-cream-dim')
                        }
                      >
                        {stream.is_transferable ? 'Yes' : 'No'}
                      </p>
                    </div>
                  </div>

                  {/* Transfer form */}
                  <div className="mt-10 border-t border-stroke pt-8">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-cream-dim">
                      Transfer NFT
                    </p>
                    <h3 className="mt-2 font-display italic text-2xl text-cream">
                      Hand over the stream.
                    </h3>
                    <p className="mt-2 max-w-md text-sm text-cream-muted leading-relaxed">
                      The new owner becomes the recipient and inherits all
                      future withdrawal rights. Optionally withdraw your accrued
                      portion first.
                    </p>

                    <div className="mt-6 max-w-md space-y-5">
                      <div>
                        <label className="text-[10px] uppercase tracking-[0.16em] text-cream-dim">
                          New owner address
                        </label>
                        <input
                          type="text"
                          spellCheck={false}
                          value={nftTransferTo}
                          onChange={(e) => {
                            setNftTransferTo(e.target.value);
                            setNftTransferError(null);
                          }}
                          placeholder="G…"
                          className="mt-2 w-full bg-transparent border-b border-stroke focus:border-sand outline-none font-mono text-sm text-cream py-2 transition-colors placeholder:text-cream-dim/60"
                        />
                        {!nftToValid && (
                          <p className="mt-2 text-rose text-[11px]">
                            {trimmedNftTo === nftOwner
                              ? 'Cannot transfer to the current owner.'
                              : 'Not a valid Stellar G… address.'}
                          </p>
                        )}
                      </div>

                      <label className="flex items-center gap-3 text-cream-muted text-sm cursor-pointer select-none">
                        <Toggle
                          size="sm"
                          checked={nftWithdrawFirst}
                          onChange={setNftWithdrawFirst}
                          ariaLabel="Withdraw accrued portion first"
                        />
                        Withdraw accrued portion first
                      </label>

                      <div className="flex gap-3 pt-2 flex-wrap">
                        <button
                          type="button"
                          onClick={callNftTransfer}
                          disabled={!canSubmitNftTransfer}
                          className="inline-flex items-center bg-sand text-night uppercase tracking-[0.18em] text-[11px] font-medium px-5 py-3 hover:bg-sand-bright transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-sm"
                        >
                          {pendingAction === 'transfer'
                            ? 'Transferring…'
                            : nftWithdrawFirst
                              ? 'Withdraw + Transfer NFT →'
                              : 'Transfer NFT →'}
                        </button>
                      </div>

                      {!address && (
                        <p className="text-cream-dim text-[11px]">
                          Connect a wallet to transfer.
                        </p>
                      )}
                      {address && !isNftOwner && nftOwner && (
                        <p className="text-rose text-[11px]">
                          Only the current NFT owner can transfer.
                        </p>
                      )}
                      {!stream.is_transferable && (
                        <p className="text-rose text-[11px]">
                          This NFT was minted as non-transferable.
                        </p>
                      )}
                      {nftTransferError && (
                        <p className="text-rose text-[11px] break-all">
                          {nftTransferError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT: NFT receipt visualization */}
                <div className="mx-auto md:mx-0 w-full max-w-[320px]">
                  <NFTReceiptCard
                    streamId={streamId}
                    owner={nftOwner}
                    deposited={deposited}
                    is_transferable={stream.is_transferable}
                    status={status}
                    fill={fillFromStatus(status, withdrawn, deposited)}
                  />
                </div>
              </div>
            )}

            {activeTab === 'events' && (
              <div className="mt-8 reveal" style={{ animationDelay: '60ms' }}>
                <EventsLog streamId={streamId} />
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: sticky attribute panel */}
        <aside className="lg:sticky lg:top-24 self-start">
          <div className="border-t lg:border-t-0 lg:border-l border-stroke pt-6 lg:pt-0 lg:pl-6">
            <p className="eyebrow text-cream-dim mb-4">Receipt</p>
            <AttributePill
              label="Shape"
              icon={<IconShape />}
              value={
                <span className="font-mono text-sm text-cream">
                  {shapeTitle(stream)}
                </span>
              }
            />
            <AttributePill
              label="Status"
              icon={<IconClock />}
              value={<StatusPill status={status} size="sm" />}
            />
            <AttributePill
              label="Sender"
              icon={<IconAtSign />}
              value={
                <span className="font-mono text-sm text-cream">
                  {truncAddress(stream.sender)}
                </span>
              }
              copyable={stream.sender}
            />
            <AttributePill
              label="Recipient"
              icon={<IconAtSign />}
              value={
                <span className="font-mono text-sm text-cream">
                  {truncAddress(stream.recipient)}
                </span>
              }
              copyable={stream.recipient}
            />
            <AttributePill
              label="Token"
              icon={<IconCoin />}
              value={
                <span className="font-mono text-sm text-cream">
                  {truncAddress(stream.token)}
                </span>
              }
              copyable={stream.token}
            />
            <AttributePill
              label="Started"
              icon={<IconClock />}
              value={
                <span className="font-mono text-sm text-cream">
                  {formatTimestamp(startTs)}
                </span>
              }
            />
            <AttributePill
              label="Cliff"
              icon={<IconClock />}
              value={
                hasCliff ? (
                  <span className="font-mono text-sm text-violet">
                    {formatTimestamp(cliffTs)}
                  </span>
                ) : (
                  <span className="font-mono text-sm text-cream-dim">—</span>
                )
              }
              accent={hasCliff ? 'violet' : undefined}
            />
            <AttributePill
              label="Ends"
              icon={<IconClock />}
              value={
                <span className="font-mono text-sm text-cream">
                  {formatTimestamp(endTs)}
                </span>
              }
            />
            <AttributePill
              label="Deposited"
              icon={<IconDeposit />}
              value={
                <span className="text-cream">
                  <span className="font-display italic text-base">
                    {formatStroops(deposited)}
                  </span>
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim">
                    XLM
                  </span>
                </span>
              }
            />
            <AttributePill
              label="Cancelable"
              value={
                <span
                  className={
                    'inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] ' +
                    (stream.is_cancelable
                      ? 'text-teal-bright'
                      : 'text-cream-dim')
                  }
                >
                  <IconCheck value={stream.is_cancelable} />
                  {stream.is_cancelable ? 'Yes' : 'No'}
                </span>
              }
            />
            <AttributePill
              label="Transferable"
              accent="violet"
              value={
                <span
                  className={
                    'inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] ' +
                    (stream.is_transferable
                      ? 'text-violet'
                      : 'text-cream-dim')
                  }
                >
                  <IconCheck value={stream.is_transferable} />
                  {stream.is_transferable ? 'Yes' : 'No'}
                </span>
              }
            />
            <AttributePill
              label="Stream ID"
              icon={<IconHash />}
              value={
                <span className="font-mono text-sm text-cream">
                  #{streamId}
                </span>
              }
            />
            <AttributePill
              label="NFT Token ID"
              icon={<IconHash />}
              value={
                <span className="font-mono text-sm text-cream-muted">
                  #{streamId}
                </span>
              }
            />
            <AttributePill
              label="NFT Owner"
              icon={<IconAtSign />}
              value={
                nftOwner ? (
                  <span
                    className={
                      'inline-flex items-center gap-1.5 font-mono text-sm ' +
                      (nftOwner !== stream.recipient
                        ? 'text-rose'
                        : 'text-cream')
                    }
                    title={
                      nftOwner !== stream.recipient
                        ? 'Owner differs from streamed-to address — NFT was transferred'
                        : nftOwner
                    }
                  >
                    {nftOwner !== stream.recipient && (
                      <span aria-hidden className="text-rose">
                        ⚠
                      </span>
                    )}
                    {truncAddress(nftOwner)}
                  </span>
                ) : (
                  <span className="font-mono text-sm text-cream-dim">—</span>
                )
              }
              accent={
                nftOwner && nftOwner !== stream.recipient ? 'rose' : undefined
              }
              copyable={nftOwner ?? undefined}
            />
            <AttributePill
              label="NFT Standard"
              value={
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-cream-muted">
                  OZ NFT · Enumerable
                </span>
              }
            />
          </div>
        </aside>
      </div>

      {!address && (
        <p className="mt-12 text-xs text-cream-dim">
          Connect a wallet to interact with this stream.
        </p>
      )}

      {/* Modals */}
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

      {transferModal && (
        <Modal onDismiss={() => setTransferModal(false)}>
          <p className="eyebrow text-cream-dim mb-3">· Transfer</p>
          <h3 className="headline-roman text-2xl text-cream mb-4">
            Transfer this stream
          </h3>
          <p className="text-sm text-cream-muted leading-relaxed mb-6">
            Withdraws any claimable balance to you, then re-assigns the NFT
            receipt to a new recipient. Address must be a valid G… key.
          </p>
          <input
            type="text"
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            placeholder="G…"
            spellCheck={false}
            className="w-full bg-night border border-stroke text-cream font-mono text-sm px-4 py-3 rounded-sm focus:outline-none focus:border-sand mb-8"
          />
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setTransferModal(false)}
              className="text-[11px] uppercase tracking-[0.18em] px-5 py-2 border border-stroke text-cream-dim hover:text-cream hover:border-cream-dim transition-colors rounded-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={callTransfer}
              disabled={!/^G[A-Z2-7]{55}$/.test(transferTo.trim())}
              className="text-[11px] uppercase tracking-[0.18em] px-5 py-2 border border-sand text-sand hover:bg-sand/10 transition-colors rounded-sm disabled:border-stroke disabled:text-cream-dim disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              Transfer →
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

function DateCell({
  label,
  ts,
  accent,
}: {
  label: string;
  ts: number | null;
  accent: 'sand' | 'violet' | 'cream-muted';
}) {
  const colorMap = {
    sand: 'text-sand',
    violet: 'text-violet',
    'cream-muted': 'text-cream',
  };
  return (
    <div className="px-0 md:px-5 md:first:pl-0 md:last:pr-0 py-4 md:border-r md:border-stroke/40 md:last:border-r-0 border-b md:border-b-0 border-stroke/40 md:py-0">
      <p className={`text-[10px] uppercase tracking-[0.18em] ${colorMap[accent]}`}>
        {label}
      </p>
      <p className={`mt-2 font-display italic text-2xl ${ts ? colorMap[accent] : 'text-cream-dim'}`}>
        {ts
          ? new Date(ts * 1000).toLocaleDateString(undefined, {
              month: 'short',
              day: '2-digit',
            })
          : 'None'}
      </p>
      <p className="mt-1 font-mono text-[11px] text-cream-dim">
        {ts ? formatTimestamp(ts) : '—'}
      </p>
    </div>
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
 * Events log — restyled as a vertical timeline                     *
 * ----------------------------------------------------------------- */

type EventRow = {
  id: string;
  kind: string;
  ts: string;
  txHash: string;
  details?: string;
};

const EVENT_DOT: Record<string, string> = {
  CREATED: 'bg-sand',
  CREATE: 'bg-sand',
  CREATE_LINEAR: 'bg-sand',
  CREATE_TRANCHED: 'bg-sand',
  WITHDRAW: 'bg-teal',
  WITHDRAWN: 'bg-teal',
  WITHDRAW_MAX: 'bg-teal',
  CANCEL: 'bg-rose',
  CANCELED: 'bg-rose',
  RENOUNCE: 'bg-violet',
  RENOUNCED: 'bg-violet',
  TRANSFER: 'bg-cream',
  TRANSFERRED: 'bg-cream',
  BURN: 'bg-cream-dim',
  BURNED: 'bg-cream-dim',
};

function dotClass(kind: string): string {
  const upper = kind.toUpperCase();
  for (const k of Object.keys(EVENT_DOT)) {
    if (upper.includes(k)) return EVENT_DOT[k];
  }
  return 'bg-cream-dim';
}

/** Build a Stellar Expert tx URL for the active network — returns null on
 *  unknown / local networks where no public explorer applies. */
function explorerTxHref(txHash: string): string | null {
  if (!txHash) return null;
  const passphrase = DEPLOYMENT.networkPassphrase ?? '';
  if (passphrase.includes('Public Global Stellar')) {
    return `https://stellar.expert/explorer/public/tx/${txHash}`;
  }
  if (passphrase.includes('Test SDF')) {
    return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  }
  return null;
}

function EventsLog({ streamId }: { streamId: number }) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unindexed, setUnindexed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Read from the indexer (Mongo via /api/streams/[id]) instead of the
        // RPC's getEvents — the RPC only retains ~24h on testnet and rejects
        // queries outside its sliding ledger window. The indexer has the full
        // history since first deploy.
        const res = await fetch(`/api/streams/${streamId}`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (res.status === 404) {
          // Stream exists on-chain but the indexer hasn't seen it yet.
          setUnindexed(true);
          setEvents([]);
          return;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          actions: Array<{
            action: string;
            ts: number;
            tx_hash: string;
            ledger: number;
            log_index?: number;
            amount?: string;
            actor?: string;
            to?: string;
            new_owner?: string;
            sender_refund?: string;
            recipient_balance?: string;
          }>;
        };
        const rows: EventRow[] = json.actions.map((a) => {
          let details: string | undefined;
          if (a.amount) {
            try {
              const formatted = formatStroops(BigInt(a.amount));
              const who = a.to ? ` → ${truncAddress(a.to)}` : '';
              details = `${formatted}${who}`;
            } catch {
              /* noop */
            }
          } else if (a.sender_refund || a.recipient_balance) {
            try {
              const refund = formatStroops(BigInt(a.sender_refund ?? '0'));
              const lockedIn = formatStroops(
                BigInt(a.recipient_balance ?? '0'),
              );
              details = `refund ${refund} · locked-in ${lockedIn}`;
            } catch {
              /* noop */
            }
          } else if (a.new_owner) {
            details = `→ ${truncAddress(a.new_owner)}`;
          }
          return {
            id: `${a.tx_hash}:${a.log_index ?? 0}`,
            kind: a.action.toUpperCase(),
            ts: new Date(a.ts * 1000).toISOString(),
            txHash: a.tx_hash,
            details,
          };
        });
        setEvents(rows);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  if (error) {
    return (
      <p className="font-mono text-xs text-rose border-l-2 border-rose pl-4 py-2">
        Indexer error: {error}
      </p>
    );
  }
  if (events === null) {
    return <p className="text-xs text-cream-dim">Loading events…</p>;
  }
  if (unindexed) {
    return (
      <p className="text-xs text-cream-dim leading-relaxed">
        The indexer hasn&apos;t materialised this stream yet. If you just created
        it, give the indexer a few seconds — refresh in ~5s. Otherwise make sure{' '}
        <code className="font-mono text-cream">npm run indexer</code> is running
        in another terminal.
      </p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-xs text-cream-dim">
        No events for this stream yet.
      </p>
    );
  }

  return (
    <ol className="relative">
      {/* Vertical connector */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[5px] top-2 bottom-2 w-px bg-stroke"
      />
      {events.map((ev) => (
        <li
          key={ev.id}
          className="relative pl-7 py-3 grid grid-cols-1 sm:grid-cols-[1fr_180px] items-baseline gap-x-4 gap-y-1"
        >
          <span
            aria-hidden
            className={
              'absolute left-0 top-4 w-3 h-3 rounded-full border-2 border-night ' +
              dotClass(ev.kind)
            }
          />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-cream">
              {ev.kind}
            </p>
            {ev.details && (
              <p className="mt-1 font-mono text-xs text-cream-muted break-words">
                → {ev.details}
              </p>
            )}
          </div>
          <div className="text-left sm:text-right">
            <p className="font-mono text-xs text-cream-dim">
              {new Date(ev.ts).toLocaleString(undefined, {
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </p>
            <p className="mt-1">
              {(() => {
                const href = explorerTxHref(ev.txHash);
                const label = (
                  <>
                    tx {ev.txHash.slice(0, 8)}…
                    <span aria-hidden className="ml-1 text-cream-dim/60">↗</span>
                  </>
                );
                return href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-cream-dim/70 hover:text-sand-bright transition-colors underline-offset-2 hover:underline"
                    title="Open transaction on Stellar Expert"
                  >
                    {label}
                  </a>
                ) : (
                  <span className="font-mono text-[10px] text-cream-dim/70">
                    tx {ev.txHash.slice(0, 8)}…
                  </span>
                );
              })()}
            </p>
          </div>
        </li>
      ))}
    </ol>
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
        <span className="mx-2 text-stroke-2">/</span>
        <span className="text-cream-dim">Loading stream…</span>
      </p>
      <div className="mt-16 max-w-[440px] mx-auto aspect-square border border-stroke/50 rounded-full opacity-20 animate-pulse" />
    </div>
  );
}
