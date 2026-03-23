import { describe, it, expect } from 'vitest';
import { extractAttributes } from './extractAttributes';
import type { TagAttribute, TransactionRow } from '../types';

const makeAttr = (tag: string, field: string, regex: string): TagAttribute => ({
  AttributeTag: tag,
  IsMandatory: true,
  LOVTag: null,
  ValidationRuleTag: 'STRING',
  AttributeRuleExpression: {
    SourceField: field,
    ExpressionPrompt: null,
    ExpressionId: null,
    Regex: regex,
    RegexDetails: [],
  },
});

describe('extractAttributes', () => {
  const row: TransactionRow = {
    Description1: '/ORDP/ACME CORP/REF/INV-001',
    Amount: '1500.50',
  };

  it('extracts value using capture group', () => {
    const attrs = [makeAttr('OrderParty', 'Description1', '/ORDP/(.*?)/REF')];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ OrderParty: 'ACME CORP' });
  });

  it('returns null when no capture group matches', () => {
    const attrs = [makeAttr('Missing', 'Description1', '/NONEXISTENT/(.*?)/')];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ Missing: null });
  });

  it('returns null for undefined field', () => {
    const attrs = [makeAttr('Nope', 'NonexistentField', '(.*)')];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ Nope: null });
  });

  it('returns null for null field value', () => {
    const rowWithNull: TransactionRow = { Description1: null };
    const attrs = [makeAttr('Test', 'Description1', '(.*)')];
    const result = extractAttributes(attrs, rowWithNull);
    expect(result).toEqual({ Test: null });
  });

  it('returns null for invalid regex', () => {
    const attrs = [makeAttr('Bad', 'Description1', '[invalid')];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ Bad: null });
  });

  it('handles multiple attributes', () => {
    const attrs = [
      makeAttr('OrderParty', 'Description1', '/ORDP/(.*?)/REF'),
      makeAttr('Reference', 'Description1', '/REF/(.*)'),
      makeAttr('Amount', 'Amount', '(\\d+\\.\\d+)'),
    ];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({
      OrderParty: 'ACME CORP',
      Reference: 'INV-001',
      Amount: '1500.50',
    });
  });

  it('handles empty attributes array', () => {
    expect(extractAttributes([], row)).toEqual({});
  });
});
