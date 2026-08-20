import { useEffect, useRef } from 'react';
import { getUserProfile, saveUserProfile } from '../api/userProfile';
import type { TepHeaders } from '../api/transactions';
import { useAuth } from '../context/AuthContext';
import {
  hydrateSettingsStore,
  registerSettingsPush,
  resetSettingsStore,
  collectAdoptionSettings,
} from '../utils/settingsStore';

/**
 * Bridges the settings store to the backend User Profile. Mounted once in
 * AppShell (ABOVE the operator/user-mode fork — both portals' preferences
 * sync). On login:
 *
 *  1. GetUserProfile → hydrate the store (migratable reads now serve the
 *     profile values; localStorage keeps working as the same-device mirror).
 *  2. One-time adoption: a profile that has never been saved (Id null) plus
 *     existing localStorage values → push the migratable keys up in ONE save,
 *     then hydrate from the merged response. From then on the profile wins.
 *  3. Register the debounced push (only changed keys + RemoveKeys travel).
 *
 * Any failure leaves the store un-hydrated — the app behaves exactly like the
 * pre-profile localStorage build for that session. On logout the store resets
 * to pass-through.
 */
export function useUserProfileSync(
  authToken: string | null,
  tepHeaders: TepHeaders | null,
  userId: string | undefined,
): void {
  const { useDummyData } = useAuth();
  // Token/headers refresh identity on every render (proactive token refresh);
  // the sync must NOT re-run on that — reads go through a ref so both the
  // initial hydrate and every later push use the freshest credentials.
  const credsRef = useRef({ authToken, tepHeaders });
  credsRef.current = { authToken, tepHeaders };
  const hasCreds = !!authToken && !!tepHeaders;

  useEffect(() => {
    if (!hasCreds || !userId || useDummyData) return;
    let cancelled = false;
    (async () => {
      try {
        const { authToken: token, tepHeaders: headers } = credsRef.current;
        if (!token || !headers) return;
        const profile = await getUserProfile(userId, token, headers);
        if (cancelled) return;

        let settings = profile.Settings;
        if (profile.Id === null) {
          // Never-saved profile: adopt this device's localStorage once.
          const adopted = collectAdoptionSettings(userId);
          if (adopted.length > 0) {
            const merged = await saveUserProfile(
              { UserId: userId, Settings: adopted },
              token,
              headers,
            );
            if (cancelled) return;
            settings = merged.Settings;
          }
        }

        hydrateSettingsStore(settings);
        registerSettingsPush(async (changed, removeKeys) => {
          const { authToken: t, tepHeaders: h } = credsRef.current;
          if (!t || !h) throw new Error('Not authenticated');
          await saveUserProfile(
            {
              UserId: userId,
              ...(changed.length > 0 ? { Settings: changed } : {}),
              ...(removeKeys.length > 0 ? { RemoveKeys: removeKeys } : {}),
            },
            t,
            h,
          );
        });
      } catch {
        // Profile backend unavailable — stay on localStorage for this session.
      }
    })();
    return () => {
      cancelled = true;
      resetSettingsStore();
    };
  }, [hasCreds, userId, useDummyData]);
}
