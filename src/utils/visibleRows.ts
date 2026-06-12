import type { TransactionRow } from '../types';
import type { SortProperty } from '../api/transactions';

/**
 * Pagination + merge helpers for the visible-rows engine
 * (useVisibleRowsEngine).
 *
 * Hidden tag specs are excluded SERVER-SIDE, but a single query can't
 * express it: two `NI` filter properties (`OpsTagSpecDefinitionId` +
 * `OpsMultiTags.TagSpecDefinitionId`) correctly drop rows hidden by their
 * primary OR any multi-tag, BUT `NI` is false for NULL columns, so it also
 * drops UNTAGGED rows (the bd1267f trap). So the visible set is fetched as
 * two disjoint halves in parallel — (A) tagged-visible via the two `NI`
 * filters, (B) untagged via `OpsIsUntagged = True` — and merged here in
 * SortingProperties order. See
 * docs/superpowers/specs/2026-06-12-hidden-tags-refill-design.md.
 */

/**
 * Row comparator mirroring the backend's SortingProperties order, used to
 * merge the two query result streams. Numeric-aware, case-insensitive
 * collation so ISO dates stay chronological and numeric strings stay
 * numeric; honors per-level ASC/DESC.
 */
export function compareBySorting(
  a: TransactionRow,
  b: TransactionRow,
  sorting: ReadonlyArray<SortProperty>,
): number {
  for (const s of sorting) {
    const av = String(a[s.ColumnName] ?? '');
    const bv = String(b[s.ColumnName] ?? '');
    const c = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true });
    if (c !== 0) return s.SortingOrder === 'DESC' ? -c : c;
  }
  return 0;
}

/**
 * Merges two individually-sorted row streams into one sorted stream
 * (two-pointer merge, stable: ties prefer the first stream). Both inputs
 * come back from the backend in SortingProperties order, so merging with
 * the matching comparator reproduces the global order of their union.
 */
export function mergeSortedRows(
  a: ReadonlyArray<TransactionRow>,
  b: ReadonlyArray<TransactionRow>,
  sorting: ReadonlyArray<SortProperty>,
): TransactionRow[] {
  const out: TransactionRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (compareBySorting(a[i], b[j], sorting) <= 0) {
      out.push(a[i++]);
    } else {
      out.push(b[j++]);
    }
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

/** Clamps a classic-mode page index when the visible total shrinks. */
export function clampPageIndex(
  page: number,
  visibleTotal: number | null,
  pageSize: number,
): number {
  if (visibleTotal == null) return Math.max(0, page);
  const lastPage = Math.max(0, Math.ceil(Math.max(visibleTotal, 1) / pageSize) - 1);
  return Math.max(0, Math.min(page, lastPage));
}
