import { throwIfNotOk } from './apiError';

const BASE = '/api/identity/auth';

interface LoginRequest {
  Username: string;
  Password: string;
  TwoFactorCode?: string;
}

interface TokenResponse {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

interface TwoFactorRequired {
  requiresTwoFactor: true;
  isSetupRequired: boolean;
  message: string;
  accessToken?: string;
}

type LoginResponse = TokenResponse | TwoFactorRequired;

export interface UserInfo {
  id: string;
  firstName: string;
  lastName: string;
  /** Present on `/userinfo`; sometimes equal to `username`. */
  email?: string;
  /**
   * Login username (typically the email). Present on `/usersinfo` rows and on
   * the `/userinfo` payload. Used as the disambiguator when matching a user
   * back to a `/usersinfo` row — see the BACKEND-WORKAROUND in
   * `AuthContext.tsx` for why we can't trust `id` alone right now.
   */
  username?: string;
  /**
   * Optional role tag. Roles currently honored by the UI:
   *  - "audit" — puts the entire app into read-only mode.
   *  - "devops" — exposes infra/diagnostics surfaces (e.g. Integration Logs).
   *  - "user"  — pivots the app to the bwatech-branded demo portal.
   * Empty string, null, or missing means the user has the standard operator role.
   */
  role?: string | null;
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function loginApi(payload: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  // Note: 2FA responses return 200 with requiresTwoFactor flag, not errors
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

export async function get2faSetup(tempToken: string): Promise<{ sharedKey: string; authenticatorUri: string }> {
  const res = await fetch(`${BASE}/2fa/setup`, {
    headers: authHeader(tempToken),
  });
  await throwIfNotOk(res, 'Failed to fetch 2FA setup');
  return res.json();
}

export async function enable2fa(tempToken: string, code: string): Promise<void> {
  const res = await fetch(`${BASE}/2fa/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(tempToken) },
    body: JSON.stringify({ code }),
  });
  await throwIfNotOk(res, 'Failed to enable 2FA');
}
