import type { TepHeaders, BacklogStatEntry } from './transactions';
import { throwIfNotOk } from './apiError';
import {
  TEP_BASE, tepReportHeaders, asRecord, numberOrZero, stringOrEmpty, summaryPair, isGranularity, isLayer,
  type TaggingGranularity, type TaggingLayer,
} from './taggingReportsShared';

export type { TaggingGranularity, TaggingLayer } from './taggingReportsShared';
export { TAGGING_GRANULARITIES, TAGGING_LAYERS, isGranularity, isLayer } from './taggingReportsShared';

// --- GetTaggingProgress (backend 2026-09-28) ---------------------------------
// Coverage of the transactions DATED in each business period, as of now. The
// x-axis is StatementDate, never "when it was tagged". Same metric names and
// rules as the Backlog screen (BacklogStatsResult), so the types are shared.

export interface TaggingProgressRequest {
  /** yyyy-MM-dd, inclusive. Omitted = earliest data. */
  FromDate?: string;
  /** yyyy-MM-dd, inclusive. Omitted = latest data. */
  ToDate?: string;
  /** Always sent. Weeks start on Sunday (Saudi business week). */
  Granularity: TaggingGranularity;
  /** Omitted when empty. */
  DataSetTypes?: string[];
  /** Omitted when empty. */
  BankSwiftCodes?: string[];
  /** 'CR' | 'DR'. Omitted when empty. */
  Sides?: string[];
  /** Always sent: the doc contradicts itself on the default. */
  Layer: TaggingLayer;
}

/** The eleven metric fields shared with the Backlog screen (same names, same meaning). */
export type TaggingMetrics = Omit<BacklogStatEntry, 'TagSpecLibraryId'>;

export interface TaggingProgressPoint extends TaggingMetrics {
  PeriodStart: string;
  PeriodEnd: string;
  /** Backend's own label for the period; shown in tooltips, not on the axis. */
  Label: string;
}

export interface TaggingProgressSeries {
  DataSetType: string;
  Points: TaggingProgressPoint[];
  Totals: TaggingMetrics;
}

export interface TaggingProgressReport {
  Granularity: TaggingGranularity;
  /** Range actually used (echoed by the backend; both ends are optional on the request). */
  FromDate: string;
  ToDate: string;
  Layer: TaggingLayer;
  ComputedAtUtc: string;
  Series: TaggingProgressSeries[];
  Totals: TaggingMetrics;
  SummaryLines: string[];
  SummaryText: string;
}

export const ZERO_METRICS: TaggingMetrics = {
  TotalTransactionCount: 0,
  TotalTaggedCount: 0,
  TaggingRate: 0,
  FullyTaggedCount: 0,
  IssuesCount: 0,
  TaggedWithMissingMandatoryAttrCount: 0,
  TaggedWithMissingOptionalAttrCount: 0,
  TaggedWithInvalidAttrCount: 0,
  UntaggedCount: 0,
  MultiTaggedCount: 0,
  DeadEndCount: 0,
};

const METRIC_KEYS = Object.keys(ZERO_METRICS) as (keyof TaggingMetrics)[];

export function normalizeMetrics(raw: unknown): TaggingMetrics {
  const src = asRecord(raw);
  const out: TaggingMetrics = { ...ZERO_METRICS };
  for (const key of METRIC_KEYS) out[key] = numberOrZero(src[key]);
  return out;
}

function normalizePoint(raw: unknown): TaggingProgressPoint {
  const src = asRecord(raw);
  return {
    ...normalizeMetrics(src),
    PeriodStart: stringOrEmpty(src.PeriodStart),
    PeriodEnd: stringOrEmpty(src.PeriodEnd),
    Label: stringOrEmpty(src.Label),
  };
}

function normalizeSeries(raw: unknown): TaggingProgressSeries {
  const src = asRecord(raw);
  const points = Array.isArray(src.Points) ? src.Points : [];
  return {
    DataSetType: stringOrEmpty(src.DataSetType),
    Points: points.map(normalizePoint).filter((p) => p.PeriodStart !== ''),
    Totals: normalizeMetrics(src.Totals),
  };
}

/**
 * Defensive normalization of the raw body. A null / missing TaggingProgress
 * or Series is a valid EMPTY report (the backend returns zero series for an
 * empty range), never an error.
 */
export function normalizeReport(json: unknown, request: TaggingProgressRequest): TaggingProgressReport {
  const tp = asRecord(asRecord(json).TaggingProgress);
  const series = Array.isArray(tp.Series) ? tp.Series : [];
  return {
    Granularity: isGranularity(tp.Granularity) ? tp.Granularity : request.Granularity,
    FromDate: stringOrEmpty(tp.FromDate),
    ToDate: stringOrEmpty(tp.ToDate),
    Layer: isLayer(tp.Layer) ? tp.Layer : request.Layer,
    ComputedAtUtc: stringOrEmpty(tp.ComputedAtUtc),
    Series: series.map(normalizeSeries).filter((s) => s.DataSetType !== ''),
    Totals: normalizeMetrics(tp.Totals),
    ...summaryPair(tp.SummaryLines, tp.SummaryText),
  };
}

/** Body with Granularity + Layer always present; empty arrays / dates dropped. */
export function toRequestBody(request: TaggingProgressRequest): Record<string, unknown> {
  const body: Record<string, unknown> = { Granularity: request.Granularity, Layer: request.Layer };
  if (request.FromDate) body.FromDate = request.FromDate;
  if (request.ToDate) body.ToDate = request.ToDate;
  if (request.DataSetTypes?.length) body.DataSetTypes = request.DataSetTypes;
  if (request.BankSwiftCodes?.length) body.BankSwiftCodes = request.BankSwiftCodes;
  if (request.Sides?.length) body.Sides = request.Sides;
  return body;
}

export async function getTaggingProgress(
  request: TaggingProgressRequest,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<TaggingProgressReport> {
  const res = await fetch(`${TEP_BASE}/GetTaggingProgress`, {
    method: 'POST',
    headers: tepReportHeaders('GetTaggingProgress', authToken, tepHeaders),
    body: JSON.stringify(toRequestBody(request)),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch tagging progress');
  const json: unknown = await res.json();
  return normalizeReport(json, request);
}
