import type { FilterProperty } from '../api/transactions';
import type { WizardFormState } from '../types/wizard';
import { regexify } from './regexify';

/**
 * Build the FilterProperty[] payload from the rule builder's form state.
 *
 * Always emits BankSwiftCode + Side as `IN` filters. Adds TransactionTypeCode
 * as `EQ` when present. Compiles the user's rule groups into a single REGEX
 * filter (outer = OR groups, inner = AND conditions), skipping empty values
 * and numeric operators (those use sentinel regex tokens that don't match
 * anything server-side and are evaluated client-side instead).
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

  const regexGroups = formState.ruleGroups
    .map(group =>
      group.conditions
        .filter(c => c.value.trim().length > 0)
        // Numeric operators are not regex — skip them here. They're currently
        // marked with a `__NUMERIC_*` sentinel in regexify and would not match
        // anything server-side inside a REGEX payload.
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
