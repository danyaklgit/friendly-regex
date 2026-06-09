import type { ConditionFormValue, MatchOperation } from '../types';
import { escapeRegex } from './regexify';

/**
 * Map every match operation to its semantic opposite.
 *
 * Used by the "Exclude another tag from matching this rule" flow in the
 * Rule Builder: when the operator clicks Exclude on a sibling tag A2,
 * the differentiating conditions in A2 are negated through this table
 * and appended to A1's rule groups so A1 stops matching the same rows
 * A2 matches.
 *
 * Most ops have a direct opposite already in MATCH_OPERATIONS. The two
 * non-simple cases are `matches_pattern` (multi-value alternation) and
 * `match_regex` (free-form regex): there is no named "Does not match
 * one of" or "Does not match pattern" operation, so we synthesize a
 * `match_regex` whose pattern wraps the original in a negative
 * lookahead. The result is a perfectly valid condition the operator
 * can read, edit, or delete like any other rule row.
 */
const SIMPLE_OPPOSITES: Partial<Record<MatchOperation, MatchOperation>> = {
  contains: 'does_not_contain',
  does_not_contain: 'contains',
  begins_with: 'does_not_start_with',
  does_not_start_with: 'begins_with',
  ends_with: 'does_not_end_with',
  does_not_end_with: 'ends_with',
  equals: 'does_not_equal',
  does_not_equal: 'equals',
  greater_than: 'less_than_or_equal',
  less_than: 'greater_than_or_equal',
  greater_than_or_equal: 'less_than',
  less_than_or_equal: 'greater_than',
  is_blank_or_empty: 'is_not_blank_or_empty',
  is_not_blank_or_empty: 'is_blank_or_empty',
};

/**
 * Build the negation of a single ConditionFormValue.
 *
 * Returns a NEW condition object with a fresh `id` so it can be safely
 * appended to a form-state AndGroup without identity collisions.
 *
 * Returns `null` only for the defensive case of an unknown operation —
 * every operation defined in `MatchOperation` should map cleanly.
 */
export function negateCondition(c: ConditionFormValue): ConditionFormValue | null {
  const simple = SIMPLE_OPPOSITES[c.operation];
  if (simple) {
    return {
      id: crypto.randomUUID(),
      sourceField: c.sourceField,
      operation: simple,
      value: c.value,
      values: c.values,
      prefix: c.prefix,
      suffix: c.suffix,
    };
  }

  if (c.operation === 'matches_pattern') {
    // Multi-value alternation. The original matches `^(v1|v2|v3)$` — we
    // negate by wrapping the same alternation in a negative lookahead.
    // Empty values array would have nothing to negate; the caller's
    // differentiator computation skips this case, but defensively map
    // it to a permissive match-everything regex.
    const vals = (c.values && c.values.length > 0) ? c.values : (c.value ? [c.value] : []);
    if (vals.length === 0) return null;
    const alt = vals.map(escapeRegex).join('|');
    return {
      id: crypto.randomUUID(),
      sourceField: c.sourceField,
      operation: 'match_regex',
      value: `^(?!(${alt})$).*$`,
    };
  }

  if (c.operation === 'match_regex') {
    // Free-form regex from the operator. Wrap in a "does not match
    // anywhere in the string" negative lookahead. Anchored at start
    // with `.*$` tail so the lookahead's full body is tested against
    // the whole string, then accept whatever the input was.
    if (!c.value) return null;
    return {
      id: crypto.randomUUID(),
      sourceField: c.sourceField,
      operation: 'match_regex',
      value: `^(?!.*(${c.value})).*$`,
    };
  }

  return null;
}
