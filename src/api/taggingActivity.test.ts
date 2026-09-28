import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import {
  getTaggingActivity, normalizeActivityReport, toActivityRequestBody, ZERO_ACTIVITY,
  type TaggingActivityRequest, type TaggingActivityMetrics,
} from './taggingActivity';
import { ApiError } from './apiError';
import type { TepHeaders } from './transactions';

const tepHeaders: TepHeaders = { userId: 'user-1', tenantCode: 'TENANT', languageCode: 'en', timeZone: 'UTC', requestId: 'req-1' };
const TOKEN = 'test-token';
const BASE = '/api/tep/api/v1/TEP';
const REQUEST: TaggingActivityRequest = { Granularity: 'Month' };

const AUG: TaggingActivityMetrics = { CheckIns: 88, Saves: 12, Rollbacks: 2, Workspaces: 22, Operators: 5, RulesAdded: 115, TransactionsTagged: 50560 };
const POINT_AUG = { ...AUG, PeriodStart: '2026-08-01', PeriodEnd: '2026-08-31', Label: '2026-08' };
const TOTALS: TaggingActivityMetrics = { CheckIns: 339, Saves: 30, Rollbacks: 10, Workspaces: 22, Operators: 5, RulesAdded: 247, TransactionsTagged: 50566 };
const RESPONSE = {
  TaggingActivity: {
    Granularity: 'Month', FromDate: '2026-05-27', ToDate: '2026-09-25', HistoryStartsAt: '2026-05-27',
    TransactionsTaggedIsReconstructed: true, ComputedAtUtc: '2026-09-28T08:45:00Z',
    Points: [POINT_AUG], Totals: TOTALS,
    SummaryLines: ['TEP tagging activity, 2026-05-27 to 2026-09-25', '', '- 339 check-in(s) by 5 operator(s) across 22 workspace(s)'],
    SummaryText: 'TEP tagging activity, 2026-05-27 to 2026-09-25\n\n- 339 check-in(s) by 5 operator(s) across 22 workspace(s)',
  },
  SFM: {},
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('getTaggingActivity', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>; });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('POSTs to /GetTaggingActivity with the TEP header bundle and only the set dates', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(RESPONSE));
    await getTaggingActivity({ FromDate: '2026-06-01', ToDate: '', Granularity: 'Week' }, TOKEN, tepHeaders);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/GetTaggingActivity`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.ActivityTag).toBe('GetTaggingActivity');
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual({ Granularity: 'Week', FromDate: '2026-06-01' });
  });

  it('returns the normalized report', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(RESPONSE));
    const report = await getTaggingActivity(REQUEST, TOKEN, tepHeaders);
    expect(report.HistoryStartsAt).toBe('2026-05-27');
    expect(report.TransactionsTaggedIsReconstructed).toBe(true);
    expect(report.Points).toEqual([POINT_AUG]);
    expect(report.Totals).toEqual(TOTALS);
    expect(report.SummaryLines).toHaveLength(3);
  });

  it('normalizes a null TaggingActivity into an empty report that still counts as reconstructed', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ TaggingActivity: null, SFM: {} }));
    const report = await getTaggingActivity(REQUEST, TOKEN, tepHeaders);
    expect(report).toEqual({
      Granularity: 'Month', FromDate: '', ToDate: '', HistoryStartsAt: '', TransactionsTaggedIsReconstructed: true,
      ComputedAtUtc: '', Points: [], Totals: ZERO_ACTIVITY, SummaryLines: [], SummaryText: '',
    });
  });

  it('throws ApiError with the SFM short description on a non-OK status', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ SFM: { Minor: [{ MinorRetCodeDetails: [{ ShortDescription: 'Unknown Granularity' }] }] } }, 400));
    const promise = getTaggingActivity(REQUEST, TOKEN, tepHeaders);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ message: 'Unknown Granularity', status: 400 });
  });
});

describe('normalizeActivityReport', () => {
  it('coerces string and null values, drops points without a PeriodStart, honours an explicit false flag', () => {
    const report = normalizeActivityReport({
      TaggingActivity: {
        TransactionsTaggedIsReconstructed: false,
        Points: [{ ...POINT_AUG, CheckIns: '88', TransactionsTagged: null }, { ...POINT_AUG, PeriodStart: '' }, 'junk'],
        Totals: { CheckIns: '339' },
      },
    }, REQUEST);
    expect(report.TransactionsTaggedIsReconstructed).toBe(false);
    expect(report.Points).toHaveLength(1);
    expect(report.Points[0].CheckIns).toBe(88);
    expect(report.Points[0].TransactionsTagged).toBe(0);
    expect(report.Totals).toEqual({ ...ZERO_ACTIVITY, CheckIns: 339 });
  });

  it('falls back to the request granularity when the echo is invalid', () => {
    expect(normalizeActivityReport({ TaggingActivity: { Granularity: 'Quarter' } }, { Granularity: 'Day' }).Granularity).toBe('Day');
  });
});

describe('toActivityRequestBody', () => {
  it('always carries Granularity and drops empty dates', () => {
    expect(toActivityRequestBody({ Granularity: 'Year', FromDate: '', ToDate: '2026-09-30' })).toEqual({ Granularity: 'Year', ToDate: '2026-09-30' });
  });
});
