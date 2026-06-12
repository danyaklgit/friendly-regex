import { describe, it, expect } from 'vitest';
import { clampPageIndex, compareBySorting, mergeSortedRows } from './visibleRows';
import type { TransactionRow } from '../types';
import type { SortProperty } from '../api/transactions';

describe('clampPageIndex', () => {
  it('keeps a valid page', () => {
    expect(clampPageIndex(3, 500, 50)).toBe(3);
  });

  it('clamps past the last page when the visible total shrinks', () => {
    expect(clampPageIndex(9, 120, 50)).toBe(2);
  });

  it('handles null visibleTotal by only flooring at 0', () => {
    expect(clampPageIndex(7, null, 50)).toBe(7);
    expect(clampPageIndex(-2, null, 50)).toBe(0);
  });

  it('zero total collapses to page 0', () => {
    expect(clampPageIndex(4, 0, 50)).toBe(0);
  });

  it('never returns a negative page', () => {
    expect(clampPageIndex(-1, 100, 50)).toBe(0);
  });
});

describe('compareBySorting / mergeSortedRows', () => {
  const DATE_SEQ: SortProperty[] = [
    { ColumnName: 'StatementDate', SortingLevel: 1, SortingOrder: 'ASC' },
    { ColumnName: 'Sequence', SortingLevel: 2, SortingOrder: 'ASC' },
  ];
  const row = (date: string | null, seq: number, id?: string): TransactionRow =>
    ({ StatementDate: date, Sequence: seq, Id: id ?? `${date}-${seq}` }) as unknown as TransactionRow;

  it('orders by date then sequence, numerically', () => {
    expect(compareBySorting(row('2023-06-14', 2), row('2023-06-15', 1), DATE_SEQ)).toBeLessThan(0);
    expect(compareBySorting(row('2023-06-14', 10), row('2023-06-14', 9), DATE_SEQ)).toBeGreaterThan(0);
    expect(compareBySorting(row('2023-06-14', 5), row('2023-06-14', 5), DATE_SEQ)).toBe(0);
  });

  it('honors DESC ordering', () => {
    const desc: SortProperty[] = [{ ColumnName: 'StatementDate', SortingLevel: 1, SortingOrder: 'DESC' }];
    expect(compareBySorting(row('2023-06-14', 1), row('2023-06-15', 1), desc)).toBeGreaterThan(0);
  });

  it('treats null/missing values as empty strings', () => {
    expect(compareBySorting(row(null, 1), row('2023-06-14', 1), DATE_SEQ)).toBeLessThan(0);
  });

  it('merges two sorted streams into global order', () => {
    const tagged = [row('2023-06-14', 1), row('2023-06-19', 1), row('2023-08-19', 2)];
    const untagged = [row('2023-06-15', 1), row('2023-06-19', 2), row('2023-07-19', 1)];
    const merged = mergeSortedRows(tagged, untagged, DATE_SEQ);
    expect(merged.map((r) => r['Id'])).toEqual([
      '2023-06-14-1',
      '2023-06-15-1',
      '2023-06-19-1',
      '2023-06-19-2',
      '2023-07-19-1',
      '2023-08-19-2',
    ]);
  });

  it('handles empty streams on either side', () => {
    const rows = [row('2023-06-14', 1)];
    expect(mergeSortedRows(rows, [], DATE_SEQ)).toEqual(rows);
    expect(mergeSortedRows([], rows, DATE_SEQ)).toEqual(rows);
    expect(mergeSortedRows([], [], DATE_SEQ)).toEqual([]);
  });

  it('is stable: ties keep the first stream first', () => {
    const a = [row('2023-06-14', 1, 'A')];
    const b = [row('2023-06-14', 1, 'B')];
    expect(mergeSortedRows(a, b, DATE_SEQ).map((r) => r['Id'])).toEqual(['A', 'B']);
  });
});
