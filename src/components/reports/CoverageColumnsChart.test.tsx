import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { CoverageColumnsChart } from './CoverageColumnsChart';
import type { CoverageDatum } from '../../utils/reports/aggregate';

let tooltipRow: CoverageDatum | null = null;

vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const echo = (testId: string) => (props: Record<string, unknown>) => {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') attrs[`data-${k.toLowerCase()}`] = String(v);
    }
    return <div data-testid={testId} {...attrs} />;
  };
  return {
    ResponsiveContainer: Passthrough,
    BarChart: ({ children, onClick, syncId, syncMethod }: { children?: ReactNode; onClick?: (state: { activeLabel?: string }) => void; syncId?: string; syncMethod?: string }) => (
      <div data-testid="bar-chart" data-syncid={syncId} data-syncmethod={syncMethod}>
        <button type="button" onClick={() => onClick?.({ activeLabel: '2024-02-01' })}>click-feb</button>
        <button type="button" onClick={() => onClick?.({})}>click-empty</button>
        {children}
      </div>
    ),
    Bar: echo('bar'),
    XAxis: echo('x-axis'),
    YAxis: echo('y-axis'),
    CartesianGrid: () => null,
    Tooltip: ({ content: C }: { content?: (props: { active?: boolean; payload?: Array<{ payload: unknown }> }) => ReactNode }) => (
      C && tooltipRow ? <div data-testid="tooltip">{C({ active: true, payload: [{ payload: tooltipRow }] })}</div> : null
    ),
    ReferenceArea: echo('reference-area'),
  };
});

const DATA: CoverageDatum[] = [
  { periodStart: '2024-01-01', axisLabel: 'Jan 2024', fullLabel: 'January 2024', title: 'Jan 2024', untagged: 690, tagged: 410, total: 1100, rate: 37.27, issues: 5, isGap: false },
  { periodStart: '2024-02-01', axisLabel: 'Feb 2024', fullLabel: 'February 2024', title: 'February 2024', untagged: 0, tagged: 0, total: 0, rate: 0, issues: 0, isGap: true },
  { periodStart: '2024-03-01', axisLabel: 'Mar 2024', fullLabel: 'March 2024', title: 'Mar 2024', untagged: 780, tagged: 2420, total: 3200, rate: 75.63, issues: 0, isGap: false },
];

describe('CoverageColumnsChart', () => {
  it('stacks Untagged on the baseline and Tagged on top with the chart tokens', () => {
    render(<CoverageColumnsChart data={DATA} selectedPeriod={null} onSelectPeriod={() => {}} singleFeed={false} />);
    const bars = screen.getAllByTestId('bar');
    expect(bars).toHaveLength(2);
    expect(bars[0].getAttribute('data-datakey')).toBe('untagged');
    expect(bars[0].getAttribute('data-fill')).toBe('var(--color-chart-2)');
    expect(bars[0].getAttribute('data-stackid')).toBe('coverage');
    expect(bars[1].getAttribute('data-datakey')).toBe('tagged');
    expect(bars[1].getAttribute('data-fill')).toBe('var(--color-chart-1)');
    expect(bars[1].getAttribute('data-stackid')).toBe('coverage');
    expect(bars[0].getAttribute('data-isanimationactive')).toBe('false');
    expect(screen.getByTestId('x-axis').getAttribute('data-datakey')).toBe('periodStart');
    expect(screen.getByTestId('bar-chart').getAttribute('data-syncid')).toBe('tep-reports');
    expect(screen.getByTestId('bar-chart').getAttribute('data-syncmethod')).toBe('value');
  });

  it('shows the two-series legend and the selection band only when a period is selected', () => {
    const { rerender } = render(<CoverageColumnsChart data={DATA} selectedPeriod={null} onSelectPeriod={() => {}} singleFeed={false} />);
    const legend = screen.getByRole('list', { name: 'Coverage by business period legend' });
    expect(within(legend).getByText('Tagged')).toBeDefined();
    expect(within(legend).getByText('Untagged')).toBeDefined();
    expect(screen.queryByTestId('reference-area')).toBeNull();
    rerender(<CoverageColumnsChart data={DATA} selectedPeriod="2024-03-01" onSelectPeriod={() => {}} singleFeed={false} />);
    expect(screen.getByTestId('reference-area').getAttribute('data-x1')).toBe('2024-03-01');
    expect(screen.getByTestId('reference-area').getAttribute('data-x2')).toBe('2024-03-01');
    expect(screen.getByTestId('reference-area').getAttribute('data-ifoverflow')).toBe('hidden');
  });

  it('selects the period from the chart click and ignores clicks on empty space', async () => {
    const user = userEvent.setup();
    const onSelectPeriod = vi.fn();
    render(<CoverageColumnsChart data={DATA} selectedPeriod={null} onSelectPeriod={onSelectPeriod} singleFeed={false} />);
    await user.click(screen.getByText('click-empty'));
    expect(onSelectPeriod).not.toHaveBeenCalled();
    await user.click(screen.getByText('click-feb'));
    expect(onSelectPeriod).toHaveBeenCalledWith('2024-02-01');
  });

  it('renders the table twin with every period, gaps muted', async () => {
    const user = userEvent.setup();
    render(<CoverageColumnsChart data={DATA} selectedPeriod={null} onSelectPeriod={() => {}} singleFeed={true} />);
    await user.click(screen.getByRole('radio', { name: 'Table' }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3
    expect(rows[1].textContent).toContain('January 2024');
    expect(rows[1].textContent).toContain('1,100');
    expect(rows[1].textContent).toContain('37.27%');
    expect(rows[1].className).toContain('text-body');
    expect(rows[2].className).toContain('text-faint');
    expect(within(rows[2]).getAllByRole('cell')[1].textContent).toBe('0');
    expect(rows[3].textContent).toContain('2,420');
  });

  it('names the rate source in the subtitle', () => {
    const { rerender } = render(<CoverageColumnsChart data={DATA} selectedPeriod={null} onSelectPeriod={() => {}} singleFeed={true} />);
    expect(screen.getByText(/backend's own rate/)).toBeDefined();
    rerender(<CoverageColumnsChart data={DATA} selectedPeriod={null} onSelectPeriod={() => {}} singleFeed={false} />);
    expect(screen.getByText(/summed across the selected feeds/)).toBeDefined();
  });

  it('tooltip shows the row title and a two-decimal rate', () => {
    tooltipRow = DATA[1];
    try {
      render(<CoverageColumnsChart data={DATA} selectedPeriod={null} onSelectPeriod={() => {}} singleFeed={false} />);
      const tooltip = screen.getByTestId('tooltip');
      expect(within(tooltip).getByText('February 2024')).toBeDefined();
      expect(within(tooltip).getByText('0.00%')).toBeDefined();
    } finally {
      tooltipRow = null;
    }
  });
});
