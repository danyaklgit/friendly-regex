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
  /** Unix ms when the inactivity grace window expires (warningArmedAt +
   *  INACTIVITY_GRACE_MS). Null while no warning is showing. */
  graceDeadline: number | null;
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
// Backend-token refresh threshold: refresh proactively when <5 min of token
// life remains. Unrelated to the user-facing inactivity model below.
const AUTO_REFRESH_THRESHOLD_MS = 5 * 60_000;
// Inactivity-based session policy. Activity is any pointer / key / touch /
// scroll input AND any authenticated API call routed through refreshIfNeeded.
const INACTIVITY_TIMEOUT_MS = 30 * 60_000; // 30 min idle → force logout
const INACTIVITY_WARN_AT_MS = 25 * 60_000; // 25 min idle → warning modal
const INACTIVITY_GRACE_MS = INACTIVITY_TIMEOUT_MS - INACTIVITY_WARN_AT_MS; // 5 min

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

  // Last user activity timestamp — drives the inactivity timeout. Re-armed
  // on any pointer / keyboard / touch / scroll input as well as authenticated
  // API calls (via refreshIfNeeded).
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    const bump = () => { lastActivityRef.current = Date.now(); };
    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  // Deadline by which the user must respond to the warning modal before being
  // auto-logged-out. Null while no warning is showing. Exposed so the modal
  // can render an accurate countdown.
  const [graceDeadline, setGraceDeadline] = useState<number | null>(null);

  const isAuthenticated = session !== null;
  const username = session?.username ?? null;
  const displayName = session?.displayName ?? null;
  const userId = session?.userId ?? null;
  const role = session?.role ?? null;
  const isAudit = isAuditRole(role);
  const isDevops = isDevopsRole(role);
  const useDummyData = session?.useDummyData ?? false;
  const expiresAt = session?.expiresAt ?? null;

  // Forward-ref to logout so the inactivity tick (declared before logout) can
  // invoke it on grace expiry. Set further down once logout is constructed.
  const logoutRef = useRef<() => void>(() => {});
  // Forward-ref to refreshSession so the proactive-refresh effect (declared
  // before refreshSession) can call it. Set further down.
  const refreshSessionRef = useRef<() => Promise<boolean>>(async () => false);

  // Inactivity-based warning + auto-logout. Single 1s interval re-reads
  // lastActivityRef each tick. We arm the warning at ≥25 min idle and force a
  // logout when the 5 min grace window elapses with no fresh activity.
  useEffect(() => {
    if (!session) {
      setShowSessionWarning(false);
      setGraceDeadline(null);
      return;
    }

    let warningArmedAt: number | null = null;

    const tick = () => {
      const now = Date.now();
      const idleMs = now - lastActivityRef.current;
      if (warningArmedAt == null) {
        if (idleMs >= INACTIVITY_WARN_AT_MS) {
          warningArmedAt = now;
          setGraceDeadline(now + INACTIVITY_GRACE_MS);
          setShowSessionWarning(true);
        }
        return;
      }
      // Warning is showing. If activity bumped lastActivityRef at or after
      // warningArmedAt, the user came back — clear the warning. Otherwise
      // count down the grace window. (>= rather than > so a bump that lands
      // in the same millisecond the warning armed still dismisses it.)
      if (lastActivityRef.current >= warningArmedAt) {
        warningArmedAt = null;
        setShowSessionWarning(false);
        setGraceDeadline(null);
      } else if (now - warningArmedAt >= INACTIVITY_GRACE_MS) {
        warningArmedAt = null;
        setShowSessionWarning(false);
        setGraceDeadline(null);
        logoutRef.current();
      }
    };

    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [session]);

  // Proactive token refresh. Without this, an idle user's access token would
  // expire at the backend-issued lifetime (which can be much shorter than 30
  // min) and the safety net below would log them out with no warning. We
  // schedule a silent refresh AUTO_REFRESH_THRESHOLD_MS before expiry; on
  // success the session update re-runs this effect and the next refresh is
  // scheduled. The inactivity model is then the only thing that can drive a
  // user-facing logout.
  useEffect(() => {
    if (!session) return;
    const remaining = session.expiresAt - Date.now();
    const refreshIn = remaining - AUTO_REFRESH_THRESHOLD_MS;
    if (refreshIn <= 0) {
      void refreshSessionRef.current();
      return;
    }
    const id = setTimeout(() => { void refreshSessionRef.current(); }, refreshIn);
    return () => clearTimeout(id);
  }, [session]);

  // Backend-token safety net: if the proactive refresh ever fails to extend
  // expiresAt in time, force a logout rather than sit on a dead token. With
  // the keepalive above this effectively never fires in practice.
  useEffect(() => {
    if (!session) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) { logoutRef.current(); return; }
    const id = setTimeout(() => logoutRef.current(), remaining);
    return () => clearTimeout(id);
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
      // Do NOT bump lastActivityRef here — refreshSession is now also called
      // proactively in the background (token keepalive), which must not
      // reset the inactivity clock or an idle user would never time out.
      // User-initiated refreshes (e.g. clicking "Get More Time") get an
      // activity bump from the DOM mousedown listener naturally.
      setShowSessionWarning(false);
      setGraceDeadline(null);
      setSession(newSession);
      return true;
    } catch {
      logout();
      return false;
    }
  }, [logout]);

  // Keep the forward-ref in sync so the inactivity tick can call the latest
  // logout (which itself closes over `session`).
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  // Same pattern for refreshSession so the proactive-refresh keepalive picks
  // up the latest implementation (which closes over `logout`).
  useEffect(() => {
    refreshSessionRef.current = refreshSession;
  }, [refreshSession]);

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
    if (!s) return;
    // Any authenticated API call counts as user activity for the
    // inactivity model — even if we don't actually need to refresh.
    lastActivityRef.current = Date.now();
    if (refreshingRef.current) return;
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
      isAuthenticated, username, displayName, userId, role, isAudit, isDevops, useDummyData, expiresAt, showSessionWarning, graceDeadline, usersMap,
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
