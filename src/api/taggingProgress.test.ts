import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import {
  getTaggingProgress, normalizeReport, toRequestBody, ZERO_METRICS,
  type TaggingProgressRequest, type TaggingMetrics,
} from './taggingProgress';
import { ApiError } from './apiError';
import type { TepHeaders } from './transactions';

const tepHeaders: TepHeaders = { userId: 'user-1', tenantCode: 'TENANT', languageCode: 'en', timeZone: 'UTC', requestId: 'req-1' };
const TOKEN = 'test-token';
const BASE = '/api/tep/api/v1/TEP';
const REQUEST: TaggingProgressRequest = { Granularity: 'Year', Layer: 'Ops' };

const METRICS_2022: TaggingMetrics = {
  TotalTransactionCount: 74, TotalTaggedCount: 72, TaggingRate: 97.3, FullyTaggedCount: 72, IssuesCount: 0,
  TaggedWithMissingMandatoryAttrCount: 0, TaggedWithMissingOptionalAttrCount: 0, TaggedWithInvalidAttrCount: 0,
  UntaggedCount: 2, MultiTaggedCount: 0, DeadEndCount: 0,
};
const POINT_2022 = { ...METRICS_2022, PeriodStart: '2022-01-01', PeriodEnd: '2022-12-31', Label: '2022' };
const RESPONSE = {
  TaggingProgress: {
    Granularity: 'Year', FromDate: '2022-07-18', ToDate: '2026-09-27', Layer: 'Ops', ComputedAtUtc: '2026-09-28T07:46:58Z',
    Series: [{ DataSetType: 'MT940', Points: [POINT_2022], Totals: METRICS_2022 }],
    Totals: METRICS_2022,
    SummaryLines: ['TEP tagging progress, 2022-07-18 to 2026-09-27', '', '- 74 transactions'],
    SummaryText: 'TEP tagging progress, 2022-07-18 to 2026-09-27\n\n- 74 transactions',
  },
  SFM: {},
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('getTaggingProgress', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>; });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('POSTs to /GetTaggingProgress with the TEP header bundle and only the set fields', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(RESPONSE));
    const controller = new AbortController();
    await getTaggingProgress(
      { FromDate: '2026-01-01', ToDate: '', Granularity: 'Month', DataSetTypes: ['MT940'], BankSwiftCodes: [], Sides: undefined, Layer: 'Active' },
      TOKEN, tepHeaders, controller.signal,
    );
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/GetTaggingProgress`);
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(controller.signal);
    const headers = init.headers as Record<string, string>;
    expect(headers.ActivityTag).toBe('GetTaggingProgress');
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers.TTPUserId).toBe('user-1');
    expect(headers.TTPTenantCode).toBe('TENANT');
    expect(JSON.parse(init.body as string)).toEqual({ Granularity: 'Month', Layer: 'Active', FromDate: '2026-01-01', DataSetTypes: ['MT940'] });
  });

  it('returns the normalized report', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(RESPONSE));
    const report = await getTaggingProgress(REQUEST, TOKEN, tepHeaders);
    expect(report.Granularity).toBe('Year');
    expect(report.FromDate).toBe('2022-07-18');
    expect(report.Layer).toBe('Ops');
    expect(report.ComputedAtUtc).toBe('2026-09-28T07:46:58Z');
    expect(report.Series).toHaveLength(1);
    expect(report.Series[0].DataSetType).toBe('MT940');
    expect(report.Series[0].Points[0]).toEqual(POINT_2022);
    expect(report.Series[0].Totals).toEqual(METRICS_2022);
    expect(report.Totals).toEqual(METRICS_2022);
    expect(report.SummaryLines).toHaveLength(3);
    expect(report.SummaryText).toContain('74 transactions');
  });

  it('normalizes a null TaggingProgress into an empty report', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ TaggingProgress: null, SFM: {} }));
    const report = await getTaggingProgress(REQUEST, TOKEN, tepHeaders);
    expect(report).toEqual({
      Granularity: 'Year', FromDate: '', ToDate: '', Layer: 'Ops', ComputedAtUtc: '',
      Series: [], Totals: ZERO_METRICS, SummaryLines: [], SummaryText: '',
    });
  });

  it('throws ApiError with the SFM short description on a non-OK status', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ SFM: { Minor: [{ MinorRetCodeDetails: [{ ShortDescription: 'FromDate is after ToDate' }] }] } }, 400));
    const promise = getTaggingProgress(REQUEST, TOKEN, tepHeaders);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ message: 'FromDate is after ToDate', status: 400 });
  });
});

describe('normalizeReport', () => {
  it('coerces string and null metric values to numbers', () => {
    const report = normalizeReport({
      TaggingProgress: { Series: [{ DataSetType: 'MT940', Points: [{ ...POINT_2022, TotalTransactionCount: '74', TaggingRate: null }], Totals: { TotalTransactionCount: '74' } }] },
    }, REQUEST);
    expect(report.Series[0].Points[0].TotalTransactionCount).toBe(74);
    expect(report.Series[0].Points[0].TaggingRate).toBe(0);
    expect(report.Series[0].Totals).toEqual({ ...ZERO_METRICS, TotalTransactionCount: 74 });
  });

  it('drops points without a PeriodStart and series without a DataSetType', () => {
    const report = normalizeReport({
      TaggingProgress: {
        Series: [
          { DataSetType: 'MT940', Points: [POINT_2022, { ...POINT_2022, PeriodStart: undefined }, 'junk', null] },
          { Points: [POINT_2022] },
          null,
        ],
      },
    }, REQUEST);
    expect(report.Series).toHaveLength(1);
    expect(report.Series[0].Points).toHaveLength(1);
    expect(report.Series[0].Totals).toEqual(ZERO_METRICS);
  });

  it('derives SummaryLines from SummaryText when the lines are missing, and vice versa', () => {
    const fromText = normalizeReport({ TaggingProgress: { SummaryText: 'a\n\nb' } }, REQUEST);
    expect(fromText.SummaryLines).toEqual(['a', '', 'b']);
    const fromLines = normalizeReport({ TaggingProgress: { SummaryLines: ['a', 'b'] } }, REQUEST);
    expect(fromLines.SummaryText).toBe('a\nb');
  });

  it('falls back to the request granularity and layer when the echo is invalid', () => {
    const report = normalizeReport({ TaggingProgress: { Granularity: 'Fortnight', Layer: 'ops' } }, { Granularity: 'Week', Layer: 'Active' });
    expect(report.Granularity).toBe('Week');
    expect(report.Layer).toBe('Active');
  });
});

describe('toRequestBody', () => {
  it('always carries Granularity and Layer and drops empties', () => {
    expect(toRequestBody({ Granularity: 'Day', Layer: 'Ops', FromDate: '', DataSetTypes: [], Sides: ['CR'] }))
      .toEqual({ Granularity: 'Day', Layer: 'Ops', Sides: ['CR'] });
  });
});
