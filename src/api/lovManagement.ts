import type { TepHeaders } from './transactions';
import type { AttributeDetail, LOVCatalogEntry, LOVListItem } from '../types/lov';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';
import { extractSfmMessage } from './lovAttributes';

const BASE = '/api/tep/api/v1/TEP';

/**
 * LOV Management (backend 2026-08-27): operators create their own lists and
 * add / edit / enable / disable / delete items of every TEP-owned list. Five
 * actions, standard auth + `ActivityTag` = action name. Write responses carry
 * only SFM; validation failures (unmanaged list, duplicate value, blank
 * value, bad tag shape, non-engine transformation method) come back as
 * SFM_INVALID_INPUT_PARAMETERS — pre-validate client-side for friendlier
 * messages. ATTRIBUTES / EXTRACTIONS stay on their dedicated endpoints.
 * The backend invalidates its list cache on every write — a read right
 * after a write returns the new state.
 */

export type LOVItemStatus = 'ACTIVE' | 'DISABLED' | 'DELETED';

/**
 * Client-side mirror of the backend's list-tag normalization (UPPER_SNAKE):
 * trims, uppercases, turns any run of non-alphanumerics into one underscore,
 * and strips leading/trailing underscores. Shown live in the New-list form so
 * the operator sees the tag the backend will actually store.
 */
export function normalizeLovListTag(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function getLOVLists(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<LOVCatalogEntry[]> {
  const res = await fetch(`${BASE}/GetLOVLists`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetLOVLists'),
    body: JSON.stringify({}),
    signal,
  });
  await throwIfNotOk(res, 'Failed to load the LOV catalog');
  const json = await res.json();
  return (json.Lists ?? []) as LOVCatalogEntry[];
}

/**
 * Items of ONE list INCLUDING DISABLED and DELETED rows with their statuses
 * and every language row in `Details` (delta 2026-08-27). `GetListsByTags`
 * returns ACTIVE items only (correct for the wizard pickers — disabling an
 * item genuinely retires it from tagging), so the management pane must read
 * through this endpoint or the operator can never see, let alone re-enable,
 * a disabled row.
 */
export async function getLOVListItems(
  listTag: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<LOVListItem[]> {
  const res = await fetch(`${BASE}/GetLOVListItems`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetLOVListItems'),
    body: JSON.stringify({ ListTag: listTag }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to load list items');
  const json = await res.json();
  return (json.Items ?? []) as LOVListItem[];
}

export async function createLOVList(
  payload: { Tag: string; Details: AttributeDetail[] },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/CreateLOVList`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'CreateLOVList'),
    body: JSON.stringify(payload),
    signal,
  });
  await throwIfNotOk(res, 'Failed to create list');
  return extractSfmMessage(await res.json());
}

export interface LOVItemPayload {
  ListTag: string;
  Value: string;
  /** Lookup tags the engine resolves the item by. Omitted / null on create →
   *  the backend defaults them to the Value. On update, null KEEPS the stored
   *  tags and an array REPLACES them. */
  Tags?: string[] | null;
  Details?: AttributeDetail[];
}

export async function createLOVListItem(
  payload: LOVItemPayload,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/CreateLOVListItem`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'CreateLOVListItem'),
    body: JSON.stringify(payload),
    signal,
  });
  await throwIfNotOk(res, 'Failed to add item');
  return extractSfmMessage(await res.json());
}

export async function updateLOVListItem(
  payload: LOVItemPayload & { Id: number },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/UpdateLOVListItem`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'UpdateLOVListItem'),
    body: JSON.stringify(payload),
    signal,
  });
  await throwIfNotOk(res, 'Failed to update item');
  return extractSfmMessage(await res.json());
}

export async function changeLOVListItemStatus(
  payload: { ListTag: string; Id: number; StatusTag: LOVItemStatus },
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}/ChangeLOVListItemStatus`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'ChangeLOVListItemStatus'),
    body: JSON.stringify(payload),
    signal,
  });
  await throwIfNotOk(res, 'Failed to change item status');
  return extractSfmMessage(await res.json());
}
