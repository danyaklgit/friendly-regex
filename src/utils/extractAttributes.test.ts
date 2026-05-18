import { describe, it, expect } from 'vitest';
import { extractAttributes } from './extractAttributes';
import type { TagAttribute, TransactionRow } from '../types';

const makeAttr = (tag: string, field: string, regex: string, transformations?: TagAttribute['Transformations']): TagAttribute => ({
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
  ...(transformations ? { Transformations: transformations } : {}),
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

  it('extract_last_n_chars regex pulls the trailing N characters', () => {
    // `(.{4})$` is what regexifyExtraction emits for extract_last_n_chars
    // with numChars=4. The trailing-anchored capture pins to the last 4
    // chars of the source field's value.
    const attrs = [makeAttr('LastFour', 'Description1', '(.{4})$')];
    expect(extractAttributes(attrs, row)).toEqual({ LastFour: '-001' });
  });

  it('extract_last_n_chars returns null when field is shorter than N', () => {
    const shortRow: TransactionRow = { Description1: 'AB' };
    const attrs = [makeAttr('TooShort', 'Description1', '(.{4})$')];
    expect(extractAttributes(attrs, shortRow)).toEqual({ TooShort: null });
  });

  it('uses raw source field value when regex is empty', () => {
    const attrs = [makeAttr('Raw', 'Description1', '')];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ Raw: '/ORDP/ACME CORP/REF/INV-001' });
  });

  it('applies transformations in order after extraction', () => {
    const attrs = [makeAttr('Upper', 'Amount', '(\\d+\\.\\d+)', [
      { Method: 'replace', Args: [{ Key: 'find', Value: '.' }, { Key: 'replaceWith', Value: ',' }] },
    ])];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ Upper: '1500,50' });
  });

  it('applies multiple transformations in pipeline order', () => {
    const attrs = [makeAttr('Pipe', 'Description1', '/ORDP/(.*?)/REF', [
      { Method: 'to_lowercase', Args: [] },
      { Method: 'replace', Args: [{ Key: 'find', Value: ' ' }, { Key: 'replaceWith', Value: '_' }] },
    ])];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ Pipe: 'acme_corp' });
  });

  it('does not apply transformations when extracted value is null', () => {
    const attrs = [makeAttr('Null', 'Description1', '/NONEXISTENT/(.*?)/', [
      { Method: 'to_uppercase', Args: [] },
    ])];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ Null: null });
  });

  it('skips transformations when array is empty', () => {
    const attrs = [makeAttr('NoTransform', 'Amount', '(\\d+\\.\\d+)', [])];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ NoTransform: '1500.50' });
  });

  it('returns the last defined capture group for multi-group regexes', () => {
    // User-authored pattern: skip 3 slash-delimited segments and capture the
    // 4th. Group 1 (inside the {3} repeat) captures the LAST iteration in JS,
    // not the desired tail — taking match[1] would silently return the wrong
    // segment. The fix is to read the last defined group.
    const row2: TransactionRow = {
      AdditionalInformation:
        '/PT/Outward IPS Credit Transaction Charges 9131102300372347/ARABIC/inv settle',
    };
    const attrs = [
      makeAttr('LastSegment', 'AdditionalInformation', '(?:.*?/(.*)){3}(/(.*))'),
    ];
    const result = extractAttributes(attrs, row2);
    expect(result).toEqual({ LastSegment: 'inv settle' });
  });

  it('falls back to earlier groups when the last group is undefined (alternation)', () => {
    // (foo)|(bar) — only one branch captures; the other is undefined.
    const attrs = [makeAttr('Alt', 'Description1', '(ACME)|(BEEM)')];
    const result = extractAttributes(attrs, row);
    expect(result).toEqual({ Alt: 'ACME' });
  });
});
