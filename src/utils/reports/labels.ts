import type { TaggingGranularity, TaggingLayer } from '../../api/taggingReportsShared';

export const GRANULARITY_LABELS: Record<TaggingGranularity, string> = { Day: 'Day', Week: 'Week', Month: 'Month', Year: 'Year' };

/** Ops is what the console and Backlog show; Active is what has been published to Bwatech. */
export const LAYER_LABELS: Record<TaggingLayer, string> = { Ops: 'Operator view', Active: 'Published' };

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dateParts(iso: string): { year: string; month: number } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  return m ? { year: m[1], month: Number(m[2]) } : null;
}

/**
 * Axis label derived from PeriodStart (never from the backend Label), so a
 * week label can never disagree with the backend's Sunday buckets. Pure
 * string work; no Date objects.
 */
export function formatPeriodAxisLabel(periodStart: string, granularity: TaggingGranularity): string {
  const p = dateParts(periodStart);
  if (!p) return periodStart;
  switch (granularity) {
    case 'Day':
    case 'Week':
      return periodStart;
    case 'Month':
      return `${MONTHS_SHORT[p.month - 1] ?? '?'} ${p.year}`;
    case 'Year':
      return p.year;
  }
}

/** Tooltip / table label for a period. */
export function formatPeriodFullLabel(periodStart: string, periodEnd: string, granularity: TaggingGranularity): string {
  const p = dateParts(periodStart);
  if (!p) return periodStart;
  switch (granularity) {
    case 'Day':
      return periodStart;
    case 'Week':
      return `Week of ${periodStart} to ${periodEnd}`;
    case 'Month':
      return `${MONTHS_LONG[p.month - 1] ?? '?'} ${p.year}`;
    case 'Year':
      return p.year;
  }
}
