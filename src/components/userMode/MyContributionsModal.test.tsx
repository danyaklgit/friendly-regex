import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyContributionsModal } from './MyContributionsModal';
import { UserModeProvider } from '../../context/UserModeContext';
import { AuthProvider } from '../../context/AuthContext';
import type { Contribution } from '../../utils/userMode/contributionStorage';

// Seed a fake authenticated session so AuthProvider resolves `userId`,
// keying the contribution-storage namespace deterministically.
const FAKE_USER_ID = 'test-user-id';
const STORAGE_KEY = `tep:userContributions:${FAKE_USER_ID}`;

function seedAuthSession() {
  localStorage.setItem(
    'auth_session',
    JSON.stringify({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      username: 'tester',
      displayName: 'Tester',
      userId: FAKE_USER_ID,
      role: 'user',
      useDummyData: false,
    }),
  );
}

function Wrap() {
  return (
    <AuthProvider>
      <UserModeProvider>
        <MyContributionsModal open={true} onClose={() => {}} />
      </UserModeProvider>
    </AuthProvider>
  );
}

const baseContribution: Omit<Contribution, 'transactionId' | 'contributionDate'> = {
  bankReference: '200tf74240080003',
  entryDate: '2024-01-08T00:00:00',
  originalTag: 'VAT on Transaction',
  originalGroups: ['Accounts'],
  newTag: 'TEST',
  newGroups: ['Custom'],
  newTagIsCustom: true,
  saveType: 'self',
};

function seed(entries: Contribution[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

describe('MyContributionsModal', () => {
  beforeEach(() => {
    localStorage.clear();
    seedAuthSession();
  });

  it('renders an empty state when the user has no contributions', () => {
    render(<Wrap />);
    expect(screen.getByText("You haven't made any contributions yet.")).toBeDefined();
  });

  it('lists each contribution with its From/To tags', () => {
    seed([{ ...baseContribution, transactionId: 'tx-1', contributionDate: '2026-05-29T10:00:00Z' }]);
    render(<Wrap />);
    expect(screen.getByText('VAT on Transaction')).toBeDefined();
    expect(screen.getByText('TEST')).toBeDefined();
    // "Custom" appears twice on this row — once as the newGroups display and
    // once as the badge next to the new tag — so getAllByText is the safer query.
    expect(screen.getAllByText('Custom').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Saved for Self')).toBeDefined();
  });

  it('renders Applied status and "No reason provided" for self-save contributions', () => {
    seed([{ ...baseContribution, transactionId: 'tx-1', contributionDate: '2026-05-29T10:00:00Z' }]);
    render(<Wrap />);
    expect(screen.getByText('Applied')).toBeDefined();
    expect(screen.getByText('No reason provided')).toBeDefined();
  });

  it('renders the user-supplied reason for review contributions', () => {
    seed([
      {
        ...baseContribution,
        transactionId: 'tx-1',
        saveType: 'review',
        reason: 'Wrong tag — should be salary',
        contributionDate: '2026-05-29T10:00:00Z',
      },
    ]);
    render(<Wrap />);
    expect(screen.getByText('Submitted for Review')).toBeDefined();
    expect(screen.getByText('Wrong tag — should be salary')).toBeDefined();
  });

  it('Revert removes the row from the list', async () => {
    seed([{ ...baseContribution, transactionId: 'tx-1', contributionDate: '2026-05-29T10:00:00Z' }]);
    const user = userEvent.setup();
    render(<Wrap />);
    await user.click(screen.getByRole('button', { name: /Revert/ }));
    expect(screen.getByText("You haven't made any contributions yet.")).toBeDefined();
  });
});
