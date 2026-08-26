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
 * Used to suggest, on an INTRADAY (MT942 / INTERIM_MT940) transaction, the
 * MT940 rules that already describe it — so the operator can clone one into an
 * intraday tag.
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

export interface Mt940ConditionExplanation {
  field: string;
  regex: string;
  prompt: string | null;
  regexCompiles: boolean;
  /** Condition on TransactionTypeCode/Name — stripped before matching. */
  ignoredAsTransactionType: boolean;
  rowValue: string;
  /** null when the condition is ignored (transaction-type). */
  pass: boolean | null;
}

export interface Mt940DefExplanation {
  tag: string;
  id: string;
  matches: boolean;
  /** Set when the def was rejected before rule evaluation. */
  skipped?: string;
  groups: Array<{ group: number; pass: boolean; conditions: Mt940ConditionExplanation[] }>;
}

/**
 * DEBUG companion to matchingMt940Defs: same decision tree, but reports WHY
 * each def did or did not match `row` — per-def skip reason (status / empty
 * rules / validity window) and per-condition pass/fail with the row value the
 * condition saw. Mirrors matchingMt940Defs exactly (evaluateRuleSet ANDs
 * conditions independently, so evaluating them one at a time is equivalent).
 * Only called for rows under investigation; never on the hot path.
 */
export function explainMt940Defs(
  defs: TagSpecDefinition[],
  row: TransactionRow,
  todayISODate: string,
): Mt940DefExplanation[] {
  return defs.map((def) => {
    let skipped: string | undefined;
    if (def.StatusTag !== 'ACTIVE') skipped = `StatusTag=${def.StatusTag}`;
    else if (def.TagRuleExpressions.length === 0) skipped = 'no rule expressions';
    else if (def.Validity.StartDate && todayISODate < def.Validity.StartDate)
      skipped = `not yet valid (StartDate=${def.Validity.StartDate}, today=${todayISODate})`;
    else if (def.Validity.EndDate && todayISODate > def.Validity.EndDate)
      skipped = `expired (EndDate=${def.Validity.EndDate}, today=${todayISODate})`;
    const groups = def.TagRuleExpressions.map((group, i) => {
      const conditions = group.map((c): Mt940ConditionExplanation => {
        const ignored = TRANSACTION_TYPE_FIELDS.has(c.SourceField);
        let regexCompiles = true;
        try {
          new RegExp(c.Regex);
        } catch {
          regexCompiles = false;
        }
        return {
          field: c.SourceField,
          regex: c.Regex,
          prompt: c.ExpressionPrompt,
          regexCompiles,
          ignoredAsTransactionType: ignored,
          rowValue: String(row[c.SourceField] ?? '<null>'),
          pass: ignored ? null : evaluateRuleSet([c], row),
        };
      });
      const nonType = conditions.filter((c) => !c.ignoredAsTransactionType);
      const pass = nonType.length === 0 ? true : nonType.every((c) => c.pass === true);
      return { group: i, pass, conditions };
    });
    return {
      tag: def.Tag,
      id: def.Id,
      matches: !skipped && groups.some((g) => g.pass),
      skipped,
      groups,
    };
  });
}
