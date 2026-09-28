import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BreakdownPanel } from './BreakdownPanel';
import { makeReportFixture } from '../../utils/reports/fixtures';

describe('BreakdownPanel', () => {
  it('lists the seven breakdown rows with counts and share of the scope total', () => {
    render(<BreakdownPanel metrics={makeReportFixture().Totals} scopeLabel="Whole range" />);
    expect(screen.getByText('Breakdown')).toBeDefined();
    expect(screen.getByText('Whole range')).toBeDefined();
    const rows = screen.getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Fully tagged3,82060.6%',
      'Multi-tagged20.0%',
      'Dead end10.0%',
      'Missing mandatory attribute30.0%',
      'Missing optional attribute40.1%',
      'Invalid attribute10.0%',
      'Needs attention50.1%',
    ]);
    expect(screen.getByText(/Categories overlap/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Show whole range' })).toBeNull();
  });

  it('shows the clear button for a period scope and calls back', async () => {
    const user = userEvent.setup();
    const onClearScope = vi.fn();
    render(<BreakdownPanel metrics={makeReportFixture().Totals} scopeLabel="March 2024" onClearScope={onClearScope} />);
    expect(screen.getByText('March 2024')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Show whole range' }));
    expect(onClearScope).toHaveBeenCalledOnce();
  });

  it('shows 0.0% shares when the scope total is zero', () => {
    render(<BreakdownPanel metrics={{ ...makeReportFixture().Totals, TotalTransactionCount: 0 }} scopeLabel="Whole range" />);
    expect(screen.getAllByText('0.0%')).toHaveLength(7);
  });
});
