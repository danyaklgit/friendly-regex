import type { TransactionRow, TagSpecDefinition, TagSpecLibrary, RowAnalysisResult } from '../types';
import { contextMatchesRow } from '../types/tagSpec';
import { evaluateRuleSet } from './evaluateRuleSet';
import { extractAttributes } from './extractAttributes';

/**
 * Checks all tag rules against a transaction row using two-level context matching.
 * First checks the library's parent context, then each definition's child context.
 * Returns matched tags and their extracted attributes.
 */
export function analyzeRow(
  row: TransactionRow,
  libraries: TagSpecLibrary[]
): RowAnalysisResult {
  const tags: string[] = [];
  const attributes: Record<string, Record<string, string | null>> = {};
  const matchedDefinitions: TagSpecDefinition[] = [];

  for (const lib of libraries) {
    // Level 1: Check parent context (e.g. Side + BankSwiftCode)
    // Empty parent context means match all rows (used for preview)
    if (lib.Context.length > 0 && !contextMatchesRow(lib.Context, row)) continue;

    for (const def of lib.TagSpecDefinitions) {
      if (def.StatusTag !== 'ACTIVE') continue;

      const now = new Date().toISOString().split('T')[0];
      if (def.Validity.StartDate && now < def.Validity.StartDate) continue;
      if (def.Validity.EndDate && now > def.Validity.EndDate) continue;

      // Level 2: Check child context (e.g. TransactionTypeCode)
      if (def.Context.length > 0 && !contextMatchesRow(def.Context, row)) continue;

      // OR logic: any AND group matching is sufficient
      // Empty rule expressions = unconditional match (for attribute-only testing)
      const matches = def.TagRuleExpressions.length === 0 ||
        def.TagRuleExpressions.some((andGroup) =>
          evaluateRuleSet(andGroup, row)
        );

      if (matches) {
        tags.push(def.Tag);
        matchedDefinitions.push(def);
        attributes[def.Tag] = extractAttributes(def.Attributes, row);
      }
    }
  }

  return { tags, attributes, matchedDefinitions };
}
