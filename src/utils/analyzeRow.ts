import type { TransactionRow, TagSpecDefinition, TagSpecLibrary, RowAnalysisResult } from '../types';
import { contextMatchesRow } from '../types/tagSpec';
import { evaluateRuleSet } from './evaluateRuleSet';
import { extractAttributes } from './extractAttributes';

/**
 * Checks tag rules against a transaction row.
 *
 * Sample mode (`useBackendTags=false`, the default):
 *   Every library is evaluated locally. Two-level context matching is applied
 *   (library Context, then definition Context), then the AND/OR rule
 *   expressions are run against the row's data fields. This is the right
 *   behavior for sample data — there's no backend label to defer to.
 *
 * Live mode (`useBackendTags=true`):
 *   Only the rule-builder preview library (empty Context — the user's
 *   in-progress draft) is evaluated locally. For saved libraries we trust
 *   the backend's tagging: the row's `OpsTag` / `OpsTagSpecDefinitionId` /
 *   `OpsMultiTags` fields are authoritative. Re-evaluating saved rules
 *   locally produced phantom matches whenever some other definition's rules
 *   happened to also be satisfied by the row's data (e.g. a `MiscDebit` def
 *   surfacing on a row the backend tagged only as `TransferOut`).
 *
 * A library with an empty Context is treated as the rule-builder preview
 * library — its empty-rule definitions match unconditionally so the user can
 * preview an attribute-only draft.
 */
export function analyzeRow(
  row: TransactionRow,
  libraries: TagSpecLibrary[],
  useBackendTags = false,
): RowAnalysisResult {
  const tags: string[] = [];
  const attributes: Record<string, Record<string, string | null>> = {};
  const matchedDefinitions: TagSpecDefinition[] = [];

  for (const lib of libraries) {
    // Level 1: Check parent context (e.g. Side + BankSwiftCode).
    // Empty parent context means this is the preview library (matches all rows).
    const isPreviewLib = lib.Context.length === 0;
    // In live mode, only the preview library is re-evaluated locally.
    // Saved libraries' tags come from the row's Ops* fields below.
    if (useBackendTags && !isPreviewLib) continue;
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

  // Live mode: layer in the backend-assigned tags. Look up each referenced
  // definition by ID so the tooltip / attribute panel show the real
  // definition's rules and metadata (not just a tag-name string).
  if (useBackendTags) {
    const opsMultiTags = row['OpsMultiTags'] as unknown;
    const opsTagDefId = row['OpsTagSpecDefinitionId'] as unknown;

    const backendDefIds: string[] = [];
    if (Array.isArray(opsMultiTags) && opsMultiTags.length > 0) {
      for (const mt of opsMultiTags) {
        if (mt && typeof mt === 'object') {
          const id = (mt as { TagSpecDefinitionId?: unknown }).TagSpecDefinitionId;
          if (typeof id === 'string' && id) backendDefIds.push(id);
        }
      }
    } else if (typeof opsTagDefId === 'string' && opsTagDefId) {
      backendDefIds.push(opsTagDefId);
    }

    if (backendDefIds.length > 0) {
      const defById = new Map<string, TagSpecDefinition>();
      for (const lib of libraries) {
        for (const def of lib.TagSpecDefinitions) {
          defById.set(def.Id, def);
        }
      }
      for (const defId of backendDefIds) {
        const def = defById.get(defId);
        if (!def) continue;
        if (matchedDefinitions.some((d) => d.Id === def.Id)) continue;
        tags.push(def.Tag);
        matchedDefinitions.push(def);
        attributes[def.Id] = extractAttributes(def.Attributes, row);
      }
    }
  }

  return { tags, attributes, matchedDefinitions };
}
