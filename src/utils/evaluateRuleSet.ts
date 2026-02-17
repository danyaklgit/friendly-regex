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
      return regex.test(String(fieldValue).trim());
    } catch {
      return false;
    }
  });
}
