import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  settingsStore,
  hydrateSettingsStore,
  registerSettingsPush,
  resetSettingsStore,
  collectAdoptionSettings,
  isMigratableKey,
  profileKeyFor,
} from './settingsStore';
import type { ProfileSetting } from '../api/userProfile';

beforeEach(() => {
  localStorage.clear();
  resetSettingsStore();
  vi.useFakeTimers();
});

afterEach(() => {
  resetSettingsStore();
  vi.useRealTimers();
});

function pushSpy() {
  const calls: Array<{ settings: ProfileSetting[]; removeKeys: string[] }> = [];
  const fn = vi.fn(async (settings: ProfileSetting[], removeKeys: string[]) => {
    calls.push({ settings, removeKeys });
  });
  registerSettingsPush(fn);
  return { fn, calls };
}

describe('key classification', () => {
  it('classifies migratable keys and rejects auth material', () => {
    expect(isMigratableKey('tep:sortOverride')).toBe(true);
    expect(isMigratableKey('tep:cols:v1:Ledger:hidden')).toBe(true);
    expect(isMigratableKey('tep:userContributions:user-1')).toBe(true);
    expect(isMigratableKey('tep.downloadCenter.seenReadyIds')).toBe(true);
    expect(isMigratableKey('auth_session')).toBe(false);
    expect(isMigratableKey('theme_preference')).toBe(false); // local-only by decision
    expect(isMigratableKey('tep:baseline:MT940:X:CR')).toBe(false);
  });

  it('drops the per-user suffix on the contributions profile key', () => {
    expect(profileKeyFor('tep:userContributions:user-1')).toBe('tep:userContributions');
    expect(profileKeyFor('tep:cols:v1:Ledger:order')).toBe('tep:cols:v1:Ledger:order');
  });
});

