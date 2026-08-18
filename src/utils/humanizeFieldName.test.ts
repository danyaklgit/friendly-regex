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

  it('expands the Txn token to Transaction', () => {
    expect(humanizeFieldName('TxnTypeName')).toBe('Transaction Type Name');
  });

  it('renders acronym tokens in their canonical casing', () => {
    expect(humanizeFieldName('ErpCode')).toBe('ERP Code');
    expect(humanizeFieldName('AmountFcy')).toBe('Amount FCY');
    expect(humanizeFieldName('StaleSinceUtc')).toBe('Stale Since UTC');
  });

  it('derives the Ledger field names verbatim from the field', () => {
    expect(humanizeFieldName('PartyName')).toBe('Party Name');
    expect(humanizeFieldName('OffsetAccountNumber')).toBe('Offset Account Number');
    expect(humanizeFieldName('StatementId')).toBe('Statement Id');
    expect(humanizeFieldName('IsStale')).toBe('Is Stale');
    expect(humanizeFieldName('ClientCode')).toBe('Client Code');
  });
});
