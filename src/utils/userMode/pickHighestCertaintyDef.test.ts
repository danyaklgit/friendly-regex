import { describe, it, expect } from 'vitest';
import type { TagSpecDefinition, CertaintyLevelTag } from '../../types/tagSpec';
import { pickHighestCertaintyDef } from './pickHighestCertaintyDef';

function def(tag: string, certainty: CertaintyLevelTag): TagSpecDefinition {
  // Only the fields the helper touches; we cast the rest to satisfy the type.
  return {
    Tag: tag,
    CertaintyLevelTag: certainty,
  } as TagSpecDefinition;
}

describe('pickHighestCertaintyDef', () => {
  it('returns null for an empty array', () => {
    expect(pickHighestCertaintyDef([])).toBeNull();
  });

  it('returns the only entry when there is one', () => {
    expect(pickHighestCertaintyDef([def('A', 'LOW')])?.Tag).toBe('A');
  });

  it('prefers HIGH over MEDIUM over LOW', () => {
    expect(pickHighestCertaintyDef([def('low', 'LOW'), def('med', 'MEDIUM'), def('high', 'HIGH')])?.Tag).toBe('high');
    expect(pickHighestCertaintyDef([def('med', 'MEDIUM'), def('low', 'LOW')])?.Tag).toBe('med');
  });

  it('resolves ties to the first occurrence', () => {
    expect(pickHighestCertaintyDef([def('first', 'HIGH'), def('second', 'HIGH')])?.Tag).toBe('first');
    expect(pickHighestCertaintyDef([def('one', 'MEDIUM'), def('two', 'MEDIUM'), def('three', 'MEDIUM')])?.Tag).toBe('one');
  });

  it('ignores entries with an unrecognized certainty (treats as rank 0)', () => {
    const weird = { Tag: 'weird', CertaintyLevelTag: 'UNKNOWN' as CertaintyLevelTag } as TagSpecDefinition;
    expect(pickHighestCertaintyDef([weird, def('ok', 'LOW')])?.Tag).toBe('ok');
  });
});
