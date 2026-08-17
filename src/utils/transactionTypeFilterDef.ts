import type { FilterDefinition } from '../api/transactions';

/**
 * Resolve THE transaction-type filter definition — the one the filter row
 * renders as its searchable "Transaction Type" dropdown — from a GetFilters
 * catalog. Single source of truth for every surface that needs the
 * transaction-type list (TransactionTypePicker, the builder→filter chip sync,
 * suggestion tooltips), so they all show the values the operator sees in the
 * filter bar.
 *
 * Selection order matters because a GetFilters response can carry MORE than
 * one transaction-type-ish definition: the Ledger catalog ships a master
 * "Transaction Types" list (every type across all DataSetTypes) ALONGSIDE the
 * ledger-scoped "Transaction Type" filter that holds the values actually
 * present in the data. Name-contains or Column-based matching picks whichever
 * comes first in the response array — the master list — so:
 *
 *   1. The def labeled EXACTLY "Transaction Type" (the filter bar's chip
 *      label; the master catalog is "Transaction Types", plural).
 *   2. Else a rendered, searchable LIST filter (`Type === 'LIST' &&
 *      IsFilterSearchable`) whose Values write to the TransactionTypeCode
 *      column — what the filter bar's ApiFilterRenderer shows.
 *   3. Else the first def whose Values write to TransactionTypeCode.
 *   4. Else the legacy Tag/Label-contains match (pre-Ledger responses).
 */
export function findTransactionTypeFilterDef(
  defs: FilterDefinition[] | undefined,
): FilterDefinition | undefined {
  if (!defs || defs.length === 0) return undefined;
  const exactLabel = defs.find(
    (d) => (d.Label ?? '').trim().toLowerCase() === 'transaction type',
  );
  if (exactLabel) return exactLabel;
  const columnMatches = defs.filter((d) =>
    d.Values.some((v) => v.Column === 'TransactionTypeCode'),
  );
  const rendered = columnMatches.find(
    (d) => d.Type === 'LIST' && d.IsFilterSearchable === true,
  );
  if (rendered) return rendered;
  if (columnMatches.length > 0) return columnMatches[0];
  return defs.find(
    (d) => d.Tag === 'TransactionTypeCode' || d.Label?.toLowerCase().includes('transaction type'),
  );
}
