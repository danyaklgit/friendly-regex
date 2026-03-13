import type { TepHeaders } from './transactions';

const BASE = '/api/tep/api/v1/TEP';

export function buildHeaders(token: string, tepHeaders: TepHeaders): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-apikey': tepHeaders.apiKey,
    ActivityTag: tepHeaders.activityTag ?? 'sit',
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
    headers: buildHeaders(token, tepHeaders),
    body: JSON.stringify({ TagSpecLibraryId: tagSpecLibraryId }),
    signal,
  });
  if (!res.ok) throw new Error('Checkout failed');
}

export async function tagSpecLibraryCheckIn(
  tagSpecLibraryId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/TagSpecLibraryCheckIn`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders),
    body: JSON.stringify({ TagSpecLibraryId: tagSpecLibraryId }),
    signal,
  });
  if (!res.ok) throw new Error('Checkin failed');
}

export async function tagSpecLibraryRollback(
  tagSpecLibraryId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/TagSpecLibraryRollback`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders),
    body: JSON.stringify({ TagSpecLibraryId: tagSpecLibraryId }),
    signal,
  });
  if (!res.ok) throw new Error('Rollback failed');
}

export async function tagSpecLibraryRelease(
  tagSpecLibraryId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/TagSpecLibraryRelease`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'TagSpecLibraryRelease' },
    body: JSON.stringify({ TagSpecLibraryId: tagSpecLibraryId }),
    signal,
  });
  if (!res.ok) throw new Error('Release failed');
}
