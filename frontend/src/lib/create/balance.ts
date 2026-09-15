//
// Pre-flight balance lookup through Horizon (classic balances cover XLM and
// the classic-asset-backed SACs we list). Any failure → null (non-blocking).

import { parseXlmToStroops } from '@/lib/format';
import type { TokenInfo } from '@/lib/tokens';

/** Below this much remaining XLM we warn about fees and reserves (5 XLM). */
export const FEE_RESERVE_STROOPS = 50_000_000n;

type HorizonBalance = { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string };

export async function fetchTokenBalance(
  horizonUrl: string,
  account: string,
  token: TokenInfo,
  fetchFn: typeof fetch = fetch,
): Promise<bigint | null> {
  if (!horizonUrl) return null;
  const isNative = token.symbol === 'XLM' && !token.issuer;
  if (!isNative && !token.issuer) return null;
  try {
    const res = await fetchFn(`${horizonUrl.replace(/\/$/, '')}/accounts/${account}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { balances?: HorizonBalance[] };
    const b = (json.balances ?? []).find((x) =>
      isNative ? x.asset_type === 'native' : x.asset_code === token.symbol && x.asset_issuer === token.issuer,
    );
    return b ? parseXlmToStroops(b.balance) : null;
  } catch {
    return null;
  }
}
