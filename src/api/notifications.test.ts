import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { getUserNotifications, setUserNotificationStatus } from './notifications';
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

describe('notifications API helpers', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getUserNotifications', () => {
    it('POSTs to /GetUserNotifications with the user id body', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ Notifications: [] }));
      await getUserNotifications('user-1', TOKEN, tepHeaders);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/GetUserNotifications`);
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.ActivityTag).toBe('GetUserNotifications');
      expect(JSON.parse(init.body as string)).toEqual({ UserId: 'user-1' });
    });

    it('returns the Notifications array from the response', async () => {
      const notifications = [
        {
          Id: 'n1',
          UserId: 'u1',
          Type: 'TAG_SPEC_COMMENT',
          Status: 'UNREAD',
          Title: 'You were mentioned',
          Body: '...',
        },
      ];
      fetchSpy.mockResolvedValueOnce(jsonResponse({ Notifications: notifications }));
      const result = await getUserNotifications('u1', TOKEN, tepHeaders);
      expect(result).toEqual(notifications);
    });

    it('treats SFM_NO_USER_NOTIFICATIONS_FOUND as empty success', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          Notifications: [],
          SFM: { Constant: 'SFM_NO_USER_NOTIFICATIONS_FOUND' },
        }, 200),
      );
      const result = await getUserNotifications('u1', TOKEN, tepHeaders);
      expect(result).toEqual([]);
    });

    it('throws on a non-2xx error response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
      await expect(getUserNotifications('u1', TOKEN, tepHeaders)).rejects.toThrow();
    });
  });

  describe('setUserNotificationStatus', () => {
    it.each(['READ', 'UNREAD', 'DELETED'] as const)(
      'sends Status=%s in the body',
      async (status) => {
        fetchSpy.mockResolvedValueOnce(jsonResponse({}));
        await setUserNotificationStatus('n1', status, TOKEN, tepHeaders);

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BASE}/SetUserNotificationStatus`);
        expect(JSON.parse(init.body as string)).toEqual({
          NotificationId: 'n1',
          Status: status,
        });
      },
    );

    it('throws on a non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}, 400));
      await expect(
        setUserNotificationStatus('n1', 'READ', TOKEN, tepHeaders),
      ).rejects.toThrow();
    });
  });
});
