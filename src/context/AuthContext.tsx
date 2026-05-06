import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { sha256 } from '../utils/sha256';
import { loginApi, refreshTokenApi, logoutApi, getUserInfo, getUsersInfo } from '../api/identity';

type LoginResult =
  | { status: 'success' }
  | { status: 'failed'; message?: string }
  | { status: '2fa_required'; isSetupRequired: boolean; tempToken?: string; username: string; hashedPassword: string };

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string | null;
  displayName: string | null;
  userId: string | null;
  /** Raw role string from the user-info payload, or null if absent. */
  role: string | null;
  /** True when the user holds the audit role — UI must render fully read-only. */
  isAudit: boolean;
  /** True when the user holds the devops role — gates infra/diagnostics surfaces (e.g. Integration Logs). */
  isDevops: boolean;
  useDummyData: boolean;
  expiresAt: number | null;
  showSessionWarning: boolean;
  usersMap: Map<string, string>;
  login: (username: string, password: string, useDummy?: boolean) => Promise<LoginResult>;
  loginWith2fa: (username: string, hashedPassword: string, code: string) => Promise<LoginResult>;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
  dismissWarning: () => void;
  getAuthHeaders: () => Record<string, string>;
  refreshIfNeeded: () => Promise<void>;
}

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
  username: string;
  displayName: string | null;
  userId: string | null;
  /** Persisted so the audit pill / read-only state survives a page reload. */
  role: string | null;
  useDummyData: boolean;
}

function isAuditRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'audit';
}

function isDevopsRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'devops';
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'auth_session';
const USERS_MAP_KEY = 'tep:usersMap';
const WARNING_BEFORE_MS = 60_000; // show warning 1 minute before expiry
const AUTO_REFRESH_THRESHOLD_MS = 5 * 60_000; // auto-refresh when <5 min remaining

