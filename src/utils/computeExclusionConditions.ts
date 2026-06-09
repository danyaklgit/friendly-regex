import type { AndGroupFormValue, ConditionFormValue, TagSpecDefinition } from '../types';
import { decomposeRegex } from './engregxify';
import { negateCondition } from './negateCondition';

/**
 * Build the canonical key for a condition's identity-by-content. Two
 * conditions with the same key are considered "the same condition" for
 * the differentiator computation — equal source field, equal operation,
 * equal value(s). The id and any extraction-only metadata don't
 * participate in the key because the operator's INTENT is captured by
 * source/op/value alone.
 *
 * For `matches_pattern` the multi-value list is joined sorted so the
 * order in which the operator typed the alternation arms doesn't matter
 * for overlap detection.
 */
function conditionKey(c: { sourceField: string; operation: string; value: string; values?: string[] }): string {
  if (c.operation === 'matches_pattern' && c.values && c.values.length > 0) {
    return `${c.sourceField}|${c.operation}|${[...c.values].sort().join(',')}`;
  }
  return `${c.sourceField}|${c.operation}|${c.value}`;
}

/**
 * Result envelope for {@link computeExclusionConditions}. Carries enough
 * structured detail that the caller (the wizard's `excludeTag` action)
 * can produce a meaningful toast: how many negative conditions were
 * generated, and why a no-op happened when nothing got generated.
 */
export interface ExclusionResult {
  /** Negated conditions to append to every AndGroup in A1. Each one has
   *  a fresh `id` so it can be inserted into existing groups without
   *  identity collisions. */
  conditions: ConditionFormValue[];
  /** True when the exclusion produced no conditions to add. */
  skipped: boolean;
  /** Human-readable reason for the skip. Mirrors operator intuition:
   *  "no rules to differentiate from", "rules fully cover this tag", etc. */
  reason?: string;
}

/**
 * For each AND group of the target tag (A2), find the conditions that
 * AREN'T already present anywhere in A1's rule groups (the
 * "differentiators"), negate them, and return the deduplicated list.
 *
 * Algorithm (per the plan):
 *   1. Build a set of every condition key across A1's filled rule groups.
 *   2. For each AndGroup in A2:
 *      - Take A2's conditions whose keys are not in A1's set.
 *      - If the group has no such differentiator, skip it (A1 fully
 *        covers A2 in this branch — adding nothing would silently say
 *        "this branch can't be distinguished from A1").
 *   3. Negate every collected differentiator via {@link negateCondition}.
 *   4. Deduplicate the negated set by key so the caller doesn't end up
 *      appending the same `does_not_contain REF` three times if A2 had
 *      three groups that all shared that differentiator.
 *
 * Edge cases surfaced through the `skipped` / `reason` fields:
 *   - A2 has no rule expressions at all → "no rules to differentiate from".
 *   - Every AndGroup in A2 was skipped (A1 fully covers A2 in every
 *     branch) → "this tag's rules fully cover the current rule".
 *   - All differentiators were unnegatable (returned null from
 *     negateCondition — only possible for `matches_pattern` with empty
 *     values or `match_regex` with empty pattern) → "no negatable
 *     conditions found".
 */
export function computeExclusionConditions(
  currentRuleGroups: AndGroupFormValue[],
  targetDefinition: TagSpecDefinition,
): ExclusionResult {
  if (targetDefinition.TagRuleExpressions.length === 0) {
    return {
      conditions: [],
      skipped: true,
      reason: `"${targetDefinition.Tag}" has no rules to differentiate from`,
    };
  }

  // Existing keys across A1, union of every filled condition. Empty
  // placeholder conditions (no sourceField) don't contribute — they
  // can't overlap anything semantically.
  const existingKeys = new Set<string>();
  for (const group of currentRuleGroups) {
    for (const c of group.conditions) {
      if (!c.sourceField) continue;
      existingKeys.add(conditionKey(c));
    }
  }

  // Collect differentiators across all of A2's AndGroups. Track how
  // many groups produced ZERO differentiators so we can detect the
  // "full overlap" case and skip with a meaningful message.
  const collected: ConditionFormValue[] = [];
  let groupsWithoutDifferentiator = 0;

  for (const andGroup of targetDefinition.TagRuleExpressions) {
    let groupHadDifferentiator = false;
    for (const expr of andGroup) {
      // Decompose A2's wire-format regex back to a form-state-shaped
      // condition. The decomposed shape lines up with
      // ConditionFormValue (minus the id we don't need here).
      const decomposed = decomposeRegex(expr.Regex);
      const candidate = {
        sourceField: expr.SourceField,
        operation: decomposed.operation,
        value: decomposed.value,
        values: decomposed.values,
        prefix: decomposed.prefix,
        suffix: decomposed.suffix,
      };
      const key = conditionKey(candidate);
      if (existingKeys.has(key)) continue;
      // Negate the differentiator. negateCondition returns a fresh id
      // and the opposite operation; we just need to give it a usable
      // ConditionFormValue, so attach a temporary id.
      const negated = negateCondition({
        id: 'tmp',
        sourceField: candidate.sourceField,
        operation: candidate.operation,
        value: candidate.value,
        values: candidate.values,
        prefix: candidate.prefix,
        suffix: candidate.suffix,
      });
      if (!negated) continue;
      groupHadDifferentiator = true;
      collected.push(negated);
    }
    if (!groupHadDifferentiator) groupsWithoutDifferentiator++;
  }

  // Full overlap: every A2 group was a subset of A1's combined
  // conditions. Adding nothing would mean "no effect"; flag as skip.
  if (groupsWithoutDifferentiator === targetDefinition.TagRuleExpressions.length) {
    return {
      conditions: [],
      skipped: true,
      reason: `"${targetDefinition.Tag}" rules fully cover the current rule — exclusion would match no rows`,
    };
  }

  // Deduplicate the collected negations by key. Multiple A2 groups
  // could legitimately produce the same negation; appending the same
  // condition twice to every A1 group just clutters the rule list.
  const seen = new Set<string>();
  const deduped: ConditionFormValue[] = [];
  for (const c of collected) {
    const k = conditionKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(c);
  }

  if (deduped.length === 0) {
    return {
      conditions: [],
      skipped: true,
      reason: `"${targetDefinition.Tag}" has no negatable differentiating conditions`,
    };
  }

  return { conditions: deduped, skipped: false };
}
