import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import {
  exportTepTransactions,
  getDownloadCenterFiles,
  downloadTepTransactions,
  deleteDownloadCenterFile,
  clearDownloadCenterFiles,
} from './downloadCenter';
import type { TepHeaders } from './transactions';

const tepHeaders: TepHeaders = {
  userId: 'user-1',
  tenantCode: 'TENANT',
  languageCode: 'en',
  timeZone: 'UTC',
  requestId: 'req-1',
};

const TOKEN = 'test-token';
const BASE = '/api/tep/api/v1/TEP';

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  });
}

function csvResponse(text: string, filename?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'text/csv; charset=utf-8' };
  if (filename) headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  return new Response(text, { status: 200, headers });
}

describe('downloadCenter API helpers', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('exportTepTransactions', () => {
    it('POSTs to /ExportTEPTransactions with the request body and returns FileId', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ FileId: 'file-123' }));
      const result = await exportTepTransactions(
        {
          FilteringProperties: [{ ColumnName: 'BankSwiftCode', Value: 'NCBKSAJE', Operand: 'EQ' }],
          SortingProperties: [{ ColumnName: 'ValueDate', SortingLevel: 1, SortingOrder: 'DESC' }],
        },
        TOKEN,
        tepHeaders,
      );

      expect(result.FileId).toBe('file-123');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/ExportTEPTransactions`);
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(headers.ActivityTag).toBe('ExportTEPTransactions');
      const body = JSON.parse(init.body as string);
      expect(body.FilteringProperties[0].ColumnName).toBe('BankSwiftCode');
      expect(body.SortingProperties[0].ColumnName).toBe('ValueDate');
    });

    it('throws when the server omits FileId', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      await expect(
        exportTepTransactions({}, TOKEN, tepHeaders),
      ).rejects.toThrow(/FileId/i);
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
      await expect(
        exportTepTransactions({}, TOKEN, tepHeaders),
      ).rejects.toThrow();
    });
  });

  describe('getDownloadCenterFiles', () => {
    it('POSTs to /GetDownloadCenterFiles and returns the Files array', async () => {
      const files = [
        { Id: 'f1', UserId: 'u1', FileType: 'MT940_EXPORT', Status: 'READY', FileName: 'a.csv', CreatedDate: '2025-07-15T14:30:22Z' },
      ];
      fetchSpy.mockResolvedValueOnce(jsonResponse({ Files: files }));
      const result = await getDownloadCenterFiles(TOKEN, tepHeaders);
      expect(result).toEqual(files);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/GetDownloadCenterFiles`);
      expect((init.headers as Record<string, string>).ActivityTag).toBe('GetDownloadCenterFiles');
    });

    it('short-circuits SFM_NO_DOWNLOAD_CENTER_FILES_FOUND to an empty array', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ SFM: { Constant: 'SFM_NO_DOWNLOAD_CENTER_FILES_FOUND' } }, 404),
      );
      const result = await getDownloadCenterFiles(TOKEN, tepHeaders);
      expect(result).toEqual([]);
    });

    it('returns an empty array when 200 OK has no Files field', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      const result = await getDownloadCenterFiles(TOKEN, tepHeaders);
      expect(result).toEqual([]);
    });

    it('throws on non-ok without the SFM short-circuit', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
      await expect(getDownloadCenterFiles(TOKEN, tepHeaders)).rejects.toThrow();
    });
  });

  describe('downloadTepTransactions', () => {
    it('returns kind="ready" with blob + filename when Content-Type is text/csv', async () => {
      fetchSpy.mockResolvedValueOnce(csvResponse('Id,Amount\n1,100', 'MT940_Export_2025.csv'));
      const result = await downloadTepTransactions('file-1', TOKEN, tepHeaders);
      expect(result.kind).toBe('ready');
      if (result.kind === 'ready') {
        expect(result.suggestedFilename).toBe('MT940_Export_2025.csv');
        expect(result.blob).toBeInstanceOf(Blob);
      }
    });

    it('returns kind="ready" with fallback filename when Content-Disposition is missing', async () => {
      fetchSpy.mockResolvedValueOnce(csvResponse('Id,Amount\n1,100'));
      const result = await downloadTepTransactions('file-1', TOKEN, tepHeaders);
      expect(result.kind).toBe('ready');
      if (result.kind === 'ready') {
        expect(result.suggestedFilename).toBe('MT940_Export_file-1.csv');
      }
    });

    it('returns kind="in_progress" for SFM_EXPORT_STILL_IN_PROGRESS', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          File: { Id: 'file-1', Status: 'INPROGRESS', FileName: 'a.csv', CreatedDate: '2025-07-15T14:30:22Z' },
          SFM: { Constant: 'SFM_EXPORT_STILL_IN_PROGRESS' },
        }),
      );
      const result = await downloadTepTransactions('file-1', TOKEN, tepHeaders);
      expect(result.kind).toBe('in_progress');
      if (result.kind === 'in_progress') {
        expect(result.file?.Status).toBe('INPROGRESS');
      }
    });

    it('returns kind="failed" with the file ErrorMessage for SFM_EXPORT_FAILED', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          File: { Id: 'file-1', Status: 'FAILED', FileName: 'a.csv', CreatedDate: '2025-07-15T14:30:22Z', ErrorMessage: 'Disk full' },
          SFM: { Constant: 'SFM_EXPORT_FAILED' },
        }),
      );
      const result = await downloadTepTransactions('file-1', TOKEN, tepHeaders);
      expect(result.kind).toBe('failed');
      if (result.kind === 'failed') {
        expect(result.message).toBe('Disk full');
      }
    });

    it('returns kind="not_found" for SFM_EXPORT_NOT_FOUND', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ SFM: { Constant: 'SFM_EXPORT_NOT_FOUND' } }),
      );
      const result = await downloadTepTransactions('file-1', TOKEN, tepHeaders);
      expect(result.kind).toBe('not_found');
    });

    it('POSTs the FileId in the body and sets ActivityTag', async () => {
      fetchSpy.mockResolvedValueOnce(csvResponse('h\n'));
      await downloadTepTransactions('file-xyz', TOKEN, tepHeaders);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/DownloadTEPTransactions`);
      expect(JSON.parse(init.body as string)).toEqual({ FileId: 'file-xyz' });
      expect((init.headers as Record<string, string>).ActivityTag).toBe('DownloadTEPTransactions');
    });
  });

  describe('deleteDownloadCenterFile', () => {
    it('POSTs to /DeleteDownloadCenterFile with FileId', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ SFM: { Constant: 'SFM_DOWNLOAD_CENTER_FILE_DELETED' } }));
      await deleteDownloadCenterFile('file-1', TOKEN, tepHeaders);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/DeleteDownloadCenterFile`);
      expect(JSON.parse(init.body as string)).toEqual({ FileId: 'file-1' });
      expect((init.headers as Record<string, string>).ActivityTag).toBe('DeleteDownloadCenterFile');
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
      await expect(deleteDownloadCenterFile('file-1', TOKEN, tepHeaders)).rejects.toThrow();
    });
  });

  describe('clearDownloadCenterFiles', () => {
    it('POSTs to /ClearDownloadCenterFiles with an empty body', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ SFM: { Constant: 'SFM_DOWNLOAD_CENTER_FILES_CLEARED' } }));
      await clearDownloadCenterFiles(TOKEN, tepHeaders);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/ClearDownloadCenterFiles`);
      expect(JSON.parse(init.body as string)).toEqual({});
      expect((init.headers as Record<string, string>).ActivityTag).toBe('ClearDownloadCenterFiles');
    });
  });
});
