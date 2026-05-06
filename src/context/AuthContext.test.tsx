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
  const { isAudit, isDevops, role, isAuthenticated, login } = useAuth();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="role">{role ?? 'null'}</span>
      <span data-testid="audit">{String(isAudit)}</span>
      <span data-testid="devops">{String(isDevops)}</span>
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

describe('AuthContext.isDevops', () => {
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

  it('isDevops is false when no session', () => {
    renderProbe();
    expect(screen.getByTestId('devops').textContent).toBe('false');
    expect(screen.getByTestId('role').textContent).toBe('null');
  });

  it('isDevops is true when role is "devops"', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: 'devops',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('devops').textContent).toBe('true');
    expect(screen.getByTestId('role').textContent).toBe('devops');
  });

  it('isDevops is true regardless of casing/whitespace', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: '  DevOps  ',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('devops').textContent).toBe('true');
  });

  it('isDevops is false when role is empty/null/missing', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: '',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('devops').textContent).toBe('false');
  });

  it('isAudit and isDevops are mutually exclusive for a single role string', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: 'devops',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('audit').textContent).toBe('false');
    expect(screen.getByTestId('devops').textContent).toBe('true');
  });

  it('persists devops role through localStorage', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: 'devops',
    });
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    const stored = JSON.parse(localStorage.getItem('auth_session') ?? '{}');
    expect(stored.role).toBe('devops');
  });

  // BACKEND-WORKAROUND(role-from-usersinfo): /userinfo doesn't return role yet,
  // so we fall back to looking up the current user in /usersinfo. Drop this
  // test once /userinfo returns role directly.
  it('falls back to /usersinfo for role when /userinfo omits it', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      // role missing from /userinfo
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com',
    });
    vi.mocked(identity.getUsersInfo).mockResolvedValueOnce([
      { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: 'devops' },
      { id: 'u2', firstName: 'C', lastName: 'D', email: 'c@d.com', role: 'audit' },
    ]);
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('devops').textContent).toBe('true');
    expect(screen.getByTestId('role').textContent).toBe('devops');
  });

  it('prefers /userinfo role over /usersinfo when both are present', async () => {
    vi.mocked(identity.getUserInfo).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: 'audit',
    });
    vi.mocked(identity.getUsersInfo).mockResolvedValueOnce([
      { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', role: 'devops' },
    ]);
    renderProbe();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('role').textContent).toBe('audit');
    expect(screen.getByTestId('audit').textContent).toBe('true');
    expect(screen.getByTestId('devops').textContent).toBe('false');
  });
});
