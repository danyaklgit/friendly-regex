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
  // The spec uses camelCase fields (`extractions`, `id`, `value`...) but
  // existing TEP endpoints in this app return PascalCase. Accept both so the
  // page works regardless of which casing the backend ends up with.
  const raw = json.Extractions ?? json.extractions ?? [];
  return raw.map(normalizeExtraction);
}

// Create/Update payload: the documented spec carries only Value + Details.
// The real EXTRACTIONS LOV stores the regex in `Tags[0]`, so we attach
// `Tags: [Regex]` to the payload. Backends that ignore unknown fields will
// be unaffected; backends that read `Tags` round-trip the regex correctly.
export async function createExtraction(
  payload: { Value: string; Regex: string; Details: AttributeDetail[] },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/CreateExtraction`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'CreateExtraction'),
    body: JSON.stringify({
      Value: payload.Value,
      Tags: [payload.Regex],
      Details: payload.Details,
    }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to create extraction');
  const json = await res.json();
  return extractSfmMessage(json);
}

export async function updateExtraction(
  payload: { Id: number; Value: string; Regex: string; Details: AttributeDetail[] },
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
      Tags: [payload.Regex],
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
