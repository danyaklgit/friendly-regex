import type { ProfileSetting } from '../api/userProfile';

/**
 * Settings store — the localStorage-compatible adapter in front of the
 * backend User Profile (see docs: UserProfile-API). Call sites keep the exact
 * localStorage semantics (string in/out, null = absent, same key names, same
 * JSON shapes); this module decides where the bytes live:
 *
 *  - BEFORE hydration (pre-login, sample mode, backend down): pure
 *    localStorage pass-through — behavior identical to the pre-profile app.
 *  - AFTER hydration (GetUserProfile loaded): migratable keys are served from
 *    the in-memory profile map; every write updates the map, mirrors to
 *    localStorage (same-device fallback), and enqueues a DEBOUNCED
 *    SaveUserProfile carrying only the changed keys (+ RemoveKeys). Failed
 *    pushes are retried — the per-key merge makes replays idempotent.
 *
 * The hydration-guard discipline (CLAUDE.md gotcha #32) applies here too:
 * only genuine user changes reach setItem/removeItem, so only genuine
 * changes are pushed — hydrated values are never echoed back.
 *
 * Non-migratable keys (auth material, rule-editing baselines/drafts, theme /
 * brand which the index.html boot script must read pre-login, caches) always
 * pass straight through to localStorage.
 */

/** Exact localStorage keys that live on the profile. */
const MIGRATABLE_KEYS = new Set([
  'tep:sortOverride',
  'tep:showAttributes',
  'tep:charView',
  'tep:charViewCols',
  'tep:incrementalPagination',
  'tep:relaxedMode',
  'tep:userProMode',
  'tep:userCustomTags',
  'tep.downloadCenter.seenReadyIds',
]);

/** Key-prefix families that live on the profile. */
const MIGRATABLE_PREFIXES = ['tep:cols:', 'tep:userContributions'];

const DEBOUNCE_MS = 2_000;
const RETRY_MS = 30_000;

export function isMigratableKey(key: string): boolean {
  if (key.startsWith('auth')) return false; // backend rejects auth* — never sync
  if (MIGRATABLE_KEYS.has(key)) return true;
  return MIGRATABLE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * The profile key a local key maps to. Identity for everything except
 * `tep:userContributions:<userId>`, whose per-user suffix is dropped — the
 * profile is already per-user, so the suffix is redundant there (and the
 * local suffixed key keeps working as the same-device fallback).
 */
export function profileKeyFor(localKey: string): string {
  if (localKey.startsWith('tep:userContributions')) return 'tep:userContributions';
  return localKey;
}

type PushFn = (settings: ProfileSetting[], removeKeys: string[]) => Promise<void>;

interface StoreState {
  hydrated: boolean;
  /** profileKey → opaque JSON string, as served by GetUserProfile + local edits. */
  values: Map<string, string>;
  /** profileKey → next value to push (null = remove). Coalesces bursts. */
  dirty: Map<string, string | null>;
  push: PushFn | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  flushing: boolean;
}

const state: StoreState = {
  hydrated: false,
  values: new Map(),
  dirty: new Map(),
  push: null,
  debounceTimer: null,
  retryTimer: null,
  flushing: false,
};

function clearTimers(): void {
  if (state.debounceTimer) { clearTimeout(state.debounceTimer); state.debounceTimer = null; }
  if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = null; }
}

async function flushDirty(): Promise<void> {
  if (state.flushing || !state.push || state.dirty.size === 0) return;
  const batch = new Map(state.dirty);
  state.dirty.clear();
  const settings: ProfileSetting[] = [];
  const removeKeys: string[] = [];
  for (const [key, value] of batch) {
    if (value === null) removeKeys.push(key);
    else settings.push({ Key: key, Value: value });
  }
  state.flushing = true;
  try {
    await state.push(settings, removeKeys);
  } catch {
    // Keep the change and retry later — the per-key merge makes replays safe.
    // Newer edits queued during the failed push win over the failed batch.
    for (const [key, value] of batch) {
      if (!state.dirty.has(key)) state.dirty.set(key, value);
    }
    if (!state.retryTimer) {
      state.retryTimer = setTimeout(() => {
        state.retryTimer = null;
        void flushDirty();
      }, RETRY_MS);
    }
  } finally {
    state.flushing = false;
    // Edits that arrived mid-push get their own debounce cycle.
    if (state.dirty.size > 0 && !state.debounceTimer && !state.retryTimer) scheduleFlush();
  }
}

