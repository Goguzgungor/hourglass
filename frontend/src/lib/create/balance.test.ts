import { describe, expect, it } from 'vitest';
import type { TokenInfo } from '@/lib/tokens';
import { FEE_RESERVE_STROOPS, fetchTokenBalance } from './balance';

const xlm: TokenInfo = { id: 'CNATIVE', symbol: 'XLM', name: 'XLM', decimals: 7, glyphColor: '', description: '' };
const usdc: TokenInfo = { id: 'CUSDC', symbol: 'USDC', name: 'USDC', decimals: 7, issuer: 'GISSUER', glyphColor: '', description: '' };
const custom: TokenInfo = { id: 'CCUSTOM', symbol: 'ZZZ', name: 'zzz', decimals: 7, glyphColor: '', description: '' };

function fakeFetch(status: number, body: unknown) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const account = {
  balances: [
    { asset_type: 'native', balance: '980.5' },
    { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER', balance: '12.25' },
  ],
};

describe('fetchTokenBalance', () => {
  it('reads native and issued balances in stroops', async () => {
    const f = fakeFetch(200, account);
    expect(await fetchTokenBalance('https://horizon.test/', 'GACC', xlm, f.fn)).toBe(9_805_000_000n);
    expect(await fetchTokenBalance('https://horizon.test', 'GACC', usdc, f.fn)).toBe(122_500_000n);
    expect(f.calls).toEqual(['https://horizon.test/accounts/GACC', 'https://horizon.test/accounts/GACC']);
  });
  it('returns null when the asset is missing, the token has no issuer, the request fails, or horizon is unset', async () => {
    const f = fakeFetch(200, { balances: [{ asset_type: 'native', balance: '1' }] });
    expect(await fetchTokenBalance('https://h', 'GACC', usdc, f.fn)).toBeNull();
    expect(await fetchTokenBalance('https://h', 'GACC', custom, f.fn)).toBeNull();
    expect(await fetchTokenBalance('https://h', 'GACC', xlm, fakeFetch(404, {}).fn)).toBeNull();
    expect(await fetchTokenBalance('', 'GACC', xlm, f.fn)).toBeNull();
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await fetchTokenBalance('https://h', 'GACC', xlm, boom)).toBeNull();
  });
  it('exposes the 5 XLM fee reserve', () => {
    expect(FEE_RESERVE_STROOPS).toBe(50_000_000n);
  });
});
