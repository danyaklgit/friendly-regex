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
  const res = await fetch(`${BASE}/TagSpecLibrarySave`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders),
    body: JSON.stringify({ TagSpecLib: tagSpecLibrary }),
    signal,
  });
  await throwIfNotOk(res, 'Save failed');
}
