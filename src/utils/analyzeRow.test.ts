import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeRow } from './analyzeRow';
import type { TagSpecLibrary, TransactionRow } from '../types';

function makeLib(overrides: Partial<TagSpecLibrary> = {}): TagSpecLibrary {
  return {
    Id: 'lib-1',
    ActiveTagSpecLibId: null,
    OperatorId: 'op-1',
    StatusTag: 'ACTIVE',
    DataSetType: 'MT940',
    Version: 1,
    VersionDate: '2025-01-01',
    Context: [],
    TagSpecDefinitions: [],
    ...overrides,
  };
}

function makeDef(tag: string, overrides: Partial<TagSpecLibrary['TagSpecDefinitions'][0]> = {}) {
  return {
    Id: `def-${tag}`,
    Context: [],
    Tag: tag,
    StatusTag: 'ACTIVE' as const,
    CertaintyLevelTag: 'HIGH' as const,
    Validity: { StartDate: null, EndDate: null },
    TagRuleExpressions: [],
    Attributes: [],
    ...overrides,
  };
}

const row: TransactionRow = {
  Side: 'DEBIT',
  BankSwiftCode: 'RIBLSARI',
  Description: 'PAYMENT TO VENDOR',
  Amount: 500,
};

describe('analyzeRow', () => {
  let dateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateSpy = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2025-06-15T00:00:00.000Z');
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('returns empty when no libraries', () => {
    const result = analyzeRow(row, []);
    expect(result).toEqual({ tags: [], attributes: {}, matchedDefinitions: [] });
  });

  it('skips library when parent context does not match', () => {
    const lib = makeLib({
      Context: [{ Key: 'Side', Value: 'CREDIT' }],
      TagSpecDefinitions: [makeDef('TAG1', {
        TagRuleExpressions: [[{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: 'PAYMENT', RegexDetails: [] }]],
      })],
    });
    const result = analyzeRow(row, [lib]);
    expect(result.tags).toEqual([]);
  });

  it('matches when parent context matches', () => {
    const lib = makeLib({
      Context: [{ Key: 'Side', Value: 'DEBIT' }],
      TagSpecDefinitions: [makeDef('TAG1', {
        TagRuleExpressions: [[{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: 'PAYMENT', RegexDetails: [] }]],
      })],
    });
    const result = analyzeRow(row, [lib]);
    expect(result.tags).toEqual(['TAG1']);
  });

  it('skips INACTIVE definitions', () => {
    const lib = makeLib({
      TagSpecDefinitions: [makeDef('TAG1', {
        StatusTag: 'INACTIVE',
        TagRuleExpressions: [[{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: 'PAYMENT', RegexDetails: [] }]],
      })],
    });
    const result = analyzeRow(row, [lib]);
    expect(result.tags).toEqual([]);
  });

  it('skips definitions outside validity start date', () => {
    const lib = makeLib({
      TagSpecDefinitions: [makeDef('TAG1', {
        Validity: { StartDate: '2026-01-01', EndDate: null },
        TagRuleExpressions: [[{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: 'PAYMENT', RegexDetails: [] }]],
      })],
    });
    const result = analyzeRow(row, [lib]);
    expect(result.tags).toEqual([]);
  });

  it('skips definitions past validity end date', () => {
    const lib = makeLib({
      TagSpecDefinitions: [makeDef('TAG1', {
        Validity: { StartDate: null, EndDate: '2024-01-01' },
        TagRuleExpressions: [[{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: 'PAYMENT', RegexDetails: [] }]],
      })],
    });
    const result = analyzeRow(row, [lib]);
    expect(result.tags).toEqual([]);
  });

  it('skips when child context does not match', () => {
    const lib = makeLib({
      TagSpecDefinitions: [makeDef('TAG1', {
        Context: [{ Key: 'Side', Value: 'CREDIT' }],
        TagRuleExpressions: [[{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: 'PAYMENT', RegexDetails: [] }]],
      })],
    });
    const result = analyzeRow(row, [lib]);
    expect(result.tags).toEqual([]);
  });

  it('skips definitions with no rules when not in preview mode', () => {
    const lib = makeLib({
      TagSpecDefinitions: [makeDef('TAG1', { TagRuleExpressions: [] })],
    });
    const result = analyzeRow(row, [lib], false);
    expect(result.tags).toEqual([]);
  });

  it('matches definitions with no rules when in preview mode', () => {
    const lib = makeLib({
      TagSpecDefinitions: [makeDef('TAG1', { TagRuleExpressions: [] })],
    });
    const result = analyzeRow(row, [lib], true);
    expect(result.tags).toEqual(['TAG1']);
  });

  it('uses OR logic across AND groups', () => {
    const lib = makeLib({
      TagSpecDefinitions: [makeDef('TAG1', {
        TagRuleExpressions: [
          // First AND group: won't match
          [{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: '^NOPE$', RegexDetails: [] }],
          // Second AND group: will match
          [{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: 'PAYMENT', RegexDetails: [] }],
        ],
      })],
    });
    const result = analyzeRow(row, [lib]);
    expect(result.tags).toEqual(['TAG1']);
  });

  it('populates matchedDefinitions and attributes', () => {
    const def = makeDef('TAG1', {
      TagRuleExpressions: [[{ SourceField: 'Description', ExpressionPrompt: null, ExpressionId: null, Regex: 'PAYMENT', RegexDetails: [] }]],
      Attributes: [{
        AttributeTag: 'attr1',
        IsMandatory: false,
        LOVTag: null,
        ValidationRuleTag: 'STRING',
        AttributeRuleExpression: {
          SourceField: 'Description',
          ExpressionPrompt: null,
          ExpressionId: null,
          Regex: '(PAYMENT)',
          RegexDetails: [],
        },
      }],
    });
    const lib = makeLib({ TagSpecDefinitions: [def] });
    const result = analyzeRow(row, [lib]);
    expect(result.matchedDefinitions).toHaveLength(1);
    expect(result.attributes['TAG1']).toBeDefined();
  });
});
