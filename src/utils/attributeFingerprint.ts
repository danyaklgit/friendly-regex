import type { AttributeFormValue } from '../types';
import { EXTRACTION_OPERATIONS } from '../constants/operations';

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

/** True if every required slot on the attribute is filled — name, source
 *  field, extraction method, and any operation-specific fields the method
 *  declares (prefix/suffix/pattern/verifyValue). Mirrors the
 *  `missingSaveFields` check inside AttributeEditor so the builder-level
 *  gate stays consistent with the inline Save button. */
export function isCompleteAttribute(a: AttributeFormValue): boolean {
  if (a.attributeTag.trim().length === 0) return false;
  // Constant-mode attributes need only a non-empty literal — the extraction
  // method, source field, transformations, and validation sections are hidden
  // in this mode, so none of those gates apply.
  if (a.isConstant) {
    return (a.constantValue ?? '').trim().length > 0;
  }
  if (!a.sourceField || a.sourceField.trim().length === 0) return false;
  const opKey = a.extractionOperation as string;
  if (!opKey || opKey.trim().length === 0) return false;
  const op = EXTRACTION_OPERATIONS.find((o) => o.key === a.extractionOperation);
  if (op) {
    for (const field of op.fields) {
      if (field === 'prefix' && (a.prefix ?? '').length === 0) return false;
      if (field === 'suffix' && (a.suffix ?? '').length === 0) return false;
      if (field === 'pattern' && (a.pattern ?? '').length === 0) return false;
      if (field === 'verifyValue' && (a.verifyValue ?? '').length === 0) return false;
    }
    // extract_last_n_chars has no required text fields, but numChars is the
    // sole driver of the captured span — without it the rule would extract
    // the entire field. Treat it as required for save gating.
    if (op.key === 'extract_last_n_chars' && !(a.numChars && a.numChars > 0)) return false;
    // extract_skip_take needs a defined capture: either an explicit take count
    // or the "till end of input" toggle. The skip count defaults to 0.
    if (op.key === 'extract_skip_take' && !a.tillEndOfInput && !(a.numChars && a.numChars > 0)) return false;
  }
  return true;
}

export function hasIncompleteAttribute(attributes: AttributeFormValue[]): boolean {
  return attributes.some((a) => !isCompleteAttribute(a));
}
