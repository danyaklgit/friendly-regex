import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { sha256 } from '../utils/sha256';

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string | null;
  expiresAt: number | null;
  showSessionWarning: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
  dismissWarning: () => void;
  getAuthHeaders: () => Record<string, string>;
}

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
  username: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOGIN_URL = '/api/identity/auth/login';
const REFRESH_URL = '/api/identity/auth/refresh';
const STORAGE_KEY = 'auth_session';
const WARNING_BEFORE_MS = 60_000; // show warning 1 minute before expiry

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

  const isAuthenticated = session !== null;
  const username = session?.username ?? null;
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
      // Less than 1 minute remaining — show warning immediately
      setShowSessionWarning(true);
    }

    // Logout timer
    timers.push(setTimeout(() => {
      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
    }, remaining));

    return () => timers.forEach(clearTimeout);
  }, [session]);

  const login = useCallback(async (user: string, pass: string): Promise<boolean> => {
    const hashedPassword = await sha256(pass);

    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: user, Password: hashedPassword }),
    });

    if (!res.ok) return false;

    const data = await res.json();

    if (!data.accessToken) return false;

    const newSession: StoredAuth = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
      username: user,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    setSession(newSession);
    return true;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setShowSessionWarning(false);
    setSession(null);
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (!session) return false;

    try {
      const res = await fetch(REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ RefreshToken: session.refreshToken }),
      });

      if (!res.ok) {
        logout();
        return false;
      }

      const data = await res.json();

      if (!data.accessToken) {
        logout();
        return false;
      }

      const newSession: StoredAuth = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + data.expiresIn * 1000,
        username: session.username,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      setShowSessionWarning(false);
      setSession(newSession);
      return true;
    } catch {
      logout();
      return false;
    }
  }, [session, logout]);

  const dismissWarning = useCallback(() => {
    setShowSessionWarning(false);
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!session) return {};
    return { Authorization: `Bearer ${session.accessToken}` };
  }, [session]);

  return (
    <AuthContext.Provider value={{
      isAuthenticated, username, expiresAt, showSessionWarning,
      login, logout, refreshSession, dismissWarning, getAuthHeaders,
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
