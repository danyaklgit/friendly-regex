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

  it('derives the Ledger model V2 field names mechanically', () => {
    expect(humanizeFieldName('TransactionId')).toBe('Transaction Id');
    expect(humanizeFieldName('PostingDate')).toBe('Posting Date');
    expect(humanizeFieldName('AccountIBAN')).toBe('Account IBAN');
    expect(humanizeFieldName('OffsetAccountIBAN')).toBe('Offset Account IBAN');
    expect(humanizeFieldName('CounterPartyName')).toBe('Counter Party Name');
    expect(humanizeFieldName('TransactionRef')).toBe('Transaction Ref');
    expect(humanizeFieldName('SourceRef')).toBe('Source Ref');
    expect(humanizeFieldName('Narrative')).toBe('Narrative');
    expect(humanizeFieldName('FXRate')).toBe('FX Rate');
    expect(humanizeFieldName('FXGainLoss')).toBe('FX Gain Loss');
    expect(humanizeFieldName('VATCode')).toBe('VAT Code');
    expect(humanizeFieldName('VATBaseAmount')).toBe('VAT Base Amount');
    expect(humanizeFieldName('TxnAmountFC')).toBe('Transaction Amount FC');
    expect(humanizeFieldName('TxnAmountLC')).toBe('Transaction Amount LC');
    expect(humanizeFieldName('NumLines')).toBe('Num Lines');
    expect(humanizeFieldName('FiscalPeriod')).toBe('Fiscal Period');
  });
});
