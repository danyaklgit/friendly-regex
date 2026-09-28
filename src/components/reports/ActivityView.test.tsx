import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityView } from './ActivityView';
import { makeActivityFixture, activityMetrics } from '../../utils/reports/fixtures';
import type { ActivityDatum } from '../../utils/reports/activityRows';

vi.mock('./ActivityColumnsChart', () => ({
  ACTIVITY_SYNC_ID: 'tep-activity',
  CHECKINS_COLOR: 'var(--color-chart-1)',
  RULES_ADDED_COLOR: 'var(--color-chart-3)',
  ActivityColumnsChart: ({ data }: { data: ActivityDatum[] }) => <div data-testid="activity-columns" data-count={data.length} />,
}));
vi.mock('./ReconstructedLineChart', () => ({
  ESTIMATE_COLOR: 'var(--color-muted)',
  ReconstructedLineChart: ({ data, reconstructed, total }: { data: ActivityDatum[]; reconstructed: boolean; total: number }) => (
    <div data-testid="estimate-line" data-count={data.length} data-reconstructed={String(reconstructed)} data-total={total} />
  ),
}));

const noop = () => {};
const tiles = () => within(screen.getByTestId('activity-tiles'));

describe('ActivityView', () => {
  it('renders the caption, history notice, four tiles from Totals, both charts, and the summary', () => {
    render(<ActivityView report={makeActivityFixture()} loading={false} error={null} onRetry={noop} onCopy={noop} requested={{}} />);
    expect(screen.getByText('Activity periods 2026-05-27 to 2026-09-25 · by month')).toBeDefined();
    expect(screen.getByText('Activity records begin 2026-05-27. Earlier periods have no records and are not shown.')).toBeDefined();
    expect(tiles().getByText('339').className).toContain('text-5xl');
    expect(tiles().getByText('30 saves · 10 rollbacks')).toBeDefined();
    expect(tiles().getByText('247')).toBeDefined();
    expect(tiles().getByText('net of removals, never negative')).toBeDefined();
    expect(tiles().getByText('5')).toBeDefined();
    expect(tiles().getByText('22')).toBeDefined();
    expect(screen.getByTestId('activity-columns').getAttribute('data-count')).toBe('5');
    const line = screen.getByTestId('estimate-line');
    expect(line.getAttribute('data-count')).toBe('5');
    expect(line.getAttribute('data-reconstructed')).toBe('true');
    expect(line.getAttribute('data-total')).toBe('50566');
    expect(screen.getByText('TEP tagging activity, 2026-05-27 to 2026-09-25')).toBeDefined();
  });

  it('hides the notice when the requested range starts inside the history', () => {
    render(<ActivityView report={makeActivityFixture()} loading={false} error={null} onRetry={noop} onCopy={noop} requested={{ from: '2026-06-01' }} />);
    expect(screen.queryByText(/Activity records begin/)).toBeNull();
  });

  it('passes the summary text to onCopy', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const report = makeActivityFixture();
    render(<ActivityView report={report} loading={false} error={null} onRetry={noop} onCopy={onCopy} requested={{}} />);
    await user.click(screen.getByRole('button', { name: 'Copy summary' }));
    expect(onCopy).toHaveBeenCalledWith(report.SummaryText);
  });

  it('shows the skeleton, the error card with Retry, and the empty state with the notice still visible', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<ActivityView report={null} loading error={null} onRetry={onRetry} onCopy={noop} requested={{}} />);
    expect(screen.getByRole('status', { name: 'Loading report' })).toBeDefined();
    rerender(<ActivityView report={null} loading={false} error="Server said no" onRetry={onRetry} onCopy={noop} requested={{}} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load the report: Server said no');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<ActivityView report={{ ...makeActivityFixture(), Points: [], Totals: activityMetrics() }} loading={false} error={null} onRetry={onRetry} onCopy={noop} requested={{ from: '2026-01-01', to: '2026-03-31' }} />);
    expect(screen.getByText('No activity in this range')).toBeDefined();
    expect(screen.getByText(/Activity records begin 2026-05-27/)).toBeDefined();
    expect(screen.queryByTestId('activity-columns')).toBeNull();
  });

  it('dims the frame while refetching and keeps the previous report', () => {
    render(<ActivityView report={makeActivityFixture()} loading error={null} onRetry={noop} onCopy={noop} requested={{}} />);
    const frame = screen.getByTestId('activity-frame');
    expect(frame.className).toContain('opacity-60');
    expect(frame.getAttribute('aria-busy')).toBe('true');
    expect(tiles().getByText('339')).toBeDefined();
  });
});
