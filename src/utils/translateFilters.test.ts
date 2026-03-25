import { describe, it, expect } from 'vitest';
import { translateFilters } from './translateFilters';

describe('translateFilters', () => {
  it('returns empty array for no filters', () => {
    expect(translateFilters({})).toEqual([]);
  });

  it('returns empty array for empty value sets', () => {
    expect(translateFilters({ Side: new Set() })).toEqual([]);
  });

  it('skips __tags filter', () => {
    expect(translateFilters({ __tags: new Set(['A']) })).toEqual([]);
  });

  it('standard EQ filter', () => {
    const result = translateFilters({ Side: new Set(['CR']) });
    expect(result).toEqual([[{ ColumnName: 'Side', Value: 'CR', Operand: 'EQ' }]]);
  });

  it('standard EQ filter with multiple values creates separate groups', () => {
    const result = translateFilters({ Side: new Set(['CR', 'DR']) });
    expect(result).toEqual([
      [{ ColumnName: 'Side', Value: 'CR', Operand: 'EQ' }],
      [{ ColumnName: 'Side', Value: 'DR', Operand: 'EQ' }],
    ]);
  });

  it('bool filter', () => {
    const result = translateFilters({ '__bool:IsDeadEnd': new Set(['true']) });
    expect(result).toEqual([[{ ColumnName: 'IsDeadEnd', Value: 'true', Operand: 'EQ' }]]);
  });

  it('decimal_gte filter', () => {
    const result = translateFilters({ '__decimal_gte:Amount': new Set(['100']) });
    expect(result).toEqual([[{ ColumnName: 'Amount', Value: '100', Operand: 'GTE' }]]);
  });

  it('decimal_lte filter', () => {
    const result = translateFilters({ '__decimal_lte:Amount': new Set(['500']) });
    expect(result).toEqual([[{ ColumnName: 'Amount', Value: '500', Operand: 'LTE' }]]);
  });

  it('date_gte filter', () => {
    const result = translateFilters({ '__date_gte:EntryDate': new Set(['2024-01-01']) });
    expect(result).toEqual([[{ ColumnName: 'EntryDate', Value: '2024-01-01', Operand: 'GTE' }]]);
  });

  it('date_lte filter', () => {
    const result = translateFilters({ '__date_lte:EntryDate': new Set(['2024-12-31']) });
    expect(result).toEqual([[{ ColumnName: 'EntryDate', Value: '2024-12-31', Operand: 'LTE' }]]);
  });

  it('string filter', () => {
    const result = translateFilters({ '__string:Description1': new Set(['ACME']) });
    expect(result).toEqual([[{ ColumnName: 'Description1', Value: 'ACME', Operand: 'IN' }]]);
  });

  it('search filter creates per-column combinations', () => {
    const result = translateFilters({
      '__search:Description1|Description2': new Set(['ACME']),
    });
    expect(result).toEqual([
      [{ ColumnName: 'Description1', Value: 'ACME', Operand: 'IN' }],
      [{ ColumnName: 'Description2', Value: 'ACME', Operand: 'IN' }],
    ]);
  });

  it('search + EQ filters combine correctly', () => {
    const result = translateFilters({
      Side: new Set(['CR']),
      '__search:Description1|Description2': new Set(['ACME']),
    });
    // EQ group + search groups, no base filters to prepend
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual([{ ColumnName: 'Side', Value: 'CR', Operand: 'EQ' }]);
    expect(result[1]).toEqual([{ ColumnName: 'Description1', Value: 'ACME', Operand: 'IN' }]);
    expect(result[2]).toEqual([{ ColumnName: 'Description2', Value: 'ACME', Operand: 'IN' }]);
  });

  it('base filters are included in each multi-value and search group', () => {
    const result = translateFilters({
      '__bool:IsDeadEnd': new Set(['true']),
      Side: new Set(['CR', 'DR']),
      '__search:Description1': new Set(['ACME']),
    });
    // 2 EQ groups + 1 search group, each with the bool base filter
    expect(result).toHaveLength(3);
    for (const group of result) {
      expect(group).toContainEqual({ ColumnName: 'IsDeadEnd', Value: 'true', Operand: 'EQ' });
    }
    expect(result[0]).toContainEqual({ ColumnName: 'Side', Value: 'CR', Operand: 'EQ' });
    expect(result[1]).toContainEqual({ ColumnName: 'Side', Value: 'DR', Operand: 'EQ' });
    expect(result[2]).toContainEqual({ ColumnName: 'Description1', Value: 'ACME', Operand: 'IN' });
  });
});
