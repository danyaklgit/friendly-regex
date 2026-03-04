import type { TepHeaders } from './transactions';

const BASE = '/api/tep/api/v1/TEP';

function buildHeaders(token: string, tepHeaders: TepHeaders): Record<string, string> {
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

export async function checkoutApi(
  bank: string,
  side: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  // TODO: wire to real endpoint when available
  const res = await fetch(`${BASE}/Checkout`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders),
    body: JSON.stringify({ Bank: bank, Side: side }),
    signal,
  });
  if (!res.ok) throw new Error('Checkout failed');
}

export async function checkinApi(
  bank: string,
  side: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  // TODO: wire to real endpoint when available
  const res = await fetch(`${BASE}/Checkin`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders),
    body: JSON.stringify({ Bank: bank, Side: side }),
    signal,
  });
  if (!res.ok) throw new Error('Checkin failed');
}

export async function undoChangesApi(
  bank: string,
  side: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  // TODO: wire to real endpoint when available
  const res = await fetch(`${BASE}/UndoChanges`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders),
    body: JSON.stringify({ Bank: bank, Side: side }),
    signal,
  });
  if (!res.ok) throw new Error('Undo changes failed');
}
