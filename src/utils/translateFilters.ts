import type { FilterProperty } from '../api/transactions';

// Prefix conventions for special filter types stored in the filter state:
// __bool:ColumnName    → BOOL filter (value = "true"/"false")
// __search:Column1|Col2 → SEARCH filter (value = search text)
// __decimal_gte:Column  → DECIMAL lower bound
// __decimal_lte:Column  → DECIMAL upper bound
// __date_gte:Column     → DATE lower bound
// __date_lte:Column     → DATE upper bound
// __string:Column       → STRING free-text filter (LIKE)
// __tags               → client-side only, skipped

/**
 * Converts UI filters (Record<string, Set<string>>) to the API FilteringProperties format.
 */
export function translateFilters(
  filters: Record<string, Set<string>>,
): FilterProperty[][] {
  const group: FilterProperty[] = [];

  for (const [key, values] of Object.entries(filters)) {
    if (values.size === 0) continue;
    if (key === '__tags') continue; // client-side only

    const val = [...values].join('|');

    if (key.startsWith('__bool:')) {
      const column = key.slice('__bool:'.length);
      group.push({ ColumnName: column, Value: 'true', Operand: 'EQ' });
    } else if (key.startsWith('__search:')) {
      const columns = key.slice('__search:'.length);
      // Search across potentially multiple columns (pipe-separated in definition)
      for (const col of columns.split('|')) {
        group.push({ ColumnName: col, Value: val, Operand: 'IN' });
      }
    } else if (key.startsWith('__decimal_gte:')) {
      const column = key.slice('__decimal_gte:'.length);
      group.push({ ColumnName: column, Value: val, Operand: 'GTE' });
    } else if (key.startsWith('__decimal_lte:')) {
      const column = key.slice('__decimal_lte:'.length);
      group.push({ ColumnName: column, Value: val, Operand: 'LTE' });
    } else if (key.startsWith('__date_gte:')) {
      const column = key.slice('__date_gte:'.length);
      group.push({ ColumnName: column, Value: val, Operand: 'GTE' });
    } else if (key.startsWith('__date_lte:')) {
      const column = key.slice('__date_lte:'.length);
      group.push({ ColumnName: column, Value: val, Operand: 'LTE' });
    } else if (key.startsWith('__string:')) {
      const column = key.slice('__string:'.length);
      group.push({ ColumnName: column, Value: val, Operand: 'IN' });
    } else {
      // Standard IN filter (STRING-FROM-LIST or data-derived)
      group.push({ ColumnName: key, Value: val, Operand: 'IN' });
    }
  }

  return group.length > 0 ? [group] : [];
}
