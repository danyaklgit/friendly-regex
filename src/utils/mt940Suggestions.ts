import type { TagSpecDefinition, TransactionRow } from '../types';
import { evaluateRuleSet } from './evaluateRuleSet';

/**
 * Transaction-type fields (both the code and the human name). Conditions on
 * these are STRIPPED before matching — see matchingMt940Defs.
 */
const TRANSACTION_TYPE_FIELDS = new Set(['TransactionTypeCode', 'TransactionTypeName']);

/**
 * Which of `defs` (the MT940 rules for a bank/side) match `row`.
 *
 * Used to suggest, on a transaction in any NON-MT940 workspace (MT942,
 * INTERIM_MT940, …), the MT940 rules that already describe it — so the
 * operator can clone one into a tag for that workspace.
 *
 * TRANSACTION TYPE IS DELIBERATELY IGNORED — both the def's child Context AND
 * any TransactionTypeCode / TransactionTypeName CONDITION inside the rule
 * expressions. MT940 and MT942 use DIFFERENT transaction-type codes/names for
 * the same logical transaction (an MT940 rule scoped to `NTRF` / "Expense" vs
 * an MT942 row coded `MSC` / a different name), so evaluating a type condition
 * would only ever match the rows whose type happens to coincide (the "works on
 * the first page only" symptom) and suppress every other otherwise-relevant
 * match. We match on the REMAINING conditions (narrative / amount / date); a
 * rule whose ONLY constraint was the transaction type imposes nothing once
 * that is ignored, so it is suggested for any row. The operator adapts the TTC
 * on the new intraday tag. Read-only; never tags the row or touches Ops.
 */
export function matchingMt940Defs(
  defs: TagSpecDefinition[],
  row: TransactionRow,
  todayISODate: string,
): TagSpecDefinition[] {
  const out: TagSpecDefinition[] = [];
  for (const def of defs) {
    if (def.StatusTag !== 'ACTIVE') continue;
    if (def.TagRuleExpressions.length === 0) continue;
    if (def.Validity.StartDate && todayISODate < def.Validity.StartDate) continue;
    if (def.Validity.EndDate && todayISODate > def.Validity.EndDate) continue;
    const matches = def.TagRuleExpressions.some((group) => {
      const nonTypeConditions = group.filter((c) => !TRANSACTION_TYPE_FIELDS.has(c.SourceField));
      // Group was purely a transaction-type constraint → nothing left to check
      // once type is ignored, so the rule applies. Otherwise match on the
      // remaining conditions.
      if (nonTypeConditions.length === 0) return true;
      return evaluateRuleSet(nonTypeConditions, row);
    });
    if (matches) out.push(def);
  }
  return out;
}

/**
 * Order-independent fingerprint of a saved def's rule expressions, with
 * transaction-type conditions STRIPPED — the same normalization
 * matchingMt940Defs matches with. Used to decide whether an MT940 def was
 * already cloned into the intraday library: the clone flow copies rules
 * verbatim but the operator adapts transaction-type codes (MT940 and MT942
 * codes differ for the same logical transaction), so type conditions must not
 * differentiate. Two defs sharing a tag name but carrying different rules
 * fingerprint differently — only the exact already-cloned rule set is
 * suppressed as a suggestion, the others still show.
 */
export function mt940CloneRuleFingerprint(def: TagSpecDefinition): string {
  return def.TagRuleExpressions
    .map((group) =>
      group
        .filter((c) => !TRANSACTION_TYPE_FIELDS.has(c.SourceField))
        .map((c) => `${c.SourceField}␟${c.Regex}`)
        .sort()
        .join('␞'),
    )
    .sort()
    .join('␝');
}

