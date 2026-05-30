import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { getDistinctFieldValues } from './distinctFieldValues';
import type { TepHeaders } from './transactions';

const tepHeaders: TepHeaders = {
  apiKey: 'test-api-key',
  userId: 'user-1',
  tenantCode: 'TENANT',
  languageCode: 'en',
  timeZone: 'UTC',
  requestId: 'req-1',
};

const TOKEN = 'test-token';
const BASE = '/api/tep/api/v1/TEP';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getDistinctFieldValues', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs to /GetDistinctFieldValues with FieldName, filters, and pagination', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        Result: {
          Items: [],
          TotalDistinctCount: 0,
          TotalValidated: 0,
          TotalNotValid: 0,
          TotalNotValidated: 0,
        },
      }),
    );

    await getDistinctFieldValues(
      {
        FieldName: 'TransactionDetails',
        FilteringProperties: [
          { ColumnName: 'BankSwiftCode', Value: 'AAA', Operand: 'EQ' },
          { ColumnName: 'Side', Value: 'CR', Operand: 'EQ' },
        ],
        Pagination: { PageIndex: 0, PageSize: 250 },
      },
      TOKEN,
      tepHeaders,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/GetDistinctFieldValues`);
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.ActivityTag).toBe('GetDistinctFieldValues');
    expect(headers['x-apikey']).toBe('test-api-key');

    const body = JSON.parse(init.body as string);
    expect(body.FieldName).toBe('TransactionDetails');
    expect(body.FilteringProperties).toEqual([
      { ColumnName: 'BankSwiftCode', Value: 'AAA', Operand: 'EQ' },
      { ColumnName: 'Side', Value: 'CR', Operand: 'EQ' },
    ]);
    expect(body.Pagination).toEqual({ PageIndex: 0, PageSize: 250 });
  });

  it('returns the parsed Result on a successful response with new field names', async () => {
    const result = {
      Items: [
        { FieldValue: 'INV-001', Count: 5, IsValid: true },
        { FieldValue: 'BAD', Count: 2, IsValid: false },
        { FieldValue: 'OTHER', Count: 1, IsValid: null },
      ],
      TotalDistinctCount: 3,
      TotalValidated: 1,
      TotalNotValid: 1,
      TotalNotValidated: 1,
      DistinctValuesCount: 3,
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Result: result }));

    const got = await getDistinctFieldValues(
      { FieldName: 'TransactionDetails' },
      TOKEN,
      tepHeaders,
    );
    expect(got).toEqual(result);
  });

  it('back-fills new field names from deprecated aliases on a legacy response', async () => {
    // Backend still dual-emits the old names during the migration window;
    // the client must expose the new names regardless of which shape arrives.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        Result: {
          Items: [{ FieldValue: 'X', Count: 1, IsValid: null }],
          TotalDistinctCount: 1,
          TotalValidated: 0,
          TotalNotValid: 0,
          TotalNotTagged: 1,
          TransactionsCount: 1,
        },
      }),
    );
    const got = await getDistinctFieldValues(
      { FieldName: 'TransactionDetails' },
      TOKEN,
      tepHeaders,
    );
    expect(got.TotalNotValidated).toBe(1);
    expect(got.DistinctValuesCount).toBe(1);
  });

  it('short-circuits SFM_NO_DISTINCT_VALUES_FOUND to an empty result without throwing', async () => {
    // New SFM constant for the empty-result case after the 2026-05-30 rename.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ SFM: { Constant: 'SFM_NO_DISTINCT_VALUES_FOUND' } }, 404),
    );
    const got = await getDistinctFieldValues(
      { FieldName: 'TransactionDetails' },
      TOKEN,
      tepHeaders,
    );
    expect(got.Items).toEqual([]);
    expect(got.TotalNotValidated).toBe(0);
  });

  it('still accepts the legacy SFM_NO_TRANSACTIONS_FOUND constant during migration', async () => {
    // Old SFM kept working until the backend fully cuts over.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ SFM: { Constant: 'SFM_NO_TRANSACTIONS_FOUND' } }, 404),
    );
    const got = await getDistinctFieldValues(
      { FieldName: 'TransactionDetails' },
      TOKEN,
      tepHeaders,
    );
    expect(got.Items).toEqual([]);
    expect(got.TotalNotValidated).toBe(0);
  });

  it('throws on a non-ok response without an SFM short-circuit constant', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      getDistinctFieldValues({ FieldName: 'TransactionDetails' }, TOKEN, tepHeaders),
    ).rejects.toThrow();
  });

  it('returns the EMPTY result when 200 OK has no Result field', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const got = await getDistinctFieldValues(
      { FieldName: 'TransactionDetails' },
      TOKEN,
      tepHeaders,
    );
    expect(got.Items).toEqual([]);
    expect(got.TotalNotValidated).toBe(0);
  });
});
