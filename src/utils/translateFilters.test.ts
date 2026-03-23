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

  it('standard EQ filter with multiple values joined by pipe', () => {
    const result = translateFilters({ Side: new Set(['CR', 'DR']) });
    expect(result).toEqual([[{ ColumnName: 'Side', Value: 'CR|DR', Operand: 'EQ' }]]);
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

  it('search + base filters combine correctly', () => {
    const result = translateFilters({
      Side: new Set(['CR']),
      '__search:Description1|Description2': new Set(['ACME']),
    });
    // Each search column gets its own filter array with base filters prepended
    expect(result).toHaveLength(2);
    expect(result[0]).toContainEqual({ ColumnName: 'Side', Value: 'CR', Operand: 'EQ' });
    expect(result[0]).toContainEqual({ ColumnName: 'Description1', Value: 'ACME', Operand: 'IN' });
    expect(result[1]).toContainEqual({ ColumnName: 'Side', Value: 'CR', Operand: 'EQ' });
    expect(result[1]).toContainEqual({ ColumnName: 'Description2', Value: 'ACME', Operand: 'IN' });
  });
});
