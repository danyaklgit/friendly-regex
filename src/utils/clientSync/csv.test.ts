import { describe, it, expect } from 'vitest';
import { CLIENT_SYNC_CSV_FIXED_HEADERS, buildClientSyncCsv, buildClientSyncCsvTable, clientSyncCsvFileName } from './csv';
import { makeTransactionFixture } from './fixtures';

const FIXED_ROW = ['2026-10-15 06:55:02', 'INTERIM_TransactionsList', 'CR', '12500.00', 'SAR', 'AL FARIS CO', 'FT26288H51MC', 'IncomingTransfer', 'Promoted', 'Confirmed', 'C-100', 'SENT', '2026-10-15 06:55:35', 'SA0380000000608010167519', 'STMT-1'];
const attr = (Key: string, Value: string | null) => ({ Key, Value, IsMandatory: false, IsValid: true });

describe('client sync CSV', () => {
  it('writes the fifteen fixed columns in order, with no attribute-count column', () => {
    expect(CLIENT_SYNC_CSV_FIXED_HEADERS).toEqual(['Received', 'Feed', 'Side', 'Amount', 'Currency', 'Sender', 'Bank reference', 'Tag', 'KB status', 'KB certainty', 'KB customer', 'Out status', 'Out last call', 'IBAN', 'Statement']);
    const table = buildClientSyncCsvTable([makeTransactionFixture()], 'UTC');
    expect(table.headers).toEqual(CLIENT_SYNC_CSV_FIXED_HEADERS);
    expect(table.rows).toEqual([FIXED_ROW]);
  });

  it('adds one column per key seen across rows: tag attributes then kb_* keys, each sorted with localeCompare, blanks where a row lacks the key', () => {
    const table = buildClientSyncCsvTable([
      makeTransactionFixture({
        Attributes: [attr('SenderName', 'AL FARIS CO'), attr('FXRate', '3.75'), attr('SenderAccountNumber', null)],
        KbAttributes: [{ Key: 'kb_outlet_customer_code', Value: 'C-100' }, { Key: 'kb_allocation_certainty', Value: 'CONFIRMED' }],
      }),
      makeTransactionFixture({
        Id: 'tx-2',
        Attributes: [attr('FinanceInstrument', 'SARIE')],
        KbAttributes: [{ Key: 'kb_displayed_customer_name_ar', Value: 'شركة الفارس' }],
      }),
    ], 'UTC');
    expect(table.headers.slice(CLIENT_SYNC_CSV_FIXED_HEADERS.length)).toEqual([
      'FinanceInstrument', 'FXRate', 'SenderAccountNumber', 'SenderName',
      'kb_allocation_certainty', 'kb_displayed_customer_name_ar', 'kb_outlet_customer_code',
    ]);
    expect(table.rows[0].slice(FIXED_ROW.length)).toEqual(['', '3.75', '', 'AL FARIS CO', 'CONFIRMED', '', 'C-100']);
    expect(table.rows[1].slice(FIXED_ROW.length)).toEqual(['SARIE', '', '', '', '', 'شركة الفارس', '']);
  });

  it('suffixes keys that clash with a fixed header or with a tag-attribute key, so headers stay unique', () => {
    const table = buildClientSyncCsvTable([
      makeTransactionFixture({
        Attributes: [attr('side', 'X'), attr('Shared', 'from tag')],
        KbAttributes: [{ Key: 'Tag', Value: 'Y' }, { Key: 'Shared', Value: 'from kb' }],
      }),
    ], 'UTC');
    const extra = table.headers.slice(CLIENT_SYNC_CSV_FIXED_HEADERS.length);
    expect(extra).toEqual(['Shared', 'side (attribute)', 'Shared (knowledge base)', 'Tag (attribute)']);
    expect(new Set(table.headers).size).toBe(table.headers.length);
    expect(table.rows[0].slice(FIXED_ROW.length)).toEqual(['from tag', 'X', 'from kb', 'Y']);
  });

  it('takes the first value when a row repeats a key, and ignores attributes without a key', () => {
    const table = buildClientSyncCsvTable([
      makeTransactionFixture({ Attributes: [attr('SenderName', 'FIRST'), attr('SenderName', 'SECOND'), attr('', 'orphan')] }),
    ], 'UTC');
    expect(table.headers.slice(CLIENT_SYNC_CSV_FIXED_HEADERS.length)).toEqual(['SenderName']);
    expect(table.rows[0].slice(FIXED_ROW.length)).toEqual(['FIRST']);
  });

  it('quotes commas and doubles quotes, writes Untagged for untagged rows, and empties for null times and customers', () => {
    const csv = buildClientSyncCsv([
      makeTransactionFixture({ Sender: 'ACME, "THE" CO', IsUntagged: true, Tag: '', ReceivedAtUtc: null, Kb: { Status: 'NotEligible', Certainty: '', CertaintyRank: 0, CustomerCode: null, CustomerNameEn: null }, Out: { Status: 'NEVER', LastCallUtc: null, LastError: null, ReceiptToPushMs: null } }),
    ], 'UTC');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(CLIENT_SYNC_CSV_FIXED_HEADERS.join(','));
    expect(lines[1]).toBe(',INTERIM_TransactionsList,CR,12500.00,SAR,"ACME, ""THE"" CO",FT26288H51MC,Untagged,NotEligible,,,NEVER,,SA0380000000608010167519,STMT-1');
  });

  it('names the file after the client and range, sanitizing the id', () => {
    expect(clientSyncCsvFileName('ORG-1', '2026-10-01', '2026-10-10')).toBe('client-sync_ORG-1_2026-10-01_2026-10-10.csv');
    expect(clientSyncCsvFileName('acme co/ltd', '2026-10-15', '2026-10-15')).toBe('client-sync_acme_co_ltd_2026-10-15_2026-10-15.csv');
    expect(clientSyncCsvFileName('', '2026-10-15', '2026-10-15')).toBe('client-sync_all_2026-10-15_2026-10-15.csv');
  });
});
