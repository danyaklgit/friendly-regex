import { describe, it, expect } from 'vitest';
import {
  DATA_SET_TYPES,
  DEFAULT_DATA_SET_TYPE,
  DATA_SET_TYPE_LABELS,
  WORKSPACES,
  ALL_LIBRARY_DATA_SET_TYPES,
  dataSetTypeFilter,
} from './dataSetTypes';

describe('dataSetTypes', () => {
  it('uses the exact case-sensitive wire literals', () => {
    // The backend rejects anything else — guard against accidental
    // reformatting (e.g. "Interim_MT940" or "INTERM_MT940").
    expect(DATA_SET_TYPES).toEqual(['MT940', 'MT942', 'INTERIM_MT940']);
    expect(DEFAULT_DATA_SET_TYPE).toBe('MT940');
  });

  it('has a label for every type', () => {
    for (const t of DATA_SET_TYPES) {
      expect(DATA_SET_TYPE_LABELS[t]).toBeTruthy();
    }
    expect(DATA_SET_TYPE_LABELS.INTERIM_MT940).toBe('Interim MT940');
  });

  it('derives the library fetch list from the workspaces', () => {
    expect(ALL_LIBRARY_DATA_SET_TYPES).toEqual(WORKSPACES.flatMap((w) => w.dataSetTypes));
    expect(ALL_LIBRARY_DATA_SET_TYPES).toContain('MT940');
    expect(ALL_LIBRARY_DATA_SET_TYPES).toContain('MT942');
    expect(ALL_LIBRARY_DATA_SET_TYPES).toContain('INTERIM_MT940');
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
});
