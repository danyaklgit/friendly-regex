import { describe, it, expect, beforeEach } from 'vitest';
import {
  columnPrefsKey,
  loadColumnPrefs,
  migrateLegacyColumnPrefs,
  saveHiddenColumns,
  saveColumnOrder,
  saveColumnWidths,
} from './columnPrefs';

beforeEach(() => {
  localStorage.clear();
});

describe('columnPrefs', () => {
  it('returns empty prefs when nothing is stored', () => {
    const prefs = loadColumnPrefs('MT940');
    expect(prefs.hidden).toBeNull();
    expect(prefs.order).toEqual([]);
    expect(prefs.widths).toEqual({});
  });

  it('round-trips hidden / order / widths per DataSetType', () => {
    saveHiddenColumns('Ledger', new Set(['data:AccountIBAN']));
    saveColumnOrder('Ledger', ['data:TransactionId', 'data:Comment']);
    saveColumnWidths('Ledger', { 'data:Narrative': 320 });

    const ledger = loadColumnPrefs('Ledger');
    expect([...ledger.hidden!]).toEqual(['data:AccountIBAN']);
    expect(ledger.order).toEqual(['data:TransactionId', 'data:Comment']);
    expect(ledger.widths).toEqual({ 'data:Narrative': 320 });

    // MT940's slot is untouched — layouts are independent per type.
    const mt940 = loadColumnPrefs('MT940');
    expect(mt940.hidden).toBeNull();
    expect(mt940.order).toEqual([]);
    expect(mt940.widths).toEqual({});
  });

  describe('Ledger model V2 key migration', () => {
    it('rewrites old statement-field keys to the dedicated Ledger names on load', () => {
      saveHiddenColumns('Ledger', new Set(['data:IBAN', 'data:PartyId']));
      saveColumnOrder('Ledger', ['data:StatementId', 'data:StatementDate', 'data:PartyName', 'data:Comment']);
      saveColumnWidths('Ledger', { 'data:AdditionalInformation': 320, 'data:TransactionDetails': 400, 'data:Description1': 150, 'data:BankName': 120 });

      const ledger = loadColumnPrefs('Ledger');
      expect([...ledger.hidden!].sort()).toEqual(['data:AccountIBAN', 'data:CounterPartyCode']);
      expect(ledger.order).toEqual(['data:TransactionId', 'data:PostingDate', 'data:CounterPartyName', 'data:Comment']);
      expect(ledger.widths).toEqual({
        'data:TransactionRef': 320,
        'data:Narrative': 400,
        'data:SourceRef': 150,
        'data:AccountBankCode': 120,
      });
    });

    it('drops RunningBalance (no longer populated on Ledger) and dedupes old/new collisions', () => {
      saveColumnOrder('Ledger', ['data:StatementId', 'data:TransactionId', 'data:RunningBalance', 'data:Comment']);
      saveHiddenColumns('Ledger', new Set(['data:RunningBalance']));

      const ledger = loadColumnPrefs('Ledger');
      expect(ledger.order).toEqual(['data:TransactionId', 'data:Comment']);
      expect([...ledger.hidden!]).toEqual([]);
    });

    it('never touches statement-type layouts (IBAN stays IBAN on MT940)', () => {
      saveHiddenColumns('MT940', new Set(['data:IBAN']));
      saveColumnOrder('MT940', ['data:StatementId', 'data:RunningBalance', 'data:Comment']);

      const mt940 = loadColumnPrefs('MT940');
      expect([...mt940.hidden!]).toEqual(['data:IBAN']);
      expect(mt940.order).toEqual(['data:StatementId', 'data:RunningBalance', 'data:Comment']);
    });
  });

  it('removes the stored key when clearing (null hidden, empty order/widths)', () => {
    saveHiddenColumns('MT940', new Set(['x']));
    saveColumnOrder('MT940', ['a']);
    saveColumnWidths('MT940', { a: 100 });

    saveHiddenColumns('MT940', null);
    saveColumnOrder('MT940', []);
    saveColumnWidths('MT940', {});

    expect(localStorage.getItem(columnPrefsKey('MT940', 'hidden'))).toBeNull();
    expect(localStorage.getItem(columnPrefsKey('MT940', 'order'))).toBeNull();
    expect(localStorage.getItem(columnPrefsKey('MT940', 'widths'))).toBeNull();
  });

  it('adopts the legacy global layout as the MT940 layout, then discards the legacy keys', () => {
    localStorage.setItem('tep:hiddenColumns', JSON.stringify(['data:IBAN']));
    localStorage.setItem('tep:columnOrder', JSON.stringify(['data:Sequence']));
    localStorage.setItem('tep:columnWidths', JSON.stringify({ 'data:IBAN': 200 }));

    const mt940 = loadColumnPrefs('MT940');
    expect([...mt940.hidden!]).toEqual(['data:IBAN']);
    expect(mt940.order).toEqual(['data:Sequence']);
    expect(mt940.widths).toEqual({ 'data:IBAN': 200 });

    expect(localStorage.getItem('tep:hiddenColumns')).toBeNull();
    expect(localStorage.getItem('tep:columnOrder')).toBeNull();
    expect(localStorage.getItem('tep:columnWidths')).toBeNull();

    // Other types are unaffected by the migration.
    expect(loadColumnPrefs('Ledger').hidden).toBeNull();
  });

  it('never overwrites an existing per-type value during migration', () => {
    localStorage.setItem(columnPrefsKey('MT940', 'hidden'), JSON.stringify(['data:Comment']));
    localStorage.setItem('tep:hiddenColumns', JSON.stringify(['data:IBAN']));

    migrateLegacyColumnPrefs();

    expect(JSON.parse(localStorage.getItem(columnPrefsKey('MT940', 'hidden'))!)).toEqual(['data:Comment']);
    expect(localStorage.getItem('tep:hiddenColumns')).toBeNull();
  });

  it('expands the legacy __dates grouped key into the three date columns on load', () => {
    localStorage.setItem(
      columnPrefsKey('MT940', 'order'),
      JSON.stringify(['data:Sequence', '__dates', 'data:Comment']),
    );
    expect(loadColumnPrefs('MT940').order).toEqual([
      'data:Sequence', 'data:StatementDate', 'data:EntryDate', 'data:ValueDate', 'data:Comment',
    ]);
  });

  it('drops invalid width entries on load', () => {
    localStorage.setItem(
      columnPrefsKey('MT940', 'widths'),
      JSON.stringify({ good: 120, zero: 0, negative: -5, nan: 'x' }),
    );
    expect(loadColumnPrefs('MT940').widths).toEqual({ good: 120 });
  });
});
