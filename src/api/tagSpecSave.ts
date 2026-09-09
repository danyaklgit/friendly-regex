import type { TepHeaders } from './transactions';
import type { TagSpecLibrary } from '../types';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

/** How the backend's save merge treated the payload (API ref §7.3,
 *  backend 2026-09-09). All counts optional — a pre-deploy backend
 *  returns none of this. */
export interface TagSpecSaveMergeSummary {
  Applied?: number;
  KeptStored?: number;
  DroppedStale?: number;
  PreservedOmitted?: number;
  Removed?: number;
  /** True when the stored copy of at least one definition was newer than the
   *  payload's and was kept — surface it: the returned library already shows
   *  the kept versions. */
  ServerKnewBetter?: boolean;
}

export interface TagSpecSaveResult {
  /** The library AS PERSISTED after the server-side merge (every definition
   *  with its current stamps, `LastUpdatedDate` set). Adopt it verbatim —
   *  what the server holds can differ from what was sent (`MergeDefinitionsForSave`
   *  keeps stored definitions over stale echoes). Null on a backend that
   *  predates the 2026-09-09 response addition — refetch libraries instead. */
  library: TagSpecLibrary | null;
  merge: TagSpecSaveMergeSummary | null;
}

interface SaveResponseJson {
  TagSpecLib?: TagSpecLibrary | null;
  Merge?: TagSpecSaveMergeSummary | null;
}

export async function tagSpecLibrarySave(
  tagSpecLibrary: TagSpecLibrary,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<TagSpecSaveResult> {
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
  let json: SaveResponseJson | null = null;
  try {
    json = (await res.json()) as SaveResponseJson;
  } catch {
    json = null; // pre-2026-09-09 backend: SFM-only body, possibly empty
  }
  return {
    library: json?.TagSpecLib ?? null,
    merge: json?.Merge ?? null,
  };
}
