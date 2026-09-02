/**
 * Shared month-scale timeline math for the Backlog rule-coverage panel.
 *
 * The scale spans whole months: from the first day of the earliest FromDate's
 * month to the last day of the latest ToDate's month, across every rule in
 * the panel, so all bars share one axis and month gridlines are complete
 * columns. Positions are day-precise percentages of that span (bars land on
 * their exact days, not snapped to months). Dates are the backend's
 * `yyyy-MM-dd` strings, parsed as UTC calendar days — never through the
 * local timezone.
 */

export interface TimelineMonth {
  /** e.g. "2024-07" — stable react key. */
  key: string;
  /** e.g. "Jul 24". */
  label: string;
  /** Whether the label should render (sparse labelling on wide ranges). */
  labeled: boolean;
  startPct: number;
  widthPct: number;
}

export interface TimelineBar {
  leftPct: number;
  widthPct: number;
}

export interface CoverageTimeline {
  months: TimelineMonth[];
  totalDays: number;
  /** Day-precise bar position for an inclusive from→to range; null when the
   *  dates don't parse or fall outside the scale entirely. */
  barFor: (from: string, to: string) => TimelineBar | null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

function parseDay(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Build the shared scale from every rule's date range. `maxLabels` thins the
 * month labels on wide ranges (every Nth month keeps its label; gridlines
 * stay per-month). Returns null when no range parses.
 */
export function buildCoverageTimeline(
  ranges: Array<{ from: string | null | undefined; to: string | null | undefined }>,
  maxLabels = 12,
): CoverageTimeline | null {
  let min = Infinity;
  let max = -Infinity;
  for (const r of ranges) {
    const from = parseDay(r.from);
    const to = parseDay(r.to);
    if (from !== null) min = Math.min(min, from);
    if (to !== null) max = Math.max(max, to ?? from ?? 0);
    if (from !== null && to === null) max = Math.max(max, from);
    if (to !== null && from === null) min = Math.min(min, to);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;

  const start = new Date(min);
  const end = new Date(max);
  // Whole-month scale bounds.
  const scaleStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const scaleEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1); // exclusive
  const totalDays = Math.round((scaleEnd - scaleStart) / DAY_MS);

  const months: TimelineMonth[] = [];
  let cursor = scaleStart;
  while (cursor < scaleEnd) {
    const d = new Date(cursor);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    months.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCFullYear() % 100).padStart(2, '0')}`,
      labeled: false,
      startPct: ((cursor - scaleStart) / DAY_MS / totalDays) * 100,
      widthPct: ((next - cursor) / DAY_MS / totalDays) * 100,
    });
    cursor = next;
  }
  // Sparse labels: every Nth month, anchored on the first.
  const every = Math.max(1, Math.ceil(months.length / maxLabels));
  months.forEach((m, i) => { m.labeled = i % every === 0; });

  const barFor = (from: string, to: string): TimelineBar | null => {
    const f = parseDay(from);
    const t = parseDay(to) ?? f;
    if (f === null || t === null || t < f) return null;
    // Inclusive range: the bar covers the whole "to" day, so a single-day
    // range still has one day of width.
    const clampedFrom = Math.max(f, scaleStart);
    const clampedToEnd = Math.min(t + DAY_MS, scaleEnd);
    if (clampedToEnd <= clampedFrom) return null;
    return {
      leftPct: ((clampedFrom - scaleStart) / DAY_MS / totalDays) * 100,
      widthPct: ((clampedToEnd - clampedFrom) / DAY_MS / totalDays) * 100,
    };
  };

  return { months, totalDays, barFor };
}
