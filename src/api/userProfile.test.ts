import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { getUserProfile, saveUserProfile } from './userProfile';
import type { TepHeaders } from './transactions';

const tepHeaders: TepHeaders = {
  userId: 'user-1',
  tenantCode: 'TENANT',
  languageCode: 'en',
  timeZone: 'UTC',
  requestId: 'req-1',
};

const TOKEN = 'test-token';
const BASE = '/api/tep/api/v1/TEP';

const PROFILE = {
  Id: '68a5f3c2e1b0a94d2c7e1f00',
  UserId: 'user-1',
  DisplayName: null, JobTitle: null, AvatarFMSId: null,
  PreferredLanguageCode: null, TimeZone: null,
  Settings: [{ Key: 'tep:relaxedMode', Value: 'true', Version: 1, UpdatedAtUtc: '2026-08-20T11:00:00Z' }],
  SettingsSchemaVersion: 1,
  CreatedAtUtc: '2026-08-01T06:00:00Z',
  UpdatedAtUtc: '2026-08-20T11:00:00Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('userProfile API', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>; });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('GetUserProfile POSTs the UserId with the paired ActivityTag and returns the Profile', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Profile: PROFILE }));
    const profile = await getUserProfile('user-1', TOKEN, tepHeaders);
    expect(profile.Settings[0].Key).toBe('tep:relaxedMode');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/GetUserProfile`);
    const headers = init.headers as Record<string, string>;
    expect(headers.ActivityTag).toBe('GetUserProfile');
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ UserId: 'user-1' });
  });

  it('SaveUserProfile sends only the changed keys + RemoveKeys and returns the merged Profile', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Profile: PROFILE }));
    const merged = await saveUserProfile(
      {
        UserId: 'user-1',
        Settings: [{ Key: 'tep:cols:v1:MT940:widths', Value: '{"data:Description1":340}', Version: 1 }],
        RemoveKeys: ['tep:sortOverride'],
      },
      TOKEN,
      tepHeaders,
    );
    expect(merged.Id).toBe(PROFILE.Id);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/SaveUserProfile`);
    expect((init.headers as Record<string, string>).ActivityTag).toBe('SaveUserProfile');
    const body = JSON.parse(init.body as string);
    expect(body.Settings).toHaveLength(1);
    expect(body.RemoveKeys).toEqual(['tep:sortOverride']);
  });

  it('throws on non-ok responses and on a missing Profile', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(getUserProfile('user-1', TOKEN, tepHeaders)).rejects.toThrow();
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    await expect(getUserProfile('user-1', TOKEN, tepHeaders)).rejects.toThrow(/Profile/);
  });
});
