import type { TagSpecCommentTarget } from '../types/comments';
import type { TagSpecLibrary } from '../types/tagSpec';
import { getContextValue } from '../types/tagSpec';

export interface SearchBreadcrumb {
  /** BankSwiftCode resolved from the library, or null when unknown. */
  bank: string | null;
  /** Side resolved from the library, or null when unknown. */
  side: string | null;
  /** Tag name resolved from the definition, or null when unknown. */
  tagName: string | null;
  /** Sub-scope label: "Attr: X", "Rule", or null. */
  scope: string | null;
  /** True when the library couldn't be resolved from the lookup. The caller
   *  should show the truncated library id as a fallback. */
  libraryMissing: boolean;
  /** True when a definition id was set on the target but couldn't be
   *  resolved. The caller should show a truncated definition id. */
  definitionMissing: boolean;
}

/**
 * Resolve a comment target into a human-readable breadcrumb. The caller is
 * expected to render the breadcrumb as `bank . side . tagName . scope`,
 * skipping null segments and falling back to truncated ids when the lookup
 * could not resolve the target's library or definition.
 */
export function buildBreadcrumb(
  target: TagSpecCommentTarget,
  libraryLookup: Map<string, TagSpecLibrary>,
): SearchBreadcrumb {
  const lib = libraryLookup.get(target.TagSpecLibraryId) ?? null;
  const bank = lib ? getContextValue(lib.Context, 'BankSwiftCode') ?? null : null;
  const side = lib ? getContextValue(lib.Context, 'Side') ?? null : null;

  let tagName: string | null = null;
  let definitionMissing = false;
  if (target.TagSpecDefinitionId) {
    const def = lib?.TagSpecDefinitions.find((d) => d.Id === target.TagSpecDefinitionId);
    if (def?.Tag) tagName = def.Tag;
    else definitionMissing = true;
  }

  let scope: string | null = null;
  if (target.AttributeTag) scope = `Attr: ${target.AttributeTag}`;
  else if (target.TagRuleExpressionId) scope = 'Rule';

  return {
    bank,
    side,
    tagName,
    scope,
    libraryMissing: !lib,
    definitionMissing,
  };
}

/** Convenience that flattens a breadcrumb into a `.`-joined display string,
 *  using the supplied fallbacks for missing ids. */
export function breadcrumbToString(
  crumb: SearchBreadcrumb,
  target: TagSpecCommentTarget,
  truncateId: (id: string) => string = (id) => `${id.slice(0, 6)}…`,
): string {
  const parts: string[] = [];
  if (crumb.libraryMissing) {
    parts.push(truncateId(target.TagSpecLibraryId));
  } else {
    const bs = [crumb.bank, crumb.side].filter(Boolean).join(' · ');
    if (bs) parts.push(bs);
  }
  if (crumb.tagName) parts.push(crumb.tagName);
  else if (crumb.definitionMissing && target.TagSpecDefinitionId) {
    parts.push(truncateId(target.TagSpecDefinitionId));
  }
  if (crumb.scope) parts.push(crumb.scope);
  return parts.join(' · ');
}
