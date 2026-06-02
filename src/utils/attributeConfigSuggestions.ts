import type { AttributeFormValue, TagSpecLibrary, TagSpecDefinition } from '../types';
import type { ExtractionMethodDef } from '../types/lov';
import { getContextValue } from '../types/tagSpec';
import { cloneAttributeFromBackend } from './cloneRulesAndAttributes';

export interface AttributeSuggestionUsage {
  /** Tag name of the source definition (e.g. "SADADBillPay"). */
  tag: string;
  /** Side context of the source library ("CR" / "DR" / "RC" / "RD"); empty
   *  string when the library doesn't carry a Side entry (defensive). */
  side: string;
  /** Stable id of the source definition. Used as the React key in the picker
   *  and lets the caller exclude self-references when editing in place. */
  definitionId: string;
}

export interface AttributeConfigSuggestion {
  /** A fresh AttributeFormValue (new ids) ready to merge into the form. Sole
   *  exception: `attributeTag` / `isMandatory` are preserved from the source
   *  definition; the caller is expected to swap them with the operator's
   *  current row values when applying. */
  config: AttributeFormValue;
  /** Every (tag, side, definitionId) that shares this same extraction config.
   *  Length > 1 means the suggestion is dedup'd across multiple definitions. */
  usages: AttributeSuggestionUsage[];
}

/**
 * Canonical fingerprint of an extraction config. Two configs sharing the
 * same fingerprint will produce the same saved regex + transformations +
 * validation. Ids are intentionally NOT part of the fingerprint so cloned
 * attributes still collide with their source.
 *
 * Exported for tests and for any consumer that needs to know whether two
 * AttributeFormValues are "equivalent for the operator's purpose."
 */
export function attributeConfigFingerprint(c: AttributeFormValue): string {
  return JSON.stringify({
    sourceField: c.sourceField ?? '',
    extractionOperation: c.extractionOperation ?? '',
    prefix: c.prefix ?? null,
    suffix: c.suffix ?? null,
    pattern: c.pattern ?? null,
    suffixOrEndOfInput: c.suffixOrEndOfInput ?? false,
    numChars: c.numChars ?? null,
    fromPosition: c.fromPosition ?? null,
    tillEndOfInput: c.tillEndOfInput ?? false,
    verifyValue: c.verifyValue ?? null,
    isConstant: c.isConstant ?? false,
    constantValue: c.constantValue ?? null,
    isLovBased: c.isLovBased ?? false,
    lovTag: c.lovTag ?? null,
    validationRuleTag: c.validationRuleTag ?? '',
    transformations: (c.transformations ?? []).map((t) => ({
      method: t.method,
      args: t.args,
    })),
  });
}

/**
 * Scan every library scoped to `bankSwiftCode` (across all sides and all
 * statuses) for definitions that carry an attribute with the supplied tag
 * name, and return their extraction configs deduplicated by
 * {@link attributeConfigFingerprint}. The returned `config` for each
 * suggestion is a freshly cloned AttributeFormValue ready to drop into the
 * wizard's form state.
 *
 * Definitions whose id equals `excludeDefinitionId` (typically the rule
 * currently being edited) are skipped so the operator never sees themselves
 * suggested back. The attribute name match is case-insensitive — operators
 * routinely mix "BeneficiaryName" / "beneficiaryName" across libraries and
 * the suggestion engine should bridge that gap.
 *
 * Output ordering: most-frequent configs first (usage count desc), with ties
 * broken alphabetically by the first source tag for a stable display order.
 */
export function getAttributeConfigSuggestions(
  libraries: TagSpecLibrary[],
  bankSwiftCode: string | null | undefined,
  attributeTag: string,
  lovExtractions: ExtractionMethodDef[] = [],
  excludeDefinitionId?: string | null,
): AttributeConfigSuggestion[] {
  const target = attributeTag.trim().toLowerCase();
  if (!target || !bankSwiftCode) return [];

  const byFingerprint = new Map<string, AttributeConfigSuggestion>();
  // Track which (definitionId + attribute name) pairs we've already absorbed,
  // so the same backend attribute on the same definition appearing in two
  // libraries (INPROGRESS + ACTIVE snapshot for the same checkout) only
  // contributes ONE usage entry.
  const seenUsages = new Set<string>();

  for (const lib of libraries) {
    if (getContextValue(lib.Context, 'BankSwiftCode') !== bankSwiftCode) continue;
    const side = getContextValue(lib.Context, 'Side') ?? '';
    for (const def of lib.TagSpecDefinitions as TagSpecDefinition[]) {
      if (excludeDefinitionId && def.Id === excludeDefinitionId) continue;
      for (const attr of def.Attributes) {
        if (attr.AttributeTag.trim().toLowerCase() !== target) continue;
        const usageKey = `${def.Id}|${attr.AttributeTag}`;
        if (seenUsages.has(usageKey)) continue;
        seenUsages.add(usageKey);
        const config = cloneAttributeFromBackend(attr, lovExtractions);
        const fp = attributeConfigFingerprint(config);
        const usage: AttributeSuggestionUsage = {
          tag: def.Tag,
          side,
          definitionId: def.Id,
        };
        const existing = byFingerprint.get(fp);
        if (existing) {
          existing.usages.push(usage);
        } else {
          byFingerprint.set(fp, { config, usages: [usage] });
        }
      }
    }
  }

  return Array.from(byFingerprint.values()).sort((a, b) => {
    if (a.usages.length !== b.usages.length) return b.usages.length - a.usages.length;
    return (a.usages[0]?.tag ?? '').localeCompare(b.usages[0]?.tag ?? '');
  });
}
