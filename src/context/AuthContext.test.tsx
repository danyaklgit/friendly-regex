import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('AuthContext.inactivityTimeout', () => {
  // Mirror the constants in AuthContext.tsx so the assertions stay aligned
  // with the production timing if the constants are ever tweaked there too.
  const WARN_AT_MS = 25 * 60_000;
  const TIMEOUT_MS = 30 * 60_000;
  const GRACE_MS = TIMEOUT_MS - WARN_AT_MS;

  function seedSession(opts: Partial<{ expiresInMs: number }> = {}) {
    const expiresInMs = opts.expiresInMs ?? 60 * 60_000; // 1 hour, well past TIMEOUT
    localStorage.setItem(
      'auth_session',
      JSON.stringify({
        accessToken: 'tok',
        refreshToken: 'r',
        expiresAt: Date.now() + expiresInMs,
        username: 'u@x.com',
        displayName: 'U',
        userId: 'u1',
        role: null,
        useDummyData: false,
      }),
    );
  }

  function InactivityProbe() {
    const { showSessionWarning, isAuthenticated, graceDeadline } = useAuth();
    return (
      <div>
        <span data-testid="auth">{String(isAuthenticated)}</span>
        <span data-testid="warning">{String(showSessionWarning)}</span>
        <span data-testid="grace">{graceDeadline == null ? 'null' : 'set'}</span>
      </div>
    );
  }

  function renderInactivityProbe() {
    return render(
      <AuthProvider>
        <InactivityProbe />
      </AuthProvider>,
    );
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // logout() fire-and-forgets logoutApi(...).catch(...), so the mock must
    // return a Promise.
    vi.mocked(identity.logoutApi).mockResolvedValue(undefined);
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show the warning before 25 min of inactivity', () => {
    seedSession();
    renderInactivityProbe();
    expect(screen.getByTestId('auth').textContent).toBe('true');
    expect(screen.getByTestId('warning').textContent).toBe('false');

    // Just under the warning threshold.
    act(() => { vi.advanceTimersByTime(WARN_AT_MS - 1_000); });
    expect(screen.getByTestId('warning').textContent).toBe('false');
    expect(screen.getByTestId('grace').textContent).toBe('null');
  });

  it('shows the warning at 25 min idle and sets a grace deadline', () => {
    seedSession();
    renderInactivityProbe();

    act(() => { vi.advanceTimersByTime(WARN_AT_MS); });
    expect(screen.getByTestId('warning').textContent).toBe('true');
    expect(screen.getByTestId('grace').textContent).toBe('set');
  });

  it('forces logout after the 5 min grace window with no response', () => {
    seedSession();
    renderInactivityProbe();

    act(() => { vi.advanceTimersByTime(WARN_AT_MS); });
    expect(screen.getByTestId('warning').textContent).toBe('true');

    act(() => { vi.advanceTimersByTime(GRACE_MS); });
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(screen.getByTestId('warning').textContent).toBe('false');
    expect(localStorage.getItem('auth_session')).toBe(null);
  });

  it('dismisses the warning if activity resumes during the grace window', () => {
    seedSession();
    renderInactivityProbe();

    act(() => { vi.advanceTimersByTime(WARN_AT_MS); });
    expect(screen.getByTestId('warning').textContent).toBe('true');

    // Simulate user activity (the provider listens to window events).
    act(() => {
      window.dispatchEvent(new Event('mousedown'));
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('warning').textContent).toBe('false');
    expect(screen.getByTestId('auth').textContent).toBe('true');
  });

  it('keeps the warning suppressed indefinitely while the user is active', () => {
    // 24 h token so the expiresAt safety-net doesn't bite during the cycles.
    seedSession({ expiresInMs: 24 * 60 * 60_000 });
    renderInactivityProbe();

    // 5 cycles of (24 min idle, then bump) — total elapsed >> 30 min, but
    // never 25 min consecutively idle.
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(WARN_AT_MS - 60_000);
        window.dispatchEvent(new Event('keydown'));
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.getByTestId('warning').textContent).toBe('false');
    }
    expect(screen.getByTestId('auth').textContent).toBe('true');
  });
});
