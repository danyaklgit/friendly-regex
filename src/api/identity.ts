import { throwIfNotOk } from './apiError';

const BASE = '/api/identity/auth';

interface LoginRequest {
  Username: string;
  Password: string;
}

interface TokenResponse {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export interface UserInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /**
   * Optional role tag. The only role currently honored by the UI is "audit",
   * which puts the entire app into read-only mode. Empty string, null, or
   * missing means the user has the standard operator role.
   */
  role?: string | null;
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function loginApi(payload: LoginRequest): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwIfNotOk(res, 'Login failed');
  return res.json();
}

export async function refreshTokenApi(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ RefreshToken: refreshToken }),
  });
  await throwIfNotOk(res, 'Token refresh failed');
  return res.json();
}

export async function logoutApi(accessToken: string): Promise<void> {
  await fetch(`${BASE}/logout`, {
    method: 'POST',
    headers: authHeader(accessToken),
  });
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(`${BASE}/userinfo`, {
    headers: authHeader(accessToken),
  });
  await throwIfNotOk(res, 'Failed to fetch user info');
  return res.json();
}

export async function getUsersInfo(accessToken: string): Promise<UserInfo[]> {
  const res = await fetch(`${BASE}/usersinfo`, {
    headers: authHeader(accessToken),
  });
  await throwIfNotOk(res, 'Failed to fetch users info');
  return res.json();
}
