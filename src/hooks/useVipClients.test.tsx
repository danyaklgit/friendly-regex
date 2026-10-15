import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { TepHeaders } from '../api/transactions';
import type { VIPCustomer } from '../api/vipCustomers';
import { ApiError } from '../api/apiError';

const mocks = vi.hoisted(() => ({ getVIPCustomers: vi.fn() }));
vi.mock('../api/vipCustomers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/vipCustomers')>()),
  getVIPCustomers: mocks.getVIPCustomers,
}));

import { useVipClients, toVipClients } from './useVipClients';

const HEADERS: TepHeaders = { userId: 'u', tenantCode: 't', languageCode: 'en', timeZone: 'UTC', requestId: 'r' };

function customer(orgId: string, iban: string, names: { LanguageCode: string; OrgName: string }[], extra: Partial<VIPCustomer> = {}): VIPCustomer {
  return { OrgId: orgId, OrgNames: names, IBAN: iban, BankCode: 'RJHISARI', AccountNames: [{ LanguageCode: 'en', AccountName: `Acct ${iban.slice(-4)}` }], ...extra };
}

describe('toVipClients', () => {
  it('groups accounts by OrgId, names from the en org name then the first name then the id, sorted by name', () => {
    const clients = toVipClients([
      customer('ORG-Z', 'SA2', [{ LanguageCode: 'ar', OrgName: 'زد' }, { LanguageCode: 'en', OrgName: 'Zeta' }]),
      customer('ORG-A', 'SA9', [{ LanguageCode: 'en', OrgName: 'Acme' }]),
      customer('ORG-A', 'SA1', [{ LanguageCode: 'en', OrgName: 'Acme' }], { BankCode: null, AccountNames: [] }),
      customer('ORG-N', 'SA5', []),
      customer('ORG-F', 'SA7', [{ LanguageCode: 'fr', OrgName: 'Fleur' }]),
    ]);
    expect(clients.map((c) => [c.orgId, c.name])).toEqual([['ORG-A', 'Acme'], ['ORG-F', 'Fleur'], ['ORG-N', 'ORG-N'], ['ORG-Z', 'Zeta']]);
    expect(clients[0].accounts).toEqual([
      { iban: 'SA1', bankCode: '', accountName: '' },
      { iban: 'SA9', bankCode: 'RJHISARI', accountName: 'Acct SA9' },
    ]);
  });
});

describe('useVipClients', () => {
  beforeEach(() => { mocks.getVIPCustomers.mockReset(); });

  it('fetches once with token, headers and a signal, and exposes the grouped clients', async () => {
    mocks.getVIPCustomers.mockResolvedValue([customer('ORG-A', 'SA1', [{ LanguageCode: 'en', OrgName: 'Acme' }])]);
    const { result, rerender } = renderHook(() => useVipClients('tok', HEADERS));
    expect(result.current.loading).toBe(true);
    expect(result.current.clients).toEqual([]);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getVIPCustomers).toHaveBeenCalledTimes(1);
    const [token, headers, signal] = mocks.getVIPCustomers.mock.calls[0];
    expect(token).toBe('tok');
    expect(headers).toBe(HEADERS);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(result.current.clients).toEqual([{ orgId: 'ORG-A', name: 'Acme', accounts: [{ iban: 'SA1', bankCode: 'RJHISARI', accountName: 'Acct SA1' }] }]);
    rerender();
    expect(mocks.getVIPCustomers).toHaveBeenCalledTimes(1);
  });

  it('surfaces the ApiError message and refetches on demand', async () => {
    mocks.getVIPCustomers.mockRejectedValueOnce(new ApiError('VIP list unavailable', 503)).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useVipClients('tok', HEADERS));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.error).toBe('VIP list unavailable');
    await act(async () => { result.current.refetch(); });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getVIPCustomers).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('does nothing without a token', () => {
    const { result } = renderHook(() => useVipClients(null, HEADERS));
    expect(mocks.getVIPCustomers).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});
