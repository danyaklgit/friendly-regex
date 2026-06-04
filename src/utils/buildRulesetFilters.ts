import type { FilterProperty } from '../api/transactions';
import type { ConditionFormValue, WizardFormState } from '../types/wizard';
import { regexify } from './regexify';
import { DATE_SOURCE_FIELDS } from '../constants/fields';
import { compileDateRangeRegex } from './dateRangeRegex';
import { compileNumericRangeRegex } from './numericRangeRegex';
import { isFilledCondition } from './ruleFingerprint';

type RegexCondition = { ColumnName: string; Value: string; Options: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Signed decimal — integer or with a fractional tail. Mirrors the input
// filter on the Amount field in ConditionEditor.
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

/**
 * Compile a single rule-set condition into the inner-condition shape the
 * server expects inside the REGEX operand: `{ ColumnName, Value, Options }`.
 *
 * Date and numeric Greater than / Less than route through their respective
 * range-regex compilers so the comparison is encoded in the regex itself
 * (the server engine can't compare numerically). Everything else falls back
 * to the existing regexify path. Returns null when the threshold is malformed
 * so the caller can drop the condition without producing a broken payload.
 */
function buildInnerCondition(c: ConditionFormValue): RegexCondition | null {
  // Nullary blank operations carry no regex the server can use to match
  // NULL columns (SQL regex against NULL returns NULL/false). Dropping
  // them from the server payload means the backend returns the broader
  // result set (rows whose columns may be NULL), and the table's
  // client-side post-filter in TransactionsTab/filteredData narrows
  // down using evaluateRuleSet's null-aware nullary handling. Both
  // halves are required: skipping here without the post-filter would
  // surface too many rows; the post-filter without skipping here would
  // never see a row because the backend already dropped them.
  if (c.operation === 'is_blank_or_empty' || c.operation === 'is_not_blank_or_empty') {
    return null;
  }
  if (c.operation === 'greater_than' || c.operation === 'less_than') {
    const op = c.operation === 'greater_than' ? 'gt' : 'lt';
    const isDate = DATE_SOURCE_FIELDS.has(c.sourceField) || ISO_DATE_RE.test(c.value.trim());
    const compiled = isDate
      ? compileDateRangeRegex(c.value, op)
      : NUMERIC_RE.test(c.value.trim())
        ? compileNumericRangeRegex(c.value, op)
        : null;
    if (!compiled) return null;
    return { ColumnName: c.sourceField, Value: compiled, Options: '' };
  }
  return {
    ColumnName: c.sourceField,
    Value: regexify(c.operation, c.value, c.values),
    Options: '',
  };
}

/**
 * Build the FilterProperty[] payload from the rule builder's form state.
 *
 * Emits BankSwiftCode + Side as `IN` filters, optionally TransactionTypeCode
 * as `EQ`, and compiles the rule groups into a single REGEX filter where
 * groups join OR and conditions inside a group join AND. Date and numeric
 * GT/LT conditions are compiled to range regex so they survive the trip
 * through the server's regex engine.
 *
 * Used by:
 *  - "Apply Rules" (filters the visible table to rule matches).
 *  - "GetAllTransactionTags" (live preview while authoring a rule).
 */
export function buildRulesetFilters(formState: WizardFormState): FilterProperty[] {
  const filters: FilterProperty[] = [
    { ColumnName: 'BankSwiftCode', Value: formState.bankSwiftCode, Operand: 'IN' },
    { ColumnName: 'Side', Value: formState.side, Operand: 'IN' },
  ];
  if (formState.transactionTypeCode) {
    filters.push({ ColumnName: 'TransactionTypeCode', Value: formState.transactionTypeCode, Operand: 'EQ' });
  }

  // `isFilledCondition` is the source of truth for "this condition carries
  // meaning for the backend." It accepts nullary ops (Is Blank or Empty /
  // Is Not Blank or Empty) which have no Value — without it, those rows
  // would be silently dropped from the REGEX payload here and the table
  // would return the unfiltered dataset.
  const regexGroups = formState.ruleGroups
    .map((group) =>
      group.conditions
        .filter(isFilledCondition)
        .map(buildInnerCondition)
        .filter((r): r is RegexCondition => r !== null),
    )
    .filter((group) => group.length > 0);

  if (regexGroups.length > 0) {
    filters.push({ Operand: 'REGEX', Regex: regexGroups });
  }

  return filters;
}
