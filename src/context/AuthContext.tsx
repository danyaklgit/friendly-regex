import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const VALID_CREDENTIALS = { username: 'admin', password: 'admin' };
const STORAGE_KEY = 'auth_token';
const USERNAME_KEY = 'auth_username';

function generateToken(username: string): string {
  const payload = { username, iat: Date.now() };
  return btoa(JSON.stringify(payload));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USERNAME_KEY));

  const isAuthenticated = token !== null;

  const login = useCallback((user: string, pass: string): boolean => {
    if (user === VALID_CREDENTIALS.username && pass === VALID_CREDENTIALS.password) {
      const newToken = generateToken(user);
      localStorage.setItem(STORAGE_KEY, newToken);
      localStorage.setItem(USERNAME_KEY, user);
      setToken(newToken);
      setUsername(user);
      return true;
    }
    return false;
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
