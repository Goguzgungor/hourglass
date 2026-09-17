import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  HISTORY_PAGE,
  STREAMS_PAGE,
  filtersKey,
  filtersToQuery,
  historyApiUrl,
  isDefault,
  parseFilters,
  searchKind,
  streamsApiUrl,
  type DashboardFilters,
} from './filters';

const G1 = 'GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2';
const C1 = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const sp = (s: string) => new URLSearchParams(s);

describe('parseFilters', () => {
  it('returns defaults for an empty query', () => {
    expect(parseFilters(sp(''))).toEqual(DEFAULT_FILTERS);
    expect(DEFAULT_FILTERS).toEqual({
      tab: 'streams', role: 'any', status: [], token: null, model: null, q: '', sort: 'created_at', order: 'desc', mine: false, kinds: [],
    });
  });
  it('parses every key and drops invalid values per key', () => {
    const f = parseFilters(sp(`tab=history&role=sender&status=streaming,pending,bogus&token=${C1}&model=Recurring&q=%2045%20&sort=start_ts&order=asc&mine=1&kinds=withdrawn,nope,created`));
    expect(f).toEqual({
      tab: 'history', role: 'sender', status: ['streaming', 'pending'], token: C1, model: 'Recurring', q: '45', sort: 'start_ts', order: 'asc', mine: true, kinds: ['withdrawn', 'created'],
    });
    const bad = parseFilters(sp('tab=nope&role=owner&token=notacontract&model=Cubic&sort=amount&order=sideways&mine=yes'));
    expect(bad).toEqual(DEFAULT_FILTERS);
  });
  it('ignores unknown keys and dedupes lists', () => {
    const f = parseFilters(sp('foo=1&status=streaming,streaming&kinds=created,created'));
    expect(f.status).toEqual(['streaming']);
    expect(f.kinds).toEqual(['created']);
  });
});

describe('filtersToQuery', () => {
  it('omits defaults and keeps a stable key order', () => {
    expect(filtersToQuery(DEFAULT_FILTERS).toString()).toBe('');
    const f: DashboardFilters = { ...DEFAULT_FILTERS, tab: 'history', role: 'recipient', status: ['streaming', 'pending'], q: 'G', order: 'asc', mine: true, kinds: ['withdrawn'] };
    expect(filtersToQuery(f).toString()).toBe('tab=history&role=recipient&status=streaming%2Cpending&q=G&order=asc&mine=1&kinds=withdrawn');
  });
  it('round-trips', () => {
    const f: DashboardFilters = { ...DEFAULT_FILTERS, token: C1, model: 'Linear', sort: 'end_ts', q: '12' };
    expect(parseFilters(filtersToQuery(f))).toEqual(f);
  });
  it('isDefault checks all or some keys', () => {
    expect(isDefault(DEFAULT_FILTERS)).toBe(true);
    const f = { ...DEFAULT_FILTERS, tab: 'history' as const };
    expect(isDefault(f)).toBe(false);
    expect(isDefault(f, ['role', 'status', 'token', 'model', 'q', 'sort', 'order'])).toBe(true);
  });
});

describe('searchKind', () => {
  it('classifies ids, account prefixes, contract prefixes, invalid and empty', () => {
    expect(searchKind('')).toBe('empty');
    expect(searchKind('  ')).toBe('empty');
    expect(searchKind('45')).toBe('id');
    expect(searchKind('G')).toBe('account');
    expect(searchKind(G1)).toBe('account');
    expect(searchKind('CDLZ')).toBe('contract');
    expect(searchKind('hello')).toBe('invalid');
    expect(searchKind('g1')).toBe('invalid'); // '1' is not a base32 char, whatever the case
    expect(searchKind('4x')).toBe('invalid');
  });
  it('is case-insensitive: lower-case prefixes classify like their upper-case form', () => {
    expect(searchKind('gabc')).toBe('account');
    expect(searchKind('g')).toBe('account');
    expect(searchKind('cdlz')).toBe('contract');
    expect(searchKind(G1.toLowerCase())).toBe('account');
  });
});

describe('API url builders', () => {
  it('streamsApiUrl encodes every active filter, the page size and the cursor', () => {
    const f: DashboardFilters = { ...DEFAULT_FILTERS, role: 'sender', status: ['streaming'], token: C1, model: 'Linear', q: '45', sort: 'end_ts', order: 'asc' };
    expect(streamsApiUrl(G1, f)).toBe(`/api/streams?address=${G1}&role=sender&status=streaming&token=${C1}&model=Linear&q=45&sort=end_ts&order=asc&limit=${STREAMS_PAGE}`);
    expect(streamsApiUrl(G1, DEFAULT_FILTERS, 'abc=')).toBe(`/api/streams?address=${G1}&limit=${STREAMS_PAGE}&cursor=abc%3D`);
  });
  it('streamsApiUrl returns null for an invalid search', () => {
    expect(streamsApiUrl(G1, { ...DEFAULT_FILTERS, q: 'hello' })).toBeNull();
  });
  it('streamsApiUrl sends the search trimmed and upper-cased (ids unaffected)', () => {
    expect(streamsApiUrl(G1, { ...DEFAULT_FILTERS, q: ' gabc ' })).toBe(`/api/streams?address=${G1}&q=GABC&limit=${STREAMS_PAGE}`);
    expect(streamsApiUrl(G1, { ...DEFAULT_FILTERS, q: '45' })).toBe(`/api/streams?address=${G1}&q=45&limit=${STREAMS_PAGE}`);
  });
  it('historyApiUrl uses address, mine and the history page size', () => {
    expect(historyApiUrl(G1, DEFAULT_FILTERS)).toBe(`/api/history?address=${G1}&limit=${HISTORY_PAGE}`);
    expect(historyApiUrl(G1, { ...DEFAULT_FILTERS, mine: true }, 'c')).toBe(`/api/history?address=${G1}&mine=1&limit=${HISTORY_PAGE}&cursor=c`);
  });
  it('filtersKey depends only on the fields the list actually requests', () => {
    const a = filtersKey(DEFAULT_FILTERS, G1);
    expect(filtersKey(DEFAULT_FILTERS, 'GOTHER')).not.toBe(a);
    expect(filtersKey({ ...DEFAULT_FILTERS, tab: 'history' }, G1)).not.toBe(a);
    expect(filtersKey({ ...DEFAULT_FILTERS, status: ['streaming'] }, G1)).not.toBe(a);
    expect(filtersKey({ ...DEFAULT_FILTERS, kinds: ['created'] }, G1)).toBe(a);
    // history-only field does not disturb the streams list, and vice versa
    expect(filtersKey({ ...DEFAULT_FILTERS, mine: true }, G1)).toBe(a);
    const h = filtersKey({ ...DEFAULT_FILTERS, tab: 'history' }, G1);
    expect(filtersKey({ ...DEFAULT_FILTERS, tab: 'history', status: ['streaming'], q: '45', sort: 'end_ts' }, G1)).toBe(h);
    expect(filtersKey({ ...DEFAULT_FILTERS, tab: 'history', mine: true }, G1)).not.toBe(h);
    // different invalid searches share one idle key
    expect(filtersKey({ ...DEFAULT_FILTERS, q: 'hello' }, G1)).toBe(filtersKey({ ...DEFAULT_FILTERS, q: 'world' }, G1));
  });
});
