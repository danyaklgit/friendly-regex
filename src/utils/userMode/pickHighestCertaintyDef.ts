import type { TagSpecDefinition, CertaintyLevelTag } from '../../types/tagSpec';

const CERTAINTY_RANK: Record<CertaintyLevelTag, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * From a list of matched TagSpec definitions, return the one with the highest
 * certainty. Ties resolve to the first match in the input order — which is the
 * order `analyzeRow` returns them, mirroring the order tags appear in
 * `OpsMultiTags` on the row. Returns `null` for an empty input.
 *
 * Used by the user-mode transactions table to collapse a multi-match row down
 * to a single displayed tag.
 */
export function pickHighestCertaintyDef(defs: TagSpecDefinition[]): TagSpecDefinition | null {
  if (defs.length === 0) return null;
  let best: TagSpecDefinition = defs[0];
  let bestRank = CERTAINTY_RANK[best.CertaintyLevelTag] ?? 0;
  for (let i = 1; i < defs.length; i++) {
    const rank = CERTAINTY_RANK[defs[i].CertaintyLevelTag] ?? 0;
    if (rank > bestRank) {
      best = defs[i];
      bestRank = rank;
    }
  }
  return best;
}