function scheduleFlush(): void {
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    void flushDirty();
  }, DEBOUNCE_MS);
}

function markDirty(profileKey: string, value: string | null): void {
  if (!state.hydrated) return; // pre-hydration: pure localStorage behavior
  state.dirty.set(profileKey, value);
  scheduleFlush();
}

// --- The localStorage-compatible surface -----------------------------------

export const settingsStore = {
  getItem(key: string): string | null {
    if (state.hydrated && isMigratableKey(key)) {
      return state.values.get(profileKeyFor(key)) ?? null;
    }
    try { return localStorage.getItem(key); } catch { return null; }
  },

  setItem(key: string, value: string): void {
    // Mirror to localStorage always — the same-device fallback for sessions
    // where hydration hasn't happened (yet) or the backend is unreachable.
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
    if (!isMigratableKey(key)) return;
    const pk = profileKeyFor(key);
    if (state.hydrated) state.values.set(pk, value);
    markDirty(pk, value);
  },

  removeItem(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    if (!isMigratableKey(key)) return;
    const pk = profileKeyFor(key);
    if (state.hydrated) state.values.delete(pk);
    markDirty(pk, null);
  },
};

// --- Lifecycle (driven by useUserProfileSync) -------------------------------

/**
 * Load the profile's settings as the read source for migratable keys and
 * mirror them into localStorage (so next session's pre-hydration reads are
 * fresh). Keys whose profileKey differs from the local key (contributions)
 * are not mirrored — their local fallback keeps its per-user suffix and is
 * only written on the next local edit.
 */
/** Profile keys that local keys MAP onto (suffix dropped) — their local
 *  fallback lives under a different name, so hydration must not mirror them. */
const MAPPED_PROFILE_KEYS = new Set(['tep:userContributions']);

export function hydrateSettingsStore(settings: ProfileSetting[]): void {
  state.values = new Map(settings.map((s) => [s.Key, s.Value]));
  state.hydrated = true;
  for (const s of settings) {
    if (MAPPED_PROFILE_KEYS.has(s.Key)) continue;
    if (isMigratableKey(s.Key)) {
      try { localStorage.setItem(s.Key, s.Value); } catch { /* ignore */ }
    }
  }
}

/** Register the function that performs the debounced SaveUserProfile push. */
export function registerSettingsPush(push: PushFn): void {
  state.push = push;
  if (state.dirty.size > 0) scheduleFlush();
}

/** Logout / auth-user switch: back to pure localStorage pass-through. Pending
 *  unpushed changes are dropped from the queue (their localStorage mirror
 *  survives, so nothing the user did on THIS device is lost). */
export function resetSettingsStore(): void {
  clearTimers();
  state.hydrated = false;
  state.values = new Map();
  state.dirty = new Map();
  state.push = null;
  state.flushing = false;
}

/**
 * One-time adoption (first login after the feature ships): collect every
 * migratable localStorage value the profile doesn't know yet, as upserts for
 * a single SaveUserProfile. Contributions adopt only the CURRENT user's
 * suffixed key — another user's contributions on a shared device must not
 * leak into this profile.
 */
export function collectAdoptionSettings(currentUserId: string): ProfileSetting[] {
  const adopted: ProfileSetting[] = [];
  const seen = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isMigratableKey(key)) continue;
      if (key.startsWith('tep:userContributions') && key !== `tep:userContributions:${currentUserId}`) continue;
      const pk = profileKeyFor(key);
      if (seen.has(pk) || state.values.has(pk)) continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      seen.add(pk);
      adopted.push({ Key: pk, Value: value });
    }
  } catch { /* ignore storage failures */ }
  return adopted;
}

/** Test-only: force the debounced push to run now. */
export async function __flushSettingsForTest(): Promise<void> {
  clearTimers();
  await flushDirty();
}
