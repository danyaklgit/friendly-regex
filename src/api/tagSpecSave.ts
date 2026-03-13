import type { TepHeaders } from './transactions';
import type { TagSpecLibrary } from '../types';
import { buildHeaders } from './checkout';

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
  if (!res.ok) throw new Error('Save failed');
}
