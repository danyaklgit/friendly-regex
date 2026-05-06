import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import {
  getIntegrationLogs,
  getIntegrationLogFile,
  rerunIntegrationRequest,
  type TepHeaders,
} from './transactions';

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

describe('integration log API helpers', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getIntegrationLogs', () => {
    it('POSTs to /GetIntegrationLogs with TEP headers and serialised body', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ Items: [], Total: 0, Page: 1, PageSize: 20 }),
      );

      await getIntegrationLogs(
        {
          Endpoint: 'ProcessTransactionsForTagging',
          StatementId: 'STMT-001',
          StatusType: 'ERROR',
          StatusCode: '500',
          FromDate: '2026-05-01T00:00:00',
          ToDate: '2026-05-06T23:59:59',
          Page: 1,
          PageSize: 20,
        },
        TOKEN,
        tepHeaders,
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/GetIntegrationLogs`);
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(headers.ActivityTag).toBe('GetIntegrationLogs');
      expect(headers['x-apikey']).toBe(tepHeaders.apiKey);
      expect(headers.LanguageCode).toBe(tepHeaders.languageCode);
      expect(headers.TTPUserId).toBe(tepHeaders.userId);
      expect(headers.TTPTenantCode).toBe(tepHeaders.tenantCode);
      expect(headers.TTPRequestId).toBe(tepHeaders.requestId);
      expect(headers.TimeZone).toBe(tepHeaders.timeZone);

      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        Endpoint: 'ProcessTransactionsForTagging',
        StatementId: 'STMT-001',
        StatusType: 'ERROR',
        StatusCode: '500',
        FromDate: '2026-05-01T00:00:00',
        ToDate: '2026-05-06T23:59:59',
        Page: 1,
        PageSize: 20,
      });
    });

    it('returns parsed Items, Total, Page, PageSize', async () => {
      const payload = {
        Items: [
          {
            Id: 'log-1',
            Endpoint: 'ProcessTransactionsForTagging',
            StatementId: 'STMT-001',
            RequestFilePath: '/req/1',
            ResponseFilePath: '/res/1',
            CallStartDate: '2026-05-06T10:00:00',
            CallEndDate: '2026-05-06T10:00:01',
            StatusType: 'SUCCESS',
            StatusCode: '200',
            StatusDescription: 'OK',
          },
        ],
        Total: 1,
        Page: 1,
        PageSize: 20,
      };
      fetchSpy.mockResolvedValueOnce(jsonResponse(payload));

      const result = await getIntegrationLogs({}, TOKEN, tepHeaders);
      expect(result).toEqual(payload);
    });

    it('throws via throwIfNotOk on non-2xx', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
      await expect(getIntegrationLogs({}, TOKEN, tepHeaders)).rejects.toThrow();
    });
  });

  describe('getIntegrationLogFile', () => {
    it('POSTs to /GetIntegrationLogFile with Id and FileType', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ Content: '{"x":1}' }));

      const result = await getIntegrationLogFile(
        { Id: 'log-1', FileType: 'REQUEST' },
        TOKEN,
        tepHeaders,
      );

      expect(result.Content).toBe('{"x":1}');
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/GetIntegrationLogFile`);
      const headers = init.headers as Record<string, string>;
      expect(headers.ActivityTag).toBe('GetIntegrationLogFile');
      expect(JSON.parse(init.body as string)).toEqual({
        Id: 'log-1',
        FileType: 'REQUEST',
      });
    });

    it('passes RESPONSE FileType through', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ Content: '' }));
      await getIntegrationLogFile(
        { Id: 'log-2', FileType: 'RESPONSE' },
        TOKEN,
        tepHeaders,
      );
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).FileType).toBe('RESPONSE');
    });
  });

  describe('rerunIntegrationRequest', () => {
    it('POSTs to /RerunIntegrationRequest with the log Id', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ SFM: { Major: { Constant: 'MAJ_SUCCESS' } } }));

      await rerunIntegrationRequest('log-3', TOKEN, tepHeaders);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/RerunIntegrationRequest`);
      const headers = init.headers as Record<string, string>;
      expect(headers.ActivityTag).toBe('RerunIntegrationRequest');
      expect(JSON.parse(init.body as string)).toEqual({ Id: 'log-3' });
    });

    it('throws on non-2xx', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'rerun failed' }, 500));
      await expect(rerunIntegrationRequest('log-3', TOKEN, tepHeaders)).rejects.toThrow();
    });
  });
});
