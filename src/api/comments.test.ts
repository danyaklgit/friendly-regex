import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import {
  getTagSpecComments,
  setTagSpecComment,
  replyTagSpecComment,
} from './comments';
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('comments API helpers', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getTagSpecComments', () => {
    it('POSTs to /GetTagSpecComments with the target body', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ Comments: [] }));
      await getTagSpecComments({ TagSpecLibraryId: 'lib-1' }, TOKEN, tepHeaders);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/GetTagSpecComments`);
      expect(init.method).toBe('POST');

      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(headers.ActivityTag).toBe('GetTagSpecComments');

      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ Target: { TagSpecLibraryId: 'lib-1' } });
    });

    it('returns an empty array when the response has no Comments field', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      const result = await getTagSpecComments({ TagSpecLibraryId: 'lib-1' }, TOKEN, tepHeaders);
      expect(result).toEqual([]);
    });

    it('returns the Comments array from the response', async () => {
      const comments = [
        {
          Id: 'c1',
          Status: 'ACTIVE',
          Comment: 'hello',
          ReportedByUserId: 'u1',
          Target: { TagSpecLibraryId: 'lib-1' },
        },
      ];
      fetchSpy.mockResolvedValueOnce(jsonResponse({ Comments: comments }));
      const result = await getTagSpecComments({ TagSpecLibraryId: 'lib-1' }, TOKEN, tepHeaders);
      expect(result).toEqual(comments);
    });

    it('throws when the response is not ok', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
      await expect(
        getTagSpecComments({ TagSpecLibraryId: 'lib-1' }, TOKEN, tepHeaders),
      ).rejects.toThrow();
    });
  });

  describe('setTagSpecComment', () => {
    it('sends Id=null for create with full Comment payload', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      await setTagSpecComment(
        {
          Id: null,
          Status: 'ACTIVE',
          Comment: 'Hello @bob',
          ReportedByUserId: 'u1',
          ReportedToUserIds: ['u2'],
          Target: { TagSpecLibraryId: 'lib-1', TagSpecDefinitionId: 'def-1' },
        },
        TOKEN,
        tepHeaders,
      );

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/SetTagSpecComment`);
      const body = JSON.parse(init.body as string);
      expect(body.Comment.Id).toBeNull();
      expect(body.Comment.Comment).toBe('Hello @bob');
      expect(body.Comment.ReportedToUserIds).toEqual(['u2']);
      expect(body.Comment.Target).toEqual({
        TagSpecLibraryId: 'lib-1',
        TagSpecDefinitionId: 'def-1',
      });
    });

    it('sends Id set for update', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      await setTagSpecComment(
        {
          Id: 'existing-id',
          Status: 'ACTIVE',
          Comment: 'edited',
          ReportedByUserId: 'u1',
          ReportedToUserIds: [],
          Target: { TagSpecLibraryId: 'lib-1' },
        },
        TOKEN,
        tepHeaders,
      );

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.Comment.Id).toBe('existing-id');
      expect(body.Comment.Comment).toBe('edited');
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 400));
      await expect(
        setTagSpecComment(
          {
            Id: null,
            Status: 'ACTIVE',
            Comment: 'x',
            ReportedByUserId: 'u1',
            ReportedToUserIds: [],
            Target: { TagSpecLibraryId: 'lib-1' },
          },
          TOKEN,
          tepHeaders,
        ),
      ).rejects.toThrow();
    });
  });

  describe('replyTagSpecComment', () => {
    it.each(['ACKNOWLEDGED', 'RESOLVED', 'REJECTED'])(
      'sends Status=%s with null ParentReplyId and empty mentions by default',
      async (status) => {
        fetchSpy.mockResolvedValueOnce(jsonResponse({}));
        await replyTagSpecComment(
          'c1',
          { UserId: 'u2', Status: status, Comment: 'response' },
          TOKEN,
          tepHeaders,
        );

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BASE}/ReplyTagSpecComment`);
        const body = JSON.parse(init.body as string);
        expect(body).toEqual({
          CommentId: 'c1',
          ParentReplyId: null,
          ReportedToUserIds: [],
          Reply: { UserId: 'u2', Status: status, Comment: 'response', ReportedToUserIds: [] },
        });
      },
    );

    it('forwards ParentReplyId and mention ids when provided', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      await replyTagSpecComment(
        'c1',
        { UserId: 'u2', Status: 'ACKNOWLEDGED', Comment: 'hey @alice', ReportedToUserIds: ['u3'] },
        TOKEN,
        tepHeaders,
        { parentReplyId: 'r-parent' },
      );

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.CommentId).toBe('c1');
      expect(body.ParentReplyId).toBe('r-parent');
      expect(body.ReportedToUserIds).toEqual(['u3']);
      expect(body.Reply.ReportedToUserIds).toEqual(['u3']);
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
      await expect(
        replyTagSpecComment(
          'c1',
          { UserId: 'u2', Status: 'ACKNOWLEDGED', Comment: 'x' },
          TOKEN,
          tepHeaders,
        ),
      ).rejects.toThrow();
    });
  });
});
