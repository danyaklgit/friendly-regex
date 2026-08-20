import { describe, it, expect } from 'vitest';
import {
  DATA_SET_TYPES,
  DEFAULT_DATA_SET_TYPE,
  DATA_SET_TYPE_LABELS,
  WORKSPACES,
  ALL_LIBRARY_DATA_SET_TYPES,
  dataSetTypeFilter,
  isSameDataSetFamily,
} from './dataSetTypes';

describe('dataSetTypes', () => {
  it('uses the exact case-sensitive wire literals', () => {
    // The backend rejects anything else — guard against accidental
    // reformatting (e.g. "Interim_MT940" or "INTERM_MT940").
    expect(DATA_SET_TYPES).toEqual(['MT940', 'MT942', 'INTERIM_MT940', 'Ledger']);
    expect(DEFAULT_DATA_SET_TYPE).toBe('MT940');
  });

  it('has a label for every type', () => {
    for (const t of DATA_SET_TYPES) {
      expect(DATA_SET_TYPE_LABELS[t]).toBeTruthy();
    }
    expect(DATA_SET_TYPE_LABELS.INTERIM_MT940).toBe('Interim MT940');
    expect(DATA_SET_TYPE_LABELS.Ledger).toBe('Ledger (ERP)');
  });

  it('derives the library fetch list from the workspaces', () => {
    expect(ALL_LIBRARY_DATA_SET_TYPES).toEqual(WORKSPACES.flatMap((w) => w.dataSetTypes));
    expect(ALL_LIBRARY_DATA_SET_TYPES).toContain('MT940');
    expect(ALL_LIBRARY_DATA_SET_TYPES).toContain('MT942');
    expect(ALL_LIBRARY_DATA_SET_TYPES).toContain('INTERIM_MT940');
    expect(ALL_LIBRARY_DATA_SET_TYPES).toContain('Ledger');
  });

  it('builds an IN scope filter for a single type', () => {
    expect(dataSetTypeFilter('MT942')).toEqual({
      ColumnName: 'DataSetType',
      Value: 'MT942',
      Operand: 'IN',
    });
  });

  it('pipe-joins a multi-type scope (never comma)', () => {
    const f = dataSetTypeFilter(['MT940', 'TransactionsList']);
    expect(f.Operand).toBe('IN');
    expect('Value' in f && f.Value).toBe('MT940|TransactionsList');
  });

  describe('isSameDataSetFamily', () => {
    it('accepts TransactionsList rows in the MT940 workspace (prod serves them under the MT940 scope filter)', () => {
      expect(isSameDataSetFamily('TransactionsList', 'MT940')).toBe(true);
      expect(isSameDataSetFamily('MT940', 'MT940')).toBe(true);
    });

    it('keeps every other workspace exact', () => {
      expect(isSameDataSetFamily('MT942', 'MT940')).toBe(false);
      expect(isSameDataSetFamily('INTERIM_MT940', 'MT940')).toBe(false);
      expect(isSameDataSetFamily('MT940', 'MT942')).toBe(false);
      expect(isSameDataSetFamily('TransactionsList', 'MT942')).toBe(false);
      expect(isSameDataSetFamily('TransactionsList', 'Ledger')).toBe(false);
      expect(isSameDataSetFamily('Ledger', 'Ledger')).toBe(true);
      // Asymmetric on purpose: the FAMILY belongs to the workspace side.
      expect(isSameDataSetFamily('MT940', 'TransactionsList')).toBe(false);
    });
  });
});
