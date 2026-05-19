import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getUserNotifications,
  setUserNotificationStatus,
} from '../api/notifications';
import type { NotificationStatus, UserNotification } from '../types/notifications';
import type { TepHeaders } from '../api/transactions';

const POLL_INTERVAL_MS = 30_000;

interface UseNotificationsResult {
  notifications: UserNotification[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  refresh: () => Promise<void>;
  markStatus: (notificationId: string, status: NotificationStatus) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * Manages the current user's notification list with light polling. Updates
 * `notifications` optimistically when the user marks one read/unread/deleted
 * so the UI is responsive while the API call completes.
 */
export function useNotifications(
  userId: string | null | undefined,
  authToken: string | null,
  tepHeaders: TepHeaders | null,
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || !authToken || !tepHeaders) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getUserNotifications(userId, authToken, tepHeaders);
      if (!mountedRef.current) return;
      // Filter out anything the server still returned as DELETED.
      setNotifications(list.filter((n) => (n.Status ?? '').toUpperCase() !== 'DELETED'));
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId, authToken, tepHeaders]);

  useEffect(() => {
    void refresh();
    if (!userId || !authToken || !tepHeaders) return;
    const id = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh, userId, authToken, tepHeaders]);

  const markStatus = useCallback(
    async (notificationId: string, status: NotificationStatus) => {
      if (!authToken || !tepHeaders) return;
      // Optimistic update so the UI doesn't lag behind the click.
      setNotifications((prev) => {
        if (status === 'DELETED') return prev.filter((n) => n.Id !== notificationId);
        return prev.map((n) =>
          n.Id === notificationId ? { ...n, Status: status } : n,
        );
      });
      try {
        await setUserNotificationStatus(notificationId, status, authToken, tepHeaders);
      } catch (e) {
        // Roll back by refetching from server.
        await refresh();
        throw e;
      }
    },
    [authToken, tepHeaders, refresh],
  );

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => (n.Status ?? '').toUpperCase() === 'UNREAD');
    if (unread.length === 0) return;
    setNotifications((prev) =>
      prev.map((n) =>
        (n.Status ?? '').toUpperCase() === 'UNREAD' ? { ...n, Status: 'READ' } : n,
      ),
    );
    try {
      await Promise.all(
        unread.map((n) =>
          setUserNotificationStatus(n.Id, 'READ', authToken!, tepHeaders!),
        ),
      );
    } catch {
      await refresh();
    }
  }, [notifications, authToken, tepHeaders, refresh]);

  const unreadCount = useMemo(
    () =>
      notifications.reduce(
        (acc, n) => acc + ((n.Status ?? '').toUpperCase() === 'UNREAD' ? 1 : 0),
        0,
      ),
    [notifications],
  );

  return { notifications, loading, error, unreadCount, refresh, markStatus, markAllRead };
}
