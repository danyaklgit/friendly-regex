import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the auth context. The modal now consumes `graceDeadline` directly and
// runs its own countdown internally instead of leaning on useTimeRemaining.
const mockRefreshSession = vi.fn().mockResolvedValue(true);
const mockLogout = vi.fn();
const fixedGraceDeadline = Date.now() + 5 * 60_000; // 5:00 ahead
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    showSessionWarning: true,
    graceDeadline: fixedGraceDeadline,
    refreshSession: mockRefreshSession,
    logout: mockLogout,
  }),
}));

import { SessionWarningModal } from './SessionWarningModal';

describe('SessionWarningModal', () => {
  it('renders the modal with the inactivity countdown', () => {
    render(<SessionWarningModal />);
    expect(screen.getByText('Session Expiring')).toBeDefined();
    expect(screen.getByText(/^Logging out in \d+:\d{2}$/)).toBeDefined();
  });

  it('renders Get More Time button', () => {
    render(<SessionWarningModal />);
    expect(screen.getByText('Get More Time')).toBeDefined();
  });

  it('renders Log Out button', () => {
    render(<SessionWarningModal />);
    expect(screen.getByText('Log Out')).toBeDefined();
  });

  it('calls logout when Log Out clicked', async () => {
    const user = userEvent.setup();
    render(<SessionWarningModal />);
    await user.click(screen.getByText('Log Out'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('calls refreshSession when Get More Time clicked', async () => {
    const user = userEvent.setup();
    render(<SessionWarningModal />);
    await user.click(screen.getByText('Get More Time'));
    expect(mockRefreshSession).toHaveBeenCalled();
  });

  it('shows Extending... while refreshing', async () => {
    mockRefreshSession.mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<SessionWarningModal />);
    await user.click(screen.getByText('Get More Time'));
    expect(screen.getByText('Extending...')).toBeDefined();
  });

  it('shows instruction text', () => {
    render(<SessionWarningModal />);
    expect(screen.getByText(/Click "Get More Time" to continue your session/)).toBeDefined();
  });

  it('onClose no-op does not throw when overlay clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<SessionWarningModal />);
    // Click the dark overlay behind the modal (triggers onClose={() => {}})
    const overlay = container.querySelector('.bg-black\\/10');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
    // Modal should still be rendered (onClose is a no-op)
    expect(screen.getByText('Session Expiring')).toBeDefined();
  });
});
