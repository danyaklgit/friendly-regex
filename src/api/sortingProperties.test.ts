import { describe, it, expect } from 'vitest';
import {
  buildSortingProperties,
  parseSortOverride,
  getDefaultSorting,
  getSortableFields,
  DEFAULT_SORTING,
  STATEMENT_SORTABLE_FIELDS,
  LEDGER_SORTABLE_FIELDS,
  type SortOverride,
} from './transactions';

describe('getDefaultSorting', () => {
  it('statement workspaces and unknown/absent types sort by StatementDate + Sequence', () => {
    expect(getDefaultSorting('MT940')).toBe(DEFAULT_SORTING);
    expect(getDefaultSorting(undefined)).toBe(DEFAULT_SORTING);
    expect(getDefaultSorting(null)).toBe(DEFAULT_SORTING);
    expect(DEFAULT_SORTING[0]).toEqual({ ColumnName: 'StatementDate', SortingLevel: 1, SortingOrder: 'ASC' });
  });

  it('Ledger sorts by PostingDate + TransactionId + Sequence (legs of one journal entry stay contiguous)', () => {
    expect(getDefaultSorting('Ledger')).toEqual([
      { ColumnName: 'PostingDate', SortingLevel: 1, SortingOrder: 'ASC' },
      { ColumnName: 'TransactionId', SortingLevel: 2, SortingOrder: 'ASC' },
      { ColumnName: 'Sequence', SortingLevel: 3, SortingOrder: 'ASC' },
    ]);
  });
});

describe('getSortableFields', () => {
  it('serves statement text columns for statement/unknown types and Ledger V2 names for Ledger', () => {
    expect(getSortableFields('MT940')).toBe(STATEMENT_SORTABLE_FIELDS);
    expect(getSortableFields(undefined)).toBe(STATEMENT_SORTABLE_FIELDS);
    expect(getSortableFields('Ledger')).toBe(LEDGER_SORTABLE_FIELDS);
    expect(LEDGER_SORTABLE_FIELDS).toEqual(['AccountIBAN', 'Narrative', 'TransactionRef', 'SourceRef']);
  });
});

describe('buildSortingProperties', () => {
  it('returns the DataSetType default when no override is provided', () => {
    expect(buildSortingProperties(null)).toBe(DEFAULT_SORTING);
    expect(buildSortingProperties(undefined)).toBe(DEFAULT_SORTING);
    expect(buildSortingProperties(null, 'Ledger')[0].ColumnName).toBe('PostingDate');
  });

  it('promotes the override to primary and keeps StatementDate then Sequence as tiebreakers, ASC', () => {
    const override: SortOverride = { field: 'IBAN', order: 'ASC' };
    expect(buildSortingProperties(override)).toEqual([
      { ColumnName: 'IBAN', SortingLevel: 1, SortingOrder: 'ASC' },
      { ColumnName: 'StatementDate', SortingLevel: 2, SortingOrder: 'ASC' },
      { ColumnName: 'Sequence', SortingLevel: 3, SortingOrder: 'ASC' },
    ]);
  });

  it('uses PostingDate, TransactionId, then Sequence as tiebreakers on Ledger', () => {
    const override: SortOverride = { field: 'Narrative', order: 'ASC' };
    expect(buildSortingProperties(override, 'Ledger')).toEqual([
      { ColumnName: 'Narrative', SortingLevel: 1, SortingOrder: 'ASC' },
      { ColumnName: 'PostingDate', SortingLevel: 2, SortingOrder: 'ASC' },
      { ColumnName: 'TransactionId', SortingLevel: 3, SortingOrder: 'ASC' },
      { ColumnName: 'Sequence', SortingLevel: 4, SortingOrder: 'ASC' },
    ]);
  });

  it('honors a DESC override on the primary level while keeping tiebreakers ascending', () => {
    const override: SortOverride = { field: 'Description1', order: 'DESC' };
    const props = buildSortingProperties(override);
    expect(props[0]).toEqual({ ColumnName: 'Description1', SortingLevel: 1, SortingOrder: 'DESC' });
    expect(props[1].SortingOrder).toBe('ASC');
    expect(props[2].SortingOrder).toBe('ASC');
  });
});

describe('parseSortOverride', () => {
  it('returns null for non-object input', () => {
    expect(parseSortOverride(null)).toBeNull();
    expect(parseSortOverride(undefined)).toBeNull();
    expect(parseSortOverride('IBAN')).toBeNull();
    expect(parseSortOverride(42)).toBeNull();
  });

  it('returns null when the field is not sortable for the DataSetType', () => {
    expect(parseSortOverride({ field: 'StatementDate', order: 'ASC' })).toBeNull();
    expect(parseSortOverride({ field: '__nope__', order: 'ASC' })).toBeNull();
    // A statement column saved before a workspace switch is invalid on Ledger…
    expect(parseSortOverride({ field: 'Description1', order: 'ASC' }, 'Ledger')).toBeNull();
    // …and a Ledger column is invalid on statement types.
    expect(parseSortOverride({ field: 'Narrative', order: 'ASC' }, 'MT940')).toBeNull();
    expect(parseSortOverride({ field: 'Narrative', order: 'ASC' })).toBeNull();
  });

  it('returns null when the order is invalid', () => {
    expect(parseSortOverride({ field: 'IBAN', order: 'asc' })).toBeNull();
    expect(parseSortOverride({ field: 'IBAN', order: 'random' })).toBeNull();
    expect(parseSortOverride({ field: 'IBAN' })).toBeNull();
  });

  it('round-trips every sortable field with both orders, per DataSetType', () => {
    for (const field of STATEMENT_SORTABLE_FIELDS) {
      for (const order of ['ASC', 'DESC'] as const) {
        expect(parseSortOverride({ field, order })).toEqual({ field, order });
      }
    }
    for (const field of LEDGER_SORTABLE_FIELDS) {
      for (const order of ['ASC', 'DESC'] as const) {
        expect(parseSortOverride({ field, order }, 'Ledger')).toEqual({ field, order });
      }
    }
  });
});
