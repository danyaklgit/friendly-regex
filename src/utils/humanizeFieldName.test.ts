import { describe, it, expect } from 'vitest';
import { humanizeFieldName } from './humanizeFieldName';

describe('humanizeFieldName', () => {
  it('splits camelCase', () => {
    expect(humanizeFieldName('bankSwiftCode')).toBe('bank Swift Code');
  });

  it('splits PascalCase', () => {
    expect(humanizeFieldName('BankSwiftCode')).toBe('Bank Swift Code');
  });

  it('handles acronyms followed by words', () => {
    expect(humanizeFieldName('IBANCode')).toBe('IBAN Code');
  });

  it('preserves all-caps acronyms', () => {
    expect(humanizeFieldName('IBAN')).toBe('IBAN');
  });

  it('splits letters from digits', () => {
    expect(humanizeFieldName('Description1')).toBe('Description 1');
  });

  it('splits digits from letters', () => {
    expect(humanizeFieldName('2ndField')).toBe('2 nd Field');
  });

  it('replaces underscores with spaces', () => {
    expect(humanizeFieldName('Additional_Information')).toBe('Additional Information');
  });

  it('handles ValueDate', () => {
    expect(humanizeFieldName('ValueDate')).toBe('Value Date');
  });

  it('handles TransactionTypeCode', () => {
    expect(humanizeFieldName('TransactionTypeCode')).toBe('Transaction Type Code');
  });
});
