'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import TabBar from '@/components/TabBar';
import WalletButton from '@/components/WalletButton';
import FilterBar from '@/components/dashboard/FilterBar';
import HistoryList from '@/components/dashboard/HistoryList';
import StatsStrip from '@/components/dashboard/StatsStrip';
import StreamList from '@/components/dashboard/StreamList';
import type { ApiStream } from '@/components/dashboard/StreamRow';
import type { WalletStats } from '@/lib/api/walletStats';
import { filtersKey, historyApiUrl, isDefault, searchKind, streamsApiUrl, type DashboardFilters } from '@/lib/dashboard/filters';
import { toHistoryRow, type HistoryItem, type HistoryRow } from '@/lib/dashboard/history';
import { useDashboardFilters } from '@/lib/dashboard/useDashboardFilters';
import { usePagedList } from '@/lib/dashboard/usePagedList';
import { useWallet } from '@/lib/wallet-context';

const FILTER_KEYS: (keyof DashboardFilters)[] = ['role', 'status', 'token', 'model', 'q', 'sort', 'order'];
const TABS = [
  { id: 'streams', label: 'Streams' },
  { id: 'history', label: 'History' },
];

export default function DashboardPage(): ReactNode {
  return (
    <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24 pt-10 sm:pt-16 md:pt-24 xl:pt-28 pb-16">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-8 sm:mb-10">
        <p className="eyebrow xl:text-[0.78rem] 2xl:text-[0.85rem]">
          <span className="text-sand">·</span> <span className="ml-1">Dashboard</span> <span className="mx-2 text-stroke-2">/</span> Your streams
        </p>
      </div>
      {/* useSearchParams needs a Suspense boundary for static prerendering */}
      <Suspense fallback={null}>
        <DashboardBody />
      </Suspense>
    </div>
  );
}

function DashboardBody(): ReactNode {
  const { address, pending } = useWallet();
  if (!address) return <DisconnectedView pending={pending} />;
  return <ConnectedView address={address} />;
}

function DisconnectedView({ pending: _pending }: { pending: boolean }): ReactNode {
  return (
    <div className="mt-12 sm:mt-20 xl:mt-28 mx-auto max-w-[560px] xl:max-w-[720px] 2xl:max-w-[840px] text-center">
      <h1 className="headline text-4xl sm:text-5xl md:text-6xl xl:text-7xl 2xl:text-8xl text-cream leading-[0.95]">
        A ledger,
        <br />
        <span className="text-sand-bright">awaiting an owner.</span>
      </h1>
      <p className="mt-6 sm:mt-8 xl:mt-10 xl:text-lg 2xl:text-xl text-cream-muted leading-relaxed">
        Connect a wallet to see the streams you’ve sent and the streams flowing toward you.
      </p>
      <div className="mt-8 sm:mt-10 flex justify-center">
        <WalletButton />
      </div>
    </div>
  );
}

function ConnectedView({ address }: { address: string }): ReactNode {
  const { filters, set, reset } = useDashboardFilters();
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Stats + token list (refreshed with the first page cadence).
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const loadStats = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        fetch(`/api/stats?address=${encodeURIComponent(address)}`, { cache: 'no-store' }),
        fetch('/api/tokens', { cache: 'no-store' }),
      ]);
      if (!s.ok) throw new Error(((await s.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${s.status}`);
      setStats((await s.json()) as WalletStats);
      if (t.ok) setTokens((((await t.json()) as { tokens?: Array<{ token: string }> }).tokens ?? []).map((x) => x.token));
      setApiError(null);
    } catch (e) {
      setApiError((e as Error).message);
    }
  }, [address]);
  // A new wallet gets placeholders, never the previous wallet's money.
  useEffect(() => {
    setStats(null);
    setTokens([]);
  }, [address]);
  useEffect(() => {
    void loadStats();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void loadStats();
    }, 10_000);
    return () => clearInterval(id);
  }, [loadStats]);

  // Streams list
  const streamsFirst = useMemo(() => streamsApiUrl(address, filters), [address, filters]);
  const streamsNext = useCallback((c: string) => streamsApiUrl(address, filters, c), [address, filters]);
  const streams = usePagedList<ApiStream>({
    key: filtersKey({ ...filters, tab: 'streams' }, address),
    firstUrl: streamsFirst, // both lists stay loaded across tab switches (spec §4)
    nextUrl: streamsNext,
    refreshMs: filters.tab === 'streams' ? 10_000 : 0, // only the visible list polls
    pick: (json) => {
      const j = json as { streams?: ApiStream[]; next_cursor?: string | null };
      return { items: j.streams ?? [], cursor: j.next_cursor ?? null };
    },
    idOf: (s) => s._id,
  });

  // History list
  const historyFirst = useMemo(() => historyApiUrl(address, filters), [address, filters]);
  const historyNext = useCallback((c: string) => historyApiUrl(address, filters, c), [address, filters]);
  const history = usePagedList<HistoryRow>({
    key: filtersKey({ ...filters, tab: 'history' }, address),
    firstUrl: historyFirst,
    nextUrl: historyNext,
    refreshMs: filters.tab === 'history' ? 10_000 : 0,
    pick: (json) => {
      const j = json as { items?: HistoryItem[]; next_cursor?: string | null };
      return { items: (j.items ?? []).map((i) => toHistoryRow(i, address)), cursor: j.next_cursor ?? null };
    },
    idOf: (r) => r.id,
  });

  const hasFilters = !isDefault(filters, FILTER_KEYS);
  const listError = filters.tab === 'streams' ? streams.state.error : history.state.error;
  const error = apiError ?? listError;

  return (
    <>
      <StatsStrip stats={stats} />

      {error && (
        <div className="mt-8 border border-warning/40 bg-warning/5 px-5 py-4 rounded-sm">
          <p className="eyebrow text-warning mb-2">· Indexer offline?</p>
          <p className="text-xs text-cream-muted leading-relaxed">
            Could not reach the indexer API. Make sure the indexer is running (<span className="font-mono text-cream">npx tsx scripts/indexer.ts</span>) and that Mongo is up.
          </p>
          <p className="mt-3 font-mono text-[11px] text-cream-dim break-all">{error}</p>
        </div>
      )}

      <div className="mt-10">
        <TabBar tabs={TABS} active={filters.tab} onChange={(id) => set({ tab: id as DashboardFilters['tab'] })} />
      </div>

      {filters.tab === 'streams' ? (
        <div className="mt-6 space-y-6">
          <FilterBar filters={filters} tokens={tokens} onChange={set} onClear={() => reset(FILTER_KEYS)} />
          <StreamList
            state={streams.state}
            nowSec={nowSec}
            address={address}
            hasFilters={hasFilters}
            invalidSearch={searchKind(filters.q) === 'invalid'}
            onClear={() => reset(FILTER_KEYS)}
            onLoadMore={streams.loadMore}
            onAbsorbNew={streams.absorbNew}
          />
        </div>
      ) : (
        <div className="mt-6">
          <HistoryList
            state={history.state}
            nowSec={nowSec}
            kinds={filters.kinds}
            mine={filters.mine}
            onKinds={(kinds) => set({ kinds })}
            onMine={(mine) => set({ mine })}
            onLoadMore={history.loadMore}
            onAbsorbNew={history.absorbNew}
          />
        </div>
      )}
    </>
  );
}
