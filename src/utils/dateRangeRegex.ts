import { numRange } from './intRangeAlternation';

/**
 * Compile a date comparison (`>` or `<`) against a `YYYY-MM-DD` threshold into
 * a regex that matches every ISO-date string in the allowed range. Output is
 * dropped into the server's REGEX filter operand alongside text conditions so
 * the regex engine can pre-filter dates without a date-aware comparator.
 *
 * End-anchor is `(T|$)` (not just `$`) so the regex matches both `2024-01-29`
 * and `2024-01-29T00:00:00Z` — backends store the column as an ISO timestamp.
 * Matches the convention used by `endAnchor` at [regexify.ts:21].
 *
 * Returns `null` on malformed input so callers can drop the condition rather
 * than emit something the server engine would reject.
 *
 * Ported from the operator's reference algorithm: split into three branches
 * (same-year-and-month / same-year / different-year) and compose using
 * `numRange` for each fixed-width digit segment.
 */

export type DateOp = 'gt' | 'lt';

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

export function compileDateRangeRegex(threshold: string, op: DateOp): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(threshold.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const parts: string[] = [];

  if (op === 'gt') {
    if (d < 31) {
      parts.push(`${pad(y, 4)}-${pad(m, 2)}-${numRange(d + 1, 31, 2)}`);
    }
    if (m < 12) {
      parts.push(`${pad(y, 4)}-${numRange(m + 1, 12, 2)}-${numRange(1, 31, 2)}`);
    }
    if (y < 9999) {
      parts.push(`${numRange(y + 1, 9999, 4)}-${numRange(1, 12, 2)}-${numRange(1, 31, 2)}`);
    }
  } else {
    if (d > 1) {
      parts.push(`${pad(y, 4)}-${pad(m, 2)}-${numRange(1, d - 1, 2)}`);
    }
    if (m > 1) {
      parts.push(`${pad(y, 4)}-${numRange(1, m - 1, 2)}-${numRange(1, 31, 2)}`);
    }
    if (y > 0) {
      parts.push(`${numRange(0, y - 1, 4)}-${numRange(1, 12, 2)}-${numRange(1, 31, 2)}`);
    }
  }

  if (parts.length === 0) return null;

  return `^(?:${parts.join('|')})(T|$)`;
}
