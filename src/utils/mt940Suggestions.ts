import type { TagSpecDefinition, TransactionRow } from '../types';
import { evaluateRuleSet } from './evaluateRuleSet';

/**
 * Which of `defs` (the MT940 rules for a bank/side) match `row`.
 *
 * Used to suggest, on an INTRADAY (MT942 / INTERIM_MT940) transaction, the
 * MT940 rules that already describe it — so the operator can clone one into an
 * intraday tag. Matches on the validity window + the rule conditions (the
 * narrative regex) only.
 *
 * The def's child Context (TransactionTypeCode) is deliberately IGNORED:
 * MT940 and MT942 use DIFFERENT transaction-type codes for the same logical
 * transaction (e.g. an MT940 rule scoped to `NTRF` vs an MT942 row coded
 * `MSC`), so honoring the TTC scope would suppress virtually every otherwise-
 * relevant match. The point here is "which MT940 rule's conditions describe
 * this row, so I can clone it" — the operator adapts the TTC on the new
 * intraday tag. Read-only; neither tags the row nor touches its Ops layer.
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
    if (def.TagRuleExpressions.some((group) => evaluateRuleSet(group, row))) {
      out.push(def);
    }
  }
  return out;
}
