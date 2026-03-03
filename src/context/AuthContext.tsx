import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { sha256 } from '../utils/sha256';

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOGIN_URL = '/api/identity/auth/login';
const STORAGE_KEY = 'auth_token';
const USERNAME_KEY = 'auth_username';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USERNAME_KEY));

  const isAuthenticated = token !== null;

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

    localStorage.setItem(STORAGE_KEY, data.accessToken);
    localStorage.setItem(USERNAME_KEY, user);
    setToken(data.accessToken);
    setUsername(user);
    return true;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setToken(null);
    setUsername(null);
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout, getAuthHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
