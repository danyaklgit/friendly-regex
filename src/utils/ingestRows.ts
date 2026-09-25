import type { TransactionRow } from '../types';

/**
 * Shared normalization for every transaction-buffer ingest path
 * (fetchPage / replaceFromBeginning / replaceFromBeginningExcluding /
 * appendBatch pages):
 *
 * 1. Mirror the backend's `OpsIsDeadEnd` (string "True"/"False") onto the
 *    boolean `IsDeadEnd` every row-level read keys off, so badges, the
 *    selection bar, and the sample-mode filter keep working after a refetch.
 * 2. Drop rows whose `Id` already appeared EARLIER IN THE SAME LIST. The
 *    backend pages with skip/limit under a sort key that is not a total
 *    order; when the query plan falls back to a blocking sort it can return
 *    the same row twice (reproduced server-side: 4 duplicated rows). A
 *    duplicate id becomes a duplicate React key in the virtualized table,
 *    and React's handling of colliding keys is undefined — mounted rows can
 *    be duplicated or survive a result-set swap (the rule-builder "ghost
 *    rows" incident, 2026-09-25). Rows without an `Id` are kept: an empty
 *    key would collapse distinct rows.
 */
export function ingestRows(raw: TransactionRow[]): TransactionRow[] {
  const out: TransactionRow[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const id = String(row['Id'] ?? '');
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    if (row['IsDeadEnd'] != null) {
      out.push(row);
      continue;
    }
    const ops = row['OpsIsDeadEnd'];
    if (ops == null) {
      out.push(row);
      continue;
    }
    const isDead = typeof ops === 'string' ? ops.toLowerCase() === 'true' : ops === true;
    out.push({ ...row, IsDeadEnd: isDead });
  }
  return out;
}
