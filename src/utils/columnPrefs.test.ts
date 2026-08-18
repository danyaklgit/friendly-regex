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
    saveHiddenColumns('Ledger', new Set(['data:IBAN']));
    saveColumnOrder('Ledger', ['data:StatementId', 'data:Comment']);
    saveColumnWidths('Ledger', { 'data:AdditionalInformation': 320 });

    const ledger = loadColumnPrefs('Ledger');
    expect([...ledger.hidden!]).toEqual(['data:IBAN']);
    expect(ledger.order).toEqual(['data:StatementId', 'data:Comment']);
    expect(ledger.widths).toEqual({ 'data:AdditionalInformation': 320 });

    // MT940's slot is untouched — layouts are independent per type.
    const mt940 = loadColumnPrefs('MT940');
    expect(mt940.hidden).toBeNull();
    expect(mt940.order).toEqual([]);
    expect(mt940.widths).toEqual({});
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
