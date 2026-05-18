import { describe, it, expect } from 'vitest';
import type { TagSpecDefinition, TagSpecLibrary } from '../types';
import { computeDefinitionVersions } from './definitionVersions';

function def(id: string, tag: string): TagSpecDefinition {
  return {
    Id: id,
    Context: [],
    Tag: tag,
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: '', EndDate: '' },
    TagRuleExpressions: [],
    Attributes: [],
  };
}

function lib(defs: TagSpecDefinition[]): TagSpecLibrary {
  return {
    Id: 'lib-1',
    ActiveTagSpecLibId: null,
    OperatorId: 'op',
    StatusTag: 'INPROGRESS',
    DataSetType: 'X',
    Version: 1,
    VersionDate: '',
    Context: [],
    TagSpecDefinitions: defs,
  };
}

describe('computeDefinitionVersions', () => {
  it('returns empty map for null library', () => {
    expect(computeDefinitionVersions(null).size).toBe(0);
  });

  it('returns empty map when no definitions', () => {
    expect(computeDefinitionVersions(lib([])).size).toBe(0);
  });

  it('excludes tags with only one definition', () => {
    const result = computeDefinitionVersions(lib([def('a', 'Foo'), def('b', 'Bar')]));
    expect(result.size).toBe(0);
  });

  it('versions two defs sharing a code as 1 and 2 with total 2', () => {
    const result = computeDefinitionVersions(lib([def('a', 'Foo'), def('b', 'Foo')]));
    expect(result.get('a')).toEqual({ version: 1, total: 2 });
    expect(result.get('b')).toEqual({ version: 2, total: 2 });
  });

  it('versions three defs sharing a code as 1, 2, 3 with total 3', () => {
    const result = computeDefinitionVersions(
      lib([def('a', 'Foo'), def('b', 'Foo'), def('c', 'Foo')]),
    );
    expect(result.get('a')).toEqual({ version: 1, total: 3 });
    expect(result.get('b')).toEqual({ version: 2, total: 3 });
    expect(result.get('c')).toEqual({ version: 3, total: 3 });
  });

  it('handles mixed duplicates and uniques', () => {
    const result = computeDefinitionVersions(
      lib([
        def('a1', 'A'), def('a2', 'A'),
        def('b1', 'B'),
        def('c1', 'C'), def('c2', 'C'), def('c3', 'C'),
      ]),
    );
    expect(result.get('a1')).toEqual({ version: 1, total: 2 });
    expect(result.get('a2')).toEqual({ version: 2, total: 2 });
    expect(result.has('b1')).toBe(false);
    expect(result.get('c1')).toEqual({ version: 1, total: 3 });
    expect(result.get('c2')).toEqual({ version: 2, total: 3 });
    expect(result.get('c3')).toEqual({ version: 3, total: 3 });
  });

  it('follows array order, not Id order', () => {
    const result = computeDefinitionVersions(
      lib([def('x', 'Foo'), def('y', 'Bar'), def('z', 'Foo')]),
    );
    expect(result.get('x')).toEqual({ version: 1, total: 2 });
    expect(result.get('z')).toEqual({ version: 2, total: 2 });
  });
});
