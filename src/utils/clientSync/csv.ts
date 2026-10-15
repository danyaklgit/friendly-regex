import type { ClientSyncTransaction } from '../../api/clientSync';
import { toCsv, downloadCsv } from '../exportCsv';
import { formatLocalTime } from './format';

/** Export of the rows currently loaded in the Client Sync list (spec 7.5). Times carry their date so the file is unambiguous. */

export const CLIENT_SYNC_CSV_HEADERS = [
  'Received', 'Feed', 'Side', 'Amount', 'Currency', 'Sender', 'Bank reference', 'Tag', 'Attributes',
  'KB status', 'KB certainty', 'KB customer', 'Out status', 'Out last call', 'IBAN', 'Statement',
];

type Cell = string | number | null;

export function transactionsToCsvRows(rows: readonly ClientSyncTransaction[], timeZone?: string): Cell[][] {
  return rows.map((t) => [
    formatLocalTime(t.ReceivedAtUtc, true, timeZone),
    t.DataSetType,
    t.Side,
    t.Amount.toFixed(2),
    t.CurrencyCode,
    t.Sender,
    t.BankReference,
    t.IsUntagged ? 'Untagged' : t.Tag,
    t.AttributeCount,
    t.Kb.Status,
    t.Kb.Certainty,
    t.Kb.CustomerCode ?? '',
    t.Out.Status,
    formatLocalTime(t.Out.LastCallUtc, true, timeZone),
    t.IBAN,
    t.StatementId,
  ]);
}

export function buildClientSyncCsv(rows: readonly ClientSyncTransaction[], timeZone?: string): string {
  return toCsv(CLIENT_SYNC_CSV_HEADERS, transactionsToCsvRows(rows, timeZone));
}

export function clientSyncCsvFileName(orgId: string, from: string, to: string): string {
  const safe = orgId.replace(/[^A-Za-z0-9_-]+/g, '_') || 'all';
  return `client-sync_${safe}_${from}_${to}.csv`;
}

export function downloadClientSyncCsv(rows: readonly ClientSyncTransaction[], orgId: string, from: string, to: string): void {
  downloadCsv(clientSyncCsvFileName(orgId, from, to), CLIENT_SYNC_CSV_HEADERS, transactionsToCsvRows(rows));
}
