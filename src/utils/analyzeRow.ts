import type { TransactionRow, TagSpecDefinition, TagSpecLibrary, RowAnalysisResult } from '../types';
import { contextMatchesRow } from '../types/tagSpec';
import { evaluateRuleSet } from './evaluateRuleSet';
import { extractAttributes } from './extractAttributes';

/**
 * Checks all tag rules against a transaction row using two-level context matching.
 * First checks the library's parent context, then each definition's child context.
 * Returns matched tags and their extracted attributes.
 *
 * A library with an empty Context is treated as the rule-builder preview library —
 * its empty-rule definitions match unconditionally (so the user can preview an
 * attribute-only draft). Real saved libraries (always scoped by bank/side via
 * Context) never match empty-rule definitions; those are skipped.
 */
export function analyzeRow(
  row: TransactionRow,
  libraries: TagSpecLibrary[]
): RowAnalysisResult {
  const tags: string[] = [];
  const attributes: Record<string, Record<string, string | null>> = {};
  const matchedDefinitions: TagSpecDefinition[] = [];

  for (const lib of libraries) {
    // Level 1: Check parent context (e.g. Side + BankSwiftCode).
    // Empty parent context means this is the preview library (matches all rows).
    const isPreviewLib = lib.Context.length === 0;
    if (!isPreviewLib && !contextMatchesRow(lib.Context, row)) continue;

    for (const def of lib.TagSpecDefinitions) {
      if (def.StatusTag !== 'ACTIVE') continue;

      const now = new Date().toISOString().split('T')[0];
      if (def.Validity.StartDate && now < def.Validity.StartDate) continue;
      if (def.Validity.EndDate && now > def.Validity.EndDate) continue;

      // Level 2: Check child context (e.g. TransactionTypeCode)
      if (def.Context.length > 0 && !contextMatchesRow(def.Context, row)) continue;

      // Definitions with no rules are only meaningful in the preview library.
      // In real libraries, skip them — they'd otherwise produce phantom tag matches.
      if (def.TagRuleExpressions.length === 0 && !isPreviewLib) continue;

      // OR logic: any AND group matching is sufficient.
      // Empty rule expressions = unconditional match (only reachable for the preview lib above).
      const matches = def.TagRuleExpressions.length === 0 ||
        def.TagRuleExpressions.some((andGroup) =>
          evaluateRuleSet(andGroup, row)
        );

      if (matches) {
        tags.push(def.Tag);
        matchedDefinitions.push(def);
        // Key by def.Id, NOT def.Tag — multiple matched defs can share a tag
        // name (e.g. two "TransferInDom" definitions covering different sender
        // patterns). Tag-keyed storage would have the last matched def silently
        // overwrite the first, so the table couldn't display attributes scoped
        // to the definition the user is currently filtering by.
        attributes[def.Id] = extractAttributes(def.Attributes, row);
      }
    }
  }

  return { tags, attributes, matchedDefinitions };
}
