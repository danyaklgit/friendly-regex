import type { AttributeFormValue, TransformationFormValue } from '../types';
import { EXTRACTION_OPERATIONS } from '../constants/operations';
import { TRANSFORMATION_METHOD_MAP } from '../constants/transformations';

/** True when every `required: true` arg the transformation method declares
 *  carries a non-empty value. Returns false on an empty `method` (still in
 *  the "pick a method" state) so an unfinished row blocks save / preview.
 *  An unknown method (not in TRANSFORMATION_METHOD_MAP — happens
 *  defensively for legacy data) is treated as complete so we don't
 *  permanently lock out an existing attribute on a backend list refresh.
 *
 *  Empty-string check uses raw length (not `.trim()`) so a single-space
 *  delimiter — e.g. `replace` with `find: ' '`, or `split_and_pick` with
 *  `delimiter: ' '` — counts as a real, meaningful value. Mirrors the
 *  extraction-field gate in isCompleteAttribute.
 *
 *  An arg flagged `allowEmpty: true` (e.g. the `replaceWith` arg on
 *  `replace` / `regex_replace` / `starts_with_and_replace` /
 *  `ends_with_and_replace`) is considered satisfied when the value is
 *  present at all, including the empty string — operators routinely use
 *  an empty replacement to DELETE matched text. We still require the key
 *  be defined (typeof === 'string') so a totally absent arg is not
 *  silently treated as "" and slip through. */
export function isCompleteTransformation(t: TransformationFormValue): boolean {
  if (!t.method) return false;
  const def = TRANSFORMATION_METHOD_MAP.get(t.method);
  if (!def) return true;
  for (const arg of def.args) {
    if (!arg.required) continue;
    const val = t.args?.[arg.key];
    if (val == null) return false;
    if (val.length === 0 && !arg.allowEmpty) return false;
  }
  return true;
}

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
  // Each post-extraction transformation row must have its required args
  // filled in. Without this gate, a Split & Pick with a missing index
  // would save with a default-0 pick (the live preview was producing a
  // misleadingly-real result), and other multi-arg transforms (Replace,
  // Regex Replace, Pad Left/Right, Reformat Date) would silently save
  // with empty inputs that the runtime then interprets as no-ops.
  for (const t of a.transformations ?? []) {
    if (!isCompleteTransformation(t)) return false;
  }
  return true;
}

export function hasIncompleteAttribute(attributes: AttributeFormValue[]): boolean {
  return attributes.some((a) => !isCompleteAttribute(a));
}
