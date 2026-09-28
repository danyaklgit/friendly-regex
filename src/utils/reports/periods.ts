import type { TaggingGranularity } from '../../api/taggingReportsShared';

/**
 * Period arithmetic for the Reports tab. Every function takes and returns
 * plain `yyyy-MM-dd` strings (the backend's Saudi-calendar business dates)
 * and steps them with Date.UTC + getUTC* ONLY. Building a local Date from a
 * date-only string shifts the day for any browser west of Saudi Arabia, so
 * a local `new Date(y, m, d)` or `toISOString()` on a local date never
 * appears here. ISO strings compare chronologically as plain strings.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC-midnight instant for a real calendar date, else null (rejects 2024-02-31). */
export function parseIsoDateUtc(s: string): Date | null {
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function formatIsoDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** iso + days (negative allowed). Invalid input is returned unchanged. */
export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateUtc(iso);
  if (!d) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDateUtc(d);
}

/** Start of the NEXT period. Month/Year normalize to day 1 / Jan 1 first so a misaligned input can't overflow. */
export function addPeriod(periodStart: string, granularity: TaggingGranularity): string {
  const d = parseIsoDateUtc(periodStart);
  if (!d) return periodStart;
  switch (granularity) {
    case 'Day':
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case 'Week':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'Month':
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case 'Year':
      d.setUTCMonth(0, 1);
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return formatIsoDateUtc(d);
}

/** Last day of the period that starts at periodStart (gap-filled slots only; real points keep the backend's PeriodEnd). */
export function periodEndFor(periodStart: string, granularity: TaggingGranularity): string {
  const d = parseIsoDateUtc(periodStart);
  if (!d) return periodStart;
  switch (granularity) {
    case 'Day':
      return periodStart;
    case 'Week':
      d.setUTCDate(d.getUTCDate() + 6);
      break;
    case 'Month':
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      d.setUTCDate(0); // day 0 = last day of the previous month
      break;
    case 'Year':
      d.setUTCMonth(11, 31);
      break;
  }
  return formatIsoDateUtc(d);
}

/** The period containing iso: same day / preceding Sunday / day 1 / Jan 1. */
export function periodStartOf(iso: string, granularity: TaggingGranularity): string {
  const d = parseIsoDateUtc(iso);
  if (!d) return iso;
  switch (granularity) {
    case 'Day':
      return iso;
    case 'Week':
      d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // getUTCDay: Sunday = 0
      break;
    case 'Month':
      d.setUTCDate(1);
      break;
    case 'Year':
      d.setUTCMonth(0, 1);
      break;
  }
  return formatIsoDateUtc(d);
}

/**
 * Sorted, de-duplicated, gap-filled list of period starts from the first to
 * the last input. A real period that is not reachable by stepping (misaligned
 * to the granularity) re-anchors the walk; nothing is dropped, nothing loops.
 */
export function fillPeriodGaps(periodStarts: readonly string[], granularity: TaggingGranularity): string[] {
  const sorted = [...new Set(periodStarts)].filter((p) => parseIsoDateUtc(p) !== null).sort();
  if (sorted.length === 0) return [];
  const out: string[] = [sorted[0]];
  let cursor = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const target = sorted[i];
    let next = addPeriod(cursor, granularity);
    while (next < target) {
      if (next <= cursor) break; // safety: addPeriod must always advance
      out.push(next);
      cursor = next;
      next = addPeriod(cursor, granularity);
    }
    out.push(target);
    cursor = target;
  }
  return out;
}
