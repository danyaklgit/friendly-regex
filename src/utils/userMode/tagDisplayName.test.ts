import { describe, it, expect } from 'vitest';
import { buildTagDisplayNameMap, tagDisplayName } from './tagDisplayName';
import type { TagTreeNode } from '../../api/tagsHierarchy';

function leaf(tag: string, name: string): TagTreeNode {
  return { tag, level: 'T', name, description: '', statusTag: 'ACTIVE', children: [] };
}
function group(tag: string, children: TagTreeNode[]): TagTreeNode {
  return { tag, level: 'G', name: tag, description: '', statusTag: 'ACTIVE', children };
}

describe('buildTagDisplayNameMap', () => {
  it('maps each leaf tag code to its display name', () => {
    const tree = [group('G1', [leaf('TransferOut', 'Outbound Transfer'), leaf('FEE', 'Bank Fee')])];
    const map = buildTagDisplayNameMap(tree);
    expect(map.get('TransferOut')).toBe('Outbound Transfer');
    expect(map.get('FEE')).toBe('Bank Fee');
  });

  it('keeps the first occurrence when a tag appears under multiple groups', () => {
    const tree = [
      group('G1', [leaf('SALARY', 'Salary')]),
      group('G2', [leaf('SALARY', 'Salary')]),
    ];
    expect(buildTagDisplayNameMap(tree).get('SALARY')).toBe('Salary');
  });
});

describe('tagDisplayName', () => {
  const map = buildTagDisplayNameMap([group('G1', [leaf('TransferOut', 'Outbound Transfer')])]);

  it('returns the display name for a known code', () => {
    expect(tagDisplayName(map, 'TransferOut')).toBe('Outbound Transfer');
  });

  it('falls back to the code when unknown', () => {
    expect(tagDisplayName(map, 'Mystery')).toBe('Mystery');
  });

  it('returns empty string for null/undefined', () => {
    expect(tagDisplayName(map, null)).toBe('');
    expect(tagDisplayName(map, undefined)).toBe('');
  });
});
