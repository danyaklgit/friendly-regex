import type { TransactionRow, TagSpecDefinition, TagSpecLibrary, RowAnalysisResult } from '../types';
import { contextMatchesRow } from '../types/tagSpec';
import { evaluateRuleSet } from './evaluateRuleSet';
import { extractAttributes } from './extractAttributes';

/**
 * Optional caller-supplied scratch state. `analyzeRow` runs across every
 * loaded transaction (44k+ in worst case), so passing a pre-built
 * "today" date and a pre-built `defById` lookup map saves recomputing
 * them inside every per-row call. When omitted, `analyzeRow` builds
 * them lazily (slower but contract-preserving for callers that only
 * ever analyze one or two rows). The right pattern for batch callers
 * is to compute these once with {@link buildAnalyzeScratch} and pass
 * the same object to every analyzeRow invocation in the batch.
 */
export interface AnalyzeRowScratch {
  todayISODate: string;
  defById: Map<string, TagSpecDefinition>;
}

export function buildAnalyzeScratch(libraries: TagSpecLibrary[]): AnalyzeRowScratch {
  const defById = new Map<string, TagSpecDefinition>();
  for (const lib of libraries) {
    for (const def of lib.TagSpecDefinitions) {
      defById.set(def.Id, def);
    }
  }
  return {
    todayISODate: new Date().toISOString().split('T')[0],
    defById,
  };
}

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
  scratch?: AnalyzeRowScratch,
): RowAnalysisResult {
  const tags: string[] = [];
  const matchedDefinitions: TagSpecDefinition[] = [];

  // Today as YYYY-MM-DD for validity-window checks. Hoisted out of the
  // per-definition loop because the inner allocation (`new Date()` +
  // `toISOString().split('T')[0]`) ran tens of millions of times on a
  // Show-all over 44k rows. Caller can pre-compute it once via
  // `buildAnalyzeScratch` and pass it in.
  const today = scratch?.todayISODate ?? new Date().toISOString().split('T')[0];

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

      if (def.Validity.StartDate && today < def.Validity.StartDate) continue;
      if (def.Validity.EndDate && today > def.Validity.EndDate) continue;

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
      // Caller-supplied `defById` lets a batch caller pay the
      // Map-construction cost ONCE per analysis pass instead of per
      // row (was the hot path for Show-all on a busy bank/side —
      // libraries × defs × rows). When omitted (single-row callers
      // like tag previews) the Map is built lazily here, same
      // semantics as before.
      const defById = scratch?.defById ?? (() => {
        const m = new Map<string, TagSpecDefinition>();
        for (const lib of libraries) {
          for (const def of lib.TagSpecDefinitions) {
            m.set(def.Id, def);
          }
        }
        return m;
      })();
      for (const defId of backendDefIds) {
        const def = defById.get(defId);
        if (!def) continue;
        if (matchedDefinitions.some((d) => d.Id === def.Id)) continue;
        tags.push(def.Tag);
        matchedDefinitions.push(def);
      }
    }
  }

  // Attributes are extracted LAZILY: the per-definition regex extraction is
  // the dominant per-row cost, but the table only reads a row's attributes
  // when it RENDERS that row (~one virtual window of rows at a time), never
  // for the count / filter / select-all paths. Computing them eagerly for
  // every loaded row made a Show all over tens of thousands of rows crawl
  // (and "select all" wait on it). The getter computes once on first access
  // and caches, keyed by def.Id — same values as before, just deferred.
  // NOTE: object spread (`{ ...analysis }`) invokes this getter; build new
  // analysis objects field-by-field instead (see displayAnalyzedData).
  let attrCache: Record<string, Record<string, string | null>> | undefined;
  return {
    tags,
    matchedDefinitions,
    get attributes() {
      if (attrCache === undefined) {
        attrCache = {};
        for (const def of matchedDefinitions) {
          // Key by def.Id, NOT def.Tag — multiple matched defs can share a
          // tag name; tag-keyed storage would clobber earlier matches.
          attrCache[def.Id] = extractAttributes(def.Attributes, row);
        }
      }
      return attrCache;
    },
  };
}
