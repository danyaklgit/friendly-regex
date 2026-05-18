import type { FilterProperty } from '../api/transactions';
import type { ConditionFormValue, WizardFormState } from '../types/wizard';
import { regexify } from './regexify';

// Source fields the backend stores as ISO date-times. Date Greater than /
// Less than comparisons get lifted to top-level GT/LT/GTE/LTE filters
// instead of being dropped from the REGEX payload.
const DATE_SOURCE_FIELDS = new Set(['StatementDate', 'EntryDate', 'ValueDate']);

const NUMERIC_OP_TO_OPERAND: Record<string, 'GT' | 'LT' | 'GTE' | 'LTE' | undefined> = {
  greater_than: 'GT',
  less_than: 'LT',
  greater_than_or_equal: 'GTE',
  less_than_or_equal: 'LTE',
};

/** True when the value is an integer or decimal string (incl. optional
 *  leading minus). Used to discriminate numeric columns from text columns
 *  without needing a hardcoded field list — the operator's value choice
 *  itself signals the intended comparison type. */
function looksLikeNumber(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

/** A date or numeric GT/LT/GTE/LTE condition can be expressed as a standard
 *  FilterProperty (and so reach the server) ONLY when there's a single rule
 *  group — top-level filters AND together, which would break OR semantics
 *  across multiple groups. Dates are detected by source field name; numeric
 *  comparisons are detected by the shape of the value so the same lift
 *  works for Amount, CreditAmount, balances, or any future numeric column
 *  the bank exposes. */
function isLiftableComparisonCondition(c: ConditionFormValue, totalGroups: number): boolean {
  if (totalGroups !== 1) return false;
  if (!NUMERIC_OP_TO_OPERAND[c.operation]) return false;
  const value = c.value.trim();
  if (value.length === 0) return false;
  if (DATE_SOURCE_FIELDS.has(c.sourceField)) return true;
  return looksLikeNumber(value);
}

/**
 * Build the FilterProperty[] payload from the rule builder's form state.
 *
 * Always emits BankSwiftCode + Side as `IN` filters. Adds TransactionTypeCode
 * as `EQ` when present. Compiles the user's rule groups into a single REGEX
 * filter (outer = OR groups, inner = AND conditions), skipping empty values
 * and numeric operators (those use sentinel regex tokens that don't match
 * anything server-side and are evaluated client-side instead).
 *
 * Date and numeric Greater than / Less than conditions are lifted to
 * top-level GT/LT/GTE/LTE filters when the rule has a single group, so the
 * server can filter by them at index speed. Multi-group comparisons stay
 * client-side (lifting them would AND-join across OR groups and lose rows).
 *
 * Used by:
 *  - "Apply Rules" (filters the visible table to rule matches)
 *  - "GetAllTransactionTags" (live preview of which existing tags match the
 *    same set of transactions while the operator is authoring a rule)
 */
export function buildRulesetFilters(formState: WizardFormState): FilterProperty[] {
  const filters: FilterProperty[] = [
    { ColumnName: 'BankSwiftCode', Value: formState.bankSwiftCode, Operand: 'IN' },
    { ColumnName: 'Side', Value: formState.side, Operand: 'IN' },
  ];
  if (formState.transactionTypeCode) {
    filters.push({ ColumnName: 'TransactionTypeCode', Value: formState.transactionTypeCode, Operand: 'EQ' });
  }

  const totalGroups = formState.ruleGroups.length;

  // Lift date / numeric GT/LT/GTE/LTE conditions to top-level standard filters.
  for (const group of formState.ruleGroups) {
    for (const c of group.conditions) {
      if (isLiftableComparisonCondition(c, totalGroups)) {
        filters.push({
          ColumnName: c.sourceField,
          Value: c.value,
          Operand: NUMERIC_OP_TO_OPERAND[c.operation]!,
        });
      }
    }
  }

  const regexGroups = formState.ruleGroups
    .map(group =>
      group.conditions
        // Drop conditions already emitted as top-level GT/LT filters so they
        // don't double-count.
        .filter(c => !isLiftableComparisonCondition(c, totalGroups))
        .filter(c => c.value.trim().length > 0)
        // Numeric operators that didn't get lifted (multi-group GT/LT) are
        // not regex — skip them. They're marked with a `__NUMERIC_*` sentinel
        // in regexify and would not match anything server-side inside a
        // REGEX payload; the client-side evaluator handles them after the
        // fetch.
        .filter(c => !c.operation.startsWith('greater_than') && !c.operation.startsWith('less_than'))
        .map(c => ({
          ColumnName: c.sourceField,
          Value: regexify(c.operation, c.value, c.values),
          Options: '',
        }))
    )
    .filter(group => group.length > 0);

  if (regexGroups.length > 0) {
    filters.push({ Operand: 'REGEX', Regex: regexGroups });
  }

  return filters;
}
