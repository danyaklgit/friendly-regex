import type { TepHeaders } from './transactions';
import type { TagSpecLibrary } from '../types';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

export async function tagSpecLibrarySave(
  tagSpecLibrary: TagSpecLibrary,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  // Sanitize empty date strings to null before sending
  const sanitized = {
    ...tagSpecLibrary,
    TagSpecDefinitions: tagSpecLibrary.TagSpecDefinitions.map((def) => ({
      ...def,
      Validity: {
        StartDate: def.Validity.StartDate || null,
        EndDate: def.Validity.EndDate || null,
      },
    })),
  };
  const res = await fetch(`${BASE}/TagSpecLibrarySave`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'TagSpecLibrarySave'),
    body: JSON.stringify({ TagSpecLib: sanitized }),
    signal,
  });
  await throwIfNotOk(res, 'Save failed');
}
