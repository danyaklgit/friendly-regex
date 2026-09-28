import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SummaryCard } from './SummaryCard';

describe('SummaryCard', () => {
  it('renders each line, keeps blank lines as spacing, and copies on click', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(<SummaryCard lines={['TEP tagging progress', '', '- 108,910 transactions']} onCopy={onCopy} />);
    expect(screen.getByText('Summary')).toBeDefined();
    expect(screen.getByText('TEP tagging progress')).toBeDefined();
    expect(screen.getByText('- 108,910 transactions')).toBeDefined();
    expect(document.querySelectorAll('[data-summary-spacer]')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Copy summary' }));
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it('disables the copy button when asked', () => {
    render(<SummaryCard lines={[]} onCopy={() => {}} copyDisabled />);
    expect((screen.getByRole('button', { name: 'Copy summary' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('No summary for this range.')).toBeDefined();
  });
});
