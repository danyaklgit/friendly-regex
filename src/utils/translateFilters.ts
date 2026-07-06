import type { FilterProperty, FilterDefinition } from '../api/transactions';

/**
 * The boolean "Show Only" flag filters (LIST+EQ) mirror the Backlog badges,
 * which check the PRIMARY single-tag column only (e.g.
 * `OpsContainsInvalidAttributes`). The backend's GetFilters definition
 * pipe-joins a multi-tag mirror (`…|OpsMultiTags.ContainsInvalidAttributes`),
 * broadening the match to multi-tagged rows whose sub-tags carry the flag.
 * That diverges from the badge + the backlog stat (e.g. Invalid Attributes
 * returned ~433 rows manually vs the 2 the badge/backlog report, because
 * multi-tagged rows are their own bucket). Drop the `OpsMultiTags.*` segments
 * so the manual "Show Only" filter matches the badge. Multi-tagged rows remain
 * reachable via the dedicated "Multi-tagged" filter — they're just not folded
 * into every attribute-flag count here.
 */
function stripMultiTagMirror(column: string): string {
  const kept = column.split('|').filter((c) => !c.startsWith('OpsMultiTags.'));
  return kept.length > 0 ? kept.join('|') : column;
}

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
        // EQ-style LIST (e.g. "SHOW ONLY"): each picked value targets a
        // different column. The operator's intent for a multi-select is
        // OR — a row qualifies if ANY of the picked flags is set. Emitting
        // separate top-level StandardFilterProperty entries would AND
        // server-side and silently exclude rows in only one bucket.
        //   - single selection → one EQ filter (no behaviour change).
        //   - multiple selections with the same Value (the common case for
        //     boolean-flag filters like SHOW ONLY where every option is
        //     "True") → one IN filter with pipe-joined column names, mirroring
        //     how Transaction Type's multi-select reaches the server.
        //   - multiple selections with differing Values → REGEX outer-OR
        //     fallback so each (column, value) pair can vary independently.
        const resolved: { Column: string; Value: string }[] = [];
        for (const col of values) {
          const valueDef = def.Values.find((v) => v.Column === col);
          if (!valueDef) continue;
          // LIST+EQ filters are the boolean "Show Only" flags (Untagged,
          // Multi-tagged, Invalid Attributes, …). Match the Backlog badge
          // recipe: the PRIMARY single-tag column (multi-tag mirror stripped —
          // see stripMultiTagMirror) EQ 'True'. A missing option value
          // (backend sometimes omits it) also defaults to 'True'.
          resolved.push({ Column: stripMultiTagMirror(valueDef.Column), Value: valueDef.Value || 'True' });
        }
        if (resolved.length === 1) {
          result.push({
            ColumnName: resolved[0].Column,
            Value: resolved[0].Value,
            Operand: def.Operand,
          });
        } else if (resolved.length > 1) {
          const sharedValue = resolved[0].Value;
          const allShareValue = resolved.every((r) => r.Value === sharedValue);
          if (allShareValue) {
            result.push({
              ColumnName: resolved.map((r) => r.Column).join('|'),
              Value: sharedValue,
              Operand: 'IN',
            });
          } else {
            result.push({
              Operand: 'REGEX',
              Regex: resolved.map((r) => [
                { ColumnName: r.Column, Value: `^${r.Value}$`, Options: '' },
              ]),
            });
          }
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
