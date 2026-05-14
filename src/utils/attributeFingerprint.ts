import type { AttributeFormValue } from '../types';

/** True if an attribute has been named — empty placeholder rows are ignored
 *  for duplicate comparisons so adding a fresh row never false-flags. */
export function isFilledAttribute(a: AttributeFormValue): boolean {
  return a.attributeTag.trim().length > 0;
}

/** Canonical name key. Case-insensitive + trimmed so "BeneficiaryName" and
 *  "  beneficiaryname  " collide. Backend OpsAttributes use case-sensitive
 *  keys, but two attributes differing only in case would still produce
 *  conflicting Key entries in any reasonable consumer, so we err on the
 *  safe side here. */
export function attributeNameKey(a: AttributeFormValue): string {
  return a.attributeTag.trim().toLowerCase();
}

/** For each attribute, returns the index of the first earlier attribute with
 *  the same name, or null when it's unique (or empty). Mirrors
 *  computeDuplicateGroupIndexes — only the LATER duplicate is flagged so the
 *  original stays clean. */
export function computeDuplicateAttributeIndexes(
  attributes: AttributeFormValue[],
): (number | null)[] {
  const seen = new Map<string, number>();
  return attributes.map((a, i) => {
    if (!isFilledAttribute(a)) return null;
    const key = attributeNameKey(a);
    const earlier = seen.get(key);
    if (earlier === undefined) {
      seen.set(key, i);
      return null;
    }
    return earlier;
  });
}

export function hasDuplicateAttributeNames(attributes: AttributeFormValue[]): boolean {
  return computeDuplicateAttributeIndexes(attributes).some((i) => i !== null);
}
