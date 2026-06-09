import { describe, it, expect } from 'vitest';
import type {
  AndGroupFormValue,
  ConditionFormValue,
  MatchOperation,
  RuleExpression,
  TagSpecDefinition,
} from '../types';
import { computeExclusionConditions } from './computeExclusionConditions';
import { regexify } from './regexify';

/** Build an A1-side rule group with the given conditions. */
function group(conds: Array<{ field: string; op: MatchOperation; value: string; values?: string[] }>): AndGroupFormValue {
  return {
    id: `g-${Math.random()}`,
    conditions: conds.map((c) => ({
      id: `c-${Math.random()}`,
      sourceField: c.field,
      operation: c.op,
      value: c.value,
      values: c.values,
    } as ConditionFormValue)),
  };
}

/** Build a wire-shape A2 definition with the given OR groups. The values
 *  go through `regexify` so the resulting `Regex` field matches what a
 *  real saved definition would carry. */
function defWithGroups(tag: string, groups: Array<Array<{ field: string; op: MatchOperation; value: string; values?: string[] }>>): TagSpecDefinition {
  return {
    Id: 'a2',
    Tag: tag,
    Context: [],
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: null, EndDate: null },
    TagRuleExpressions: groups.map((conds) => conds.map((c) => ({
      SourceField: c.field,
      ExpressionPrompt: null,
      ExpressionId: null,
      Regex: regexify(c.op, c.value, c.values),
      RegexDetails: [],
    } as RuleExpression))),
    Attributes: [],
  };
}

