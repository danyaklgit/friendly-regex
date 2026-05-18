import { numRange } from './intRangeAlternation';

/**
 * Compile a numeric comparison (`>` or `<`) against a numeric threshold into
 * a regex that matches every value in the allowed range. The threshold may be
 * an integer or a decimal (`100`, `100.5`, `-50`, `-100.25`).
 *
 * Field values may carry a decimal tail and/or a leading minus, so the regex
 * accepts an optional `(?:\.\d+)?` suffix and signs.
 *
 * Returns `null` when the threshold isn't a valid signed decimal.
 *
 * High-level dispatch on the threshold's sign and on whether it has a
 * fractional part. Integer threshold compilation is the simpler classic case;
 * decimal thresholds add a same-int-part-then-compare-fractions branch built
 * by `fracGreater` / `fracLess`.
 */

export type NumericOp = 'gt' | 'lt';

const OPT_DECIMAL = '(?:\\.\\d+)?';
const FLOAT_RE = /^-?\d+(\.\d+)?$/;

function digitsOf(n: number): number {
  if (n === 0) return 1;
  return String(Math.abs(n)).length;
}

function wrap(parts: string[]): string | null {
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `(?:${parts.join('|')})`;
}

/** Regex matching any unsigned integer in [min, max] (no leading zeros). */
function unsignedInRange(min: number, max: number): string | null {
  if (min < 0 || max < 0 || min > max) return null;
  if (min === max) return String(min);

  const minD = digitsOf(min);
  const maxD = digitsOf(max);
  const parts: string[] = [];

  if (minD === maxD) return numRange(min, max, minD);

  parts.push(numRange(min, Math.pow(10, minD) - 1, minD));
  for (let d = minD + 1; d < maxD; d++) {
    parts.push(d === 1 ? '[0-9]' : `[1-9]\\d{${d - 1}}`);
  }
  parts.push(numRange(Math.pow(10, maxD - 1), max, maxD));

  return wrap(parts);
}

/** Regex matching any unsigned integer strictly greater than T. */
function unsignedGreaterThan(T: number): string {
  if (T < 0) return '(?:0|[1-9]\\d*)';
  const d = digitsOf(T);
  const parts: string[] = [];
  const sameMax = Math.pow(10, d) - 1;
  if (T + 1 <= sameMax) parts.push(numRange(T + 1, sameMax, d));
  parts.push(`[1-9]\\d{${d},}`);
  return wrap(parts)!;
}

/**
 * Regex matching a digit string X such that the fraction `0.X` is strictly
 * greater than the fraction `0.tFrac`. `tFrac` is the digit string after the
 * decimal point of the threshold (e.g. `"5"` for `0.5`, `"50"` for `0.50`).
 *
 * Branches:
 *  - prefix matches t1..tk, (k+1)th digit > t_{k+1}, then anything
 *  - all of tFrac matches as a prefix, then more digits with at least one ≥ 1
 */
function fracGreater(tFrac: string): string | null {
  const branches: string[] = [];
  for (let k = 0; k < tFrac.length; k++) {
    const tk = Number(tFrac[k]);
    if (tk >= 9) continue;
    const prefix = tFrac.slice(0, k);
    branches.push(`${prefix}[${tk + 1}-9]\\d*`);
  }
  // Equal prefix, then has more digits with at least one nonzero.
  branches.push(`${tFrac}\\d*[1-9]\\d*`);
  return wrap(branches);
}

/**
 * Regex matching a digit string X such that `0.X` is strictly less than
 * `0.tFrac`. Branches mirror `fracGreater`:
 *  - prefix matches t1..tk, (k+1)th digit < t_{k+1}, then anything
 *  (No "all-equal" branch — equal isn't less.)
 */
function fracLess(tFrac: string): string | null {
  const branches: string[] = [];
  for (let k = 0; k < tFrac.length; k++) {
    const tk = Number(tFrac[k]);
    if (tk === 0) continue;
    const prefix = tFrac.slice(0, k);
    branches.push(`${prefix}[0-${tk - 1}]\\d*`);
  }
  return wrap(branches);
}

export function compileNumericRangeRegex(threshold: string, op: NumericOp): string | null {
  const trimmed = threshold.trim();
  if (!FLOAT_RE.test(trimmed)) return null;

  const isNegative = trimmed.startsWith('-');
  const absStr = isNegative ? trimmed.slice(1) : trimmed;
  const [intStr, fracRaw = ''] = absStr.split('.');
  const T_int = Number(intStr);
  // Trim trailing zeros so "100.50" behaves the same as "100.5". The remaining
  // empty string signals "threshold is an integer".
  const T_frac = fracRaw.replace(/0+$/, '');
  const hasFrac = T_frac.length > 0;

  const branches: string[] = [];

  if (!isNegative) {
    // T >= 0
    if (op === 'gt') {
      branches.push(`${unsignedGreaterThan(T_int)}${OPT_DECIMAL}`);
      if (!hasFrac) {
        // Integer T: T followed by a non-zero decimal is > T.
        branches.push(`${T_int}\\.\\d*[1-9]\\d*`);
      } else {
        // Decimal T: V_int == T_int AND V_frac > T_frac.
        const fg = fracGreater(T_frac);
        if (fg) branches.push(`${T_int}\\.${fg}`);
      }
    } else {
      // lt
      const lt = unsignedInRange(0, T_int - 1);
      if (lt) branches.push(`${lt}${OPT_DECIMAL}`);
      if (hasFrac) {
        // V_int == T_int AND (no decimal, OR V_frac < T_frac).
        const fl = fracLess(T_frac);
        branches.push(fl ? `${T_int}(?:\\.${fl})?` : `${T_int}`);
      }
      // Any negative value is < a non-negative T — EXCEPT when T == 0,
      // where "-0" and "-0.0" represent zero and shouldn't match.
      if (T_int > 0 || hasFrac) {
        branches.push(`-(?:0|[1-9]\\d*)${OPT_DECIMAL}`);
      } else {
        branches.push(`-[1-9]\\d*${OPT_DECIMAL}`);
        branches.push(`-0\\.\\d*[1-9]\\d*`);
      }
    }
  } else {
    // T < 0
    const A_int = T_int;
    if (op === 'gt') {
      // Any non-negative value > negative T.
      branches.push(`(?:0|[1-9]\\d*)${OPT_DECIMAL}`);
      // Negative values whose magnitude is less than |T|.
      if (A_int >= 2) {
        const inner = unsignedInRange(1, A_int - 1);
        if (inner) branches.push(`-${inner}${OPT_DECIMAL}`);
      }
      if (hasFrac) {
        // V == -A_int (no decimal) or V == -A_int.x with x < T_frac
        // (e.g. T = -100.5: -100, -100.4, -100.49 are all > -100.5).
        const fl = fracLess(T_frac);
        branches.push(fl ? `-${A_int}(?:\\.${fl})?` : `-${A_int}`);
      }
    } else {
      // lt: V more negative than T (V < T < 0).
      branches.push(`-${unsignedGreaterThan(A_int)}${OPT_DECIMAL}`);
      if (!hasFrac) {
        // T integer: V == -A_int with a non-zero decimal is more negative.
        branches.push(`-${A_int}\\.\\d*[1-9]\\d*`);
      } else {
        // T decimal: V_int == A_int AND V_frac > T_frac → V more negative.
        const fg = fracGreater(T_frac);
        if (fg) branches.push(`-${A_int}\\.${fg}`);
      }
    }
  }

  if (branches.length === 0) return null;
  return `^(?:${branches.join('|')})$`;
}
