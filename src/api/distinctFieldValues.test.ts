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
          TotalNotTagged: 0,
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

  it('returns the parsed Result on a successful response', async () => {
    const result = {
      Items: [
        { FieldValue: 'INV-001', Count: 5, IsValid: true },
        { FieldValue: 'BAD', Count: 2, IsValid: false },
        { FieldValue: 'OTHER', Count: 1, IsValid: null },
      ],
      TotalDistinctCount: 3,
      TotalValidated: 1,
      TotalNotValid: 1,
      TotalNotTagged: 1,
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Result: result }));

    const got = await getDistinctFieldValues(
      { FieldName: 'TransactionDetails' },
      TOKEN,
      tepHeaders,
    );
    expect(got).toEqual(result);
  });

  it('short-circuits SFM_NO_TRANSACTIONS_FOUND to an empty result without throwing', async () => {
    // Backend sends 404-ish status with this SFM constant when the filtered
    // dataset is empty; the client must treat it as a normal empty response.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ SFM: { Constant: 'SFM_NO_TRANSACTIONS_FOUND' } }, 404),
    );
    const got = await getDistinctFieldValues(
      { FieldName: 'TransactionDetails' },
      TOKEN,
      tepHeaders,
    );
    expect(got).toEqual({
      Items: [],
      TotalDistinctCount: 0,
      TotalValidated: 0,
      TotalNotValid: 0,
      TotalNotTagged: 0,
    });
  });

  it('throws on a non-ok response without the SFM short-circuit constant', async () => {
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
    expect(got).toEqual({
      Items: [],
      TotalDistinctCount: 0,
      TotalValidated: 0,
      TotalNotValid: 0,
      TotalNotTagged: 0,
    });
  });
});
