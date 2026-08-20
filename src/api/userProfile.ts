import type { TepHeaders } from './transactions';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

/**
 * User Profile API (backend build 2026-08-20+): an operator's settings follow
 * them across devices instead of living in one browser's localStorage.
 *
 * The model is a lift-and-shift of the localStorage contract:
 *  - `Key` is the exact localStorage key name.
 *  - `Value` is an OPAQUE JSON string — exactly what localStorage.getItem
 *    returns / setItem receives. The backend never parses it, so client-side
 *    value migrations keep running after read, same as today.
 *  - `Version` is client-owned (encoding version of the value); the server
 *    stores it verbatim. Omitted on save = 1.
 *  - Absence of a key = "no saved preference" (a null getItem).
 */
export interface ProfileSetting {
  Key: string;
  Value: string;
  Version?: number;
  UpdatedAtUtc?: string;
}

export interface UserProfile {
  /** null until the first SaveUserProfile persists the document — the tell
   *  that this user has never saved anything (triggers localStorage adoption). */
  Id: string | null;
  UserId: string;
  DisplayName: string | null;
  JobTitle: string | null;
  AvatarFMSId: string | null;
  PreferredLanguageCode: string | null;
  TimeZone: string | null;
  Settings: ProfileSetting[];
  SettingsSchemaVersion: number;
  CreatedAtUtc: string;
  UpdatedAtUtc: string;
}

interface ProfileResponse {
  Profile?: UserProfile;
}

/** Read the full profile. Never 404s — a user with no stored profile gets a
 *  synthesized default (Id null, empty Settings); nothing is written by the read. */
export async function getUserProfile(
  userId: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<UserProfile> {
  const res = await fetch(`${BASE}/GetUserProfile`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetUserProfile'),
    body: JSON.stringify({ UserId: userId }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to load user profile');
  const json = (await res.json()) as ProfileResponse;
  if (!json.Profile) throw new Error('Server did not return a Profile.');
  return json.Profile;
}

export interface SaveUserProfileRequest {
  UserId: string;
  /** Only the keys to upsert — every listed key is fully replaced. Everything
   *  omitted is preserved server-side (per-key merge). */
  Settings?: ProfileSetting[];
  /** Keys to delete (the localStorage.removeItem equivalent). Removing an
   *  absent key is a no-op. */
  RemoveKeys?: string[];
}

/** Per-key merge save. Returns the full merged profile — adopt it as the new
 *  in-memory state. Validation is all-or-nothing (400 writes nothing). */
export async function saveUserProfile(
  req: SaveUserProfileRequest,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<UserProfile> {
  const res = await fetch(`${BASE}/SaveUserProfile`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SaveUserProfile'),
    body: JSON.stringify(req),
    signal,
  });
  await throwIfNotOk(res, 'Failed to save user profile');
  const json = (await res.json()) as ProfileResponse;
  if (!json.Profile) throw new Error('Server did not return a Profile.');
  return json.Profile;
}
