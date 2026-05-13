import type { AndGroup, TransactionRow } from '../types';

/**
 * Evaluates a single AND group against a transaction row.
 * Returns true if ALL conditions in the group match.
 */
export function evaluateRuleSet(andGroup: AndGroup, row: TransactionRow): boolean {
  return andGroup.every((condition) => {
    const fieldValue = row[condition.SourceField];
    if (fieldValue === undefined || fieldValue === null) return false;

    // Numeric comparison operations
    const numericPrefixes = [
      { prefix: '__NUMERIC_GT:', compare: (a: number, b: number) => a > b },
      { prefix: '__NUMERIC_LT:', compare: (a: number, b: number) => a < b },
      { prefix: '__NUMERIC_GTE:', compare: (a: number, b: number) => a >= b },
      { prefix: '__NUMERIC_LTE:', compare: (a: number, b: number) => a <= b },
    ];
    for (const { prefix, compare } of numericPrefixes) {
      if (condition.Regex.startsWith(prefix)) {
        const threshold = parseFloat(condition.Regex.slice(prefix.length));
        const numValue = parseFloat(String(fieldValue));
        return !isNaN(numValue) && !isNaN(threshold) && compare(numValue, threshold);
      }
    }

    try {
      const regex = new RegExp(condition.Regex);
      const rawStr = String(fieldValue).trim();
      // If the stored value is an ISO date-time string (YYYY-MM-DDThh:mm…),
      // canonicalise to the date portion so user input like "2022-07-18"
      // matches "2022-07-18T00:00:00Z". The time suffix on these fields is
      // never meaningful (always 00:00:00) and matching it on the full string
      // would let negative operations (does_not_end_with, does_not_equal) pass
      // for rows the user clearly intended to exclude — the time-suffix only
      // satisfies the negation, not the underlying date semantics.
      const fieldStr = /^\d{4}-\d{2}-\d{2}T/.test(rawStr) ? rawStr.split('T')[0] : rawStr;
      return regex.test(fieldStr);
    } catch {
      return false;
    }
  });
}
