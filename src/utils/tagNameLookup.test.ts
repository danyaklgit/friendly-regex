import { describe, it, expect } from 'vitest';
import type { TagAttribute, TagSpecDefinition, TagSpecLibrary } from '../types';
import type { TagHierarchyRawNode } from '../api/tagsHierarchy';
import { getAllTagNameOptions, getAttributeSuggestionsForTag } from './tagNameLookup';

function attr(name: string): TagAttribute {
  return {
    AttributeTag: name,
    IsMandatory: false,
    LOVTag: null,
    ValidationRuleTag: '',
    AttributeRuleExpression: { SourceField: '', RegexDetails: null, Regex: '', ExpressionPrompt: '' } as unknown as TagAttribute['AttributeRuleExpression'],
  };
}

function def(id: string, tag: string, attrs: TagAttribute[] = []): TagSpecDefinition {
  return {
    Id: id,
    Context: [],
    Tag: tag,
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: '', EndDate: '' },
    TagRuleExpressions: [],
    Attributes: attrs,
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

function hierarchyTag(tag: string, status: string = 'ACTIVE', level: 'G' | 'T' = 'T'): TagHierarchyRawNode {
  return {
    Tag: tag,
    Level: level,
    StatusTag: status,
    Actions: null,
    Details: null,
    GroupTags: null,
    ParentTag: null,
  };
}

describe('getAllTagNameOptions', () => {
  it('returns empty list for empty libraries', () => {
    expect(getAllTagNameOptions([])).toEqual([]);
  });

  it('deduplicates case-insensitively, keeps first casing, counts definitions', () => {
    const result = getAllTagNameOptions([
      lib([def('a', 'TransferInDom'), def('b', 'transferindom'), def('c', 'Fees')]),
    ]);
    expect(result).toEqual([
      { value: 'Fees', label: 'Fees', sublabel: '1 definition' },
      { value: 'TransferInDom', label: 'TransferInDom', sublabel: '2 definitions' },
    ]);
  });

  it('aggregates across multiple libraries', () => {
    const result = getAllTagNameOptions([
      lib([def('a', 'Foo')]),
      lib([def('b', 'Foo'), def('c', 'Bar')]),
    ]);
    expect(result.find((o) => o.value === 'Foo')?.sublabel).toBe('2 definitions');
    expect(result.find((o) => o.value === 'Bar')?.sublabel).toBe('1 definition');
  });

  it('merges ACTIVE hierarchy leaves that have no definitions yet', () => {
    const result = getAllTagNameOptions(
      [lib([def('a', 'Foo')])],
      [hierarchyTag('NewTag'), hierarchyTag('Foo')],
    );
    expect(result.find((o) => o.value === 'Foo')?.sublabel).toBe('1 definition');
    expect(result.find((o) => o.value === 'NewTag')?.sublabel).toBe('0 definitions');
  });

  it('ignores hierarchy groups and archived leaves', () => {
    const result = getAllTagNameOptions(
      [],
      [
        hierarchyTag('Accounts', 'ACTIVE', 'G'),
        hierarchyTag('Archived', 'ARCHIVED', 'T'),
        hierarchyTag('Active', 'ACTIVE', 'T'),
      ],
    );
    expect(result.map((o) => o.value)).toEqual(['Active']);
  });

  it('keeps the library casing when hierarchy disagrees', () => {
    const result = getAllTagNameOptions(
      [lib([def('a', 'TransferInDom')])],
      [hierarchyTag('transferindom')],
    );
    expect(result.find((o) => o.value.toLowerCase() === 'transferindom')?.value).toBe('TransferInDom');
  });
});

describe('getAttributeSuggestionsForTag', () => {
  it('returns empty when tagName is blank', () => {
    expect(getAttributeSuggestionsForTag([], '', [])).toEqual([]);
    expect(getAttributeSuggestionsForTag([], '   ', [])).toEqual([]);
  });

  it('matches Tag case-insensitively and aggregates distinct attribute names', () => {
    const libs = [
      lib([
        def('a', 'TransferInDom', [attr('Beneficiary'), attr('Reference')]),
        def('b', 'transferindom', [attr('Beneficiary'), attr('Amount')]),
      ]),
    ];
    const result = getAttributeSuggestionsForTag(libs, 'TRANSFERINDOM', []);
    expect(result).toEqual([
      { name: 'Beneficiary', count: 2 },
      { name: 'Amount', count: 1 },
      { name: 'Reference', count: 1 },
    ]);
  });

  it('excludes attribute names already present (case-insensitive)', () => {
    const libs = [
      lib([
        def('a', 'TransferInDom', [attr('Beneficiary'), attr('Reference'), attr('Amount')]),
      ]),
    ];
    const result = getAttributeSuggestionsForTag(libs, 'TransferInDom', ['beneficiary']);
    expect(result.map((s) => s.name)).toEqual(['Amount', 'Reference']);
  });

  it('returns empty when no definitions match the tag name', () => {
    const libs = [lib([def('a', 'OtherTag', [attr('Foo')])])];
    expect(getAttributeSuggestionsForTag(libs, 'NoMatch', [])).toEqual([]);
  });
});
