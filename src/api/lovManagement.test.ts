import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import {
  normalizeLovListTag,
  getLOVLists,
  getLOVListItems,
  createLOVList,
  createLOVListItem,
  updateLOVListItem,
  changeLOVListItemStatus,
} from './lovManagement';
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
const SFM_OK = { SFM: { Constant: 'SFM_SUCCESS', Major: { Constant: 'MAJ_SUCCESS', MajorRetCodeDetails: [{ LanguageCode: 'en', ShortDescription: 'Saved' }] } } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('normalizeLovListTag', () => {
  it('mirrors the backend UPPER_SNAKE normalization', () => {
    expect(normalizeLovListTag('my billers')).toBe('MY_BILLERS');
    expect(normalizeLovListTag('  Sadad - Gov. Services  ')).toBe('SADAD_GOV_SERVICES');
    expect(normalizeLovListTag('already_UPPER')).toBe('ALREADY_UPPER');
    expect(normalizeLovListTag('___')).toBe('');
    expect(normalizeLovListTag('a1-b2')).toBe('A1_B2');
  });
});

describe('lovManagement API', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as MockInstance<typeof fetch>; });
  afterEach(() => { fetchSpy.mockRestore(); });

  function lastCall(): { url: string; init: RequestInit; body: Record<string, unknown> } {
    const [url, init] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as [string, RequestInit];
    return { url, init, body: JSON.parse(init.body as string) };
  }

  it('GetLOVLists returns the catalog with the paired ActivityTag', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Lists: [{ Tag: 'BANKS', Name: 'Banks', IsUserCreated: false, ItemsCount: 12 }], ...SFM_OK }));
    const lists = await getLOVLists(TOKEN, tepHeaders);
    expect(lists).toEqual([{ Tag: 'BANKS', Name: 'Banks', IsUserCreated: false, ItemsCount: 12 }]);
    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/GetLOVLists`);
    expect((init.headers as Record<string, string>).ActivityTag).toBe('GetLOVLists');
  });

  it('GetLOVListItems reads one list by ListTag, including non-ACTIVE rows and every language row', async () => {
    const items = [
      { Id: 1, Value: '001', Name: 'STC', Description: '', Tags: ['001'], StatusTag: 'ACTIVE', Details: [{ LanguageCode: 'en', Name: 'STC', ShortDescription: '' }, { LanguageCode: 'ar', Name: 'الاتصالات', ShortDescription: '' }] },
      { Id: 2, Value: '002', Name: 'Old', Description: '', Tags: ['002'], StatusTag: 'DISABLED', Details: [] },
    ];
    fetchSpy.mockResolvedValueOnce(jsonResponse({ Items: items, ...SFM_OK }));
    const result = await getLOVListItems('SADAD_BILLERS', TOKEN, tepHeaders);
    expect(result).toEqual(items);
    const { url, init, body } = lastCall();
    expect(url).toBe(`${BASE}/GetLOVListItems`);
    expect((init.headers as Record<string, string>).ActivityTag).toBe('GetLOVListItems');
    expect(body).toEqual({ ListTag: 'SADAD_BILLERS' });
  });

  it('CreateLOVList posts Tag + Details and surfaces the SFM message', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(SFM_OK));
    const msg = await createLOVList({ Tag: 'MY_BILLERS', Details: [{ LanguageCode: 'en', Name: 'My billers', ShortDescription: '' }] }, TOKEN, tepHeaders);
    expect(msg).toBe('Saved');
    const { url, body } = lastCall();
    expect(url).toBe(`${BASE}/CreateLOVList`);
    expect(body.Tag).toBe('MY_BILLERS');
  });

  it('item create / update / status address the list by ListTag and items by Id', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse(SFM_OK)));
    await createLOVListItem({ ListTag: 'BANKS', Value: 'RJHI', Details: [] }, TOKEN, tepHeaders);
    expect(lastCall().url).toBe(`${BASE}/CreateLOVListItem`);
    expect(lastCall().body).toEqual({ ListTag: 'BANKS', Value: 'RJHI', Details: [] });

    await updateLOVListItem({ ListTag: 'BANKS', Id: 7, Value: 'RJHI', Tags: null, Details: [] }, TOKEN, tepHeaders);
    expect(lastCall().url).toBe(`${BASE}/UpdateLOVListItem`);
    expect(lastCall().body.Id).toBe(7);
    // null keeps the stored tags server-side — must travel as null, not be dropped.
    expect('Tags' in lastCall().body && lastCall().body.Tags).toBeNull();

    await changeLOVListItemStatus({ ListTag: 'BANKS', Id: 7, StatusTag: 'DISABLED' }, TOKEN, tepHeaders);
    expect(lastCall().url).toBe(`${BASE}/ChangeLOVListItemStatus`);
    expect((lastCall().init.headers as Record<string, string>).ActivityTag).toBe('ChangeLOVListItemStatus');
    expect(lastCall().body).toEqual({ ListTag: 'BANKS', Id: 7, StatusTag: 'DISABLED' });
  });

  it('throws on a validation failure (400)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ SFM: { Constant: 'SFM_INVALID_INPUT_PARAMETERS' } }, 400));
    await expect(createLOVListItem({ ListTag: 'ATTRIBUTES', Value: 'x' }, TOKEN, tepHeaders)).rejects.toThrow();
  });
});
