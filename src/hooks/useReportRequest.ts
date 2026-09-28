import { useCallback, useEffect, useState } from 'react';
import type { TepHeaders } from '../api/transactions';
import { ApiError } from '../api/apiError';

export interface ReportRequestState<Rep> {
  report: Rep | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export type ReportFetcher<Req, Rep> = (request: Req, authToken: string, tepHeaders: TepHeaders, signal?: AbortSignal) => Promise<Rep>;

/**
 * Abort-aware fetch for the Reports tab. Keyed on the request CONTENT
 * (JSON) so a new-but-identical controls object never refetches, while any
 * real change aborts the in-flight request and ignores its late result. The
 * last report is retained while loading and on error (stale-while-refetch:
 * the page dims instead of blanking). `enabled=false` fetches nothing, which
 * lets the tab hold both sub-view hooks and only run the visible one.
 * `request` must be plain JSON data (it is keyed and re-parsed as JSON).
 * `fetcher` and `tepHeaders` must be referentially stable (module-level fetcher, memoized headers) or every state update refetches.
 */
export function useReportRequest<Req, Rep>(
  request: Req,
  fetcher: ReportFetcher<Req, Rep>,
  authToken: string | null,
  tepHeaders: TepHeaders | null,
  enabled = true,
): ReportRequestState<Rep> {
  const [report, setReport] = useState<Rep | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    if (!enabled || !authToken || !tepHeaders) return;
    const controller = new AbortController();
    const parsed = JSON.parse(requestKey) as Req;
    setLoading(true);
    fetcher(parsed, authToken, tepHeaders, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setReport(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load the report');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requestKey, nonce, enabled, authToken, tepHeaders, fetcher]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { report, loading: loading && enabled && !!authToken && !!tepHeaders, error, refetch };
}
