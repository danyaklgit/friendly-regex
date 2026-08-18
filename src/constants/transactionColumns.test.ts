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

  it('ends every default view with StatementId then Comment (StatementId leads on Ledger)', () => {
    for (const type of ['MT940', 'MT942', 'INTERIM_MT940'] as const) {
      const spec = getColumnSpec(type);
      const visibleInOrder = spec.defaultOrder.filter((k) => spec.defaultVisible.has(k));
      expect(visibleInOrder.slice(-2)).toEqual(['data:StatementId', 'data:Comment']);
    }
    const ledger = getColumnSpec('Ledger');
    const ledgerVisible = ledger.defaultOrder.filter((k) => ledger.defaultVisible.has(k));
    expect(ledgerVisible[0]).toBe('data:StatementId');
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
  });

  it('never offers Ledger-only fields on MT940/intraday types', () => {
    for (const type of ['MT940', 'MT942', 'INTERIM_MT940'] as const) {
      const spec = getColumnSpec(type);
      for (const field of ['ClientCode', 'PartyName', 'OffsetAccountNumber', 'AmountFcy', 'IsStale']) {
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

  it('defaults every Ledger-only field visible except the stale pair', () => {
    const ledger = getColumnSpec('Ledger');
    for (const field of ['ClientCode', 'ErpCode', 'TxnTypeName', 'EntryId', 'AccountId', 'AccountName', 'AccountNumber', 'AccountType', 'BankName', 'PartyId', 'PartyName', 'OffsetAccountName', 'OffsetAccountId', 'OffsetAccountNumber', 'OffsetAccountType', 'AmountFcy']) {
      expect(ledger.defaultVisible.has(`data:${field}`), field).toBe(true);
    }
    expect(ledger.defaultVisible.has('data:IsStale')).toBe(false);
    expect(ledger.defaultVisible.has('data:StaleSinceUtc')).toBe(false);
    expect(ledger.defaultOrder).toContain('data:IsStale');
    expect(ledger.defaultOrder).toContain('data:StaleSinceUtc');
  });

  it('places TransactionTypeCode right after TxnTypeName in the Ledger order', () => {
    const order = getColumnSpec('Ledger').defaultOrder;
    const txnTypeName = order.indexOf('data:TxnTypeName');
    expect(order[txnTypeName + 1]).toBe('data:TransactionTypeCode');
    expect(getColumnSpec('Ledger').defaultVisible.has('data:TransactionTypeCode')).toBe(false);
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
