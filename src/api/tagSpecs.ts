import type { TepHeaders } from './transactions';
import type { TagSpecLibrary, TaggingProgressMap } from '../types';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

export interface TagSpecLibrariesResult {
  libraries: TagSpecLibrary[];
  taggingProgress: TaggingProgressMap;
}

export async function getTagSpecLibraries(
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<TagSpecLibrariesResult> {
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
  const json: { TagSpecLibs: TagSpecLibrary[]; TaggingProgress?: TaggingProgressMap } = await res.json();
  return {
    libraries: json.TagSpecLibs,
    taggingProgress: json.TaggingProgress ?? {},
  };
}
