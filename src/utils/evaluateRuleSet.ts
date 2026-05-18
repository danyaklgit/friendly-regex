import type { AndGroup, TransactionRow } from '../types';

type CompareOp = 'gt' | 'lt' | 'gte' | 'lte';

function compareWithOp<T extends number | string>(a: T, b: T, op: CompareOp): boolean {
  switch (op) {
    case 'gt': return a > b;
    case 'lt': return a < b;
    case 'gte': return a >= b;
    case 'lte': return a <= b;
  }
}

/**
 * Evaluates a single AND group against a transaction row.
 * Returns true if ALL conditions in the group match.
 */
export function evaluateRuleSet(andGroup: AndGroup, row: TransactionRow): boolean {
  return andGroup.every((condition) => {
    const fieldValue = row[condition.SourceField];
    if (fieldValue === undefined || fieldValue === null) return false;

    // Numeric / date comparison operations. The regexify sentinel
    // `__NUMERIC_<OP>:<value>` is used for both numeric (Amount > 100) and
    // date (StatementDate > 2024-01-29) conditions because regexify is
    // type-agnostic. If the threshold is ISO date-shaped we compare
    // lexicographically (ISO dates sort correctly as strings); otherwise we
    // fall back to numeric comparison.
    const numericPrefixes: { prefix: string; op: CompareOp }[] = [
      { prefix: '__NUMERIC_GT:', op: 'gt' },
      { prefix: '__NUMERIC_LT:', op: 'lt' },
      { prefix: '__NUMERIC_GTE:', op: 'gte' },
      { prefix: '__NUMERIC_LTE:', op: 'lte' },
    ];
    for (const { prefix, op } of numericPrefixes) {
      if (condition.Regex.startsWith(prefix)) {
        const valueStr = condition.Regex.slice(prefix.length);
        if (/^\d{4}-\d{2}-\d{2}$/.test(valueStr)) {
          const rawStr = String(fieldValue);
          const fieldStr = /^\d{4}-\d{2}-\d{2}T/.test(rawStr) ? rawStr.split('T')[0] : rawStr;
          return compareWithOp(fieldStr, valueStr, op);
        }
        const threshold = parseFloat(valueStr);
        const numValue = parseFloat(String(fieldValue));
        return !isNaN(numValue) && !isNaN(threshold) && compareWithOp(numValue, threshold, op);
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
