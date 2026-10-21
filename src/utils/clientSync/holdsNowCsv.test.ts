import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHoldsNowCsvRows, downloadHoldsNowCsv, holdsNowCsvFileName, holdsNowHasContent, HOLDS_NOW_CSV_HEADERS } from './holdsNowCsv';
import { makeTraceFixture, makeCurrentViewFixture } from './fixtures';
import { downloadCsv } from '../exportCsv';

vi.mock('../exportCsv', () => ({ downloadCsv: vi.fn() }));

/** The list as sent to BwaTech, in a deliberately different order from the grouped view. */
const SENT = [
  { Key: 'kb_ho_customer_code', Value: '11223344556' },
  { Key: 'SenderAccountNumber', Value: 'SA4180000123456789012345' },
  { Key: 'kb_customer_type', Value: 'TC' },
  { Key: 'kb_displayed_customer_code', Value: '11223344556' },
  { Key: 'kb_new_signal_2', Value: 'x7' },
  { Key: 'SenderBank', Value: '80' },
];
const out = { ...makeTraceFixture().Out, CurrentAttributes: SENT };

describe('buildHoldsNowCsvRows', () => {
  it('writes the three Transaction rows, then TEP, Displayed and each match in on-screen order, parties before fields', () => {
    const rows = buildHoldsNowCsvRows('tx-1', out);
    expect(rows.slice(0, 3)).toEqual([
      ['Transaction', null, null, null, 'Transaction id', 'TransactionId', 'tx-1', null],
      ['Transaction', null, null, null, 'Tag', 'tag', 'IncomingTransfer', null],
      ['Transaction', null, null, null, 'Deleted at BwaTech', 'DeletedAtBwatech', 'No', null],
    ]);
    expect(rows.map((r) => r[0])).toEqual([
      ...Array(3).fill('Transaction'), ...Array(3).fill('TEP'), ...Array(5).fill('Displayed'), ...Array(8).fill('Match'), ...Array(6).fill('Match'),
    ]);
    const keys = rows.map((r) => r[5]);
    expect(keys.slice(3, 6)).toEqual(['SenderAccountNumber', 'SenderBank', 'SenderName']);
    expect(keys.slice(11, 19)).toEqual([
      'kb_franchise_customer_code', 'kb_franchise_customer_name_en', 'kb_franchise_customer_name_ar',
      'kb_ho_customer_code', 'kb_ho_customer_name_en', 'kb_ho_customer_name_ar',
      'kb_customer_type', 'kb_allocation_certainty',
    ]);
    expect(rows.find((r) => r[5] === 'kb_ho_customer_code')).toEqual(['Match', 0, '', 'Head office', 'Code', 'kb_ho_customer_code', '11223344556', 1]);
    expect(rows.find((r) => r[5] === 'kb_franchise_customer_code')).toEqual(['Match', 0, '', 'Franchise', 'Code', 'kb_franchise_customer_code', '11223', null]);
    expect(rows.find((r) => r[5] === 'kb_customer_type')).toEqual(['Match', 0, '', null, 'Customer type', 'kb_customer_type', 'TC', 3]);
    expect(rows.find((r) => r[5] === 'kb_new_signal_2')).toEqual(['Match', 2, '_2', null, '', 'kb_new_signal_2', 'x7', 5]);
    expect(rows.find((r) => r[5] === 'kb_displayed_customer_code')).toEqual(['Displayed', null, null, null, 'Code', 'kb_displayed_customer_code', '11223344556', 4]);
    expect(rows.find((r) => r[5] === 'SenderName')).toEqual(['TEP', null, null, null, '', 'SenderName', 'AL NOOR INTERNATIONAL CO', null]);
  });

  it('gives every sent attribute exactly one row whose Sent order is its position, and appends one the grouped view does not place', () => {
    const extra = [...SENT, { Key: 'kb_orphan', Value: null }];
    const rows = buildHoldsNowCsvRows('tx-1', { ...out, CurrentAttributes: extra });
    extra.forEach((a, i) => {
      const matches = rows.filter((r) => r[5] === a.Key);
      expect(matches).toHaveLength(1);
      expect(matches[0][7]).toBe(i + 1);
    });
    expect(rows[rows.length - 1]).toEqual(['', null, null, null, '', 'kb_orphan', '', 7]);
  });

  it('without a grouped view writes the sent list as is, sections blank, Sent order 1, 2, 3', () => {
    const rows = buildHoldsNowCsvRows('tx-1', { ...out, CurrentView: null, CurrentTag: null, DeletedAtBwatech: true });
    expect(rows).toHaveLength(3 + SENT.length);
    expect(rows[1]).toEqual(['Transaction', null, null, null, 'Tag', 'tag', '', null]);
    expect(rows[2][6]).toBe('Yes');
    expect(rows[3]).toEqual(['', null, null, null, '', 'kb_ho_customer_code', '11223344556', 1]);
    expect(rows[rows.length - 1]).toEqual(['', null, null, null, '', 'SenderBank', '80', SENT.length]);
  });
});

describe('holdsNowHasContent', () => {
  it('is false with no tag and nothing held, true with a tag, a sent attribute or a grouped attribute', () => {
    const empty = { ...out, CurrentTag: null, CurrentAttributes: [], CurrentView: null };
    expect(holdsNowHasContent(empty)).toBe(false);
    expect(holdsNowHasContent({ ...empty, CurrentView: { Tep: [], Displayed: null, Matches: [] } })).toBe(false);
    expect(holdsNowHasContent({ ...empty, CurrentTag: 'IncomingTransfer' })).toBe(true);
    expect(holdsNowHasContent({ ...empty, CurrentAttributes: [{ Key: 'payer_name', Value: 'X' }] })).toBe(true);
    expect(holdsNowHasContent({ ...empty, CurrentView: makeCurrentViewFixture({ Displayed: null, Matches: [] }) })).toBe(true);
  });
});

describe('holdsNowCsvFileName and downloadHoldsNowCsv', () => {
  beforeEach(() => vi.mocked(downloadCsv).mockClear());

  it('names the file after the transaction id, made safe', () => {
    expect(holdsNowCsvFileName('6ad1cc48da7c9b23f5ced317')).toBe('bwatech-holds-6ad1cc48da7c9b23f5ced317.csv');
    expect(holdsNowCsvFileName('a/b c')).toBe('bwatech-holds-a_b_c.csv');
    expect(holdsNowCsvFileName('')).toBe('bwatech-holds-transaction.csv');
  });

  it('hands the name, the eight headers and the rows to downloadCsv', () => {
    downloadHoldsNowCsv('tx-1', out);
    expect(downloadCsv).toHaveBeenCalledWith('bwatech-holds-tx-1.csv', HOLDS_NOW_CSV_HEADERS, buildHoldsNowCsvRows('tx-1', out));
    expect(HOLDS_NOW_CSV_HEADERS).toEqual(['Section', 'Match', 'Suffix', 'Party', 'Label', 'Key', 'Value', 'Sent order']);
  });
});
