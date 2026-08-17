import { describe, it, expect } from 'vitest';
import type { TagSpecLibrary } from '../types';
import {
  isLedger,
  identityKeys,
  identityContext,
  identityKeySuffix,
  hasCompleteIdentity,
  identityScopeFilters,
  libraryContextSummary,
  identityFromContext,
  checkoutIdentityFromLib,
  libraryMatchesCheckout,
} from './libraryIdentity';

const bankSide = { dataSetType: 'MT942', bank: 'GULFSARI', side: 'DR' };
const ledger = { dataSetType: 'Ledger', clientCode: 'BWATECH', erpCode: 'ZOHO' };

function lib(context: { Key: string; Value: string }[], dataSetType: string): TagSpecLibrary {
  return {
    Id: 'lib-1',
    ActiveTagSpecLibId: null,
    OperatorId: 'op',
    StatusTag: 'INPROGRESS',
    DataSetType: dataSetType,
    Version: 1,
    IsLatestVersion: true,
    VersionDate: '2026-01-01',
    Context: context,
    TagSpecDefinitions: [],
  };
}

describe('libraryIdentity', () => {
  it('isLedger only matches the exact case-sensitive wire string', () => {
    expect(isLedger('Ledger')).toBe(true);
    expect(isLedger('LEDGER')).toBe(false);
    expect(isLedger('MT940')).toBe(false);
    expect(isLedger(undefined)).toBe(false);
  });

  it('identityKeys switches on Ledger', () => {
    expect(identityKeys('Ledger')).toEqual(['ClientCode', 'ErpCode']);
    expect(identityKeys('MT940')).toEqual(['BankSwiftCode', 'Side']);
  });

  it('identityContext builds the right pair per type', () => {
    expect(identityContext(bankSide)).toEqual([
      { Key: 'BankSwiftCode', Value: 'GULFSARI' },
      { Key: 'Side', Value: 'DR' },
    ]);
    expect(identityContext(ledger)).toEqual([
      { Key: 'ClientCode', Value: 'BWATECH' },
      { Key: 'ErpCode', Value: 'ZOHO' },
    ]);
  });

  it('identityKeySuffix never collides across types for the same-looking pair', () => {
    expect(identityKeySuffix(bankSide)).toBe('MT942:GULFSARI:DR');
    expect(identityKeySuffix(ledger)).toBe('Ledger:BWATECH:ZOHO');
    // A Ledger draft and an MT940 draft do not share a suffix.
    expect(identityKeySuffix({ dataSetType: 'MT940', bank: 'BWATECH', side: 'ZOHO' })).not.toBe(
      identityKeySuffix(ledger),
    );
  });

  it('hasCompleteIdentity checks the type-appropriate pair', () => {
    expect(hasCompleteIdentity(bankSide)).toBe(true);
    expect(hasCompleteIdentity({ dataSetType: 'MT942', bank: 'GULFSARI', side: '' })).toBe(false);
    expect(hasCompleteIdentity(ledger)).toBe(true);
    expect(hasCompleteIdentity({ dataSetType: 'Ledger', clientCode: 'BWATECH' })).toBe(false);
  });

  it('identityScopeFilters emits the right columns with the given operand', () => {
    expect(identityScopeFilters(ledger, 'EQ')).toEqual([
      { ColumnName: 'ClientCode', Value: 'BWATECH', Operand: 'EQ' },
      { ColumnName: 'ErpCode', Value: 'ZOHO', Operand: 'EQ' },
    ]);
    expect(identityScopeFilters(bankSide, 'IN')).toEqual([
      { ColumnName: 'BankSwiftCode', Value: 'GULFSARI', Operand: 'IN' },
      { ColumnName: 'Side', Value: 'DR', Operand: 'IN' },
    ]);
  });

  it('libraryContextSummary labels Client/ERP for Ledger, Bank/Side otherwise', () => {
    expect(libraryContextSummary(ledger)).toEqual({
      primaryLabel: 'Client',
      primaryValue: 'BWATECH',
      secondaryLabel: 'ERP',
      secondaryValue: 'ZOHO',
    });
    expect(libraryContextSummary(bankSide)).toEqual({
      primaryLabel: 'Bank',
      primaryValue: 'GULFSARI',
      secondaryLabel: 'Side',
      secondaryValue: 'DR',
    });
  });

  it('identityFromContext / checkoutIdentityFromLib read the library Context', () => {
    const ledgerLib = lib(
      [
        { Key: 'ClientCode', Value: 'BWATECH' },
        { Key: 'ErpCode', Value: 'ZOHO' },
      ],
      'Ledger',
    );
    expect(identityFromContext(ledgerLib)).toEqual({
      bank: '',
      side: '',
      clientCode: 'BWATECH',
      erpCode: 'ZOHO',
    });
    expect(checkoutIdentityFromLib(ledgerLib)).toEqual({
      bank: '',
      side: '',
      clientCode: 'BWATECH',
      erpCode: 'ZOHO',
    });

    const mtLib = lib(
      [
        { Key: 'BankSwiftCode', Value: 'GULFSARI' },
        { Key: 'Side', Value: 'DR' },
      ],
      'MT940',
    );
    expect(checkoutIdentityFromLib(mtLib)).toEqual({
      bank: 'GULFSARI',
      side: 'DR',
      clientCode: '',
      erpCode: '',
    });
  });

  describe('libraryMatchesCheckout', () => {
    const mtLib = lib(
      [
        { Key: 'BankSwiftCode', Value: 'GULFSARI' },
        { Key: 'Side', Value: 'DR' },
      ],
      'MT942',
    );
    const ledgerLib = lib(
      [
        { Key: 'ClientCode', Value: 'BWATECH' },
        { Key: 'ErpCode', Value: 'ZOHO' },
      ],
      'Ledger',
    );

    it('matches bank/side libraries on DataSetType + bank + side', () => {
      expect(libraryMatchesCheckout(mtLib, { dataSetType: 'MT942', bank: 'GULFSARI', side: 'DR' })).toBe(true);
      expect(libraryMatchesCheckout(mtLib, { dataSetType: 'MT942', bank: 'GULFSARI', side: 'CR' })).toBe(false);
      expect(libraryMatchesCheckout(mtLib, { dataSetType: 'MT940', bank: 'GULFSARI', side: 'DR' })).toBe(false);
    });

    it('matches a Ledger library on DataSetType alone when client/erp absent', () => {
      // Handlers that only received ('','','Ledger') still resolve the single
      // Ledger library. A bank/side comparison would fail (Context has no
      // BankSwiftCode/Side), so it must NOT be attempted.
      expect(libraryMatchesCheckout(ledgerLib, { dataSetType: 'Ledger', bank: '', side: '' })).toBe(true);
    });

    it('matches a Ledger library exactly when client/erp are carried', () => {
      expect(libraryMatchesCheckout(ledgerLib, { dataSetType: 'Ledger', clientCode: 'BWATECH', erpCode: 'ZOHO' })).toBe(true);
      expect(libraryMatchesCheckout(ledgerLib, { dataSetType: 'Ledger', clientCode: 'OTHER', erpCode: 'ZOHO' })).toBe(false);
    });
  });
});
