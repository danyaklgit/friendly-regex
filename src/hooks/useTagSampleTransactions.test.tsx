import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../api/transactions', async () => {
  const actual = await vi.importActual<typeof import('../api/transactions')>('../api/transactions');
  return {
    ...actual,
    getTransactions: vi.fn(),
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
    userId: 'user-1',
    refreshIfNeeded: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../context/TepConfigContext', () => ({
  useTepConfig: () => ({
    ttpTenantCode: 'TENANT',
    languageCode: 'en',
    timeZone: 'UTC',
    ttpRequestId: 'req-1',
  }),
}));

const useTransactionDataMock = vi.fn(() => ({ isLiveMode: true }));
vi.mock('./useTransactionData', () => ({
  useTransactionData: () => useTransactionDataMock(),
}));

import { getTransactions } from '../api/transactions';
import { useTagSampleTransactions } from './useTagSampleTransactions';

const mockedGetTransactions = vi.mocked(getTransactions);

describe('useTagSampleTransactions', () => {
  beforeEach(() => {
    mockedGetTransactions.mockReset();
    useTransactionDataMock.mockReset();
    useTransactionDataMock.mockReturnValue({ isLiveMode: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null rows and fires nothing when definitionId is null', async () => {
    const { result } = renderHook(() => useTagSampleTransactions(null));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.rows).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockedGetTransactions).not.toHaveBeenCalled();
  });

  it('fires once with the tag-id filter and stores rows on success', async () => {
    mockedGetTransactions.mockResolvedValue({
      Transactions: [{ StatementDate: '2026-01-01', Side: 'CR', Amount: 100, Description1: 'TEST' }],
    });

    const { result } = renderHook(() => useTagSampleTransactions('def-123'));

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(mockedGetTransactions).toHaveBeenCalledTimes(1);
    const [request] = mockedGetTransactions.mock.calls[0];
    expect(request.FilteringProperties).toEqual([
      {
        ColumnName: 'OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId',
        Value: 'def-123',
        Operand: 'EQ',
      },
    ]);
    expect(request.Pagination).toEqual({ PageIndex: 0, PageSize: 50 });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it('returns empty rows without firing in sample mode', async () => {
    useTransactionDataMock.mockReturnValue({ isLiveMode: false });
    const { result } = renderHook(() => useTagSampleTransactions('def-123'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockedGetTransactions).not.toHaveBeenCalled();
  });

  it('aborts the in-flight request when definitionId changes mid-flight', async () => {
    let firstSignal: AbortSignal | undefined;
    mockedGetTransactions.mockImplementationOnce(async (_req, _token, _headers, signal) => {
      firstSignal = signal;
      return new Promise<{ Transactions: never[] }>((resolve, reject) => {
        const timer = setTimeout(() => resolve({ Transactions: [] }), 10_000);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    mockedGetTransactions.mockResolvedValueOnce({
      Transactions: [{ StatementDate: '2026-02-02', Side: 'DR', Amount: 50, Description1: 'FRESH' }],
    });

    const { rerender, result } = renderHook(
      ({ id }: { id: string }) => useTagSampleTransactions(id),
      { initialProps: { id: 'def-1' } },
    );

    await act(async () => { await Promise.resolve(); });
    expect(mockedGetTransactions).toHaveBeenCalledTimes(1);

    rerender({ id: 'def-2' });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(firstSignal?.aborted).toBe(true);
    expect(mockedGetTransactions).toHaveBeenCalledTimes(2);
    expect(result.current.rows).toEqual([
      { StatementDate: '2026-02-02', Side: 'DR', Amount: 50, Description1: 'FRESH' },
    ]);
  });
});
