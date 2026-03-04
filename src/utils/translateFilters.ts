import type { FilterProperty } from '../api/transactions';

/**
 * Converts UI filters (Record<string, Set<string>>) to the API FilteringProperties format.
 *
 * Each field becomes one inner array with a single IN filter using pipe-separated values.
 * The __tags virtual filter is skipped (client-side only).
 */
export function translateFilters(
  filters: Record<string, Set<string>>,
): FilterProperty[][] {
  const group: FilterProperty[] = [];

  for (const [field, values] of Object.entries(filters)) {
    if (values.size === 0) continue;
    if (field === '__tags') continue; // client-side only filter

    group.push({
      ColumnName: field,
      Value: [...values].join('|'),
      Operand: 'IN',
    });
  }

  return group.length > 0 ? [group] : [];
}
