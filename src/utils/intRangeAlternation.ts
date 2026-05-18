/**
 * Compile a fixed-width integer range `[min, max]` into a compact regex
 * alternation pattern.
 *
 * Pure digit-grouping decomposition: same-prefix branches collapse into a
 * character class, full-width interior ranges become `[a-b]\d{w-1}`, and the
 * remainder is recursively decomposed.
 *
 * Examples:
 *   numRange(1, 12, 2)     → "(?:0[1-9]|1[0-2])"
 *   numRange(1, 31, 2)     → "(?:0[1-9]|[1-2]\d|3[0-1])"
 *   numRange(2025, 9999, 4)→ "(?:2(?:0(?:2[5-9]|[3-9]\d)|[1-9]\d\d)|[3-9]\d\d\d)"
 *
 * Both `min` and `max` are zero-padded to `width` digits in the output, so
 * `numRange(5, 5, 3)` returns the literal `"005"`. Callers using this for
 * unsigned ints without leading zeros must compose their own digit-count
 * branches (see numericRangeRegex.ts) and only invoke this for fixed-width
 * tails.
 */
export function numRange(min: number, max: number, width: number): string {
  const alts: string[] = [];
  collect(min, max, width, alts);
  return alts.length === 1 ? alts[0] : `(?:${alts.join('|')})`;
}

function collect(min: number, max: number, width: number, alts: string[]): void {
  if (min > max) return;
  if (width === 1) {
    alts.push(min === max ? `${min}` : `[${min}-${max}]`);
    return;
  }

  const factor = Math.pow(10, width - 1);
  const loHi = Math.floor(min / factor);
  const hiHi = Math.floor(max / factor);
  const loRest = min % factor;
  const hiRest = max % factor;

  if (loHi === hiHi) {
    alts.push(`${loHi}${numRange(loRest, hiRest, width - 1)}`);
    return;
  }

  let midStart = loHi;
  let midEnd = hiHi;

  if (loRest > 0) {
    alts.push(`${loHi}${numRange(loRest, factor - 1, width - 1)}`);
    midStart = loHi + 1;
  }
  if (hiRest < factor - 1) midEnd = hiHi - 1;

  if (midStart <= midEnd) {
    const prefix = midStart === midEnd ? `${midStart}` : `[${midStart}-${midEnd}]`;
    const suffix = '\\d'.repeat(width - 1);
    alts.push(`${prefix}${suffix}`);
  }

  if (hiRest < factor - 1) {
    alts.push(`${hiHi}${numRange(0, hiRest, width - 1)}`);
  }
}
