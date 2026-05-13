import type { TransactionRow } from '../types';

/**
 * Reads the `Hints` field from a transaction row and returns a clean string[].
 *
 * The `Hints` field arrives on the GetMT940Transactions response as a string
 * array, but the row type is permissive (Record-like) so it isn't statically
 * checked. This helper performs a defensive shape check so the call site can
 * just iterate the result.
 */
export function getHints(row: TransactionRow): string[] {
  const raw = (row as unknown as Record<string, unknown>).Hints;
  if (!Array.isArray(raw)) return [];
  return raw.filter((h): h is string => typeof h === 'string' && h.length > 0);
}
