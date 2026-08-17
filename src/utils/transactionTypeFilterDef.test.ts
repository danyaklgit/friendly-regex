import { describe, it, expect } from 'vitest';
import { findTransactionTypeFilterDef } from './transactionTypeFilterDef';
import type { FilterDefinition } from '../api/transactions';

const value = (v: string, column = 'TransactionTypeCode') => ({
  Column: column,
  Value: v,
  Label: v,
  Operand: null,
  DisabledBy: null,
});

describe('findTransactionTypeFilterDef', () => {
  it('returns undefined for empty/missing input', () => {
    expect(findTransactionTypeFilterDef(undefined)).toBeUndefined();
    expect(findTransactionTypeFilterDef([])).toBeUndefined();
  });

  it('prefers the def labeled exactly "Transaction Type" over an earlier "Transaction Types" master catalog (Ledger shape)', () => {
    const master: FilterDefinition = {
      Tag: 'TransactionTypeCode',
      Label: 'Transaction Types',
      Type: 'LIST',
      Operand: null,
      IsFilterSearchable: true,
      Values: [value('101'), value('TRF'), value('customer_payment')],
    };
    const ledgerFilter: FilterDefinition = {
      Tag: 'LedgerTransactionTypes',
      Label: 'Transaction Type',
      Type: 'LIST',
      Operand: null,
      Values: [value('bad_debt'), value('bill'), value('creditnote')],
    };
    // Master first in array order, searchable, Column-matched — the exact
    // "Transaction Type" label must still win.
    expect(findTransactionTypeFilterDef([master, ledgerFilter])).toBe(ledgerFilter);
  });

  it('prefers a searchable LIST Column match when no def is labeled exactly "Transaction Type"', () => {
    const master: FilterDefinition = {
      Tag: 'TransactionTypeCode',
      Label: 'Transaction Types',
      Type: 'LIST',
      Operand: null,
      Values: [value('101'), value('TRF')],
    };
    const renderedFilter: FilterDefinition = {
      Tag: 'LedgerTransactionTypes',
      Label: 'Type',
      Type: 'LIST',
      Operand: null,
      IsFilterSearchable: true,
      Values: [value('bad_debt'), value('bill')],
    };
    expect(findTransactionTypeFilterDef([master, renderedFilter])).toBe(renderedFilter);
  });

  it('falls back to the first Column match when none is a searchable LIST', () => {
    const a: FilterDefinition = {
      Tag: 'A',
      Label: 'Something',
      Type: 'LIST',
      Operand: null,
      Values: [value('TRF')],
    };
    const b: FilterDefinition = {
      Tag: 'B',
      Label: 'Something else',
      Type: 'LIST',
      Operand: null,
      Values: [value('CHG')],
    };
    expect(findTransactionTypeFilterDef([a, b])).toBe(a);
  });

  it('falls back to Tag/Label matching when no def writes to TransactionTypeCode', () => {
    const legacy: FilterDefinition = {
      Tag: 'TransactionTypeCode',
      Label: 'Transaction Type',
      Type: 'LIST',
      Operand: null,
      Values: [value('TRF', 'TTC')],
    };
    expect(findTransactionTypeFilterDef([legacy])).toBe(legacy);
  });

  it('matches by Label containing "transaction type" as last resort', () => {
    const byLabel: FilterDefinition = {
      Tag: 'SomeTag',
      Label: 'Swift Transaction Type',
      Type: 'LIST',
      Operand: null,
      Values: [value('TRF', 'TTC')],
    };
    const other: FilterDefinition = {
      Tag: 'Banks',
      Label: 'Bank',
      Type: 'LIST',
      Operand: null,
      Values: [value('ARNBSARI', 'BankSwiftCode')],
    };
    expect(findTransactionTypeFilterDef([other, byLabel])).toBe(byLabel);
  });
});
