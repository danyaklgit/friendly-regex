import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { searchTagSpecComments } from './searchComments';
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

describe('searchTagSpecComments', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs to /SearchTagSpecComments with only SearchText when target is null', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Results: [] }));
    await searchTagSpecComments('IBAN', null, TOKEN, tepHeaders);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/SearchTagSpecComments`);
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.ActivityTag).toBe('SearchTagSpecComments');

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ SearchText: 'IBAN' });
    expect('Target' in body).toBe(false);
  });

  it('normalises a partial Target so absent fields become explicit null', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Results: [] }));
    await searchTagSpecComments(
      'mandatory',
      { TagSpecLibraryId: 'lib-1' },
      TOKEN,
      tepHeaders,
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.SearchText).toBe('mandatory');
    expect(body.Target).toEqual({
      TagSpecLibraryId: 'lib-1',
      TagSpecDefinitionId: null,
      TagRuleExpressionId: null,
      AttributeTag: null,
    });
  });

  it('passes through fully populated Target fields', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Results: [] }));
    await searchTagSpecComments(
      'foo',
      {
        TagSpecLibraryId: 'lib-1',
        TagSpecDefinitionId: 'def-1',
        TagRuleExpressionId: 'rule-1',
        AttributeTag: 'Amount',
      },
      TOKEN,
      tepHeaders,
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.Target).toEqual({
      TagSpecLibraryId: 'lib-1',
      TagSpecDefinitionId: 'def-1',
      TagRuleExpressionId: 'rule-1',
      AttributeTag: 'Amount',
    });
  });

  it('returns the Results array from the response', async () => {
    const results = [
      {
        Id: 'm1',
        RootCommentId: 'm1',
        ReplyPath: [],
        Comment: 'IBAN regex too broad',
        AuthorUserId: 'u1',
        CreationDate: '2025-05-10T14:22:00Z',
        Status: 'ACTIVE',
        Target: {
          TagSpecLibraryId: 'lib-1',
          TagSpecDefinitionId: 'def-1',
          TagRuleExpressionId: 'rule-1',
          AttributeTag: null,
        },
        RootCommentPreview: 'IBAN regex too broad...',
        Depth: 0,
      },
    ];
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Results: results }));
    const out = await searchTagSpecComments('IBAN', null, TOKEN, tepHeaders);
    expect(out).toEqual(results);
  });

  it('returns an empty array when the SFM constant is SFM_NO_TAG_SPEC_COMMENTS_FOUND', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ SFM: { Constant: 'SFM_NO_TAG_SPEC_COMMENTS_FOUND' } }, 404),
    );
    const out = await searchTagSpecComments('nothingmatches', null, TOKEN, tepHeaders);
    expect(out).toEqual([]);
  });

  it('throws when the response is not ok and the SFM constant is something else', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      searchTagSpecComments('foo', null, TOKEN, tepHeaders),
    ).rejects.toThrow();
  });

  it('threads the AbortSignal through fetch', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Results: [] }));
    const controller = new AbortController();
    await searchTagSpecComments('foo', null, TOKEN, tepHeaders, controller.signal);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
