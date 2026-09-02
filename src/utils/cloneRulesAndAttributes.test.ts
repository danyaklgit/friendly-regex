import { describe, it, expect } from 'vitest';
import { cloneRulesAndAttributesFrom } from './cloneRulesAndAttributes';
import { regexify, regexifyExtraction } from './regexify';
import type { TagSpecDefinition } from '../types';

function makeDefinition(overrides: Partial<TagSpecDefinition> = {}): TagSpecDefinition {
  return {
    Id: 'src-def-id',
    Tag: 'SOURCE_TAG',
    Context: [{ Key: 'TransactionTypeCode', Value: 'NTRF' }],
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: null, EndDate: null },
    TagRuleExpressions: [],
    Attributes: [],
    ...overrides,
  };
}

describe('cloneRulesAndAttributesFrom', () => {
  it('returns only ruleGroups and attributes keys', () => {
    const result = cloneRulesAndAttributesFrom(makeDefinition());
    expect(Object.keys(result).sort()).toEqual(['attributes', 'ruleGroups']);
  });

  it('returns empty arrays when source has no rules and no attributes', () => {
    const result = cloneRulesAndAttributesFrom(makeDefinition());
    expect(result.ruleGroups).toEqual([]);
    expect(result.attributes).toEqual([]);
  });

  it('clones rule groups with conditions and regenerates all ids', () => {
    const def = makeDefinition({
      TagRuleExpressions: [
        [
          {
            SourceField: 'NarrativeText',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexify('contains', 'SALARY'),
            RegexDetails: [],
          },
          {
            SourceField: 'Description',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexify('equals', 'PAY'),
            RegexDetails: [],
          },
        ],
        [
          {
            SourceField: 'NarrativeText',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexify('begins_with', 'WAGE'),
            RegexDetails: [],
          },
        ],
      ],
    });

    const result = cloneRulesAndAttributesFrom(def);
    expect(result.ruleGroups).toHaveLength(2);
    expect(result.ruleGroups[0].conditions).toHaveLength(2);
    expect(result.ruleGroups[1].conditions).toHaveLength(1);

    const allIds = result.ruleGroups.flatMap((g) => [g.id, ...g.conditions.map((c) => c.id)]);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const id of allIds) {
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    }

    expect(result.ruleGroups[0].conditions[0].sourceField).toBe('NarrativeText');
    expect(result.ruleGroups[0].conditions[0].operation).toBe('contains');
    expect(result.ruleGroups[0].conditions[0].value).toBe('SALARY');
    expect(result.ruleGroups[0].conditions[1].operation).toBe('equals');
    expect(result.ruleGroups[1].conditions[0].operation).toBe('begins_with');
  });

  it('clones attributes with transformations and regenerates ids; drops _originalRegex', () => {
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'AMOUNT',
          IsMandatory: true,
          LOVTag: null,
          ValidationRuleTag: 'NUMERIC',
          AttributeRuleExpression: {
            SourceField: 'NarrativeText',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_between', { prefix: 'AMT:', suffix: ';' }),
            RegexDetails: [],
          },
          Transformations: [
            { Method: 'trim', Args: [] },
            { Method: 'to_uppercase', Args: [] },
          ],
        },
        {
          AttributeTag: 'CURRENCY',
          IsMandatory: false,
          LOVTag: 'CURRENCY_LIST',
          ValidationRuleTag: '',
          AttributeRuleExpression: {
            SourceField: 'NarrativeText',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_after', { prefix: 'CUR:' }),
            RegexDetails: [],
          },
        },
      ],
    });

    const result = cloneRulesAndAttributesFrom(def);
    expect(result.attributes).toHaveLength(2);

    const [amount, currency] = result.attributes;
    expect(amount.attributeTag).toBe('AMOUNT');
    expect(amount.isMandatory).toBe(true);
    expect(amount.validationRuleTag).toBe('NUMERIC');
    expect(amount.sourceField).toBe('NarrativeText');
    expect(amount._originalRegex).toBeUndefined();
    expect(amount.transformations).toHaveLength(2);
    expect(amount.transformations?.[0].method).toBe('trim');
    expect(amount.transformations?.[1].method).toBe('to_uppercase');

    const transformationIds = amount.transformations!.map((t) => t.id);
    expect(new Set(transformationIds).size).toBe(transformationIds.length);

    expect(currency.attributeTag).toBe('CURRENCY');
    expect(currency.isLovBased).toBe(true);
    expect(currency.lovTag).toBe('CURRENCY_LIST');
    expect(currency._originalRegex).toBeUndefined();

    const attrIds = result.attributes.map((a) => a.id);
    expect(new Set(attrIds).size).toBe(attrIds.length);
  });

  it('round-trips the LOV miss behavior (CLEAR_TEXT kept, absent → null = KEEP_TEXT default)', () => {
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'BILLER',
          IsMandatory: true,
          LOVTag: 'SADAD_BILLERS',
          LOVMissBehavior: 'CLEAR_TEXT',
          ValidationRuleTag: 'STRING',
          AttributeRuleExpression: {
            SourceField: 'AdditionalInformation',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_between', { prefix: 'BILLER:', suffix: ';' }),
            RegexDetails: [],
          },
          Transformations: [],
        },
        {
          AttributeTag: 'BANK',
          IsMandatory: false,
          LOVTag: 'BANKS',
          ValidationRuleTag: 'STRING',
          AttributeRuleExpression: {
            SourceField: 'AdditionalInformation',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_between', { prefix: 'BANK:', suffix: ';' }),
            RegexDetails: [],
          },
          Transformations: [],
        },
      ],
    });
    const { attributes } = cloneRulesAndAttributesFrom(def);
    expect(attributes[0].isLovBased).toBe(true);
    expect(attributes[0].lovMissBehavior).toBe('CLEAR_TEXT');
    expect(attributes[1].lovMissBehavior).toBeNull();
  });

  it('round-trips a constant-LOV attribute (both toggles light, tag preselected)', () => {
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'Biller',
          IsMandatory: false,
          LOVTag: 'SADAD_BILLERS',
          ValidationRuleTag: '',
          Constant: 'STC',
          AttributeRuleExpression: null,
          Transformations: null,
        },
      ],
    });
    const { attributes } = cloneRulesAndAttributesFrom(def);
    expect(attributes[0].isConstant).toBe(true);
    expect(attributes[0].constantValue).toBe('STC');
    expect(attributes[0].isLovBased).toBe(true);
    expect(attributes[0].lovTag).toBe('SADAD_BILLERS');
  });

  it('preserves rule-group and condition ordering', () => {
    const def = makeDefinition({
      TagRuleExpressions: [
        [
          { SourceField: 'F1', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('contains', 'A'), RegexDetails: [] },
          { SourceField: 'F2', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('contains', 'B'), RegexDetails: [] },
          { SourceField: 'F3', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('contains', 'C'), RegexDetails: [] },
        ],
      ],
    });

    const result = cloneRulesAndAttributesFrom(def);
    expect(result.ruleGroups[0].conditions.map((c) => c.value)).toEqual(['A', 'B', 'C']);
    expect(result.ruleGroups[0].conditions.map((c) => c.sourceField)).toEqual(['F1', 'F2', 'F3']);
  });

  it('loads a constant-mode attribute (Constant set, AttributeRuleExpression null)', () => {
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'Channel',
          IsMandatory: false,
          LOVTag: null,
          ValidationRuleTag: '',
          Constant: 'Branch',
          AttributeRuleExpression: null,
          Transformations: null,
        },
      ],
    });

    const result = cloneRulesAndAttributesFrom(def);
    expect(result.attributes).toHaveLength(1);
    const a = result.attributes[0];
    expect(a.attributeTag).toBe('Channel');
    expect(a.isConstant).toBe(true);
    expect(a.constantValue).toBe('Branch');
    expect(a.sourceField).toBe('');
    expect(a.isLovBased).toBe(false);
    expect(a.lovTag).toBeNull();
    expect(a.transformations).toEqual([]);
    // Constant attributes start with empty pre AND post pipelines —
    // toggling Constant off later should give the operator a clean slate.
    expect(a.preExtractionTransformations).toEqual([]);
  });

  it('clones PreExtractionTransformations with regenerated ids alongside post-extraction', () => {
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'PARTY',
          IsMandatory: true,
          LOVTag: null,
          ValidationRuleTag: 'STRING',
          AttributeRuleExpression: {
            SourceField: 'NarrativeText',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_between', { prefix: 'P:', suffix: ';' }),
            RegexDetails: [],
          },
          PreExtractionTransformations: [
            { Method: 'trim', Args: [] },
            { Method: 'to_uppercase', Args: [] },
          ],
          Transformations: [
            { Method: 'collapse_whitespace', Args: [] },
          ],
        },
      ],
    });

    const result = cloneRulesAndAttributesFrom(def);
    const a = result.attributes[0];
    expect(a.preExtractionTransformations).toHaveLength(2);
    expect(a.preExtractionTransformations?.[0].method).toBe('trim');
    expect(a.preExtractionTransformations?.[1].method).toBe('to_uppercase');
    // Ids regenerated and distinct from any post-extraction ids — the
    // form state must own its own identity so editing one row can't
    // accidentally mutate the other.
    const preIds = a.preExtractionTransformations!.map((t) => t.id);
    const postIds = a.transformations!.map((t) => t.id);
    expect(new Set(preIds).size).toBe(preIds.length);
    expect(new Set([...preIds, ...postIds]).size).toBe(preIds.length + postIds.length);
  });

  it('defaults preExtractionTransformations to [] when the backend field is missing', () => {
    // Older saved attributes ship without `PreExtractionTransformations`. The
    // backwards-compat contract is that they round-trip into form state as an
    // empty array (rather than `undefined`) so the form-state shape is
    // uniform across legacy and new attributes.
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'LEGACY',
          IsMandatory: true,
          LOVTag: null,
          ValidationRuleTag: 'STRING',
          AttributeRuleExpression: {
            SourceField: 'NarrativeText',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_full_field', {}),
            RegexDetails: [],
          },
        },
      ],
    });

    const result = cloneRulesAndAttributesFrom(def);
    expect(result.attributes[0].preExtractionTransformations).toEqual([]);
  });

  it('restores extract_matching Starting Position on reload (not folded into the pattern)', () => {
    // Repro: an attribute saved with Extraction Method "Extract matching
    // pattern", a lookbehind pattern, and Starting Position 3. The leading
    // `.{3}` skip used to get dragged into the pattern and the Starting
    // Position field came back empty.
    const pattern = '(?<=BENF\\s+ID\\s*:C\\s)\\d+';
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'BENF_ID',
          IsMandatory: false,
          LOVTag: null,
          ValidationRuleTag: '',
          AttributeRuleExpression: {
            SourceField: 'AdditionalInformation',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_matching', { pattern, startingPosition: 3 }),
            RegexDetails: [],
          },
        },
      ],
    });

    const attr = cloneRulesAndAttributesFrom(def).attributes[0];
    expect(attr.extractionOperation).toBe('extract_matching');
    expect(attr.startingPosition).toBe(3);
    expect(attr.pattern).toBe(pattern);
  });

  it('restores extract_matching Occurrence (>= 2) on reload', () => {
    const pattern = 'ABC';
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'OCC',
          IsMandatory: false,
          LOVTag: null,
          ValidationRuleTag: '',
          AttributeRuleExpression: {
            SourceField: 'AdditionalInformation',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_matching', { pattern, occurrence: 2 }),
            RegexDetails: [],
          },
        },
      ],
    });

    const attr = cloneRulesAndAttributesFrom(def).attributes[0];
    expect(attr.extractionOperation).toBe('extract_matching');
    expect(attr.occurrence).toBe(2);
    expect(attr.pattern).toBe(pattern);
  });

  it('restores extract_matching Occurrence when the pattern has its own capture group', () => {
    // Repro: occurrence was silently dropped when the pattern already had a
    // `(...)` group. regexifyExtraction emits `(?:.*?(?:(\d+))){1}.*?(\d+)`
    // (no extra wrap), which the decoder rejected because it stripped parens
    // off the trailing body but not the skip's inner pattern.
    const pattern = '(\\d+)';
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'OCC_GROUP',
          IsMandatory: false,
          LOVTag: null,
          ValidationRuleTag: '',
          AttributeRuleExpression: {
            SourceField: 'AdditionalInformation',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_matching', { pattern, occurrence: 2 }),
            RegexDetails: [],
          },
        },
      ],
    });

    const attr = cloneRulesAndAttributesFrom(def).attributes[0];
    expect(attr.extractionOperation).toBe('extract_matching');
    expect(attr.occurrence).toBe(2);
    // Pattern round-trips group-stripped but extraction-equivalent (the
    // captured value is identical).
    expect(attr.pattern).toBe('\\d+');
  });

  it('sets extract_between_and_verify when VerifyValue is present', () => {
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'STATUS',
          IsMandatory: false,
          LOVTag: null,
          ValidationRuleTag: '',
          AttributeRuleExpression: {
            SourceField: 'NarrativeText',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexifyExtraction('extract_between', { prefix: 'S:', suffix: ';' }),
            RegexDetails: [],
            VerifyValue: 'OK',
          },
        },
      ],
    });

    const result = cloneRulesAndAttributesFrom(def);
    expect(result.attributes[0].extractionOperation).toBe('extract_between_and_verify');
    expect(result.attributes[0].verifyValue).toBe('OK');
  });

  it('maps a stored regex back to the LOV extraction op when its Value matches', () => {
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'IBAN',
          IsMandatory: false,
          ValidationRuleTag: 'KSA_IBAN',
          LOVTag: null,
          AttributeRuleExpression: {
            SourceField: 'AdditionalInformation',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: '^SA\\d{2}[A-Z0-9]{18}$',
            RegexDetails: [],
          },
        },
      ],
    });
    const result = cloneRulesAndAttributesFrom(def, [
      { key: 'lov:^SA\\d{2}[A-Z0-9]{18}$', label: 'Saudi IBAN', regex: '^SA\\d{2}[A-Z0-9]{18}$' },
    ]);
    expect(result.attributes[0].extractionOperation).toBe('lov:^SA\\d{2}[A-Z0-9]{18}$');
    expect(result.attributes[0].prefix).toBeUndefined();
    expect(result.attributes[0].suffix).toBeUndefined();
    expect(result.attributes[0].pattern).toBeUndefined();
  });

  it('maps a stored regex back to the LOV op when the stored form is the capture-wrapped version of the LOV regex', () => {
    // Validation-style LOV entries (no capture group, anchored ^...$) get
    // wrapped at save time AND have their trailing `$` dropped so extraction
    // works on longer fields. The load path must still resolve back to the
    // LOV op despite the transformation.
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'IBAN',
          IsMandatory: false,
          ValidationRuleTag: 'KSA_IBAN',
          LOVTag: null,
          AttributeRuleExpression: {
            SourceField: 'IBAN',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: '^(SA\\d{2}[A-Z0-9]{18})',
            RegexDetails: [],
          },
        },
      ],
    });
    const result = cloneRulesAndAttributesFrom(def, [
      { key: 'lov:^SA\\d{2}[A-Z0-9]{18}$', label: 'Saudi IBAN', regex: '^SA\\d{2}[A-Z0-9]{18}$' },
    ]);
    expect(result.attributes[0].extractionOperation).toBe('lov:^SA\\d{2}[A-Z0-9]{18}$');
  });

  it('falls through to the standard decompose path when no LOV catalog is supplied', () => {
    // Same regex as the previous test but without `lovExtractions` — the
    // decomposer should produce the legacy `extract_matching` shape so old
    // behaviour is preserved for callers that don't have LOV context.
    const def = makeDefinition({
      Attributes: [
        {
          AttributeTag: 'IBAN',
          IsMandatory: false,
          ValidationRuleTag: 'KSA_IBAN',
          LOVTag: null,
          AttributeRuleExpression: {
            SourceField: 'AdditionalInformation',
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: '^SA\\d{2}[A-Z0-9]{18}$',
            RegexDetails: [],
          },
        },
      ],
    });
    const result = cloneRulesAndAttributesFrom(def);
    expect(result.attributes[0].extractionOperation).not.toMatch(/^lov:/);
  });
});
