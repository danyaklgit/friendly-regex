import { describe, it, expect } from 'vitest';
import { buildSortingProperties, parseSortOverride, DEFAULT_SORTING, SORTABLE_FIELDS, type SortOverride } from './transactions';

describe('buildSortingProperties', () => {
  it('returns DEFAULT_SORTING when no override is provided', () => {
    expect(buildSortingProperties(null)).toBe(DEFAULT_SORTING);
    expect(buildSortingProperties(undefined)).toBe(DEFAULT_SORTING);
  });

  it('promotes the override to primary and keeps StatementDate then Sequence as tiebreakers, ASC', () => {
    const override: SortOverride = { field: 'IBAN', order: 'ASC' };
    expect(buildSortingProperties(override)).toEqual([
      { ColumnName: 'IBAN', SortingLevel: 1, SortingOrder: 'ASC' },
      { ColumnName: 'StatementDate', SortingLevel: 2, SortingOrder: 'ASC' },
      { ColumnName: 'Sequence', SortingLevel: 3, SortingOrder: 'ASC' },
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

  it('returns null when the field is not in SORTABLE_FIELDS', () => {
    expect(parseSortOverride({ field: 'StatementDate', order: 'ASC' })).toBeNull();
    expect(parseSortOverride({ field: '__nope__', order: 'ASC' })).toBeNull();
  });

  it('returns null when the order is invalid', () => {
    expect(parseSortOverride({ field: 'IBAN', order: 'asc' })).toBeNull();
    expect(parseSortOverride({ field: 'IBAN', order: 'random' })).toBeNull();
    expect(parseSortOverride({ field: 'IBAN' })).toBeNull();
  });

  it('round-trips every sortable field with both orders', () => {
    for (const field of SORTABLE_FIELDS) {
      for (const order of ['ASC', 'DESC'] as const) {
        const parsed = parseSortOverride({ field, order });
        expect(parsed).toEqual({ field, order });
      }
    }
  });
});
