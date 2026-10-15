import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { TepHeaders } from '../api/transactions';
import type { ClientSyncScope, ClientSyncTransactionsRequest } from '../api/clientSync';
import { makeSummaryFixture, makePageFixture, makeTraceFixture, makeTransactionFixture } from '../utils/clientSync/fixtures';

const mocks = vi.hoisted(() => ({ getClientSyncSummary: vi.fn(), getClientSyncTransactions: vi.fn(), getClientSyncTrace: vi.fn() }));
vi.mock('../api/clientSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/clientSync')>()),
  getClientSyncSummary: mocks.getClientSyncSummary,
  getClientSyncTransactions: mocks.getClientSyncTransactions,
  getClientSyncTrace: mocks.getClientSyncTrace,
}));

import { useClientSyncSummary, useClientSyncTransactions, useClientSyncTrace } from './useClientSync';

const HEADERS: TepHeaders = { userId: 'u', tenantCode: 't', languageCode: 'en', timeZone: 'UTC', requestId: 'r' };
const SCOPE: ClientSyncScope = { OrgId: 'ORG-1', FromDate: '2026-10-15', ToDate: '2026-10-15', Layer: 'ALL' };
const LIST: ClientSyncTransactionsRequest = { ...SCOPE, Show: 'ALL', PageIndex: 1, PageSize: 100 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe('useClientSync wrappers', () => {
  beforeEach(() => {
    mocks.getClientSyncSummary.mockReset().mockResolvedValue(makeSummaryFixture());
    mocks.getClientSyncTransactions.mockReset().mockResolvedValue(makePageFixture());
    mocks.getClientSyncTrace.mockReset().mockResolvedValue(makeTraceFixture());
  });

  it('summary: passes the scope, token, headers and a signal; honours enabled', async () => {
    const { result } = renderHook(() => useClientSyncSummary(SCOPE, 'tok', HEADERS));
    await act(async () => { await Promise.resolve(); });
    const [request, token, headers, signal] = mocks.getClientSyncSummary.mock.calls[0];
    expect(request).toEqual(SCOPE);
    expect(token).toBe('tok');
    expect(headers).toBe(HEADERS);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(result.current.report?.ClientName).toBe('Acme Trading');
    renderHook(() => useClientSyncSummary(SCOPE, 'tok', HEADERS, false));
    expect(mocks.getClientSyncSummary).toHaveBeenCalledTimes(1);
  });

  it('transactions: passes the list request and refetches only when its content changes', async () => {
    const { result, rerender } = renderHook(({ req }) => useClientSyncTransactions(req, 'tok', HEADERS), { initialProps: { req: LIST } });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getClientSyncTransactions.mock.calls[0][0]).toEqual(LIST);
    expect(result.current.report?.Transactions).toHaveLength(1);
    rerender({ req: { ...LIST } });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getClientSyncTransactions).toHaveBeenCalledTimes(1);
    rerender({ req: { ...LIST, PageSize: 150 } });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getClientSyncTransactions).toHaveBeenCalledTimes(2);
  });

  it('trace: disabled without a row, fetches by id, and never hands back a trace for a different row', async () => {
    const first = deferred<ReturnType<typeof makeTraceFixture>>();
    const second = deferred<ReturnType<typeof makeTraceFixture>>();
    mocks.getClientSyncTrace.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ id }) => useClientSyncTrace(id, 'tok', HEADERS), { initialProps: { id: null as string | null } });
    expect(mocks.getClientSyncTrace).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);

    rerender({ id: 'tx-1' });
    expect(mocks.getClientSyncTrace.mock.calls[0][0]).toEqual({ TransactionId: 'tx-1' });
    await act(async () => { first.resolve(makeTraceFixture()); });
    expect(result.current.report?.Transaction.Id).toBe('tx-1');

    rerender({ id: 'tx-2' });
    expect(result.current.report).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => { second.resolve(makeTraceFixture({ Transaction: makeTransactionFixture({ Id: 'tx-2' }) })); });
    expect(result.current.report?.Transaction.Id).toBe('tx-2');

    rerender({ id: null });
    expect(result.current.report).toBeNull();
  });

  it('summary: a scope change hands back null until the new scope resolves', async () => {
    const next = deferred<ReturnType<typeof makeSummaryFixture>>();
    mocks.getClientSyncSummary.mockReset()
      .mockResolvedValueOnce(makeSummaryFixture())
      .mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(({ scope }) => useClientSyncSummary(scope, 'tok', HEADERS), { initialProps: { scope: SCOPE } });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.report?.ClientName).toBe('Acme Trading');
    rerender({ scope: { ...SCOPE, OrgId: 'ORG-2' } });
    expect(result.current.report).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => { next.resolve(makeSummaryFixture({ ClientName: 'Beta Foods' })); });
    expect(result.current.report?.ClientName).toBe('Beta Foods');
  });

  it('transactions: a scope change hands back null, while a Show-only change keeps the previous page', async () => {
    const showOnly = deferred<ReturnType<typeof makePageFixture>>();
    const newScope = deferred<ReturnType<typeof makePageFixture>>();
    mocks.getClientSyncTransactions.mockReset()
      .mockResolvedValueOnce(makePageFixture())
      .mockReturnValueOnce(showOnly.promise)
      .mockReturnValueOnce(newScope.promise);
    const { result, rerender } = renderHook(({ req }) => useClientSyncTransactions(req, 'tok', HEADERS), { initialProps: { req: LIST } });
    await act(async () => { await Promise.resolve(); });
    const firstPage = result.current.report;
    expect(firstPage?.Transactions).toHaveLength(1);

    rerender({ req: { ...LIST, Show: 'UNTAGGED' } });
    expect(result.current.loading).toBe(true);
    expect(result.current.report).toBe(firstPage);
    await act(async () => { showOnly.resolve(makePageFixture([])); });
    expect(result.current.report?.Transactions).toHaveLength(0);

    rerender({ req: { ...LIST, Show: 'UNTAGGED', IBANs: ['SA0380000000608010167519'] } });
    expect(result.current.report).toBeNull();
    await act(async () => { newScope.resolve(makePageFixture()); });
    expect(result.current.report?.Transactions).toHaveLength(1);
  });

  it('trace: an error from one row is not shown while another row loads', async () => {
    const second = deferred<ReturnType<typeof makeTraceFixture>>();
    mocks.getClientSyncTrace.mockReset().mockRejectedValueOnce(new Error('boom')).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ id }) => useClientSyncTrace(id, 'tok', HEADERS), { initialProps: { id: 'tx-1' as string | null } });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.error).toBe('Failed to load the report');

    rerender({ id: 'tx-2' });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => { second.resolve(makeTraceFixture({ Transaction: makeTransactionFixture({ Id: 'tx-2' }) })); });
    expect(result.current.error).toBeNull();
    expect(result.current.report?.Transaction.Id).toBe('tx-2');
  });
});
