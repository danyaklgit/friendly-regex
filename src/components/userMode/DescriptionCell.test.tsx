import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DescriptionCell } from './DescriptionCell';
import { UserModeProvider } from '../../context/UserModeContext';
import { AuthProvider } from '../../context/AuthContext';

// Tiny wrapper: DescriptionCell needs UserModeContext (for redactionOn), and
// UserModeContext needs AuthContext for the userId namespacing.
function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UserModeProvider>{children}</UserModeProvider>
    </AuthProvider>
  );
}

describe('DescriptionCell', () => {
  it('renders an em-dash placeholder when the text is empty', () => {
    render(<Wrap><DescriptionCell text="" /></Wrap>);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('applies redaction by default (REDACTION_RULES contains the ORDP rule)', () => {
    render(<Wrap><DescriptionCell text="x /ORDP/Acme/ y" /></Wrap>);
    expect(screen.getByText(/OrderingPty/)).toBeDefined();
    expect(screen.queryByText(/Acme/)).toBeNull();
  });

  it('does not show "Show more" for short text', () => {
    render(<Wrap><DescriptionCell text="A short one-liner." /></Wrap>);
    expect(screen.queryByText('Show more')).toBeNull();
  });

  it('toggles "Show more" / "Show less" for long text', async () => {
    const user = userEvent.setup();
    const long = 'lorem '.repeat(60); // ~360 chars
    render(<Wrap><DescriptionCell text={long} /></Wrap>);
    const toggle = screen.getByText('Show more');
    await user.click(toggle);
    expect(screen.getByText('Show less')).toBeDefined();
    await user.click(screen.getByText('Show less'));
    expect(screen.getByText('Show more')).toBeDefined();
  });
});
