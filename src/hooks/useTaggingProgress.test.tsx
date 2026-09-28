import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { TepHeaders } from '../api/transactions';

const mocks = vi.hoisted(() => ({ getTaggingProgress: vi.fn() }));

vi.mock('../api/taggingProgress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/taggingProgress')>()),
  getTaggingProgress: mocks.getTaggingProgress,
}));

import { useTaggingProgress } from './useTaggingProgress';
import { DEFAULT_REPORT_CONTROLS, type ReportControls } from '../utils/reports/controls';
import { makeReportFixture } from '../utils/reports/fixtures';

const HEADERS: TepHeaders = { userId: 'u', tenantCode: 't', languageCode: 'en', timeZone: 'UTC', requestId: 'r' };

describe('useTaggingProgress', () => {
  beforeEach(() => {
    mocks.getTaggingProgress.mockReset();
    mocks.getTaggingProgress.mockResolvedValue(makeReportFixture());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 28, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds the request from the controls and today, and re-reads today on a later render', async () => {
    const controls: ReportControls = { ...DEFAULT_REPORT_CONTROLS, preset: 'last30' };
    const { rerender } = renderHook(() => useTaggingProgress(controls, 'tok', HEADERS));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getTaggingProgress).toHaveBeenCalledTimes(1);
    const [request, token, headers] = mocks.getTaggingProgress.mock.calls[0];
    expect(request).toEqual({ FromDate: '2026-08-30', ToDate: '2026-09-28', Granularity: 'Month', Layer: 'Ops' });
    expect(token).toBe('tok');
    expect(headers).toBe(HEADERS);

    rerender();
    expect(mocks.getTaggingProgress).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(2026, 8, 29, 12));
    rerender();
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getTaggingProgress).toHaveBeenCalledTimes(2);
    expect(mocks.getTaggingProgress.mock.calls[1][0]).toEqual({ FromDate: '2026-08-31', ToDate: '2026-09-29', Granularity: 'Month', Layer: 'Ops' });
  });

  it('passes enabled through', () => {
    const controls: ReportControls = { ...DEFAULT_REPORT_CONTROLS };
    const { result } = renderHook(() => useTaggingProgress(controls, 'tok', HEADERS, false));
    expect(mocks.getTaggingProgress).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});
