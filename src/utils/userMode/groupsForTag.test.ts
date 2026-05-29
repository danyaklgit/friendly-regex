import { describe, it, expect } from 'vitest';
import type { TagTreeNode } from '../../api/tagsHierarchy';
import { groupsForTag } from './groupsForTag';

function group(tag: string, name: string, leaves: Array<[string, string]>): TagTreeNode {
  return {
    tag,
    level: 'G',
    name,
    description: '',
    statusTag: 'ACTIVE',
    children: leaves.map(([t, n]) => ({
      tag: t,
      level: 'T',
      name: n,
      description: '',
      statusTag: 'ACTIVE',
      children: [],
    })),
  };
}

describe('groupsForTag', () => {
  it('returns [] when the tag is not in the tree', () => {
    expect(groupsForTag([group('G1', 'Group One', [['t1', 'Tag 1']])], 'missing')).toEqual([]);
  });

  it('returns [] for an empty tag string', () => {
    expect(groupsForTag([group('G1', 'A', [['t1', 'T1']])], '')).toEqual([]);
  });

  it('returns the display name of the single group containing the tag', () => {
    const tree = [
      group('G1', 'Inbound Transfers', [['SWIFT_INBOUND', 'Swift Inbound']]),
      group('G2', 'Outbound Transfers', [['SWIFT_OUTBOUND', 'Swift Outbound']]),
    ];
    expect(groupsForTag(tree, 'SWIFT_INBOUND')).toEqual(['Inbound Transfers']);
  });

  it('returns ALL groups a leaf belongs to, sorted alphabetically', () => {
    const tree = [
      group('GA', 'Accounts', [['SALARY', 'Salary']]),
      group('GP', 'Payroll', [['SALARY', 'Salary']]),
      group('GZ', 'Audit', [['SALARY', 'Salary']]),
    ];
    expect(groupsForTag(tree, 'SALARY')).toEqual(['Accounts', 'Audit', 'Payroll']);
  });

  it('deduplicates if a leaf somehow appears twice under the same group', () => {
    const dup: TagTreeNode = {
      tag: 'G1',
      level: 'G',
      name: 'Dup Group',
      description: '',
      statusTag: 'ACTIVE',
      children: [
        { tag: 'X', level: 'T', name: 'X', description: '', statusTag: 'ACTIVE', children: [] },
        { tag: 'X', level: 'T', name: 'X', description: '', statusTag: 'ACTIVE', children: [] },
      ],
    };
    expect(groupsForTag([dup], 'X')).toEqual(['Dup Group']);
  });

  it('ignores non-group entries at the tree root', () => {
    const stray: TagTreeNode = {
      tag: 'STRAY',
      level: 'T',
      name: 'Stray Leaf',
      description: '',
      statusTag: 'ACTIVE',
      children: [],
    };
    expect(groupsForTag([stray], 'STRAY')).toEqual([]);
  });
});
