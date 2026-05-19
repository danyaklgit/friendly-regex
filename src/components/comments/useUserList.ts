import { useEffect, useState } from 'react';
import { getUsersInfo, type UserInfo } from '../../api/identity';

let cachedPromise: Promise<UserInfo[]> | null = null;
let cachedToken: string | null = null;

/** Reset cache (used in tests). */
export function resetUserListCache(): void {
  cachedPromise = null;
  cachedToken = null;
}

/**
 * Lazily fetches the full user list for @-mention autocomplete and caches
 * the promise so multiple composers share one network call. The cache is
 * keyed by access token so a re-login re-fetches.
 */
export function useUserList(token: string | null): {
  users: UserInfo[];
  loading: boolean;
  error: string | null;
} {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    if (!cachedPromise || cachedToken !== token) {
      cachedToken = token;
      cachedPromise = getUsersInfo(token).catch((e) => {
        cachedPromise = null;
        throw e;
      });
    }
    setLoading(true);
    setError(null);
    cachedPromise
      .then((list) => {
        if (cancelled) return;
        setUsers(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { users, loading, error };
}
