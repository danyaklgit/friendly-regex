import { numRange } from './intRangeAlternation';

/**
 * Compile a numeric comparison (`>` or `<`) against an integer threshold into
 * a regex that matches every decimal/integer string in the allowed range.
 *
 * Threshold is integer-shaped (`^-?\d+$`) — the condition editor's onChange
 * filter strips non-digits and non-leading-minus, so this is what arrives.
 * Field values, however, may carry a decimal tail like `100.50` or be
 * negative — the regex accepts both.
 *
 * Returns `null` when the threshold isn't integer-shaped so the caller can
 * drop the condition.
 *
 * Algorithm splits on threshold sign:
 *   T >= 0, op '>': intPart > T (with any decimal) OR intPart == T with
 *                   a nonzero decimal.
 *   T >= 0, op '<': intPart < T (with any decimal) OR negative non-zero.
 *   T < 0,  op '>': any non-negative OR negative with |value| < |T|.
 *   T < 0,  op '<': negative with |value| > |T| OR |-T| with nonzero decimal.
 */

export type NumericOp = 'gt' | 'lt';

const OPT_DECIMAL = '(?:\\.\\d+)?';

function digitsOf(n: number): number {
  if (n === 0) return 1;
  return String(Math.abs(n)).length;
}

function wrap(parts: string[]): string | null {
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `(?:${parts.join('|')})`;
}

/**
 * Regex matching any unsigned integer string (no leading zeros, except the
 * literal "0") in [min, max]. Returns null when min > max.
 */
function unsignedInRange(min: number, max: number): string | null {
  if (min < 0 || max < 0 || min > max) return null;
  if (min === max) return String(min);

  const minD = digitsOf(min);
  const maxD = digitsOf(max);
  const parts: string[] = [];

  if (minD === maxD) {
    return numRange(min, max, minD);
  }

  // First: from min up to the largest minD-digit number.
  parts.push(numRange(min, Math.pow(10, minD) - 1, minD));

  // Middle: every full d-digit range, no leading zero.
  for (let d = minD + 1; d < maxD; d++) {
    parts.push(d === 1 ? '[0-9]' : `[1-9]\\d{${d - 1}}`);
  }

  // Last: from smallest maxD-digit number up to max.
  parts.push(numRange(Math.pow(10, maxD - 1), max, maxD));

  return wrap(parts);
}

/** Regex matching any unsigned integer strictly greater than T (no upper bound). */
function unsignedGreaterThan(T: number): string {
  if (T < 0) return '(?:0|[1-9]\\d*)';
  const d = digitsOf(T);
  const parts: string[] = [];
  const sameMax = Math.pow(10, d) - 1;
  if (T + 1 <= sameMax) {
    parts.push(numRange(T + 1, sameMax, d));
  }
  parts.push(`[1-9]\\d{${d},}`);
  return wrap(parts)!;
}

export function compileNumericRangeRegex(threshold: string, op: NumericOp): string | null {
  if (!/^-?\d+$/.test(threshold.trim())) return null;
  const T = Number(threshold.trim());

  const branches: string[] = [];

  if (op === 'gt') {
    if (T >= 0) {
      branches.push(`${unsignedGreaterThan(T)}${OPT_DECIMAL}`);
      branches.push(`${T}\\.\\d*[1-9]\\d*`);
    } else {
      const A = -T;
      // Any non-negative value satisfies value > T (negative).
      branches.push(`(?:0|[1-9]\\d*)${OPT_DECIMAL}`);
      // Negative values with magnitude < A — i.e. intPart in [1, A-1].
      if (A >= 2) {
        const inner = unsignedInRange(1, A - 1);
        if (inner) branches.push(`-${inner}${OPT_DECIMAL}`);
      }
    }
  } else {
    if (T > 0) {
      const inner = unsignedInRange(0, T - 1);
      if (inner) branches.push(`${inner}${OPT_DECIMAL}`);
      // Any negative value is less than any positive T. Real data won't
      // contain "-0"; allowing it matches mathematically anyway (it equals 0
      // which is < T).
      branches.push(`-(?:0|[1-9]\\d*)${OPT_DECIMAL}`);
    } else if (T === 0) {
      // Strictly less than 0 — negative non-zero only.
      branches.push(`-[1-9]\\d*${OPT_DECIMAL}`);
      branches.push(`-0\\.\\d*[1-9]\\d*`);
    } else {
      const A = -T;
      // Negative values with magnitude > A — i.e. intPart > A.
      branches.push(`-${unsignedGreaterThan(A)}${OPT_DECIMAL}`);
      // -A followed by a non-zero decimal (e.g. -100.5 < -100).
      branches.push(`-${A}\\.\\d*[1-9]\\d*`);
    }
  }

  if (branches.length === 0) return null;
  return `^(?:${branches.join('|')})$`;
}
