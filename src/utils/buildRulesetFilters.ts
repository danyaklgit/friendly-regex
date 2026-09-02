import type { FilterProperty, RegexFilterProperty, StandardFilterProperty } from '../api/transactions';
import type { AndGroupFormValue, ConditionFormValue, WizardFormState } from '../types/wizard';
import { regexify } from './regexify';
import { DATE_SOURCE_FIELDS } from '../constants/fields';
import { compileDateRangeRegex } from './dateRangeRegex';
import { compileNumericRangeRegex } from './numericRangeRegex';
import { isFilledCondition } from './ruleFingerprint';
import { identityScopeFilters } from './libraryIdentity';

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
  // Nullary blank operations cannot ride inside the REGEX structure: the
  // server evaluates each inner condition as a Mongo regex, and a regex
  // never matches a NULL/missing field. When the rule has EXACTLY ONE
  // group, extractSingleGroupBlankFilters lifts these conditions out as
  // top-level ISBLANK/ISNOTBLANK FilterProperties (backend support
  // 2026-09-02) BEFORE this compiler runs, so they never reach here. With
  // several OR groups the lift is not semantically possible (top-level
  // filters AND) - those still drop here and the table's client-side
  // post-filter in TransactionsTab/filteredData narrows the loaded rows
  // using evaluateRuleSet's null-aware handling.
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
 * Compile a list of form-state AndGroups into the single REGEX
 * FilterProperty entry the backend understands. Returns `null` when
 * every group is empty (no filled conditions) so the caller can decide
 * whether to send no filter at all vs. an empty one.
 *
 * Extracted from {@link buildRulesetFilters} so other surfaces (the
 * standalone "Matching Rules" filter chip in the Transactions
 * filter row) can produce the same REGEX shape without dragging
 * along the bank/side/TxType context the rule wizard needs.
 */
/**
 * Lift "Is (Not) Blank or Empty" conditions out of the rule groups as
 * top-level ISBLANK/ISNOTBLANK FilterProperties (server support 2026-09-02:
 * blank = null/missing, empty, whitespace-only or dash-only - the same
 * convention evaluateRuleSet and the "-" placeholder use).
 *
 * Only possible when EXACTLY ONE group carries filled conditions: top-level
 * FilterProperties AND with everything else, which matches a single group's
 * AND semantics but would corrupt OR-of-groups. With zero or 2+ filled
 * groups everything is returned unchanged and the legacy behavior applies
 * (blank conditions drop from the payload; the client post-filter narrows).
 */
export function extractSingleGroupBlankFilters(ruleGroups: AndGroupFormValue[]): {
  blankFilters: StandardFilterProperty[];
  remainingGroups: AndGroupFormValue[];
} {
  const filledGroups = ruleGroups.filter((g) => g.conditions.some(isFilledCondition));
  if (filledGroups.length !== 1) return { blankFilters: [], remainingGroups: ruleGroups };
  const target = filledGroups[0];
  const isBlankOp = (op: string) => op === 'is_blank_or_empty' || op === 'is_not_blank_or_empty';
  const blanks = target.conditions.filter((c) => isFilledCondition(c) && isBlankOp(c.operation));
  if (blanks.length === 0) return { blankFilters: [], remainingGroups: ruleGroups };
  return {
    blankFilters: blanks.map((c) => ({
      ColumnName: c.sourceField,
      Value: '',
      Operand: c.operation === 'is_blank_or_empty' ? 'ISBLANK' : 'ISNOTBLANK',
    })),
    remainingGroups: ruleGroups.map((g) =>
      g === target
        ? { ...g, conditions: g.conditions.filter((c) => !(isFilledCondition(c) && isBlankOp(c.operation))) }
        : g,
    ),
  };
}

/**
 * The full FilterProperty payload for a set of rule groups: lifted
 * ISBLANK/ISNOTBLANK entries (single-group case) plus the REGEX entry over
 * whatever conditions remain. Use this instead of calling
 * buildRegexFilterFromRuleGroups directly wherever the result is SENT as
 * filters, or blank conditions silently vanish from the server payload.
 */
export function buildRuleFilterProperties(ruleGroups: AndGroupFormValue[]): FilterProperty[] {
  const { blankFilters, remainingGroups } = extractSingleGroupBlankFilters(ruleGroups);
  const regexFilter = buildRegexFilterFromRuleGroups(remainingGroups);
  return regexFilter ? [...blankFilters, regexFilter] : [...blankFilters];
}

export function buildRegexFilterFromRuleGroups(ruleGroups: AndGroupFormValue[]): RegexFilterProperty | null {
  const regexGroups = ruleGroups
    .map((group) =>
      group.conditions
        .filter(isFilledCondition)
        .map(buildInnerCondition)
        .filter((r): r is RegexCondition => r !== null),
    )
    .filter((group) => group.length > 0);
  if (regexGroups.length === 0) return null;
  return { Operand: 'REGEX', Regex: regexGroups };
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
  // Ledger scopes by ClientCode/ErpCode; every other type by BankSwiftCode/Side.
  // WizardFormState names the bank field `bankSwiftCode`, so map it to the
  // identity helper's `bank` slot.
  const filters: FilterProperty[] = identityScopeFilters(
    {
      dataSetType: formState.dataSetType,
      bank: formState.bankSwiftCode,
      side: formState.side,
      clientCode: formState.clientCode,
      erpCode: formState.erpCode,
    },
    'IN',
  );
  if (formState.transactionTypeCode) {
    filters.push({ ColumnName: 'TransactionTypeCode', Value: formState.transactionTypeCode, Operand: 'EQ' });
  }

  // Route through the shared helper so the same shapes (lifted blank
  // operands + REGEX) are used by every surface that builds from
  // form-state AndGroups.
  filters.push(...buildRuleFilterProperties(formState.ruleGroups));

  return filters;
}
