import { ZERO_METRICS, type TaggingMetrics, type TaggingProgressPoint, type TaggingProgressReport } from '../../api/taggingProgress';
import { fillPeriodGaps, periodEndFor } from './periods';
import { formatPeriodAxisLabel, formatPeriodFullLabel } from './labels';

/** Backend formula: tagged / total * 100, two decimals; dead ends are already inside TotalTaggedCount. */
export function rateOf(tagged: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((tagged / total) * 100 * 100) / 100;
}

const COUNT_KEYS = (Object.keys(ZERO_METRICS) as (keyof TaggingMetrics)[]).filter((k) => k !== 'TaggingRate');

/**
 * Sum of several feeds' metrics. A single entry is returned verbatim so the
 * backend's own TaggingRate is preserved; only a multi-feed sum recomputes
 * the rate. This is the ONLY client-derived number on the Reports tab.
 */
export function sumMetrics(list: readonly TaggingMetrics[]): TaggingMetrics {
  if (list.length === 0) return { ...ZERO_METRICS };
  if (list.length === 1) return { ...list[0] };
  const out: TaggingMetrics = { ...ZERO_METRICS };
  for (const m of list) for (const key of COUNT_KEYS) out[key] += m[key];
  out.TaggingRate = rateOf(out.TotalTaggedCount, out.TotalTransactionCount);
  return out;
}

export interface PeriodRow {
  periodStart: string;
  periodEnd: string;
  axisLabel: string;
  fullLabel: string;
  /** The backend's Label of the first feed that has this period, or null for a gap. */
  backendLabel: string | null;
  /** Summed over the feeds present in this period; null for a gap. */
  metrics: TaggingMetrics | null;
  perFeed: Record<string, TaggingProgressPoint | null>;
}

/** One row per axis slot (union of periods across feeds, gap-filled). Last point wins on a repeated PeriodStart. */
export function buildPeriodRows(report: TaggingProgressReport): PeriodRow[] {
  const granularity = report.Granularity;
  const feeds = report.Series.map((s) => s.DataSetType);
  const byFeed = new Map<string, Map<string, TaggingProgressPoint>>();
  const starts: string[] = [];
  for (const series of report.Series) {
    const map = new Map<string, TaggingProgressPoint>();
    for (const p of series.Points) {
      map.set(p.PeriodStart, p);
      starts.push(p.PeriodStart);
    }
    byFeed.set(series.DataSetType, map);
  }
  return fillPeriodGaps(starts, granularity).map((periodStart) => {
    const perFeed: Record<string, TaggingProgressPoint | null> = {};
    const present: TaggingProgressPoint[] = [];
    for (const feed of feeds) {
      const p = byFeed.get(feed)?.get(periodStart) ?? null;
      perFeed[feed] = p;
      if (p) present.push(p);
    }
    const first = present[0];
    const periodEnd = first?.PeriodEnd || periodEndFor(periodStart, granularity);
    return {
      periodStart,
      periodEnd,
      axisLabel: formatPeriodAxisLabel(periodStart, granularity),
      fullLabel: formatPeriodFullLabel(periodStart, periodEnd, granularity),
      backendLabel: first?.Label || null,
      metrics: present.length > 0 ? sumMetrics(present) : null,
      perFeed,
    };
  });
}

export interface CoverageDatum {
  periodStart: string;
  axisLabel: string;
  fullLabel: string;
  /** Tooltip title: the backend Label for a real point, the derived full label for a gap or a point without a Label (spec 6.2). */
  title: string;
  untagged: number;
  tagged: number;
  total: number;
  rate: number;
  issues: number;
  isGap: boolean;
}

/** Chart 1 data: gaps render as 0-height columns. */
export function toCoverageData(rows: readonly PeriodRow[]): CoverageDatum[] {
  return rows.map((r) => ({
    periodStart: r.periodStart,
    axisLabel: r.axisLabel,
    fullLabel: r.fullLabel,
    title: r.backendLabel ?? r.fullLabel,
    untagged: r.metrics?.UntaggedCount ?? 0,
    tagged: r.metrics?.TotalTaggedCount ?? 0,
    total: r.metrics?.TotalTransactionCount ?? 0,
    rate: r.metrics?.TaggingRate ?? 0,
    issues: r.metrics?.IssuesCount ?? 0,
    isGap: r.metrics === null,
  }));
}

export interface FeedRateDatum {
  periodStart: string;
  axisLabel: string;
  fullLabel: string;
  /** Tooltip title: the backend Label for a real point, the derived full label for a gap or a point without a Label (spec 6.2). */
  title: string;
  /** Per-feed rate + count for the tooltip / table; null where the feed has no point. */
  feeds: Record<string, { rate: number; count: number } | null>;
  /** Flat `rate:<feed>` keys for recharts dataKeys; null breaks the line (an absent period is not zero). */
  [rateKey: `rate:${string}`]: number | null;
}

export function rateDataKey(feed: string): `rate:${string}` {
  return `rate:${feed}`;
}

/** Chart 2 data: one rate per feed per period. */
export function toFeedRateData(rows: readonly PeriodRow[], feeds: readonly string[]): FeedRateDatum[] {
  return rows.map((r) => {
    const datum: FeedRateDatum = { periodStart: r.periodStart, axisLabel: r.axisLabel, fullLabel: r.fullLabel, title: r.backendLabel ?? r.fullLabel, feeds: {} };
    for (const feed of feeds) {
      const p = r.perFeed[feed] ?? null;
      datum.feeds[feed] = p ? { rate: p.TaggingRate, count: p.TotalTransactionCount } : null;
      datum[rateDataKey(feed)] = p ? p.TaggingRate : null;
    }
    return datum;
  });
}

/** Above this many periods the page shows the "switch to Week or Month" hint. Nothing is blocked. */
export const DENSE_AXIS_THRESHOLD = 400;

export function isDenseAxis(rows: readonly PeriodRow[]): boolean {
  return rows.length > DENSE_AXIS_THRESHOLD;
}
