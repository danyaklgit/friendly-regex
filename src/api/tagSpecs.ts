import type { TepHeaders } from './transactions';
import type { TagSpecLibrary } from '../types';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

export async function getTagSpecLibraries(
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<TagSpecLibrary[]> {
  const res = await fetch(`${BASE}/GetTagSpecLibraries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'GetTagSpecLibraries',
      LanguageCode: 'en',
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ DataSetType: 'MT940' }),
    signal,
  });

  await throwIfNotOk(res, 'Failed to fetch tag spec libraries');
  const json: { TagSpecLibs: TagSpecLibrary[] } = await res.json();
  return json.TagSpecLibs;
}
