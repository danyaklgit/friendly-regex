import type { AndGroupFormValue, ConditionFormValue } from '../types';

/** True if a condition has been filled in enough to matter for matching. An
 *  empty placeholder row (no sourceField or empty value) contributes nothing
 *  to a group's identity and is excluded from duplicate comparisons. */
export function isFilledCondition(c: ConditionFormValue): boolean {
  return !!c.sourceField && c.value.trim().length > 0;
}

/** Canonical fingerprint of a single condition. */
export function conditionFingerprint(c: ConditionFormValue): string {
  return [
    c.sourceField,
    c.operation,
    c.value,
    (c.values ?? []).join('|'),
    c.prefix ?? '',
    c.suffix ?? '',
  ].join('␟');
}

export function isSameCondition(a: ConditionFormValue, b: ConditionFormValue): boolean {
  return conditionFingerprint(a) === conditionFingerprint(b);
}

/** Order-independent fingerprint of a rule set's *filled* conditions only —
 *  empty placeholder rows are ignored so opening a new empty condition in one
 *  group doesn't mask a duplicate elsewhere. Returns '' when the group has no
 *  filled conditions yet (so it never matches another empty group). */
export function groupFingerprint(conditions: ConditionFormValue[]): string {
  const filled = conditions.filter(isFilledCondition);
  if (filled.length === 0) return '';
  return filled.map(conditionFingerprint).sort().join('␞');
}

/** For each rule set, returns the index of the first OTHER rule set with the
 *  same canonical fingerprint, or null if this rule set is unique (or empty).
 *  Used to render a persistent duplicate-rule-set warning on every member of
 *  a duplicate pair simultaneously. */
export function computeDuplicateGroupIndexes(ruleGroups: AndGroupFormValue[]): (number | null)[] {
  const fps = ruleGroups.map((g) => groupFingerprint(g.conditions));
  return fps.map((fp, i) => {
    if (!fp) return null;
    const other = fps.findIndex((f, j) => j !== i && f === fp);
    return other === -1 ? null : other;
  });
}

/** True when any two rule sets share the same canonical fingerprint. Used as
 *  the boolean gate on the top-level submit buttons; the per-row banner is
 *  driven by computeDuplicateGroupIndexes above. */
export function hasDuplicateGroups(ruleGroups: AndGroupFormValue[]): boolean {
  return computeDuplicateGroupIndexes(ruleGroups).some((i) => i !== null);
}

/** True when any rule set contains two filled conditions with the same
 *  fingerprint. Cross-group duplicates are NOT covered here — that's
 *  hasDuplicateGroups. Empty placeholder conditions never participate. */
export function hasWithinGroupConditionDuplicates(
  ruleGroups: AndGroupFormValue[],
): boolean {
  for (const g of ruleGroups) {
    const seen = new Set<string>();
    for (const c of g.conditions) {
      if (!isFilledCondition(c)) continue;
      const fp = conditionFingerprint(c);
      if (seen.has(fp)) return true;
      seen.add(fp);
    }
  }
  return false;
}