describe('before hydration', () => {
  it('is a pure localStorage pass-through and never pushes', async () => {
    const { fn } = pushSpy();
    settingsStore.setItem('tep:relaxedMode', 'false');
    expect(localStorage.getItem('tep:relaxedMode')).toBe('false');
    expect(settingsStore.getItem('tep:relaxedMode')).toBe('false');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('after hydration', () => {
  it('serves migratable keys from the profile, ignoring stale localStorage', () => {
    localStorage.setItem('tep:sortOverride', '{"field":"IBAN","order":"ASC"}');
    hydrateSettingsStore([{ Key: 'tep:relaxedMode', Value: 'true' }]);
    expect(settingsStore.getItem('tep:relaxedMode')).toBe('true');
    // Key absent from the profile = no saved preference, even if the local
    // mirror still has an old value.
    expect(settingsStore.getItem('tep:sortOverride')).toBeNull();
    // Non-migratable keys keep reading localStorage.
    localStorage.setItem('theme_preference', '"dark"');
    expect(settingsStore.getItem('theme_preference')).toBe('"dark"');
  });

  it('mirrors hydrated values into localStorage (same-key entries only)', () => {
    hydrateSettingsStore([
      { Key: 'tep:relaxedMode', Value: 'true' },
      { Key: 'tep:userContributions', Value: '[]' },
    ]);
    expect(localStorage.getItem('tep:relaxedMode')).toBe('true');
    // Contribution values map to per-user local keys — not mirrored blindly.
    expect(localStorage.getItem('tep:userContributions')).toBeNull();
  });

  it('debounces a push carrying only the changed keys', async () => {
    hydrateSettingsStore([]);
    const { fn, calls } = pushSpy();
    settingsStore.setItem('tep:relaxedMode', 'false');
    settingsStore.setItem('tep:relaxedMode', 'true'); // coalesces
    settingsStore.setItem('tep:charView', 'true');
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls[0].settings).toEqual([
      { Key: 'tep:relaxedMode', Value: 'true' },
      { Key: 'tep:charView', Value: 'true' },
    ]);
    expect(calls[0].removeKeys).toEqual([]);
    // The in-memory value and the mirror both updated.
    expect(settingsStore.getItem('tep:relaxedMode')).toBe('true');
    expect(localStorage.getItem('tep:relaxedMode')).toBe('true');
  });

  it('pushes removals as RemoveKeys', async () => {
    hydrateSettingsStore([{ Key: 'tep:sortOverride', Value: '{"field":"IBAN","order":"ASC"}' }]);
    const { calls } = pushSpy();
    settingsStore.removeItem('tep:sortOverride');
    expect(settingsStore.getItem('tep:sortOverride')).toBeNull();
    await vi.advanceTimersByTimeAsync(2_100);
    expect(calls[0].removeKeys).toEqual(['tep:sortOverride']);
    expect(calls[0].settings).toEqual([]);
  });

  it('maps contribution writes to the suffix-less profile key', async () => {
    hydrateSettingsStore([]);
    const { calls } = pushSpy();
    settingsStore.setItem('tep:userContributions:user-1', '[{"a":1}]');
    // Local mirror keeps the per-user key; profile gets the plain key.
    expect(localStorage.getItem('tep:userContributions:user-1')).toBe('[{"a":1}]');
    expect(settingsStore.getItem('tep:userContributions:user-1')).toBe('[{"a":1}]');
    await vi.advanceTimersByTimeAsync(2_100);
    expect(calls[0].settings).toEqual([{ Key: 'tep:userContributions', Value: '[{"a":1}]' }]);
  });

  it('retries a failed push and never drops the change', async () => {
    hydrateSettingsStore([]);
    let failNext = true;
    const calls: Array<{ settings: ProfileSetting[]; removeKeys: string[] }> = [];
    registerSettingsPush(async (settings, removeKeys) => {
      if (failNext) { failNext = false; throw new Error('offline'); }
      calls.push({ settings, removeKeys });
    });
    settingsStore.setItem('tep:charView', 'true');
    await vi.advanceTimersByTimeAsync(2_100); // first push fails
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(30_100); // retry succeeds
    expect(calls).toHaveLength(1);
    expect(calls[0].settings).toEqual([{ Key: 'tep:charView', Value: 'true' }]);
  });
});

describe('collectAdoptionSettings', () => {
  it('collects migratable localStorage values, excluding other users and profile-known keys', () => {
    localStorage.setItem('tep:relaxedMode', 'false');
    localStorage.setItem('tep:cols:v1:Ledger:order', '["data:TransactionId"]');
    localStorage.setItem('tep:userContributions:user-1', '[1]');
    localStorage.setItem('tep:userContributions:user-2', '[2]'); // another user — never adopt
    localStorage.setItem('auth_session', '{"t":1}');             // rejected server-side — never adopt
    localStorage.setItem('theme_preference', '"dark"');          // local-only — never adopt
    hydrateSettingsStore([{ Key: 'tep:relaxedMode', Value: 'true' }]); // profile already knows it

    const adopted = collectAdoptionSettings('user-1');
    const byKey = new Map(adopted.map((s) => [s.Key, s.Value]));
    expect(byKey.get('tep:cols:v1:Ledger:order')).toBe('["data:TransactionId"]');
    expect(byKey.get('tep:userContributions')).toBe('[1]');
    expect(byKey.has('tep:relaxedMode')).toBe(false);
    expect(byKey.has('auth_session')).toBe(false);
    expect(byKey.has('theme_preference')).toBe(false);
    expect(adopted).toHaveLength(2);
  });
});

describe('resetSettingsStore', () => {
  it('returns to pass-through and stops pushing', async () => {
    hydrateSettingsStore([{ Key: 'tep:relaxedMode', Value: 'true' }]);
    const { fn } = pushSpy();
    resetSettingsStore();
    localStorage.setItem('tep:relaxedMode', 'false');
    expect(settingsStore.getItem('tep:relaxedMode')).toBe('false'); // localStorage again
    settingsStore.setItem('tep:charView', 'true');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).not.toHaveBeenCalled();
  });
});
