import type { TagSpecDefinition, TransactionRow } from '../types';
import { getContextValue } from '../types/tagSpec';
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
 * BY DEFAULT TRANSACTION TYPE IS IGNORED — both the def's child Context AND
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
 *
 * `matchTransactionType` is the opt-in escape hatch for banks whose intraday
 * codes DO line up with their MT940 codes: the "Match transaction type" toggle
 * in the MT942 / Interim MT940 workspaces. When true a def is suggested only
 * if its OWN Context TransactionTypeCode equals the row's — and a def carrying
 * NO code is hidden rather than treated as unconstrained (deliberately strict:
 * the toggle exists to see only confirmed same-type matches). Rule-level type
 * CONDITIONS stay stripped either way, so the toggle changes the def's
 * identity scope, never how its narrative/amount/date rules evaluate.
 */
export function matchingMt940Defs(
  defs: TagSpecDefinition[],
  row: TransactionRow,
  todayISODate: string,
  matchTransactionType = false,
): TagSpecDefinition[] {
  const out: TagSpecDefinition[] = [];
  const rowTtc = matchTransactionType ? String(row['TransactionTypeCode'] ?? '').trim() : '';
  for (const def of defs) {
    if (def.StatusTag !== 'ACTIVE') continue;
    if (def.TagRuleExpressions.length === 0) continue;
    if (def.Validity.StartDate && todayISODate < def.Validity.StartDate) continue;
    if (def.Validity.EndDate && todayISODate > def.Validity.EndDate) continue;
    if (matchTransactionType) {
      const defTtc = (getContextValue(def.Context, 'TransactionTypeCode') ?? '').trim();
      // No code on the rule → hidden while the toggle is on (strict).
      if (!defTtc || defTtc !== rowTtc) continue;
    }
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
