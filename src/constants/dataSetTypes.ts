import type { FilterProperty } from '../api/transactions';

/**
 * Single source of truth for statement DataSetTypes.
 *
 * These are the exact wire strings the backend expects — upper-case, with the
 * underscore for INTERIM_MT940. Matching is case-sensitive server-side and an
 * unknown value is rejected with SFM_INVALID_INPUT_PARAMETERS, so never
 * lower-case or reformat them.
 *
 * MT940 is the confirmed end-of-day statement (the original, only type until
 * intraday shipped). MT942 and INTERIM_MT940 are the provisional intraday
 * reports (their rows carry IsConfirmed = false). Ledger is the ERP ledger
 * feed — its library is identified by (ClientCode, ErpCode), NOT (bank, side)
 * (see src/utils/libraryIdentity.ts). TransactionsList (an end-of-day SNB
 * list) is intentionally NOT here yet — see WORKSPACES.
 */
export const DATA_SET_TYPES = ['MT940', 'MT942', 'INTERIM_MT940', 'Ledger'] as const;
export type DataSetType = (typeof DATA_SET_TYPES)[number];

/**
 * Scope used when nothing is checked out (browse / "View all"). The grid
 * endpoint returns EVERY DataSetType unless a filter is sent, so defaulting to
 * MT940 preserves the pre-intraday behavior and keeps intraday rows from
 * leaking into an unscoped grid.
 */
export const DEFAULT_DATA_SET_TYPE: DataSetType = 'MT940';

/** Backend column name the grid / export / GetFilters use to scope by type. */
export const DATA_SET_TYPE_COLUMN = 'DataSetType';

/**
 * Row-level DataSetTypes that belong to a workspace type's FAMILY. The prod
 * backend serves TransactionsList rows (the end-of-day SNB list) under the
 * plain `DataSetType IN MT940` scope filter — the request asks for MT940 and
 * rows come back labeled TransactionsList. Any row-vs-workspace comparison
 * must treat those as the same scope, or the row is misread as belonging to
 * another workspace (the stale-buffer guard held the table in its skeleton
 * forever on prod because of this). Intraday types and Ledger stay exact.
 */
export function isSameDataSetFamily(rowType: string, workspaceType: string): boolean {
  if (rowType === workspaceType) return true;
  return workspaceType === 'MT940' && rowType === 'TransactionsList';
}

/** Human labels for badges, backlog "Type" column, and the checkout banner. */
export const DATA_SET_TYPE_LABELS: Record<DataSetType, string> = {
  MT940: 'MT940',
  MT942: 'MT942',
  INTERIM_MT940: 'Interim MT940',
  Ledger: 'Ledger (ERP)',
};

/**
 * A tagging workspace = one TagSpec library group. Rules authored in a
 * workspace tag transactions of its `dataSetTypes`. Today each workspace maps
 * to a single type; adding TransactionsList later is a one-line change —
 * give the MT940 workspace `dataSetTypes: ['MT940', 'TransactionsList']` (the
 * grid filter then pipe-joins them, which the IN operand already supports).
 */
export interface Workspace {
  id: string;
  label: string;
  dataSetTypes: DataSetType[];
}

export const WORKSPACES: Workspace[] = [
  { id: 'MT940', label: 'MT940', dataSetTypes: ['MT940'] },
  { id: 'MT942', label: 'MT942', dataSetTypes: ['MT942'] },
  { id: 'INTERIM_MT940', label: 'Interim MT940', dataSetTypes: ['INTERIM_MT940'] },
  { id: 'Ledger', label: 'Ledger (ERP)', dataSetTypes: ['Ledger'] },
];

/** Every DataSetType the app fetches libraries / backlog stats for. */
export const ALL_LIBRARY_DATA_SET_TYPES: DataSetType[] = WORKSPACES.flatMap((w) => w.dataSetTypes);

/**
 * Grid/export scope filter for a DataSetType (or several, pipe-joined for a
 * multi-type workspace). The IN operand splits on `|`, never a comma — a comma
 * would become part of a single value that matches nothing.
 */
export function dataSetTypeFilter(types: string | string[]): FilterProperty {
  const value = Array.isArray(types) ? types.join('|') : types;
  return { ColumnName: DATA_SET_TYPE_COLUMN, Value: value, Operand: 'IN' };
}
