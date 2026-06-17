import type { TepHeaders } from './transactions';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

/** Build the standard header bundle for TEP API calls. The `activityTag`
 *  argument is required and should match the endpoint's method name (e.g.
 *  the URL segment after `/TEP/`) so backend telemetry correlates each
 *  request with the operation it actually performed. */
export function buildHeaders(token: string, tepHeaders: TepHeaders, activityTag: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ActivityTag: activityTag,
    LanguageCode: tepHeaders.languageCode,
    TTPUserId: tepHeaders.userId,
    TTPTenantCode: tepHeaders.tenantCode,
    TTPRequestId: tepHeaders.requestId,
    TimeZone: tepHeaders.timeZone,
  };
}

export async function tagSpecLibraryCheckOut(
  tagSpecLibraryId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/TagSpecLibraryCheckOut`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'TagSpecLibraryCheckOut'),
    body: JSON.stringify({ TagSpecLibraryId: tagSpecLibraryId }),
    signal,
  });
  await throwIfNotOk(res, 'Checkout failed');
}

export async function tagSpecLibraryCheckIn(
  tagSpecLibraryId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/TagSpecLibraryCheckIn`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'TagSpecLibraryCheckIn'),
    body: JSON.stringify({ TagSpecLibraryId: tagSpecLibraryId }),
    signal,
  });
  await throwIfNotOk(res, 'Check-in failed');
}

export async function tagSpecLibraryRollback(
  tagSpecLibraryId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/TagSpecLibraryRollback`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'TagSpecLibraryRollback'),
    body: JSON.stringify({ TagSpecLibraryId: tagSpecLibraryId }),
    signal,
  });
  await throwIfNotOk(res, 'Rollback failed');
}

export async function tagSpecLibraryRelease(
  tagSpecLibraryId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/TagSpecLibraryRelease`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'TagSpecLibraryRelease'),
    body: JSON.stringify({ TagSpecLibraryId: tagSpecLibraryId }),
    signal,
  });
  await throwIfNotOk(res, 'Release failed');
}