describe('computeExclusionConditions', () => {
  it("user's example: A1 begins_with /SA, A2 begins_with /SA AND contains REF -> adds does_not_contain REF", () => {
    const a1 = [group([{ field: 'Description1', op: 'begins_with', value: '/SA' }])];
    const a2 = defWithGroups('A2', [[
      { field: 'Description1', op: 'begins_with', value: '/SA' },
      { field: 'Description1', op: 'contains', value: 'REF' },
    ]]);
    const result = computeExclusionConditions(a1, a2);
    expect(result.skipped).toBe(false);
    expect(result.conditions).toHaveLength(1);
    expect(result.conditions[0]).toMatchObject({
      sourceField: 'Description1',
      operation: 'does_not_contain',
      value: 'REF',
    });
  });

  it('multi-group A2: takes differentiators from EACH group, dedupes', () => {
    // A1: begins_with /SA
    // A2: (begins_with /SA AND contains REF) OR (begins_with /SA AND contains XYZ)
    // Result should contain BOTH does_not_contain REF and does_not_contain XYZ.
    const a1 = [group([{ field: 'Description1', op: 'begins_with', value: '/SA' }])];
    const a2 = defWithGroups('A2', [
      [
        { field: 'Description1', op: 'begins_with', value: '/SA' },
        { field: 'Description1', op: 'contains', value: 'REF' },
      ],
      [
        { field: 'Description1', op: 'begins_with', value: '/SA' },
        { field: 'Description1', op: 'contains', value: 'XYZ' },
      ],
    ]);
    const result = computeExclusionConditions(a1, a2);
    expect(result.skipped).toBe(false);
    const negVals = result.conditions.map((c) => c.value).sort();
    expect(negVals).toEqual(['REF', 'XYZ']);
    expect(result.conditions.every((c) => c.operation === 'does_not_contain')).toBe(true);
  });

  it('full overlap: A2 fully contained in A1 -> skipped with full-overlap reason', () => {
    const a1 = [group([
      { field: 'Description1', op: 'begins_with', value: '/SA' },
      { field: 'Description1', op: 'contains', value: 'REF' },
    ])];
    const a2 = defWithGroups('A2', [[
      { field: 'Description1', op: 'begins_with', value: '/SA' },
      { field: 'Description1', op: 'contains', value: 'REF' },
    ]]);
    const result = computeExclusionConditions(a1, a2);
    expect(result.skipped).toBe(true);
    expect(result.conditions).toEqual([]);
    expect(result.reason).toMatch(/fully cover/i);
  });

  it('A2 with no rule expressions at all -> skipped with no-rules reason', () => {
    const a1 = [group([{ field: 'Description1', op: 'begins_with', value: '/SA' }])];
    const a2 = defWithGroups('A2', []);
    const result = computeExclusionConditions(a1, a2);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/no rules/i);
  });

  it('A1 with no rules at all: every A2 condition becomes a differentiator', () => {
    const a1: AndGroupFormValue[] = [];
    const a2 = defWithGroups('A2', [[
      { field: 'Description1', op: 'begins_with', value: '/SA' },
      { field: 'Description1', op: 'contains', value: 'REF' },
    ]]);
    const result = computeExclusionConditions(a1, a2);
    expect(result.skipped).toBe(false);
    expect(result.conditions).toHaveLength(2);
    const ops = result.conditions.map((c) => c.operation).sort();
    expect(ops).toEqual(['does_not_contain', 'does_not_start_with']);
  });

  it('partial overlap across groups: one A2 group is subset of A1, the other contributes a differentiator', () => {
    // A1: begins_with /SA (single group)
    // A2: (begins_with /SA) OR (begins_with /SA AND contains REF)
    //   - First A2 group is a subset of A1 (no differentiator -> skipped)
    //   - Second A2 group adds contains REF -> negate to does_not_contain REF
    // Without the per-group skip logic, this would erroneously skip with
    // a full-overlap message because the first group has zero differentiators.
    const a1 = [group([{ field: 'Description1', op: 'begins_with', value: '/SA' }])];
    const a2 = defWithGroups('A2', [
      [{ field: 'Description1', op: 'begins_with', value: '/SA' }],
      [
        { field: 'Description1', op: 'begins_with', value: '/SA' },
        { field: 'Description1', op: 'contains', value: 'REF' },
      ],
    ]);
    const result = computeExclusionConditions(a1, a2);
    expect(result.skipped).toBe(false);
    expect(result.conditions).toHaveLength(1);
    expect(result.conditions[0].operation).toBe('does_not_contain');
    expect(result.conditions[0].value).toBe('REF');
  });

  it('matches_pattern differentiator: negation wraps the alternation regex in a negative lookahead', () => {
    // `regexify('matches_pattern', '', ['REF1', 'REF2'])` produces
    // `^(REF1|REF2)$` on the wire. Because the resulting wire regex
    // contains active syntax (^, $, parens, alternation), the
    // decomposer falls through to `match_regex` rather than the
    // dedicated matches_pattern branch. The negation path therefore
    // exercises the match_regex wrapping. The result is functionally
    // equivalent ("string is not REF1 or REF2"); the extra anchors
    // inside the lookahead body are harmless because regex lookaheads
    // re-anchor from the current position.
    const a1 = [group([{ field: 'Description1', op: 'begins_with', value: '/SA' }])];
    const a2 = defWithGroups('A2', [[
      { field: 'Description1', op: 'begins_with', value: '/SA' },
      { field: 'Description1', op: 'matches_pattern', value: '', values: ['REF1', 'REF2'] },
    ]]);
    const result = computeExclusionConditions(a1, a2);
    expect(result.skipped).toBe(false);
    expect(result.conditions).toHaveLength(1);
    expect(result.conditions[0].operation).toBe('match_regex');
    expect(result.conditions[0].value).toBe('^(?!.*(^(REF1|REF2)$)).*$');
  });

  it('produces fresh ids on every negated condition so they can land in existing AndGroups', () => {
    const a1 = [group([{ field: 'Description1', op: 'begins_with', value: '/SA' }])];
    const a2 = defWithGroups('A2', [[
      { field: 'Description1', op: 'begins_with', value: '/SA' },
      { field: 'Description1', op: 'contains', value: 'REF' },
    ]]);
    const result = computeExclusionConditions(a1, a2);
    expect(result.conditions[0].id).toBeTruthy();
    // ids on the conditions should not collide with A1 ids; uuidv4 collision
    // odds are zero in practice, this is a smoke test.
    expect(a1[0].conditions.map((c) => c.id)).not.toContain(result.conditions[0].id);
  });
});
