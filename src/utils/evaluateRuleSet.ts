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
      const fieldStr = String(fieldValue).trim();
      // If the stored value is an ISO date-time string (YYYY-MM-DDThh:mm…),
      // also test against just the date portion so a literal input like
      // "2022-07-18" matches a stored value of "2022-07-18T00:00:00Z".
      if (/^\d{4}-\d{2}-\d{2}T/.test(fieldStr)) {
        return regex.test(fieldStr) || regex.test(fieldStr.split('T')[0]);
      }
      return regex.test(fieldStr);
    } catch {
      return false;
    }
  });
}
