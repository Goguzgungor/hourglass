// frontend/src/lib/dashboard/useDashboardFilters.ts
'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_FILTERS, filtersToQuery, parseFilters, type DashboardFilters } from './filters';

/** Dashboard view state lives in the URL query; edits use router.replace (no history spam). */
export function useDashboardFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);

  const write = useCallback(
    (next: DashboardFilters) => {
      const qs = filtersToQuery(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const set = useCallback((patch: Partial<DashboardFilters>) => write({ ...filters, ...patch }), [filters, write]);
  const reset = useCallback(
    (keys?: (keyof DashboardFilters)[]) => {
      if (!keys) return write(DEFAULT_FILTERS);
      const next = { ...filters };
      for (const k of keys) (next as Record<string, unknown>)[k] = DEFAULT_FILTERS[k];
      write(next);
    },
    [filters, write],
  );

  return { filters, set, reset };
}
