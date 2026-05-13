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
});
