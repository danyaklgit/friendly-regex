import { ZERO_ACTIVITY, type TaggingActivityMetrics, type TaggingActivityPoint, type TaggingActivityReport } from '../../api/taggingActivity';
import { fillPeriodGaps, periodEndFor, periodStartOf, parseIsoDateUtc } from './periods';
import { formatPeriodAxisLabel, formatPeriodFullLabel } from './labels';

/** The range the UI actually sent (resolved from the preset); the backend's echoed FromDate may already be clamped. */
export interface RequestedRange {
  from?: string;
  to?: string;
}

/**
 * Axis bounds for the activity charts. Start = the LATER of the requested
 * start and HistoryStartsAt (a period before the history start is "no
 * records", not "no work", so it is never drawn), but never after the first
 * real point. End = the later of the last real point and the requested end,
 * so trailing quiet periods read as zero.
 */
export function activityAxisBounds(report: TaggingActivityReport, requested: RequestedRange): { start: string; end: string } | null {
  if (report.Points.length === 0) return null;
  const granularity = report.Granularity;
  const sorted = report.Points.map((p) => p.PeriodStart).sort();
  const firstPoint = sorted[0];
  const lastPoint = sorted[sorted.length - 1];

  const toPeriod = (iso: string | undefined): string | null =>
    iso && parseIsoDateUtc(iso) ? periodStartOf(iso, granularity) : null;

  const lowerCandidates = [toPeriod(requested.from), toPeriod(report.HistoryStartsAt)].filter((x): x is string => x !== null).sort();
  const lower = lowerCandidates.length > 0 ? lowerCandidates[lowerCandidates.length - 1] : null;
  const start = lower !== null && lower < firstPoint ? lower : firstPoint;

  const upper = toPeriod(requested.to);
  const end = upper !== null && upper > lastPoint ? upper : lastPoint;
  return { start, end };
}

export interface ActivityRow {
  periodStart: string;
  periodEnd: string;
  axisLabel: string;
  fullLabel: string;
  backendLabel: string | null;
  /** Real point, or ZERO_ACTIVITY for a zero-filled period. */
  metrics: TaggingActivityMetrics;
  isGap: boolean;
}

/** Zero-filled rows from the clamped start to the requested end. Last point wins on a repeated PeriodStart. */
export function buildActivityRows(report: TaggingActivityReport, requested: RequestedRange): ActivityRow[] {
  const bounds = activityAxisBounds(report, requested);
  if (!bounds) return [];
  const granularity = report.Granularity;
  const byStart = new Map<string, TaggingActivityPoint>();
  for (const p of report.Points) byStart.set(p.PeriodStart, p);
  return fillPeriodGaps([bounds.start, bounds.end, ...byStart.keys()], granularity).map((periodStart) => {
    const p = byStart.get(periodStart) ?? null;
    const periodEnd = p?.PeriodEnd || periodEndFor(periodStart, granularity);
    return {
      periodStart,
      periodEnd,
      axisLabel: formatPeriodAxisLabel(periodStart, granularity),
      fullLabel: formatPeriodFullLabel(periodStart, periodEnd, granularity),
      backendLabel: p ? p.Label : null,
      metrics: p ? { ...p } : { ...ZERO_ACTIVITY },
      isGap: p === null,
    };
  });
}

/** Shown whenever the requested range starts before the audit trail (or is open-ended). */
export function historyNotice(requestedFrom: string | undefined, historyStartsAt: string): string | null {
  if (!historyStartsAt) return null;
  if (requestedFrom && requestedFrom >= historyStartsAt) return null;
  return `Activity records begin ${historyStartsAt}. Earlier periods have no records and are not shown.`;
}

export interface ActivityDatum {
  periodStart: string;
  axisLabel: string;
  fullLabel: string;
  checkIns: number;
  rulesAdded: number;
  saves: number;
  rollbacks: number;
  operators: number;
  workspaces: number;
  transactionsTagged: number;
  isGap: boolean;
}

/** One flat datum per row, shared by both activity charts. No arithmetic: values are copied, never derived. */
export function toActivityData(rows: readonly ActivityRow[]): ActivityDatum[] {
  return rows.map((r) => ({
    periodStart: r.periodStart,
    axisLabel: r.axisLabel,
    fullLabel: r.fullLabel,
    checkIns: r.metrics.CheckIns,
    rulesAdded: r.metrics.RulesAdded,
    saves: r.metrics.Saves,
    rollbacks: r.metrics.Rollbacks,
    operators: r.metrics.Operators,
    workspaces: r.metrics.Workspaces,
    transactionsTagged: r.metrics.TransactionsTagged,
    isGap: r.isGap,
  }));
}
