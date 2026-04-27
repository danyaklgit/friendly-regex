import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../utils/sha256', () => ({
  sha256: vi.fn(async (s: string) => `hashed:${s}`),
}));

vi.mock('../api/identity', () => ({
  loginApi: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn(),
  getUserInfo: vi.fn(),
  getUsersInfo: vi.fn(async () => []),
}));

import * as identity from '../api/identity';

function Probe() {
  const { isAudit, role, isAuthenticated, login } = useAuth();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="role">{role ?? 'null'}</span>
      <span data-testid="audit">{String(isAudit)}</span>
      <button onClick={() => login('user@x.com', 'pw', false)}>login</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

describe('AuthContext.isAudit', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(identity.loginApi).mockResolvedValue({
      tokenType: 'Bearer',
      accessToken: 'tok',
      refreshToken: 'r',
      expiresIn: 3600,
    });
  });

  it('isAudit is false when no session', () => {
    renderProbe();
    expect(screen.getByTestId('audit').textContent).toBe('false');
    expect(screen.getByTestId('role').textContent).toBe('null');
  });

  it('isAudit is true when role is "audit"', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: 'audit',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('audit').textContent).toBe('true');
    expect(screen.getByTestId('role').textContent).toBe('audit');
  });

  it('isAudit is true regardless of casing/whitespace', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: '  Audit  ',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('audit').textContent).toBe('true');
  });

  it('isAudit is false when role is empty/null/missing', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: '',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('audit').textContent).toBe('false');
  });

  it('persists role through localStorage', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: 'audit',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    const stored = JSON.parse(localStorage.getItem('auth_session') ?? '{}');
    expect(stored.role).toBe('audit');
  });
});
