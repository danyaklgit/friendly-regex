import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { sha256 } from '../utils/sha256';

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string | null;
  expiresAt: number | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
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
const STORAGE_KEY = 'auth_session';

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

  const isAuthenticated = session !== null;
  const username = session?.username ?? null;
  const expiresAt = session?.expiresAt ?? null;

  // Auto-logout when token expires
  useEffect(() => {
    if (!session) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const timer = setTimeout(() => {
      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
    }, remaining);
    return () => clearTimeout(timer);
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
    setSession(null);
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!session) return {};
    return { Authorization: `Bearer ${session.accessToken}` };
  }, [session]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, expiresAt, login, logout, getAuthHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
