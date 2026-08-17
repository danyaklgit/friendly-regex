import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { WizardFormState } from '../types';

// Mock the network call. Each test redefines its mock as needed.
vi.mock('../api/transactions', async () => {
  const actual = await vi.importActual<typeof import('../api/transactions')>('../api/transactions');
  return {
    ...actual,
    getAllTransactionTags: vi.fn(),
  };
});

// Stubbed contexts so the hook can run without the full provider tree.
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

vi.mock('./useTransactionData', () => ({
  useTransactionData: () => ({ isLiveMode: true }),
}));

import { getAllTransactionTags } from '../api/transactions';
import { useMatchingTagIds } from './useMatchingTagIds';

const mockedGetAllTransactionTags = vi.mocked(getAllTransactionTags);

function makeFormState(overrides: Partial<WizardFormState> = {}): WizardFormState {
  return {
    tag: '',
    side: 'CR',
    bankSwiftCode: 'ARNBSARI',
    dataSetType: 'MT940',
    clientCode: '',
    erpCode: '',
    transactionTypeCode: 'TRF',
    statusTag: 'ACTIVE',
    certaintyLevelTag: 'HIGH',
    validity: { StartDate: '2026-01-01', EndDate: null },
    ruleGroups: [],
    attributes: [],
    ...overrides,
  };
}

describe('useMatchingTagIds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedGetAllTransactionTags.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null with no fetch when disabled', async () => {
    const { result } = renderHook(() => useMatchingTagIds(makeFormState(), false));
    expect(result.current.ids).toBeNull();
    expect(result.current.loading).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedGetAllTransactionTags).not.toHaveBeenCalled();
  });

  it('returns null when bankSwiftCode is missing', async () => {
    const { result } = renderHook(() =>
      useMatchingTagIds(makeFormState({ bankSwiftCode: '' }), true),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.ids).toBeNull();
    expect(mockedGetAllTransactionTags).not.toHaveBeenCalled();
  });

  it('debounces multiple rapid form-state changes into a single call', async () => {
    mockedGetAllTransactionTags.mockResolvedValue(['id-a']);

    const { rerender } = renderHook(
      ({ form }: { form: WizardFormState }) => useMatchingTagIds(form, true),
      { initialProps: { form: makeFormState({ transactionTypeCode: 'TRF' }) } },
    );

    // Rapid edits before the debounce window elapses
    rerender({ form: makeFormState({ transactionTypeCode: 'CHK' }) });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    rerender({ form: makeFormState({ transactionTypeCode: 'INT' }) });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    rerender({ form: makeFormState({ transactionTypeCode: 'WIR' }) });

    // Before the window elapses, no calls
    expect(mockedGetAllTransactionTags).not.toHaveBeenCalled();

    // After the full debounce window past the last edit, exactly one call
    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    expect(mockedGetAllTransactionTags).toHaveBeenCalledTimes(1);

    // The fired call carries the latest payload
    const [request] = mockedGetAllTransactionTags.mock.calls[0];
    expect(request.FilteringProperties).toContainEqual({
      ColumnName: 'TransactionTypeCode',
      Value: 'WIR',
      Operand: 'EQ',
    });
  });

  it('stores the response IDs after a successful call', async () => {
    mockedGetAllTransactionTags.mockResolvedValue(['def-1', 'def-2']);

    const { result } = renderHook(() => useMatchingTagIds(makeFormState(), true));

    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    expect(mockedGetAllTransactionTags).toHaveBeenCalledTimes(1);
    expect(result.current.ids).toEqual(['def-1', 'def-2']);
    expect(result.current.loading).toBe(false);
  });

  it('aborts the in-flight call when form-state changes mid-flight', async () => {
    let firstSignal: AbortSignal | undefined;
    mockedGetAllTransactionTags.mockImplementationOnce(async (_req, _token, _headers, signal) => {
      firstSignal = signal;
      return new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(() => resolve(['stale']), 10_000);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    mockedGetAllTransactionTags.mockResolvedValueOnce(['fresh']);

    const { rerender, result } = renderHook(
      ({ form }: { form: WizardFormState }) => useMatchingTagIds(form, true),
      { initialProps: { form: makeFormState({ transactionTypeCode: 'TRF' }) } },
    );

    // Fire the first call
    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    expect(mockedGetAllTransactionTags).toHaveBeenCalledTimes(1);

    // Change the payload — should abort the first call and schedule a new one
    rerender({ form: makeFormState({ transactionTypeCode: 'CHK' }) });
    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    expect(firstSignal?.aborted).toBe(true);
    expect(mockedGetAllTransactionTags).toHaveBeenCalledTimes(2);

    // The fresh response wins
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.ids).toEqual(['fresh']);
  });
});
