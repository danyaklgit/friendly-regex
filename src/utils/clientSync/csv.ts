import type { ClientSyncTransaction } from '../../api/clientSync';
import { toCsv, downloadCsv } from '../exportCsv';
import { formatLocalTime } from './format';

/**
 * Client Sync list export (spec 7.5, attribute columns per
 * UI_ClientSync_FiltersAndExport section 3). Times carry their date so the
 * file is unambiguous. After the fixed columns come one column per attribute
 * key seen across the exported rows: the published tag's attributes, then the
 * knowledge base's kb_* keys, each group sorted with localeCompare. A key
 * equal to a fixed header (case-insensitively) is suffixed " (attribute)"; a
 * knowledge-base key equal to a tag-attribute key is suffixed
 * " (knowledge base)" so no two columns share a header.
 */

export const CLIENT_SYNC_CSV_FIXED_HEADERS = [
  'Received', 'Feed', 'Side', 'Amount', 'Currency', 'Sender', 'Bank reference', 'Tag',
  'KB status', 'KB certainty', 'KB customer', 'Out status', 'Out last call', 'IBAN', 'Statement',
];

type Cell = string | number | null;

interface KeyedValue { Key: string; Value: string | null }

export interface ClientSyncCsvTable {
  headers: string[];
  rows: Cell[][];
}

function sortedKeys(rows: readonly ClientSyncTransaction[], pick: (t: ClientSyncTransaction) => readonly KeyedValue[]): string[] {
  const keys = new Set<string>();
  for (const t of rows) for (const a of pick(t)) if (a.Key) keys.add(a.Key);
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/** First occurrence of each key wins; a null value reads as blank. */
function valuesByKey(list: readonly KeyedValue[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of list) if (a.Key && !map.has(a.Key)) map.set(a.Key, a.Value ?? '');
  return map;
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

export function buildClientSyncCsvTable(rows: readonly ClientSyncTransaction[], timeZone?: string): ClientSyncCsvTable {
  const tagKeys = sortedKeys(rows, (t) => t.Attributes);
  const kbKeys = sortedKeys(rows, (t) => t.KbAttributes);
  const fixed = new Set(CLIENT_SYNC_CSV_FIXED_HEADERS.map((h) => h.toLowerCase()));
  const tagSet = new Set(tagKeys.map((k) => k.toLowerCase()));
  const headers = [
    ...CLIENT_SYNC_CSV_FIXED_HEADERS,
    ...tagKeys.map((k) => (fixed.has(k.toLowerCase()) ? `${k} (attribute)` : k)),
    ...kbKeys.map((k) => (fixed.has(k.toLowerCase()) ? `${k} (attribute)` : tagSet.has(k.toLowerCase()) ? `${k} (knowledge base)` : k)),
  ];
  return {
    headers,
    rows: rows.map((t) => {
      const tagValues = valuesByKey(t.Attributes);
      const kbValues = valuesByKey(t.KbAttributes);
      return [
        ...fixedCells(t, timeZone),
        ...tagKeys.map((k) => tagValues.get(k) ?? ''),
        ...kbKeys.map((k) => kbValues.get(k) ?? ''),
      ];
    }),
  };
}

export function buildClientSyncCsv(rows: readonly ClientSyncTransaction[], timeZone?: string): string {
  const table = buildClientSyncCsvTable(rows, timeZone);
  return toCsv(table.headers, table.rows);
}

export function clientSyncCsvFileName(orgId: string, from: string, to: string): string {
  const safe = orgId.replace(/[^A-Za-z0-9_-]+/g, '_') || 'all';
  return `client-sync_${safe}_${from}_${to}.csv`;
}

/** Downloads with a UTF-8 BOM (downloadCsv) so Excel opens Arabic values correctly. */
export function downloadClientSyncCsv(rows: readonly ClientSyncTransaction[], orgId: string, from: string, to: string): void {
  const table = buildClientSyncCsvTable(rows);
  downloadCsv(clientSyncCsvFileName(orgId, from, to), table.headers, table.rows);
}
