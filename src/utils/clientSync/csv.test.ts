import { describe, it, expect } from 'vitest';
import { CLIENT_SYNC_CSV_FIXED_HEADERS, buildClientSyncCsv, buildClientSyncCsvTable, clientSyncCsvFileName } from './csv';
import { makeTransactionFixture } from './fixtures';

const FIXED_ROW = ['2026-10-15 06:55:02', 'INTERIM_TransactionsList', 'CR', '12500.00', 'SAR', 'AL FARIS CO', 'FT26288H51MC', 'IncomingTransfer', 'Promoted', 'Confirmed', 'C-100', 'SENT', '2026-10-15 06:55:35', 'SA0380000000608010167519', 'STMT-1'];
const kv = (Key: string, Value: string | null) => ({ Key, Value });
const NO_KB = { Status: 'NotEligible' as const, Certainty: '', CertaintyRank: 0, CustomerCode: null, CustomerNameEn: null, KbCustomerType: null };
const NO_OUT = { Status: 'NEVER' as const, LastCallUtc: null, LastError: null, ReceiptToPushMs: null };

describe('client sync CSV', () => {
  it('writes the fifteen fixed columns in order when each has data', () => {
    expect(CLIENT_SYNC_CSV_FIXED_HEADERS).toEqual(['Received', 'Feed', 'Side', 'Amount', 'Currency', 'Sender', 'Bank reference', 'Tag', 'KB status', 'KB certainty', 'KB customer', 'Out status', 'Out last call', 'IBAN', 'Statement']);
    const table = buildClientSyncCsvTable([makeTransactionFixture()], [], 'UTC');
    expect(table.headers).toEqual(CLIENT_SYNC_CSV_FIXED_HEADERS);
    expect(table.rows).toEqual([FIXED_ROW]);
  });

  it('follows AttributeColumns exactly (tag attributes, then kb_* by alternative) and reads every cell from WireAttributes', () => {
    const columns = ['SenderAccountNumber', 'SenderBank', 'kb_outlet_customer_code', 'kb_allocation_certainty', 'kb_outlet_customer_code_2', 'kb_allocation_certainty_2'];
    const table = buildClientSyncCsvTable([
      makeTransactionFixture({
        // Attributes / KbAttributes are deliberately different: the export must ignore them.
        Attributes: [{ Key: 'SenderBank', Value: 'IGNORED', IsMandatory: false, IsValid: true }],
        KbAttributes: [kv('kb_outlet_customer_code', 'IGNORED')],
        WireAttributes: [kv('SenderAccountNumber', '6080101'), kv('SenderBank', 'RJHI'), kv('kb_outlet_customer_code', '17600310125'), kv('kb_allocation_certainty', 'VERY STRONG'), kv('kb_outlet_customer_code_2', '17600310999'), kv('kb_allocation_certainty_2', 'WEAK')],
      }),
      makeTransactionFixture({ Id: 'tx-2', WireAttributes: [kv('SenderBank', 'SNB'), kv('kb_allocation_certainty', 'MODERATE')] }),
    ], columns, 'UTC');
    expect(table.headers.slice(CLIENT_SYNC_CSV_FIXED_HEADERS.length)).toEqual(columns);
    expect(table.rows[0].slice(FIXED_ROW.length)).toEqual(['6080101', 'RJHI', '17600310125', 'VERY STRONG', '17600310999', 'WEAK']);
    expect(table.rows[1].slice(FIXED_ROW.length)).toEqual(['', 'SNB', '', 'MODERATE', '', '']);
  });

  it('drops every column, fixed or attribute, that is blank on every exported row', () => {
    const table = buildClientSyncCsvTable([
      makeTransactionFixture({ IBAN: '', Kb: { ...NO_KB, Status: 'Pending' }, Out: NO_OUT, WireAttributes: [kv('SenderName', 'AL FARIS CO'), kv('Invoice', '   ')] }),
      makeTransactionFixture({ Id: 'tx-2', IBAN: '  ', Kb: NO_KB, Out: NO_OUT, WireAttributes: [kv('Invoice', null)] }),
    ], ['SenderName', 'Invoice', 'kb_customer_type'], 'UTC');
    expect(table.headers).toEqual(['Received', 'Feed', 'Side', 'Amount', 'Currency', 'Sender', 'Bank reference', 'Tag', 'KB status', 'Out status', 'Statement', 'SenderName']);
    expect(table.rows[0]).toEqual(['2026-10-15 06:55:02', 'INTERIM_TransactionsList', 'CR', '12500.00', 'SAR', 'AL FARIS CO', 'FT26288H51MC', 'IncomingTransfer', 'Pending', 'NEVER', 'STMT-1', 'AL FARIS CO']);
    expect(table.rows[1][table.rows[1].length - 1]).toBe('');
  });

  it('keeps a column when only one row has data in it', () => {
    const table = buildClientSyncCsvTable([
      makeTransactionFixture({ Kb: NO_KB }),
      makeTransactionFixture({ Id: 'tx-2' }),
    ], [], 'UTC');
    expect(table.headers).toContain('KB customer');
    expect(table.rows.map((r) => r[table.headers.indexOf('KB customer')])).toEqual(['', 'C-100']);
  });

  it('falls back to the first-seen wire order when the response carries no AttributeColumns', () => {
    const table = buildClientSyncCsvTable([
      makeTransactionFixture({ WireAttributes: [kv('SenderBank', 'RJHI'), kv('kb_outlet_customer_code', 'C-1')] }),
      makeTransactionFixture({ Id: 'tx-2', WireAttributes: [kv('SenderAccountNumber', '608'), kv('SenderBank', 'SNB')] }),
    ], [], 'UTC');
    expect(table.headers.slice(CLIENT_SYNC_CSV_FIXED_HEADERS.length)).toEqual(['SenderBank', 'kb_outlet_customer_code', 'SenderAccountNumber']);
  });

  it('suffixes an attribute key that clashes with a fixed header, and takes the first value of a repeated key', () => {
    const table = buildClientSyncCsvTable([
      makeTransactionFixture({ WireAttributes: [kv('side', 'X'), kv('side', 'Y')] }),
    ], ['side', 'side'], 'UTC');
    expect(table.headers.slice(CLIENT_SYNC_CSV_FIXED_HEADERS.length)).toEqual(['side (attribute)']);
    expect(table.rows[0][table.rows[0].length - 1]).toBe('X');
  });

  it('keeps the headers for an export with no rows', () => {
    expect(buildClientSyncCsvTable([], ['SenderName'], 'UTC').headers).toEqual([...CLIENT_SYNC_CSV_FIXED_HEADERS, 'SenderName']);
  });

  it('quotes commas and doubles quotes, and writes Untagged for untagged rows', () => {
    const csv = buildClientSyncCsv([
      makeTransactionFixture({ Sender: 'ACME, "THE" CO', IsUntagged: true, Tag: '', ReceivedAtUtc: null, Kb: NO_KB, Out: NO_OUT }),
    ], [], 'UTC');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Feed,Side,Amount,Currency,Sender,Bank reference,Tag,KB status,Out status,IBAN,Statement');
    expect(lines[1]).toBe('INTERIM_TransactionsList,CR,12500.00,SAR,"ACME, ""THE"" CO",FT26288H51MC,Untagged,NotEligible,NEVER,SA0380000000608010167519,STMT-1');
  });

  it('names the file after the client and range, sanitizing the id', () => {
    expect(clientSyncCsvFileName('ORG-1', '2026-10-01', '2026-10-10')).toBe('client-sync_ORG-1_2026-10-01_2026-10-10.csv');
    expect(clientSyncCsvFileName('acme co/ltd', '2026-10-15', '2026-10-15')).toBe('client-sync_acme_co_ltd_2026-10-15_2026-10-15.csv');
    expect(clientSyncCsvFileName('', '2026-10-15', '2026-10-15')).toBe('client-sync_all_2026-10-15_2026-10-15.csv');
  });
});
