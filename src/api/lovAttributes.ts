import type { TepHeaders } from './transactions';
import type { LOVList, ValidationClass, BackendAttribute, AttributeDetail } from '../types/lov';
import { buildHeaders } from './checkout';
import { LOV_TAGS } from '../constants/lov';

const BASE = '/api/tep/api/v1/TEP';

/** Extract a human-readable message from the standard SFM envelope returned by TEP APIs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSfmMessage(json: any): string | null {
  const sfm = json?.SFM;
  if (!sfm) return null;
  const majorDetails: { LanguageCode: string; ShortDescription: string }[] | undefined =
    sfm.Major?.MajorRetCodeDetails;
  const en = majorDetails?.find((d) => d.LanguageCode === 'en');
  return en?.ShortDescription ?? null;
}

export async function getListsByTags(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<LOVList[]> {
  const res = await fetch(`${BASE}/GetListsByTags`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'GetListsByTags' },
    body: JSON.stringify({ Tags: [...LOV_TAGS] }),
    signal,
  });
  if (!res.ok) throw new Error(`GetListsByTags failed: ${res.status}`);
  const json = await res.json();
  return json.Lists ?? [];
}

export async function getValidationClasses(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<ValidationClass[]> {
  const res = await fetch(`${BASE}/GetValidationClasses`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'GetValidationClasses' },
    body: JSON.stringify({}),
    signal,
  });
  if (!res.ok) throw new Error(`GetValidationClasses failed: ${res.status}`);
  const json = await res.json();
  return json.ValidationClasses ?? [];
}

export async function getAttributes(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<BackendAttribute[]> {
  const res = await fetch(`${BASE}/GetAttributes`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'GetAttributes' },
    body: JSON.stringify({}),
    signal,
  });
  if (!res.ok) throw new Error(`GetAttributes failed: ${res.status}`);
  const json = await res.json();
  return json.Attributes ?? [];
}

export async function createAttribute(
  payload: { Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/CreateAttribute`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'CreateAttribute' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`CreateAttribute failed: ${res.status}`);
  const json = await res.json();
  return extractSfmMessage(json);
}

export async function updateAttribute(
  payload: { Id: number; Value: string; PossibleLOVTag?: string | null; Details: AttributeDetail[] },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/UpdateAttribute`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'UpdateAttribute' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`UpdateAttribute failed: ${res.status}`);
  const json = await res.json();
  return extractSfmMessage(json);
}

export async function disableAttribute(
  id: number,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/DisableAttribute`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'DisableAttribute' },
    body: JSON.stringify({ Id: id }),
    signal,
  });
  if (!res.ok) throw new Error(`DisableAttribute failed: ${res.status}`);
  const json = await res.json();
  return extractSfmMessage(json);
}

export async function enableAttribute(
  id: number,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/EnableAttribute`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'EnableAttribute' },
    body: JSON.stringify({ Id: id }),
    signal,
  });
  if (!res.ok) throw new Error(`EnableAttribute failed: ${res.status}`);
  const json = await res.json();
  return extractSfmMessage(json);
}

export async function deleteAttribute(
  id: number,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/DeleteAttribute`, {
    method: 'POST',
    headers: { ...buildHeaders(token, tepHeaders), ActivityTag: 'DeleteAttribute' },
    body: JSON.stringify({ Id: id }),
    signal,
  });
  if (!res.ok) throw new Error(`DeleteAttribute failed: ${res.status}`);
  const json = await res.json();
  return extractSfmMessage(json);
}
