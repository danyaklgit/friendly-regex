import { describe, it, expect } from 'vitest';
import {
  getAttributeConfigSuggestions,
  attributeConfigFingerprint,
} from './attributeConfigSuggestions';
import type { TagSpecLibrary, TagSpecDefinition, TagAttribute, AttributeFormValue } from '../types';

function mkAttr(overrides: Partial<TagAttribute> = {}): TagAttribute {
  return {
    AttributeTag: 'Narrative',
    IsMandatory: false,
    LOVTag: null,
    ValidationRuleTag: '',
    AttributeRuleExpression: {
      SourceField: 'AdditionalInformation',
      ExpressionPrompt: null,
      ExpressionId: null,
      Regex: 'ITTR(.*?)(?: |$)',
      RegexDetails: [],
    },
    ...overrides,
  };
}

function mkDef(id: string, tag: string, attributes: TagAttribute[]): TagSpecDefinition {
  return {
    Id: id,
    Context: [],
    Tag: tag,
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: null, EndDate: null },
    TagRuleExpressions: [],
    Attributes: attributes,
  };
}

function mkLib(
  id: string,
  bank: string,
  side: string,
  definitions: TagSpecDefinition[],
  status: TagSpecLibrary['StatusTag'] = 'ACTIVE',
): TagSpecLibrary {
  return {
    Id: id,
    ActiveTagSpecLibId: null,
    OperatorId: 'op',
    StatusTag: status,
    DataSetType: 'MT940',
    Version: 1,
    VersionDate: '2024-01-01',
    Context: [
      { Key: 'BankSwiftCode', Value: bank },
      { Key: 'Side', Value: side },
    ],
    TagSpecDefinitions: definitions,
  };
}

describe('getAttributeConfigSuggestions', () => {
  it('returns [] when no libraries / bank / attribute tag are supplied', () => {
    expect(getAttributeConfigSuggestions([], 'BSFSARI', 'Narrative')).toEqual([]);
    expect(getAttributeConfigSuggestions([mkLib('1', 'BSFSARI', 'CR', [])], '', 'Narrative')).toEqual([]);
    expect(getAttributeConfigSuggestions([mkLib('1', 'BSFSARI', 'CR', [])], 'BSFSARI', '')).toEqual([]);
  });

  it('finds attributes with the same name across both sides of the same bank', () => {
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [mkDef('d1', 'TagA', [mkAttr()])]),
      mkLib('dr', 'BSFSARI', 'DR', [mkDef('d2', 'TagB', [mkAttr({
        AttributeRuleExpression: {
          SourceField: 'Description1',
          ExpressionPrompt: null,
          ExpressionId: null,
          Regex: 'OTHER(.*?)/',
          RegexDetails: [],
        },
      })])]),
    ];
    const suggestions = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    expect(suggestions).toHaveLength(2);
    // Sorted by frequency (tie) then alphabetically by source tag
    expect(suggestions[0].usages[0].tag).toBe('TagA');
    expect(suggestions[1].usages[0].tag).toBe('TagB');
  });

  it('skips libraries belonging to other banks entirely', () => {
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [mkDef('d1', 'TagA', [mkAttr()])]),
      mkLib('other', 'NCBKSARI', 'CR', [mkDef('d2', 'TagB', [mkAttr()])]),
    ];
    const suggestions = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].usages.map((u) => u.tag)).toEqual(['TagA']);
  });

  it('matches attribute names case-insensitively', () => {
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [mkDef('d1', 'TagA', [mkAttr({ AttributeTag: 'narrative' })])]),
    ];
    expect(getAttributeConfigSuggestions(libs, 'BSFSARI', 'NARRATIVE')).toHaveLength(1);
  });

  it('dedupes identical configs and counts usages', () => {
    const sharedAttr = mkAttr();
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [
        mkDef('d1', 'TagA', [{ ...sharedAttr }]),
        mkDef('d2', 'TagB', [{ ...sharedAttr }]),
        mkDef('d3', 'TagC', [{ ...sharedAttr }]),
      ]),
    ];
    const suggestions = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].usages).toHaveLength(3);
    expect(suggestions[0].usages.map((u) => u.tag).sort()).toEqual(['TagA', 'TagB', 'TagC']);
  });

  it('keeps distinct configs separate even when same attribute name', () => {
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [
        mkDef('d1', 'TagA', [mkAttr()]),
        mkDef('d2', 'TagB', [mkAttr({
          AttributeRuleExpression: {
            SourceField: 'Description1',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: 'EPHS(.*?) ',
            RegexDetails: [],
          },
        })]),
      ]),
    ];
    const suggestions = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    expect(suggestions).toHaveLength(2);
  });

  it('orders by usage count descending, then alphabetically', () => {
    const sharedAttr = mkAttr();
    const altAttr = mkAttr({
      AttributeRuleExpression: {
        SourceField: 'Description1',
        ExpressionPrompt: null,
        ExpressionId: null,
        Regex: 'OTHER(.*?)/',
        RegexDetails: [],
      },
    });
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [
        mkDef('d1', 'Zulu', [{ ...sharedAttr }]),
        mkDef('d2', 'Alpha', [{ ...sharedAttr }]),
        mkDef('d3', 'Beta', [{ ...altAttr }]),
      ]),
    ];
    const suggestions = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    // The shared-attr group appears first (usages = 2). Within usages, the
    // primary usage is sorted alphabetically — Alpha precedes Zulu.
    expect(suggestions.map((s) => s.usages.length)).toEqual([2, 1]);
    expect(suggestions[0].usages[0].tag).toBe('Zulu');
    // (Internal order within a deduped group is insertion order — first
    // library scanned wins. The sort is on the OUTER list of suggestions.)
    expect(suggestions[1].usages[0].tag).toBe('Beta');
  });

  it('excludes the currently-edited definition via excludeDefinitionId', () => {
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [
        mkDef('d1', 'TagA', [mkAttr()]),
        mkDef('d2', 'TagB', [mkAttr()]),
      ]),
    ];
    const all = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    expect(all[0].usages).toHaveLength(2);

    const excluded = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative', [], 'd1');
    expect(excluded[0].usages).toHaveLength(1);
    expect(excluded[0].usages[0].tag).toBe('TagB');
  });

  it('preserves attribute metadata in the cloned config (validation, LOV, mandatory, transformations)', () => {
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [
        mkDef('d1', 'TagA', [mkAttr({
          IsMandatory: true,
          ValidationRuleTag: 'STRING',
          LOVTag: 'COUNTRIES',
          Transformations: [
            { Method: 'trim', Args: [] },
            { Method: 'to_uppercase', Args: [] },
          ],
        })]),
      ]),
    ];
    const [suggestion] = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    expect(suggestion.config.isMandatory).toBe(true);
    expect(suggestion.config.validationRuleTag).toBe('STRING');
    expect(suggestion.config.lovTag).toBe('COUNTRIES');
    expect(suggestion.config.isLovBased).toBe(true);
    expect(suggestion.config.transformations).toHaveLength(2);
    expect(suggestion.config.transformations?.[0].method).toBe('trim');
    expect(suggestion.config.transformations?.[1].method).toBe('to_uppercase');
  });

  it('regenerates ids so the cloned config is independent of the source', () => {
    const libs = [
      mkLib('cr', 'BSFSARI', 'CR', [
        mkDef('d1', 'TagA', [mkAttr({
          Transformations: [{ Method: 'trim', Args: [] }],
        })]),
      ]),
    ];
    const a = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    const b = getAttributeConfigSuggestions(libs, 'BSFSARI', 'Narrative');
    expect(a[0].config.id).not.toBe(b[0].config.id);
    expect(a[0].config.transformations?.[0].id).not.toBe(b[0].config.transformations?.[0].id);
  });
});

