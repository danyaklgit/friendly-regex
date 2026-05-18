import type { TepHeaders } from './transactions';
import type { BackendExtraction, AttributeDetail } from '../types/lov';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';
import { extractSfmMessage } from './lovAttributes';

const BASE = '/api/tep/api/v1/TEP';

export async function getExtractions(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<BackendExtraction[]> {
  const res = await fetch(`${BASE}/GetExtractions`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetExtractions'),
    body: JSON.stringify({}),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch extractions');
  const json = await res.json();
  // Accept both PascalCase and camelCase payloads — TEP endpoints in this app
  // have historically used PascalCase but the documented spec uses camelCase.
  const raw = json.Extractions ?? json.extractions ?? [];
  return raw.map(normalizeExtraction);
}

// Create/Update: `value` IS the regex (no separate Tags array). The form
// surfaces a single Regex input and `value` round-trips it.
export async function createExtraction(
  payload: { Value: string; Details: AttributeDetail[] },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/CreateExtraction`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'CreateExtraction'),
    body: JSON.stringify({
      Value: payload.Value,
      Details: payload.Details,
    }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to create extraction');
  const json = await res.json();
  return extractSfmMessage(json);
}

export async function updateExtraction(
  payload: { Id: number; Value: string; Details: AttributeDetail[] },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/UpdateExtraction`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'UpdateExtraction'),
    body: JSON.stringify({
      Id: payload.Id,
      Value: payload.Value,
      Details: payload.Details,
    }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to update extraction');
  const json = await res.json();
  return extractSfmMessage(json);
}

export async function deleteExtraction(
  id: number,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/DeleteExtraction`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'DeleteExtraction'),
    body: JSON.stringify({ Id: id }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to delete extraction');
  const json = await res.json();
  return extractSfmMessage(json);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeExtraction(raw: any): BackendExtraction {
  const details = (raw.Details ?? raw.details ?? []).map((d: any) => ({
    LanguageCode: d.LanguageCode ?? d.languageCode ?? 'en',
    Name: d.Name ?? d.name ?? '',
    ShortDescription: d.ShortDescription ?? d.shortDescription ?? '',
  }));
  return {
    Id: raw.Id ?? raw.id,
    Value: raw.Value ?? raw.value ?? '',
    StatusTag: raw.StatusTag ?? raw.statusTag ?? null,
    StatusName: raw.StatusName ?? raw.statusName ?? null,
    PossibleLOVTag: raw.PossibleLOVTag ?? raw.possibleLOVTag ?? null,
    Details: details,
  };
}
