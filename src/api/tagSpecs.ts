import type { TepHeaders } from './transactions';
import type { TagSpecLibrary, TaggingProgressMap } from '../types';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

export interface TagSpecLibrariesResult {
  libraries: TagSpecLibrary[];
  taggingProgress: TaggingProgressMap;
}

export async function getTagSpecLibraries(
  dataSetTypes: string[],
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
      ActivityTag: 'GetTagSpecLibraries',
      LanguageCode: 'en',
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    // `DataSetTypes` (a real JSON array) — the backend uses it when non-empty
    // and every returned library carries its own DataSetType, so we fetch all
    // workspaces in one call and group client-side.
    body: JSON.stringify({ DataSetTypes: dataSetTypes }),
    signal,
  });

  await throwIfNotOk(res, 'Failed to fetch tag spec libraries');
  const json: { TagSpecLibs: TagSpecLibrary[]; TaggingProgress?: TaggingProgressMap } = await res.json();
  return {
    libraries: json.TagSpecLibs,
    taggingProgress: json.TaggingProgress ?? {},
  };
}
