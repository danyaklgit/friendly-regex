import { useCallback, useMemo, useState } from 'react';
import {
  getClientSyncSummary, getClientSyncTransactions, getClientSyncTrace,
  type ClientSyncScope, type ClientSyncSummary, type ClientSyncTrace, type ClientSyncTraceRequest,
  type ClientSyncTransactionsPage, type ClientSyncTransactionsRequest,
} from '../api/clientSync';
import type { TepHeaders } from '../api/transactions';
import { useReportRequest, type ReportFetcher, type ReportRequestState } from './useReportRequest';

/**
 * Identity of the SCOPE only (client, accounts, dates, layer). Show, Search
 * and PageSize are deliberately left out: a filter, search or load-more
 * change keeps the previous rows visible (dimmed) while it reloads, whereas a
 * scope change must never show another scope's data.
 */
function scopeKeyOf(scope: ClientSyncScope): string {
  return JSON.stringify({
    OrgId: scope.OrgId ?? null, IBANs: scope.IBANs ?? null, FromDate: scope.FromDate, ToDate: scope.ToDate, Layer: scope.Layer,
  });
}

interface ScopedEnvelope<T> { forScope: string; data: T }

const fetchSummary: ReportFetcher<ClientSyncScope, ScopedEnvelope<ClientSyncSummary>> = async (request, token, headers, signal) => ({
  forScope: scopeKeyOf(request),
  data: await getClientSyncSummary(request, token, headers, signal),
});

const fetchTransactions: ReportFetcher<ClientSyncTransactionsRequest, ScopedEnvelope<ClientSyncTransactionsPage>> = async (request, token, headers, signal) => ({
  forScope: scopeKeyOf(request),
  data: await getClientSyncTransactions(request, token, headers, signal),
});

/**
 * useReportRequest retains the last report across request changes; unwrap it
 * only when it belongs to the current scope, so a new scope shows the
 * skeleton (or its own error) instead of the previous scope's data.
 */
function unwrapScoped<T>(state: ReportRequestState<ScopedEnvelope<T>>, scope: ClientSyncScope): ReportRequestState<T> {
  const report = state.report && state.report.forScope === scopeKeyOf(scope) ? state.report.data : null;
  return { report, loading: state.loading, error: state.error, refetch: state.refetch };
}

/** Summary for the scope; `enabled` is false until a client is picked and the range is valid. */
export function useClientSyncSummary(
  scope: ClientSyncScope,
  authToken: string | null,
  tepHeaders: TepHeaders | null,
  enabled = true,
): ReportRequestState<ClientSyncSummary> {
  return unwrapScoped(useReportRequest(scope, fetchSummary, authToken, tepHeaders, enabled), scope);
}

/** The loaded window of rows; load-more re-keys the request through PageSize. */
export function useClientSyncTransactions(
  request: ClientSyncTransactionsRequest,
  authToken: string | null,
  tepHeaders: TepHeaders | null,
  enabled = true,
): ReportRequestState<ClientSyncTransactionsPage> {
  return unwrapScoped(useReportRequest(request, fetchTransactions, authToken, tepHeaders, enabled), request);
}

interface TraceEnvelope { forId: string; trace: ClientSyncTrace }

/**
 * Enabled only while a row is selected. useReportRequest retains the last
 * report and error across request changes; the envelope records which row a
 * trace belongs to, and `settledId` which row the last settled (not aborted)
 * request was for, so a newly opened row shows the skeleton instead of the
 * previous row's trace or error.
 */
export function useClientSyncTrace(
  transactionId: string | null,
  authToken: string | null,
  tepHeaders: TepHeaders | null,
): ReportRequestState<ClientSyncTrace> {
  const [settledId, setSettledId] = useState<string | null>(null);
  const fetchTrace = useCallback<ReportFetcher<ClientSyncTraceRequest, TraceEnvelope>>(async (request, token, headers, signal) => {
    try {
      return { forId: request.TransactionId, trace: await getClientSyncTrace(request, token, headers, signal) };
    } finally {
      if (!signal?.aborted) setSettledId(request.TransactionId);
    }
  }, []);
  const request = useMemo((): ClientSyncTraceRequest => ({ TransactionId: transactionId ?? '' }), [transactionId]);
  const state = useReportRequest(request, fetchTrace, authToken, tepHeaders, transactionId !== null && transactionId !== '');
  const report = state.report && state.report.forId === transactionId ? state.report.trace : null;
  const error = transactionId !== null && transactionId === settledId ? state.error : null;
  return { report, loading: state.loading, error, refetch: state.refetch };
}
