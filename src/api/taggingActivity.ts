import type { TepHeaders } from './transactions';
import { throwIfNotOk } from './apiError';
import {
  TEP_BASE, tepReportHeaders, asRecord, numberOrZero, stringOrEmpty, summaryPair, isGranularity,
  type TaggingGranularity,
} from './taggingReportsShared';

// --- GetTaggingActivity (backend addendum 2026-09-28) ------------------------
// Team throughput per period from the tagging library AUDIT TRAIL. The x-axis
// is the date the work happened (not the transaction's business date), so this
// is never drawn on the same axis as GetTaggingProgress.
//
// Measured (recorded): CheckIns, Saves, Rollbacks, Workspaces, Operators,
// RulesAdded. Reconstructed (derived): TransactionsTagged, flagged by
// TransactionsTaggedIsReconstructed; the UI keys every caveat off that flag.
// RulesAdded is a NET delta per period and never summed client-side; Operators
// and Workspaces are distinct counts. Tiles use the backend Totals only.

export interface TaggingActivityRequest {
  FromDate?: string;
  ToDate?: string;
  Granularity: TaggingGranularity;
}

export interface TaggingActivityMetrics {
  CheckIns: number;
  Saves: number;
  Rollbacks: number;
  Workspaces: number;
  Operators: number;
  RulesAdded: number;
  TransactionsTagged: number;
}

export interface TaggingActivityPoint extends TaggingActivityMetrics {
  PeriodStart: string;
  PeriodEnd: string;
  Label: string;
}

export interface TaggingActivityReport {
  Granularity: TaggingGranularity;
  FromDate: string;
  ToDate: string;
  /** Earliest date the audit trail covers. Periods before it are "no records", not "no work". */
  HistoryStartsAt: string;
  /** Missing on the wire = true (treat the figure as an estimate unless told otherwise). */
  TransactionsTaggedIsReconstructed: boolean;
  ComputedAtUtc: string;
  Points: TaggingActivityPoint[];
  Totals: TaggingActivityMetrics;
  SummaryLines: string[];
  SummaryText: string;
}

export const ZERO_ACTIVITY: TaggingActivityMetrics = {
  CheckIns: 0, Saves: 0, Rollbacks: 0, Workspaces: 0, Operators: 0, RulesAdded: 0, TransactionsTagged: 0,
};

const ACTIVITY_KEYS = Object.keys(ZERO_ACTIVITY) as (keyof TaggingActivityMetrics)[];

export function normalizeActivityMetrics(raw: unknown): TaggingActivityMetrics {
  const src = asRecord(raw);
  const out: TaggingActivityMetrics = { ...ZERO_ACTIVITY };
  for (const key of ACTIVITY_KEYS) out[key] = numberOrZero(src[key]);
  return out;
}

function normalizeActivityPoint(raw: unknown): TaggingActivityPoint {
  const src = asRecord(raw);
  return {
    ...normalizeActivityMetrics(src),
    PeriodStart: stringOrEmpty(src.PeriodStart),
    PeriodEnd: stringOrEmpty(src.PeriodEnd),
    Label: stringOrEmpty(src.Label),
  };
}

export function normalizeActivityReport(json: unknown, request: TaggingActivityRequest): TaggingActivityReport {
  const ta = asRecord(asRecord(json).TaggingActivity);
  const points = Array.isArray(ta.Points) ? ta.Points : [];
  return {
    Granularity: isGranularity(ta.Granularity) ? ta.Granularity : request.Granularity,
    FromDate: stringOrEmpty(ta.FromDate),
    ToDate: stringOrEmpty(ta.ToDate),
    HistoryStartsAt: stringOrEmpty(ta.HistoryStartsAt),
    TransactionsTaggedIsReconstructed: ta.TransactionsTaggedIsReconstructed !== false,
    ComputedAtUtc: stringOrEmpty(ta.ComputedAtUtc),
    Points: points.map(normalizeActivityPoint).filter((p) => p.PeriodStart !== ''),
    Totals: normalizeActivityMetrics(ta.Totals),
    ...summaryPair(ta.SummaryLines, ta.SummaryText),
  };
}

export function toActivityRequestBody(request: TaggingActivityRequest): Record<string, unknown> {
  const body: Record<string, unknown> = { Granularity: request.Granularity };
  if (request.FromDate) body.FromDate = request.FromDate;
  if (request.ToDate) body.ToDate = request.ToDate;
  return body;
}

export async function getTaggingActivity(
  request: TaggingActivityRequest,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<TaggingActivityReport> {
  const res = await fetch(`${TEP_BASE}/GetTaggingActivity`, {
    method: 'POST',
    headers: tepReportHeaders('GetTaggingActivity', authToken, tepHeaders),
    body: JSON.stringify(toActivityRequestBody(request)),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch tagging activity');
  const json: unknown = await res.json();
  return normalizeActivityReport(json, request);
}
