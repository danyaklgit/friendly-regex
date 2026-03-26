import type { FilterProperty, FilterDefinition } from '../api/transactions';

/**
 * Converts UI filters (Record<string, Set<string>>) to the API FilteringProperties format.
 * Uses filter definitions to look up Column, Operand, and other metadata.
 *
 * Filter state key conventions:
 *   TAG_NAME          → LIST/SEARCH filters (set of selected values or single search string)
 *   TAG_NAME_GTE      → DECIMAL/DATE lower bound
 *   TAG_NAME_LTE      → DECIMAL/DATE upper bound
 */
export function translateFilters(
  filters: Record<string, Set<string>>,
  filterDefinitions: FilterDefinition[],
): FilterProperty[] {
  const result: FilterProperty[] = [];

  // Build a lookup by Tag for quick access
  const defByTag = new Map<string, FilterDefinition>();
  for (const def of filterDefinitions) {
    defByTag.set(def.Tag, def);
  }

  for (const [key, values] of Object.entries(filters)) {
    if (values.size === 0) continue;

    // Check for range suffixes (_GTE / _LTE)
    const gteMatch = key.match(/^(.+)_GTE$/);
    const lteMatch = key.match(/^(.+)_LTE$/);

    if (gteMatch || lteMatch) {
      const tag = (gteMatch ?? lteMatch)![1];
      const operand = gteMatch ? 'GTE' : 'LTE';
      const def = defByTag.get(tag);
      if (!def) continue;

      // Find the value definition matching this operand
      const valueDef = def.Values.find((v) => v.Operand === operand);
      if (!valueDef) continue;

      const val = [...values][0]; // range filters have a single value
      result.push({
        ColumnName: valueDef.Column,
        Value: val,
        Operand: operand,
      });
      continue;
    }

    // Direct tag match
    const def = defByTag.get(key);
    if (!def) continue;

    if (def.Type === 'LIST') {
      if (def.Operand === 'EQ') {
        // EQ style: each selected value is a separate filter entry
        // Column, Value, and Operand all come from the definition
        for (const col of values) {
          const valueDef = def.Values.find((v) => v.Column === col);
          if (!valueDef) continue;
          result.push({
            ColumnName: valueDef.Column,
            Value: valueDef.Value ?? '',
            Operand: def.Operand,
          });
        }
      } else {
        // IN style: single entry with pipe-separated values
        const column = def.Values[0]?.Column;
        if (!column) continue;
        const val = [...values].join('|');
        result.push({
          ColumnName: column,
          Value: val,
          Operand: def.Operand ?? 'IN',
        });
      }
    } else if (def.Type === 'SEARCH') {
      const column = def.Values[0]?.Column;
      if (!column) continue;
      const val = [...values][0];
      result.push({
        ColumnName: column,
        Value: val,
        Operand: def.Operand ?? 'CONTAINS',
      });
    }
    // DECIMAL and DATE are handled via the _GTE/_LTE suffix above
  }

  return result;
}
