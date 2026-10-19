import type { ClientSyncTransaction } from '../../api/clientSync';
import { toCsv, downloadCsv } from '../exportCsv';
import { formatLocalTime } from './format';

/**
 * Client Sync list export (spec 7.5; UI_ClientSync_CertaintyAndExportOrder
 * sections 2 and 3). Times carry their date so the file is unambiguous.
 *
 * After the fixed columns come the attribute columns in BwaTech's order: the
 * page's AttributeColumns (tag attributes, then kb_* of the best customer,
 * then every _2 key, every _3 key, ...), each cell read from the row's
 * WireAttributes, so a row's non-empty cells follow "What BwaTech holds now".
 * A key equal to a fixed header (case-insensitively) is suffixed
 * " (attribute)". Finally every column, fixed ones included, whose cells are
 * blank on every exported row is dropped, header and all.
 */

export const CLIENT_SYNC_CSV_FIXED_HEADERS = [
  'Received', 'Feed', 'Side', 'Amount', 'Currency', 'Sender', 'Bank reference', 'Tag',
  'KB status', 'KB certainty', 'KB customer', 'Out status', 'Out last call', 'IBAN', 'Statement',
];

type Cell = string | number | null;

export interface ClientSyncCsvTable {
  headers: string[];
  rows: Cell[][];
}

function isBlank(cell: Cell): boolean {
  return cell === null || String(cell).trim() === '';
}

function fixedCells(t: ClientSyncTransaction, timeZone?: string): Cell[] {
  return [
    formatLocalTime(t.ReceivedAtUtc, true, timeZone),
    t.DataSetType,
    t.Side,
    t.Amount.toFixed(2),
    t.CurrencyCode,
    t.Sender,
    t.BankReference,
    t.IsUntagged ? 'Untagged' : t.Tag,
    t.Kb.Status,
    t.Kb.Certainty,
    t.Kb.CustomerCode ?? '',
    t.Out.Status,
    formatLocalTime(t.Out.LastCallUtc, true, timeZone),
    t.IBAN,
    t.StatementId,
  ];
}

/** The given column order, de-duplicated; without one (older backend), the keys' first-seen order on the wire. */
function attributeKeys(rows: readonly ClientSyncTransaction[], attributeColumns: readonly string[]): string[] {
  const keys = new Set<string>();
  if (attributeColumns.length > 0) {
    for (const k of attributeColumns) if (k) keys.add(k);
  } else {
    for (const t of rows) for (const a of t.WireAttributes) if (a.Key) keys.add(a.Key);
  }
  return [...keys];
}

/** First occurrence of each key wins; a null value reads as blank. */
function wireValues(t: ClientSyncTransaction): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of t.WireAttributes) if (a.Key && !map.has(a.Key)) map.set(a.Key, a.Value ?? '');
  return map;
}

/** Drops every column whose cells are all blank. With no rows there is nothing to judge, so the headers stay. */
function dropEmptyColumns(table: ClientSyncCsvTable): ClientSyncCsvTable {
  if (table.rows.length === 0) return table;
  const keep = table.headers.map((_, i) => table.rows.some((row) => !isBlank(row[i])));
  return {
    headers: table.headers.filter((_, i) => keep[i]),
    rows: table.rows.map((row) => row.filter((_, i) => keep[i])),
  };
}

export function buildClientSyncCsvTable(
  rows: readonly ClientSyncTransaction[],
  attributeColumns: readonly string[],
  timeZone?: string,
): ClientSyncCsvTable {
  const keys = attributeKeys(rows, attributeColumns);
  const fixed = new Set(CLIENT_SYNC_CSV_FIXED_HEADERS.map((h) => h.toLowerCase()));
  return dropEmptyColumns({
    headers: [
      ...CLIENT_SYNC_CSV_FIXED_HEADERS,
      ...keys.map((k) => (fixed.has(k.toLowerCase()) ? `${k} (attribute)` : k)),
    ],
    rows: rows.map((t) => {
      const values = wireValues(t);
      return [...fixedCells(t, timeZone), ...keys.map((k) => values.get(k) ?? '')];
    }),
  });
}

export function buildClientSyncCsv(rows: readonly ClientSyncTransaction[], attributeColumns: readonly string[], timeZone?: string): string {
  const table = buildClientSyncCsvTable(rows, attributeColumns, timeZone);
  return toCsv(table.headers, table.rows);
}

export function clientSyncCsvFileName(orgId: string, from: string, to: string): string {
  const safe = orgId.replace(/[^A-Za-z0-9_-]+/g, '_') || 'all';
  return `client-sync_${safe}_${from}_${to}.csv`;
}

/** Downloads with a UTF-8 BOM (downloadCsv) so Excel opens Arabic values correctly. */
export function downloadClientSyncCsv(
  rows: readonly ClientSyncTransaction[],
  attributeColumns: readonly string[],
  orgId: string,
  from: string,
  to: string,
): void {
  const table = buildClientSyncCsvTable(rows, attributeColumns);
  downloadCsv(clientSyncCsvFileName(orgId, from, to), table.headers, table.rows);
}
