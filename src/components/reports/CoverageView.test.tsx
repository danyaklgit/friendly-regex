import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoverageView } from './CoverageView';
import { makeReportFixture, point, metrics } from '../../utils/reports/fixtures';
import type { CoverageDatum } from '../../utils/reports/aggregate';

vi.mock('./CoverageColumnsChart', () => ({
  REPORTS_SYNC_ID: 'tep-reports',
  CoverageColumnsChart: ({ data, selectedPeriod, onSelectPeriod }: { data: CoverageDatum[]; selectedPeriod: string | null; onSelectPeriod: (p: string) => void }) => (
    <div data-testid="columns" data-selected={selectedPeriod ?? ''} data-count={data.length}>
      <button type="button" onClick={() => onSelectPeriod(data[0].periodStart)}>select-first</button>
    </div>
  ),
}));
vi.mock('./FeedRateLinesChart', () => ({
  FeedRateLinesChart: ({ feeds }: { feeds: string[] }) => <div data-testid="lines" data-feeds={feeds.join(',')} />,
}));

const noop = () => {};
const tiles = () => within(screen.getByTestId('coverage-tiles'));

describe('CoverageView', () => {
  it('renders the caption, the four tiles from Totals, both charts, the breakdown, the feed table, and the summary', () => {
    render(<CoverageView report={makeReportFixture()} loading={false} error={null} onRetry={noop} onCopy={noop} />);
    expect(screen.getByText('Business periods 2024-01-01 to 2024-03-31 · by month · Operator view')).toBeDefined();
    expect(tiles().getByText('6,300')).toBeDefined();
    expect(tiles().getByText('60.8%').className).toContain('text-5xl');
    expect(tiles().getByText('2,470')).toBeDefined();
    expect(tiles().getByText('5')).toBeDefined();
    expect(screen.getByTestId('columns').getAttribute('data-count')).toBe('3');
    expect(screen.getByTestId('lines').getAttribute('data-feeds')).toBe('MT940,Ledger');
    expect(screen.getByRole('region', { name: 'Breakdown' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Per-feed totals' })).toBeDefined();
    expect(screen.getByText('TEP tagging progress, 2024-01-01 to 2024-03-31')).toBeDefined();
    expect(screen.queryByText(/Showing .* periods/)).toBeNull();
  });

  it('scopes the breakdown to the selected period (summed across feeds) and clears it', async () => {
    const user = userEvent.setup();
    render(<CoverageView report={makeReportFixture()} loading={false} error={null} onRetry={noop} onCopy={noop} />);
    const breakdown = screen.getByRole('region', { name: 'Breakdown' });
    expect(breakdown.textContent).toContain('Whole range');
    expect(breakdown.textContent).toContain('60.6%'); // Fully tagged 3,820 of 6,300
    await user.click(screen.getByText('select-first'));
    expect(screen.getByTestId('columns').getAttribute('data-selected')).toBe('2024-01-01');
    expect(breakdown.textContent).toContain('January 2024');
    expect(breakdown.textContent).toContain('36.4%'); // Fully tagged 390 + 10 of 1,000 + 100
    expect(tiles().getByText('6,300')).toBeDefined(); // tiles never follow the selection
    await user.click(screen.getByRole('button', { name: 'Show whole range' }));
    expect(breakdown.textContent).toContain('Whole range');
    expect(screen.getByTestId('columns').getAttribute('data-selected')).toBe('');
  });

  it('drops a selection that no longer exists after a refetch', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CoverageView report={makeReportFixture()} loading={false} error={null} onRetry={noop} onCopy={noop} />);
    await user.click(screen.getByText('select-first'));
    const narrowed = {
      ...makeReportFixture(),
      Series: [{ DataSetType: 'MT940', Points: [point('2024-03-01', '2024-03-31', 'Mar 2024', 3000, 2400)], Totals: metrics({ TotalTransactionCount: 3000, TotalTaggedCount: 2400, UntaggedCount: 600, TaggingRate: 80 }) }],
    };
    rerender(<CoverageView report={narrowed} loading={false} error={null} onRetry={noop} onCopy={noop} />);
    expect(screen.getByTestId('columns').getAttribute('data-selected')).toBe('');
    expect(screen.getByRole('region', { name: 'Breakdown' }).textContent).toContain('Whole range');
  });

  it('clears the period selection when the granularity changes, even if the period string collides', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CoverageView report={makeReportFixture()} loading={false} error={null} onRetry={noop} onCopy={noop} />);
    await user.click(screen.getByText('select-first'));
    expect(screen.getByTestId('columns').getAttribute('data-selected')).toBe('2024-01-01');
    const yearReport = {
      ...makeReportFixture(),
      Granularity: 'Year' as const,
      Series: [{ DataSetType: 'MT940', Points: [point('2024-01-01', '2024-12-31', '2024', 6000, 3800)], Totals: metrics({ TotalTransactionCount: 6000, TotalTaggedCount: 3800, UntaggedCount: 2200, TaggingRate: 63.33 }) }],
    };
    rerender(<CoverageView report={yearReport} loading={false} error={null} onRetry={noop} onCopy={noop} />);
    expect(screen.getByRole('region', { name: 'Breakdown' }).textContent).toContain('Whole range');
    expect(screen.getByTestId('columns').getAttribute('data-selected')).toBe('');
    rerender(<CoverageView report={makeReportFixture()} loading={false} error={null} onRetry={noop} onCopy={noop} />);
    expect(screen.getByRole('region', { name: 'Breakdown' }).textContent).toContain('Whole range');
    expect(screen.getByTestId('columns').getAttribute('data-selected')).toBe('');
  });

  it('passes the summary text to onCopy', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const report = makeReportFixture();
    render(<CoverageView report={report} loading={false} error={null} onRetry={noop} onCopy={onCopy} />);
    await user.click(screen.getByRole('button', { name: 'Copy summary' }));
    expect(onCopy).toHaveBeenCalledWith(report.SummaryText);
  });

  it('shows the skeleton on first load, the error card with Retry, and the empty state', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<CoverageView report={null} loading error={null} onRetry={onRetry} onCopy={noop} />);
    expect(screen.getByRole('status', { name: 'Loading report' })).toBeDefined();
    rerender(<CoverageView report={null} loading={false} error="Server said no" onRetry={onRetry} onCopy={noop} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load the report: Server said no');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<CoverageView report={{ ...makeReportFixture(), Series: [], Totals: metrics() }} loading={false} error={null} onRetry={onRetry} onCopy={noop} />);
    expect(screen.getByText('No transactions in this range')).toBeDefined();
  });

  it('dims the frame and keeps the previous report while refetching, and keeps it under an error', () => {
    const { rerender } = render(<CoverageView report={makeReportFixture()} loading error={null} onRetry={noop} onCopy={noop} />);
    const frame = screen.getByTestId('coverage-frame');
    expect(frame.className).toContain('opacity-60');
    expect(frame.getAttribute('aria-busy')).toBe('true');
    expect(tiles().getByText('6,300')).toBeDefined();
    rerender(<CoverageView report={makeReportFixture()} loading={false} error="Timed out" onRetry={noop} onCopy={noop} />);
    expect(screen.getByRole('alert').textContent).toContain('Timed out');
    expect(tiles().getByText('6,300')).toBeDefined();
  });

  it('warns about a dense axis', () => {
    const days = Array.from({ length: 401 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
      return point(d, d, d, 10, 5);
    });
    const report = { ...makeReportFixture(), Granularity: 'Day' as const, Series: [{ DataSetType: 'MT940', Points: days, Totals: metrics({ TotalTransactionCount: 4010, TotalTaggedCount: 2005, UntaggedCount: 2005, TaggingRate: 50 }) }] };
    render(<CoverageView report={report} loading={false} error={null} onRetry={noop} onCopy={noop} />);
    expect(screen.getByText('Showing 401 periods. Switch to Week or Month, or narrow the range, for a clearer chart.')).toBeDefined();
  });
});
