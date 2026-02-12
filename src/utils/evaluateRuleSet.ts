import type { AndGroup, TransactionRow } from '../types';

/**
 * Evaluates a single AND group against a transaction row.
 * Returns true if ALL conditions in the group match.
 */
export function evaluateRuleSet(andGroup: AndGroup, row: TransactionRow): boolean {
  return andGroup.every((condition) => {
    const fieldValue = row[condition.SourceField];
    if (fieldValue === undefined || fieldValue === null) return false;
    try {
      const regex = new RegExp(condition.Regex);
      return regex.test(fieldValue);
    } catch {
      return false;
    }
  });
}