describe('attributeConfigFingerprint', () => {
  function baseConfig(): AttributeFormValue {
    return {
      id: 'doesnt-matter',
      attributeTag: 'Narrative',
      isMandatory: false,
      validationRuleTag: '',
      sourceField: 'AdditionalInformation',
      extractionOperation: 'extract_between',
      prefix: 'ITTR',
      suffix: ' ',
      suffixOrEndOfInput: true,
      isLovBased: false,
      lovTag: null,
      transformations: [],
    };
  }

  it('collides when only ids differ', () => {
    const a = baseConfig();
    const b = { ...baseConfig(), id: 'something-else' };
    expect(attributeConfigFingerprint(a)).toBe(attributeConfigFingerprint(b));
  });

  it('differs when extraction params change', () => {
    const a = baseConfig();
    const b = { ...baseConfig(), prefix: 'OTHER' };
    expect(attributeConfigFingerprint(a)).not.toBe(attributeConfigFingerprint(b));
  });

  it('differs when transformations order changes', () => {
    const a: AttributeFormValue = {
      ...baseConfig(),
      transformations: [
        { id: '1', method: 'trim', args: {} },
        { id: '2', method: 'to_uppercase', args: {} },
      ],
    };
    const b: AttributeFormValue = {
      ...baseConfig(),
      transformations: [
        { id: '3', method: 'to_uppercase', args: {} },
        { id: '4', method: 'trim', args: {} },
      ],
    };
    expect(attributeConfigFingerprint(a)).not.toBe(attributeConfigFingerprint(b));
  });

  it('collides across attributeTag changes (name is NOT part of the extraction fingerprint)', () => {
    const a = baseConfig();
    const b = { ...baseConfig(), attributeTag: 'CompletelyDifferentName' };
    expect(attributeConfigFingerprint(a)).toBe(attributeConfigFingerprint(b));
  });
});
