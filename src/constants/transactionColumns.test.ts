import { describe, it, expect } from 'vitest';
import { getColumnSpec } from './transactionColumns';
import { DATA_SET_TYPES } from './dataSetTypes';

describe('getColumnSpec', () => {
  it('provides a spec for every DataSetType', () => {
    for (const type of DATA_SET_TYPES) {
      const spec = getColumnSpec(type);
      expect(spec.defaultOrder.length).toBeGreaterThan(0);
      expect(spec.defaultVisible.size).toBeGreaterThan(0);
    }
  });

  it('falls back to the MT940 spec for unknown/absent types', () => {
    expect(getColumnSpec(undefined)).toBe(getColumnSpec('MT940'));
    expect(getColumnSpec(null)).toBe(getColumnSpec('MT940'));
    expect(getColumnSpec('SOMETHING_NEW')).toBe(getColumnSpec('MT940'));
  });

  it('keeps every default-visible key present in the default order', () => {
    for (const type of DATA_SET_TYPES) {
      const spec = getColumnSpec(type);
      const orderSet = new Set(spec.defaultOrder);
      for (const key of spec.defaultVisible) {
        expect(orderSet.has(key), `${type}: ${key} missing from defaultOrder`).toBe(true);
      }
    }
  });

  it('never overlaps defaultVisible with neverShow', () => {
    for (const type of DATA_SET_TYPES) {
      const spec = getColumnSpec(type);
      for (const key of spec.defaultVisible) {
        expect(spec.neverShow.has(key), `${type}: ${key} both visible and never-show`).toBe(false);
      }
    }
  });

  it('ends every default view with StatementId then Comment (TransactionId leads on Ledger)', () => {
    for (const type of ['MT940', 'MT942', 'INTERIM_MT940'] as const) {
      const spec = getColumnSpec(type);
      const visibleInOrder = spec.defaultOrder.filter((k) => spec.defaultVisible.has(k));
      expect(visibleInOrder.slice(-2)).toEqual(['data:StatementId', 'data:Comment']);
    }
    const ledger = getColumnSpec('Ledger');
    const ledgerVisible = ledger.defaultOrder.filter((k) => ledger.defaultVisible.has(k));
    expect(ledgerVisible[0]).toBe('data:TransactionId');
    expect(ledgerVisible[ledgerVisible.length - 1]).toBe('data:Comment');
  });

  it('hides RunningBalance entirely on MT942 but only by default on INTERIM_MT940', () => {
    const mt942 = getColumnSpec('MT942');
    expect(mt942.neverShow.has('data:RunningBalance')).toBe(true);
    expect(mt942.defaultOrder).not.toContain('data:RunningBalance');

    const interim = getColumnSpec('INTERIM_MT940');
    expect(interim.neverShow.has('data:RunningBalance')).toBe(false);
    expect(interim.defaultOrder).toContain('data:RunningBalance');
    expect(interim.defaultVisible.has('data:RunningBalance')).toBe(false);

    expect(getColumnSpec('MT940').defaultVisible.has('data:RunningBalance')).toBe(true);

    // Ledger model V2: RunningBalance is no longer populated on Ledger rows.
    const ledger = getColumnSpec('Ledger');
    expect(ledger.neverShow.has('data:RunningBalance')).toBe(true);
    expect(ledger.defaultOrder).not.toContain('data:RunningBalance');
  });

  it('never offers Ledger-only fields on MT940/intraday types', () => {
    for (const type of ['MT940', 'MT942', 'INTERIM_MT940'] as const) {
      const spec = getColumnSpec(type);
      for (const field of ['ClientCode', 'CounterPartyName', 'OffsetAccountNumber', 'AmountFcy', 'IsStale', 'TransactionId', 'PostingDate', 'Narrative', 'TransactionRef', 'SourceRef', 'AccountBankCode', 'FXRate', 'VATCode']) {
        expect(spec.neverShow.has(`data:${field}`), `${type}: ${field}`).toBe(true);
      }
    }
  });

  it('never offers the always-null fields on Ledger', () => {
    const ledger = getColumnSpec('Ledger');
    for (const field of ['BankSwiftCode', 'FundsCode', 'BankReference', 'Description2', 'Hints']) {
      expect(ledger.neverShow.has(`data:${field}`)).toBe(true);
    }
  });

  it('never offers the pre-V2 statement-field names on Ledger (null / deprecated aliases)', () => {
    const ledger = getColumnSpec('Ledger');
    for (const field of ['StatementId', 'StatementDate', 'IBAN', 'AdditionalInformation', 'TransactionDetails', 'Description1', 'PartyId', 'PartyName', 'BankName', 'RunningBalance', 'TransactionStatusIndicator']) {
      expect(ledger.neverShow.has(`data:${field}`), field).toBe(true);
      expect(ledger.defaultOrder).not.toContain(`data:${field}`);
    }
  });

  it('keeps the pre-V2 visible set under the dedicated Ledger names', () => {
    const ledger = getColumnSpec('Ledger');
    for (const field of ['TransactionId', 'PostingDate', 'ClientCode', 'ErpCode', 'TxnTypeName', 'EntryId', 'AccountId', 'AccountName', 'AccountNumber', 'AccountType', 'AccountBankCode', 'CounterPartyCode', 'CounterPartyName', 'OffsetAccountName', 'OffsetAccountId', 'OffsetAccountNumber', 'OffsetAccountType', 'AmountFcy', 'TransactionNarrative', 'ExternalRef', 'SourceRef']) {
      expect(ledger.defaultVisible.has(`data:${field}`), field).toBe(true);
    }
    expect(ledger.defaultVisible.has('data:IsStale')).toBe(false);
    expect(ledger.defaultVisible.has('data:StaleSinceUtc')).toBe(false);
    expect(ledger.defaultOrder).toContain('data:IsStale');
    expect(ledger.defaultOrder).toContain('data:StaleSinceUtc');
  });

  it('V2.1 remap: TransactionNarrative/ExternalRef are the visible text columns; the remapped-away pair stays offerable-hidden; AccountCode is gone', () => {
    const ledger = getColumnSpec('Ledger');
    // Visible replacements sit right where the old columns sat.
    const order = ledger.defaultOrder;
    expect(order.indexOf('data:TransactionNarrative')).toBeLessThan(order.indexOf('data:Narrative'));
    expect(order.indexOf('data:ExternalRef')).toBeLessThan(order.indexOf('data:TransactionRef'));
    // NULL-for-Zoho columns stay offerable (a future ERP may fill them), hidden.
    for (const field of ['Narrative', 'TransactionRef', 'ValueDate']) {
      expect(ledger.defaultOrder, field).toContain(`data:${field}`);
      expect(ledger.defaultVisible.has(`data:${field}`), field).toBe(false);
      expect(ledger.neverShow.has(`data:${field}`), field).toBe(false);
    }
    // AccountCode duplicated AccountNumber and is dropped outright.
    expect(ledger.neverShow.has('data:AccountCode')).toBe(true);
    expect(ledger.defaultOrder).not.toContain('data:AccountCode');
  });

  it('offers the new V2 fields hidden-by-default (line-level at canonical spots, document-level at the tail)', () => {
    const ledger = getColumnSpec('Ledger');
    for (const field of ['AccountIBAN', 'AccountCurrency', 'OffsetAccountCode', 'OffsetAccountIBAN', 'CounterPartyType', 'CounterPartyBankCode', 'CounterPartyAccountNumber', 'CounterPartyCountryCode', 'PaymentMethod', 'PaymentRef', 'ExtPaymentRef', 'Notes', 'GroupingRef', 'BusinessUnit', 'DocumentRef', 'VATCode', 'VATAmount', 'VATBaseAmount', 'IsReversal', 'IsReversed', 'ReversalOfRef', 'FXGainLoss', 'Entity', 'FiscalPeriod', 'TransactionNotes', 'TransactionExternalRef', 'TransactionCurrencyCode', 'FXRate', 'TxnAmountFC', 'TxnAmountLC', 'NumLines', 'Source', 'TransactionIsReversal', 'TransactionIsReversed', 'TransactionReversalOfRef', 'ReasonCode', 'ReasonDescription']) {
      expect(ledger.defaultOrder, field).toContain(`data:${field}`);
      expect(ledger.defaultVisible.has(`data:${field}`), field).toBe(false);
      expect(ledger.neverShow.has(`data:${field}`), field).toBe(false);
    }
    // Document-level fields sit after the ERP identity block, before Comment.
    const order = ledger.defaultOrder;
    expect(order.indexOf('data:Entity')).toBeGreaterThan(order.indexOf('data:ErpCode'));
    expect(order.indexOf('data:ReasonDescription')).toBeLessThan(order.indexOf('data:Comment'));
  });

  it('places TransactionTypeCode right after TxnTypeName in the Ledger order', () => {
    const order = getColumnSpec('Ledger').defaultOrder;
    const txnTypeName = order.indexOf('data:TxnTypeName');
    expect(order[txnTypeName + 1]).toBe('data:TransactionTypeCode');
    expect(getColumnSpec('Ledger').defaultVisible.has('data:TransactionTypeCode')).toBe(false);
  });

  it('shows the raw Side column by default only on Ledger, offerable-hidden elsewhere', () => {
    const ledger = getColumnSpec('Ledger');
    expect(ledger.defaultVisible.has('data:Side')).toBe(true);
    expect(ledger.defaultOrder).toContain('data:Side');
    for (const type of ['MT940', 'MT942', 'INTERIM_MT940'] as const) {
      const spec = getColumnSpec(type);
      expect(spec.defaultOrder).toContain('data:Side');
      expect(spec.defaultVisible.has('data:Side'), type).toBe(false);
      expect(spec.neverShow.has('data:Side'), type).toBe(false);
    }
  });

  it('offers Hash hidden-by-default on every type', () => {
    for (const type of DATA_SET_TYPES) {
      const spec = getColumnSpec(type);
      expect(spec.defaultOrder).toContain('data:Hash');
      expect(spec.defaultVisible.has('data:Hash')).toBe(false);
      expect(spec.neverShow.has('data:Hash')).toBe(false);
    }
  });
});
