import { describe, it, expect } from 'vitest';
import type { AndGroupFormValue, ConditionFormValue } from '../types';
import {
  computeDuplicateGroupIndexes,
  hasDuplicateGroups,
  hasWithinGroupConditionDuplicates,
} from './ruleFingerprint';

function cond(partial: Partial<ConditionFormValue> = {}): ConditionFormValue {
  return {
    id: Math.random().toString(36).slice(2),
    sourceField: 'Description1',
    operation: 'contains' as ConditionFormValue['operation'],
    value: 'foo',
    ...partial,
  };
}

function group(conditions: ConditionFormValue[]): AndGroupFormValue {
  return { id: Math.random().toString(36).slice(2), conditions };
}

describe('computeDuplicateGroupIndexes', () => {
  it('returns null for empty rule sets so a fresh empty group never collides', () => {
    const groups = [group([]), group([])];
    expect(computeDuplicateGroupIndexes(groups)).toEqual([null, null]);
  });

  it('flags both members of a duplicate pair simultaneously', () => {
    const a = group([cond({ value: 'foo' })]);
    const b = group([cond({ value: 'foo' })]);
    expect(computeDuplicateGroupIndexes([a, b])).toEqual([1, 0]);
  });

  it('ignores condition order within a group when fingerprinting', () => {
    const a = group([cond({ value: 'foo' }), cond({ sourceField: 'Description2', value: 'bar' })]);
    const b = group([cond({ sourceField: 'Description2', value: 'bar' }), cond({ value: 'foo' })]);
    expect(computeDuplicateGroupIndexes([a, b])).toEqual([1, 0]);
  });
});

describe('hasDuplicateGroups', () => {
  it('is false when every group is unique', () => {
    const a = group([cond({ value: 'foo' })]);
    const b = group([cond({ value: 'bar' })]);
    expect(hasDuplicateGroups([a, b])).toBe(false);
  });

  it('is true when any two groups match', () => {
    const a = group([cond({ value: 'foo' })]);
    const b = group([cond({ value: 'foo' })]);
    expect(hasDuplicateGroups([a, b])).toBe(true);
  });
});

describe('hasWithinGroupConditionDuplicates', () => {
  it('is false for an empty rule set', () => {
    expect(hasWithinGroupConditionDuplicates([])).toBe(false);
    expect(hasWithinGroupConditionDuplicates([group([])])).toBe(false);
  });

  it('is false when a single rule set has only unique conditions', () => {
    const g = group([
      cond({ value: 'foo' }),
      cond({ sourceField: 'Description2', value: 'bar' }),
    ]);
    expect(hasWithinGroupConditionDuplicates([g])).toBe(false);
  });

  it('is true when one rule set contains two identical conditions', () => {
    const g = group([
      cond({ value: 'foo' }),
      cond({ value: 'foo' }),
    ]);
    expect(hasWithinGroupConditionDuplicates([g])).toBe(true);
  });

  it('does NOT fire when the same condition lives in two different groups (that is hasDuplicateGroups)', () => {
    const a = group([cond({ value: 'foo' })]);
    const b = group([cond({ value: 'foo' })]);
    expect(hasWithinGroupConditionDuplicates([a, b])).toBe(false);
  });

  it('ignores empty placeholder conditions when scanning a group', () => {
    const g = group([
      cond({ value: 'foo' }),
      cond({ sourceField: '', value: '' }),
      cond({ sourceField: '', value: '' }),
    ]);
    expect(hasWithinGroupConditionDuplicates([g])).toBe(false);
  });
});
