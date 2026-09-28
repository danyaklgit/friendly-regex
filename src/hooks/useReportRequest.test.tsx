import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReportRequest, type ReportFetcher } from './useReportRequest';
import type { TepHeaders } from '../api/transactions';
import { ApiError } from '../api/apiError';

const HEADERS: TepHeaders = { userId: 'u', tenantCode: 't', languageCode: 'en', timeZone: 'UTC', requestId: 'r' };

interface Req { granularity: string }
interface Rep { name: string }

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useReportRequest', () => {
  let fetcher: ReturnType<typeof vi.fn<ReportFetcher<Req, Rep>>>;

  beforeEach(() => {
    fetcher = vi.fn<ReportFetcher<Req, Rep>>();
  });

  it('fetches once on mount with the request, token, headers, and a signal, then stores the report', async () => {
    const d = deferred<Rep>();
    fetcher.mockReturnValueOnce(d.promise);
    const { result } = renderHook(() => useReportRequest<Req, Rep>({ granularity: 'Month' }, fetcher, 'tok', HEADERS));
    expect(result.current.loading).toBe(true);
    expect(result.current.report).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [request, token, headers, signal] = fetcher.mock.calls[0];
    expect(request).toEqual({ granularity: 'Month' });
    expect(token).toBe('tok');
    expect(headers).toBe(HEADERS);
    expect(signal).toBeInstanceOf(AbortSignal);
    await act(async () => { d.resolve({ name: 'A' }); });
    expect(result.current.loading).toBe(false);
    expect(result.current.report).toEqual({ name: 'A' });
    expect(result.current.error).toBeNull();
  });

  it('does not refetch when the request content is unchanged (new object, same JSON)', async () => {
    fetcher.mockResolvedValue({ name: 'A' });
    const { rerender } = renderHook(({ req }) => useReportRequest<Req, Rep>(req, fetcher, 'tok', HEADERS), { initialProps: { req: { granularity: 'Month' } } });
    await act(async () => { await Promise.resolve(); });
    rerender({ req: { granularity: 'Month' } });
    await act(async () => { await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight request on change and ignores its late result', async () => {
    const d1 = deferred<Rep>();
    const d2 = deferred<Rep>();
    fetcher.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    const { result, rerender } = renderHook(({ req }) => useReportRequest<Req, Rep>(req, fetcher, 'tok', HEADERS), { initialProps: { req: { granularity: 'Month' } } });
    rerender({ req: { granularity: 'Week' } });
    const firstSignal = fetcher.mock.calls[0][3] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => { d2.resolve({ name: 'B' }); });
    expect(result.current.report).toEqual({ name: 'B' });
    await act(async () => { d1.resolve({ name: 'A' }); });
    expect(result.current.report).toEqual({ name: 'B' });
    expect(result.current.loading).toBe(false);
  });

  it('ignores an abort rejection from the superseded request', async () => {
    const d1 = deferred<Rep>();
    const d2 = deferred<Rep>();
    fetcher.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    const { result, rerender } = renderHook(({ req }) => useReportRequest<Req, Rep>(req, fetcher, 'tok', HEADERS), { initialProps: { req: { granularity: 'Month' } } });
    rerender({ req: { granularity: 'Week' } });
    await act(async () => { d1.reject(new DOMException('Aborted', 'AbortError')); });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.report).toBeNull();
    await act(async () => { d2.resolve({ name: 'B' }); });
    expect(result.current.report).toEqual({ name: 'B' });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps the previous report while refetching and on error, and clears the error on the next success', async () => {
    const d1 = deferred<Rep>();
    const d2 = deferred<Rep>();
    const d3 = deferred<Rep>();
    fetcher.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise).mockReturnValueOnce(d3.promise);
    const { result, rerender } = renderHook(({ req }) => useReportRequest<Req, Rep>(req, fetcher, 'tok', HEADERS), { initialProps: { req: { granularity: 'Month' } } });
    await act(async () => { d1.resolve({ name: 'A' }); });
    rerender({ req: { granularity: 'Week' } });
    expect(result.current.loading).toBe(true);
    expect(result.current.report).toEqual({ name: 'A' });
    await act(async () => { d2.reject(new ApiError('boom', 500)); });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('boom');
    expect(result.current.report).toEqual({ name: 'A' });
    rerender({ req: { granularity: 'Day' } });
    await act(async () => { d3.resolve({ name: 'C' }); });
    expect(result.current.error).toBeNull();
    expect(result.current.report).toEqual({ name: 'C' });
  });

  it('uses a generic message for non-Error rejections', async () => {
    fetcher.mockRejectedValueOnce('nope');
    const { result } = renderHook(() => useReportRequest<Req, Rep>({ granularity: 'Month' }, fetcher, 'tok', HEADERS));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.error).toBe('Failed to load the report');
  });

  it('uses the generic message for a plain Error (network or parse failure)', async () => {
    fetcher.mockRejectedValueOnce(new Error('Unexpected token <'));
    const { result } = renderHook(() => useReportRequest<Req, Rep>({ granularity: 'Month' }, fetcher, 'tok', HEADERS));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.error).toBe('Failed to load the report');
  });

  it('refetch fires the same request again', async () => {
    fetcher.mockResolvedValue({ name: 'A' });
    const { result } = renderHook(() => useReportRequest<Req, Rep>({ granularity: 'Month' }, fetcher, 'tok', HEADERS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { result.current.refetch(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toEqual({ granularity: 'Month' });
  });

  it('fetches nothing while disabled or without auth, then fetches once enabled', async () => {
    fetcher.mockResolvedValue({ name: 'A' });
    const { result, rerender } = renderHook(
      ({ enabled, token }) => useReportRequest<Req, Rep>({ granularity: 'Month' }, fetcher, token, HEADERS, enabled),
      { initialProps: { enabled: false, token: 'tok' as string | null } },
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    rerender({ enabled: true, token: null });
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ enabled: true, token: 'tok' });
    await act(async () => { await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.report).toEqual({ name: 'A' });
  });

  it('disabling mid-flight aborts the request, reports loading false, and keeps the previous report', async () => {
    const d1 = deferred<Rep>();
    const d2 = deferred<Rep>();
    const d3 = deferred<Rep>();
    fetcher.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise).mockReturnValueOnce(d3.promise);
    const { result, rerender } = renderHook(
      ({ req, enabled }) => useReportRequest<Req, Rep>(req, fetcher, 'tok', HEADERS, enabled),
      { initialProps: { req: { granularity: 'Month' }, enabled: true } },
    );
    await act(async () => { d1.resolve({ name: 'A' }); });
    rerender({ req: { granularity: 'Week' }, enabled: true });
    expect(result.current.loading).toBe(true);
    rerender({ req: { granularity: 'Week' }, enabled: false });
    const secondSignal = fetcher.mock.calls[1][3] as AbortSignal;
    expect(secondSignal.aborted).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.report).toEqual({ name: 'A' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    rerender({ req: { granularity: 'Week' }, enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('fetches nothing without headers', () => {
    const { result } = renderHook(() => useReportRequest<Req, Rep>({ granularity: 'Month' }, fetcher, 'tok', null));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('aborts on unmount', () => {
    fetcher.mockReturnValueOnce(deferred<Rep>().promise);
    const { unmount } = renderHook(() => useReportRequest<Req, Rep>({ granularity: 'Month' }, fetcher, 'tok', HEADERS));
    unmount();
    expect((fetcher.mock.calls[0][3] as AbortSignal).aborted).toBe(true);
  });
});
