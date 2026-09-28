import type { TepHeaders } from './transactions';

/**
 * Shared pieces of the two reporting clients (GetTaggingProgress and
 * GetTaggingActivity): the granularity / layer vocabulary, the TEP header
 * bundle, and the defensive normalizers that turn an untrusted JSON body into
 * the typed reports the Reports tab renders. Every count passes through
 * `numberOrZero` so a string or null from the backend can never surface as
 * NaN in a tile.
 */

export type TaggingGranularity = 'Day' | 'Week' | 'Month' | 'Year';
export type TaggingLayer = 'Ops' | 'Active';

export const TAGGING_GRANULARITIES: readonly TaggingGranularity[] = ['Day', 'Week', 'Month', 'Year'];
export const TAGGING_LAYERS: readonly TaggingLayer[] = ['Ops', 'Active'];

export function isGranularity(value: unknown): value is TaggingGranularity {
  return typeof value === 'string' && (TAGGING_GRANULARITIES as readonly string[]).includes(value);
}

export function isLayer(value: unknown): value is TaggingLayer {
  return typeof value === 'string' && (TAGGING_LAYERS as readonly string[]).includes(value);
}

export const TEP_BASE = '/api/tep/api/v1/TEP';

/** The header bundle every TEP call carries (mirrors getBacklogStats). */
export function tepReportHeaders(activityTag: string, authToken: string, tepHeaders: TepHeaders): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${authToken}`,
    ActivityTag: activityTag,
    LanguageCode: tepHeaders.languageCode,
    TTPUserId: tepHeaders.userId,
    TTPTenantCode: tepHeaders.tenantCode,
    TTPRequestId: tepHeaders.requestId,
    TimeZone: tepHeaders.timeZone,
  };
}

/** Plain-object view of an unknown value; arrays and primitives become {}. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Finite number or 0. Accepts numeric strings ("97.30"); rejects booleans. */
export function numberOrZero(value: unknown): number {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** SummaryLines and SummaryText fall back to each other when one is missing. */
export function summaryPair(lines: unknown, text: unknown): { SummaryLines: string[]; SummaryText: string } {
  const safeLines = Array.isArray(lines) ? lines.filter((l): l is string => typeof l === 'string') : null;
  const safeText = typeof text === 'string' ? text : null;
  return {
    SummaryLines: safeLines ?? (safeText ? safeText.split('\n') : []),
    SummaryText: safeText ?? (safeLines ? safeLines.join('\n') : ''),
  };
}
