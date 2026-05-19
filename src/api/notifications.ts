import type { TepHeaders } from './transactions';
import { throwIfNotOk } from './apiError';
import { buildHeaders } from './checkout';
import type { UserNotification, NotificationStatus } from '../types/notifications';

const BASE = '/api/tep/api/v1/TEP';

interface GetUserNotificationsResponse {
  Notifications?: UserNotification[];
  SFM?: {
    Constant?: string | null;
    Major?: { Constant?: string | null };
  };
}

/**
 * Mirror of the comments-no-results pattern: backend returns
 * SFM_NO_USER_NOTIFICATIONS_FOUND (still a MAJ_SUCCESS_INFO) when the user has
 * no notifications. Treated as a valid empty response.
 */
export async function getUserNotifications(
  userId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<UserNotification[]> {
  const res = await fetch(`${BASE}/GetUserNotifications`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetUserNotifications'),
    body: JSON.stringify({ UserId: userId }),
    signal,
  });
  let json: GetUserNotificationsResponse | null = null;
  try {
    json = (await res.clone().json()) as GetUserNotificationsResponse;
  } catch {
    json = null;
  }
  if (json && json.SFM?.Constant === 'SFM_NO_USER_NOTIFICATIONS_FOUND') {
    return [];
  }
  await throwIfNotOk(res, 'Failed to load notifications');
  return json?.Notifications ?? [];
}

export async function setUserNotificationStatus(
  notificationId: string,
  status: NotificationStatus,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/SetUserNotificationStatus`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SetUserNotificationStatus'),
    body: JSON.stringify({ NotificationId: notificationId, Status: status }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to update notification');
}
