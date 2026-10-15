import { describe, it, expect } from 'vitest';
import { CLIENT_SYNC_CSV_HEADERS, buildClientSyncCsv, clientSyncCsvFileName, transactionsToCsvRows } from './csv';
import { makeTransactionFixture } from './fixtures';

describe('client sync CSV', () => {
  it('writes the sixteen documented columns in order', () => {
    expect(CLIENT_SYNC_CSV_HEADERS).toEqual(['Received', 'Feed', 'Side', 'Amount', 'Currency', 'Sender', 'Bank reference', 'Tag', 'Attributes', 'KB status', 'KB certainty', 'KB customer', 'Out status', 'Out last call', 'IBAN', 'Statement']);
    const [row] = transactionsToCsvRows([makeTransactionFixture()], 'UTC');
    expect(row).toEqual(['2026-10-15 06:55:02', 'INTERIM_TransactionsList', 'CR', '12500.00', 'SAR', 'AL FARIS CO', 'FT26288H51MC', 'IncomingTransfer', 3, 'Promoted', 'Confirmed', 'C-100', 'SENT', '2026-10-15 06:55:35', 'SA0380000000608010167519', 'STMT-1']);
  });

  it('quotes commas and doubles quotes, writes Untagged for untagged rows, and empties for null times and customers', () => {
    const csv = buildClientSyncCsv([
      makeTransactionFixture({ Sender: 'ACME, "THE" CO', IsUntagged: true, Tag: '', ReceivedAtUtc: null, Kb: { Status: 'NotEligible', Certainty: '', CertaintyRank: 0, CustomerCode: null, CustomerNameEn: null }, Out: { Status: 'NEVER', LastCallUtc: null, LastError: null, ReceiptToPushMs: null } }),
    ], 'UTC');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(CLIENT_SYNC_CSV_HEADERS.join(','));
    expect(lines[1]).toBe(',INTERIM_TransactionsList,CR,12500.00,SAR,"ACME, ""THE"" CO",FT26288H51MC,Untagged,3,NotEligible,,,NEVER,,SA0380000000608010167519,STMT-1');
  });

  it('names the file after the client and range, sanitizing the id', () => {
    expect(clientSyncCsvFileName('ORG-1', '2026-10-01', '2026-10-10')).toBe('client-sync_ORG-1_2026-10-01_2026-10-10.csv');
    expect(clientSyncCsvFileName('acme co/ltd', '2026-10-15', '2026-10-15')).toBe('client-sync_acme_co_ltd_2026-10-15_2026-10-15.csv');
    expect(clientSyncCsvFileName('', '2026-10-15', '2026-10-15')).toBe('client-sync_all_2026-10-15_2026-10-15.csv');
  });
});