function loadSession(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: StoredAuth = JSON.parse(raw);
    if (Date.now() >= session.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredAuth | null>(loadSession);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [usersMap, setUsersMap] = useState<Map<string, string>>(() => {
    try {
      const raw = localStorage.getItem(USERS_MAP_KEY);
      if (raw) return new Map(JSON.parse(raw) as [string, string][]);
    } catch { /* ignore */ }
    return new Map();
  });

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const isAuthenticated = session !== null;
  const username = session?.username ?? null;
  const displayName = session?.displayName ?? null;
  const userId = session?.userId ?? null;
  const role = session?.role ?? null;
  const isAudit = isAuditRole(role);
  const isDevops = isDevopsRole(role);
  const useDummyData = session?.useDummyData ?? false;
  const expiresAt = session?.expiresAt ?? null;

  // Dual timers: warning at 1min before, logout at expiry
  useEffect(() => {
    if (!session) {
      setShowSessionWarning(false);
      return;
    }

    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Warning timer
    const warningIn = remaining - WARNING_BEFORE_MS;
    if (warningIn > 0) {
      timers.push(setTimeout(() => setShowSessionWarning(true), warningIn));
    } else {
      setShowSessionWarning(true);
    }

    // Logout timer
    timers.push(setTimeout(() => {
      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
    }, remaining));

    return () => timers.forEach(clearTimeout);
  }, [session]);

  const login = useCallback(async (user: string, pass: string, useDummy = true): Promise<LoginResult> => {
    try {
      const hashedPassword = await sha256(pass);
      const data = await loginApi({ Username: user, Password: hashedPassword });

      // Check if 2FA is required
      if ('requiresTwoFactor' in data && data.requiresTwoFactor) {
        return {
          status: '2fa_required',
          isSetupRequired: data.isSetupRequired,
          tempToken: data.accessToken,
          username: user,
          hashedPassword,
        };
      }

      // Normal login (no 2FA)
      const tokenData = data as { accessToken: string; refreshToken: string; expiresIn: number };
      if (!tokenData.accessToken) return { status: 'failed', message: 'No access token received' };

      // Fetch user info to get display name, userId, and role.
      let name: string | null = null;
      let uid: string | null = null;
      let userRole: string | null = null;
      try {
        const info = await getUserInfo(tokenData.accessToken);
        name = [info.firstName, info.lastName].filter(Boolean).join(' ') || null;
        uid = info.id || null;
        userRole = info.role ?? null;
      } catch {
        // getUserInfo failed — proceed with email as fallback. role stays null,
        // which is the safe default (= no audit lock).
      }

      // Fetch all users for OperatorId → name resolution
      try {
        const allUsers = await getUsersInfo(tokenData.accessToken);
        const entries: [string, string][] = allUsers.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]);
        setUsersMap(new Map(entries));
        localStorage.setItem(USERS_MAP_KEY, JSON.stringify(entries));
        // BACKEND-WORKAROUND(role-from-usersinfo): the /userinfo endpoint does
        // not currently return `role`; only /usersinfo does. Fall back to the
        // current user's row in the users list. Remove this block once
        // /userinfo includes `role` directly.
        if (!userRole && uid) {
          const me = allUsers.find((u) => u.id === uid);
          if (me?.role) userRole = me.role;
        }
      } catch {
        // getUsersInfo failed — usersMap stays empty
      }

      const newSession: StoredAuth = {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: Date.now() + tokenData.expiresIn * 1000,
        username: user,
        displayName: name,
        userId: uid,
        role: userRole,
        useDummyData: useDummy,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      setSession(newSession);
      return { status: 'success' };
    } catch (err) {
      return { status: 'failed', message: err instanceof Error ? err.message : 'Login failed' };
    }
  }, []);

  const loginWith2fa = useCallback(async (user: string, hashedPassword: string, code: string): Promise<LoginResult> => {
    try {
      const data = await loginApi({ Username: user, Password: hashedPassword, TwoFactorCode: code });

      // Should not get 2FA required after providing code
      if ('requiresTwoFactor' in data && data.requiresTwoFactor) {
        return { status: 'failed', message: 'Unexpected 2FA required response' };
      }

      const tokenData = data as { accessToken: string; refreshToken: string; expiresIn: number };
      if (!tokenData.accessToken) return { status: 'failed', message: 'No access token received' };

      // Fetch user info to get display name, userId, and role.
      let name: string | null = null;
      let uid: string | null = null;
      let userRole: string | null = null;
      try {
        const info = await getUserInfo(tokenData.accessToken);
        name = [info.firstName, info.lastName].filter(Boolean).join(' ') || null;
        uid = info.id || null;
        userRole = info.role ?? null;
      } catch {
        // getUserInfo failed — proceed with email as fallback.
      }

      // Fetch all users for OperatorId → name resolution
      try {
        const allUsers = await getUsersInfo(tokenData.accessToken);
        const entries: [string, string][] = allUsers.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]);
        setUsersMap(new Map(entries));
        localStorage.setItem(USERS_MAP_KEY, JSON.stringify(entries));
        // BACKEND-WORKAROUND(role-from-usersinfo): see login() above.
        if (!userRole && uid) {
          const me = allUsers.find((u) => u.id === uid);
          if (me?.role) userRole = me.role;
        }
      } catch {
        // getUsersInfo failed — usersMap stays empty
      }

      const newSession: StoredAuth = {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: Date.now() + tokenData.expiresIn * 1000,
        username: user,
        displayName: name,
        userId: uid,
        role: userRole,
        useDummyData: false,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      setSession(newSession);
      return { status: 'success' };
    } catch (err) {
      return { status: 'failed', message: err instanceof Error ? err.message : '2FA login failed' };
    }
  }, []);

  const logout = useCallback(() => {
    // Fire-and-forget server-side logout
    if (session?.accessToken) {
      logoutApi(session.accessToken).catch(() => {});
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USERS_MAP_KEY);
    setShowSessionWarning(false);
    setSession(null);
    setUsersMap(new Map());
  }, [session]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const s = sessionRef.current;
    if (!s) return false;

    try {
      const data = await refreshTokenApi(s.refreshToken);

      if (!data.accessToken) {
        logout();
        return false;
      }

      const newSession: StoredAuth = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + data.expiresIn * 1000,
        username: s.username,
        displayName: s.displayName,
        userId: s.userId,
        role: s.role,
        useDummyData: s.useDummyData,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      setShowSessionWarning(false);
      setSession(newSession);
      return true;
    } catch {
      logout();
      return false;
    }
  }, [logout]);

  const dismissWarning = useCallback(() => {
    setShowSessionWarning(false);
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!sessionRef.current) return {};
    return { Authorization: `Bearer ${sessionRef.current.accessToken}` };
  }, []);

  const refreshingRef = useRef(false);
  const refreshIfNeeded = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || refreshingRef.current) return;
    const remaining = s.expiresAt - Date.now();
    if (remaining > AUTO_REFRESH_THRESHOLD_MS) return;
    refreshingRef.current = true;
    try {
      await refreshSession();
    } finally {
      refreshingRef.current = false;
    }
  }, [refreshSession]);

  return (
    <AuthContext.Provider value={{
      isAuthenticated, username, displayName, userId, role, isAudit, isDevops, useDummyData, expiresAt, showSessionWarning, usersMap,
      login, loginWith2fa, logout, refreshSession, dismissWarning, getAuthHeaders, refreshIfNeeded,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
