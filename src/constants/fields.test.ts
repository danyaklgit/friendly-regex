import { describe, it, expect } from 'vitest';
import { LEDGER_SOURCE_FIELDS, DATE_SOURCE_FIELDS } from './fields';
import { getColumnSpec } from './transactionColumns';

describe('LEDGER_SOURCE_FIELDS', () => {
  it('only lists fields that are offerable Ledger columns', () => {
    const ledgerOrder = new Set(getColumnSpec('Ledger').defaultOrder);
    for (const field of LEDGER_SOURCE_FIELDS) {
      expect(ledgerOrder.has(`data:${field}`), field).toBe(true);
    }
  });

  it('never lists a field statement rows also carry (it would leak into MT940 dropdowns)', () => {
    const mt940Order = new Set(getColumnSpec('MT940').defaultOrder);
    for (const field of LEDGER_SOURCE_FIELDS) {
      expect(mt940Order.has(`data:${field}`), field).toBe(false);
    }
  });

  it('offers the V2 identity and document fields (rule + attribute source dropdowns)', () => {
    const set = new Set<string>(LEDGER_SOURCE_FIELDS);
    for (const field of ['TransactionId', 'EntryId', 'ClientCode', 'ErpCode', 'TxnTypeName', 'Entity', 'FiscalPeriod', 'Source', 'ReasonCode', 'ReasonDescription', 'Narrative', 'TransactionRef', 'SourceRef']) {
      expect(set.has(field), field).toBe(true);
    }
  });

  it('excludes numerics, booleans, dates, the stale pair, and V2.1-dropped AccountCode', () => {
    const set = new Set<string>(LEDGER_SOURCE_FIELDS);
    for (const field of ['AmountFcy', 'FXRate', 'TxnAmountFC', 'TxnAmountLC', 'VATAmount', 'VATBaseAmount', 'FXGainLoss', 'NumLines', 'IsReversal', 'IsReversed', 'TransactionIsReversal', 'TransactionIsReversed', 'AccountIsBankAccount', 'OffsetAccountIsBankAccount', 'PostingDate', 'IsStale', 'StaleSinceUtc', 'Side', 'Comment', 'Hash', 'AccountCode']) {
      expect(set.has(field), field).toBe(false);
    }
  });
});

describe('DATE_SOURCE_FIELDS', () => {
  it('covers the statement date and its Ledger V2 counterpart', () => {
    expect(DATE_SOURCE_FIELDS.has('StatementDate')).toBe(true);
    expect(DATE_SOURCE_FIELDS.has('PostingDate')).toBe(true);
  });
});
