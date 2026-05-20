import type { FilterDefinition } from '../api/transactions';

/** Resolve a stored filter value to the human-readable label used in the filter
 *  UI, including the SubLabel when present. Falls back to the raw value. */
export function resolveFilterValueLabel(key: string, value: string, defs: FilterDefinition[]): string {
  if (!defs.length) return value;
  if (key.startsWith('__') || key.endsWith('_GTE') || key.endsWith('_LTE')) return value;
  const column = key.startsWith('data:') ? key.slice(5) : key;
  const def = defs.find(
    (d) => d.Tag === key || d.Tag === column || d.Values.some((v) => v.Column === column),
  );
  const match = def?.Values.find((v) => v.Column === value || v.Value === value);
  if (!match) return value;
  return match.SubLabel ? `${match.Label} — ${match.SubLabel}` : match.Label;
}
