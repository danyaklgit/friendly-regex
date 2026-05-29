import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RedactionToggle } from './RedactionToggle';
import { UserModeProvider, useUserMode } from '../../context/UserModeContext';
import { AuthProvider } from '../../context/AuthContext';

function Probe() {
  const { redactionOn } = useUserMode();
  return <span data-testid="state">{redactionOn ? 'on' : 'off'}</span>;
}

function Wrap() {
  return (
    <AuthProvider>
      <UserModeProvider>
        <RedactionToggle />
        <Probe />
      </UserModeProvider>
    </AuthProvider>
  );
}

describe('RedactionToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts in the ON state', () => {
    render(<Wrap />);
    expect(screen.getByTestId('state').textContent).toBe('on');
  });

  it('opens the password modal when toggled from ON', async () => {
    const user = userEvent.setup();
    render(<Wrap />);
    await user.click(screen.getByRole('switch', { name: 'Redaction' }));
    expect(screen.getByText('Turn off redaction')).toBeDefined();
  });

  it('rejects the wrong password and keeps the state ON', async () => {
    const user = userEvent.setup();
    render(<Wrap />);
    await user.click(screen.getByRole('switch', { name: 'Redaction' }));
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(screen.getByText('Incorrect password.')).toBeDefined();
    expect(screen.getByTestId('state').textContent).toBe('on');
  });

  it('accepts the correct password and flips to OFF', async () => {
    const user = userEvent.setup();
    render(<Wrap />);
    await user.click(screen.getByRole('switch', { name: 'Redaction' }));
    await user.type(screen.getByLabelText('Password'), '123123');
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(screen.getByTestId('state').textContent).toBe('off');
  });

  it('one-click re-enables redaction when in the OFF state', async () => {
    const user = userEvent.setup();
    render(<Wrap />);
    // Turn it off first.
    await user.click(screen.getByRole('switch', { name: 'Redaction' }));
    await user.type(screen.getByLabelText('Password'), '123123');
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(screen.getByTestId('state').textContent).toBe('off');
    // Now flip back on — no password modal.
    await user.click(screen.getByRole('switch', { name: 'Redaction' }));
    expect(screen.getByTestId('state').textContent).toBe('on');
    expect(screen.queryByText('Turn off redaction')).toBeNull();
  });
});
