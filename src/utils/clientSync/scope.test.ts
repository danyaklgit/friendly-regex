import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CLIENT_SYNC_CONTROLS, CLIENT_SYNC_CONTROLS_STORAGE_KEY, RANGE_TOO_LONG_MESSAGE, RANGE_INVERTED_MESSAGE, PAGE_SIZE_MAX,
  sanitizeControls, readStoredControls, writeStoredControls, daysBetween, rangeTooLong, spansDays, resolveRange, rangeError,
  buildScope, buildTransactionsRequest, nextLimit, NO_LIST_FILTERS, type ClientSyncControls,
} from './scope';

const TODAY = '2026-10-15';
const RANGE: ClientSyncControls = { ...DEFAULT_CLIENT_SYNC_CONTROLS, orgId: 'ORG-1', mode: 'range', from: '2026-10-01', to: '2026-10-10' };

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, map };
}

describe('defaults and sanitize', () => {
  it('defaults to no client, all accounts, today, ALL layer, auto-refresh on', () => {
    expect(DEFAULT_CLIENT_SYNC_CONTROLS).toEqual({ orgId: '', ibans: [], mode: 'today', from: '', to: '', layer: 'ALL', autoRefresh: true });
    expect(CLIENT_SYNC_CONTROLS_STORAGE_KEY).toBe('tep:clientSync:controls');
  });

  it('validates every field of an untrusted object', () => {
    expect(sanitizeControls(null)).toEqual(DEFAULT_CLIENT_SYNC_CONTROLS);
    expect(sanitizeControls({ orgId: 7, ibans: ['SA1', 2, null], mode: 'week', from: '2026-02-30', to: 'x', layer: 'Ops', autoRefresh: 'yes' }))
      .toEqual({ orgId: '', ibans: ['SA1'], mode: 'today', from: '', to: '', layer: 'ALL', autoRefresh: true });
    expect(sanitizeControls({ orgId: 'ORG-1', ibans: [], mode: 'range', from: '2026-10-01', to: '2026-10-10', layer: 'INTRADAY', autoRefresh: false }))
      .toEqual({ orgId: 'ORG-1', ibans: [], mode: 'range', from: '2026-10-01', to: '2026-10-10', layer: 'INTRADAY', autoRefresh: false });
  });

  it('drops an inverted range and a range longer than 31 days', () => {
    expect(sanitizeControls({ mode: 'range', from: '2026-10-10', to: '2026-10-01' })).toMatchObject({ mode: 'range', from: '', to: '' });
    expect(sanitizeControls({ mode: 'range', from: '2026-10-01', to: '2026-11-01' })).toMatchObject({ from: '', to: '' });
    expect(sanitizeControls({ mode: 'range', from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('storage', () => {
  it('round-trips through storage and never throws', () => {
    const storage = memoryStorage();
    writeStoredControls(storage, RANGE);
    expect(JSON.parse(storage.map.get(CLIENT_SYNC_CONTROLS_STORAGE_KEY) ?? '')).toEqual(RANGE);
    expect(readStoredControls(storage)).toEqual(RANGE);
    expect(readStoredControls(memoryStorage({ [CLIENT_SYNC_CONTROLS_STORAGE_KEY]: '{not json' }))).toEqual(DEFAULT_CLIENT_SYNC_CONTROLS);
    expect(readStoredControls(null)).toEqual(DEFAULT_CLIENT_SYNC_CONTROLS);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readStoredControls(throwing)).toEqual(DEFAULT_CLIENT_SYNC_CONTROLS);
    expect(() => writeStoredControls(throwing, RANGE)).not.toThrow();
  });
});

describe('range arithmetic', () => {
  it('counts whole days and rejects invalid dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0);
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-01', 'nope')).toBeNull();
  });

  it('caps at 31 inclusive days', () => {
    expect(rangeTooLong('2026-10-01', '2026-10-31')).toBe(false);
    expect(rangeTooLong('2026-10-01', '2026-11-01')).toBe(true);
    expect(rangeTooLong('bad', '2026-11-01')).toBe(false);
  });

  it('spansDays is true only for two different real dates', () => {
    expect(spansDays('2026-10-01', '2026-10-01')).toBe(false);
    expect(spansDays('2026-10-01', '2026-10-02')).toBe(true);
    expect(spansDays('', '2026-10-02')).toBe(false);
  });
});

describe('resolveRange, rangeError and buildScope', () => {
  it('uses today in today mode and the stored dates in range mode, each blank date falling back to today', () => {
    expect(resolveRange(DEFAULT_CLIENT_SYNC_CONTROLS, TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(resolveRange(RANGE, TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(resolveRange({ ...RANGE, from: '', to: '' }, TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(resolveRange({ ...RANGE, to: '' }, TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
  });

  it('blocks an inverted range and a range over the cap with the exact messages', () => {
    expect(rangeError(DEFAULT_CLIENT_SYNC_CONTROLS, TODAY)).toBeNull();
    expect(rangeError(RANGE, TODAY)).toBeNull();
    expect(rangeError({ ...RANGE, from: '2026-10-20', to: '2026-10-10' }, TODAY)).toBe(RANGE_INVERTED_MESSAGE);
    expect(rangeError({ ...RANGE, from: '2026-09-01', to: '2026-10-10' }, TODAY)).toBe(RANGE_TOO_LONG_MESSAGE);
    expect(RANGE_TOO_LONG_MESSAGE).toBe('Range can cover at most 31 days.');
  });

  it('builds the scope: OrgId when set, IBANs only when non-empty, Layer always, never a blank date', () => {
    expect(buildScope(DEFAULT_CLIENT_SYNC_CONTROLS, TODAY)).toEqual({ FromDate: TODAY, ToDate: TODAY, Layer: 'ALL' });
    expect(buildScope({ ...RANGE, ibans: ['SA1'], layer: 'CONFIRMED' }, TODAY)).toEqual({ OrgId: 'ORG-1', IBANs: ['SA1'], FromDate: '2026-10-01', ToDate: '2026-10-10', Layer: 'CONFIRMED' });
    expect(buildScope({ ...RANGE, from: '', to: '' }, TODAY)).toEqual({ OrgId: 'ORG-1', FromDate: TODAY, ToDate: TODAY, Layer: 'ALL' });
  });
});

describe('list request and paging', () => {
  it('builds the list request with a trimmed Search only when set', () => {
    const scope = buildScope(RANGE, TODAY);
    expect(buildTransactionsRequest(scope, 'ALL', '  ', 100)).toEqual({ ...scope, Show: 'ALL', PageIndex: 1, PageSize: 100 });
    expect(buildTransactionsRequest(scope, 'UNTAGGED', ' FT26 ', 150)).toEqual({ ...scope, Show: 'UNTAGGED', Search: 'FT26', PageIndex: 1, PageSize: 150 });
  });

  it('adds Side only for CR or DR, and Tags, customer types and certainty ranks only when some are picked', () => {
    const scope = buildScope(RANGE, TODAY);
    expect(buildTransactionsRequest(scope, 'ALL', '', 100, NO_LIST_FILTERS)).toEqual({ ...scope, Show: 'ALL', PageIndex: 1, PageSize: 100 });
    expect(buildTransactionsRequest(scope, 'ALL', '', 100, { side: 'CR', tags: ['UNTAGGED', 'IncomingTransfer'], customerTypes: ['TC'], certaintyRanks: [5, 4] }))
      .toEqual({ ...scope, Show: 'ALL', Side: 'CR', Tags: ['UNTAGGED', 'IncomingTransfer'], KbCustomerTypes: ['TC'], KbCertaintyRanks: [5, 4], PageIndex: 1, PageSize: 100 });
  });

  it('grows the limit by the step and caps at 2000', () => {
    expect(nextLimit(100, 50)).toBe(150);
    expect(nextLimit(1900, 200)).toBe(PAGE_SIZE_MAX);
    expect(PAGE_SIZE_MAX).toBe(2000);
  });
});
