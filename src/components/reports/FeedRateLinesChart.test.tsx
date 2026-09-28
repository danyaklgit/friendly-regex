import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { FeedRateLinesChart } from './FeedRateLinesChart';
import type { FeedRateDatum } from '../../utils/reports/aggregate';

let tooltipRow: FeedRateDatum | null = null;

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
    LineChart: ({ children, syncId, syncMethod }: { children?: ReactNode; syncId?: string; syncMethod?: string }) => (
      <div data-testid="line-chart" data-syncid={syncId} data-syncmethod={syncMethod}>{children}</div>
    ),
    Line: echo('line'),
    XAxis: echo('x-axis'),
    YAxis: echo('y-axis'),
    CartesianGrid: () => null,
    Tooltip: ({ content: C }: { content?: (props: { active?: boolean; payload?: Array<{ payload: unknown }> }) => ReactNode }) => (
      C && tooltipRow ? <div data-testid="tooltip">{C({ active: true, payload: [{ payload: tooltipRow }] })}</div> : null
    ),
  };
});

const DATA: FeedRateDatum[] = [
  { periodStart: '2024-01-01', axisLabel: 'Jan 2024', fullLabel: 'January 2024', title: 'Jan 2024', feeds: { MT940: { rate: 40, count: 1000 }, Ledger: { rate: 10, count: 100 } }, 'rate:MT940': 40, 'rate:Ledger': 10 },
  { periodStart: '2024-02-01', axisLabel: 'Feb 2024', fullLabel: 'February 2024', title: 'Feb 2024', feeds: { MT940: { rate: 50, count: 2000 }, Ledger: null }, 'rate:MT940': 50, 'rate:Ledger': null },
];

describe('FeedRateLinesChart', () => {
  it('draws one linear, dotless, non-connecting line per feed in its fixed slot color', () => {
    render(<FeedRateLinesChart data={DATA} feeds={['MT940', 'Ledger', 'Mystery']} />);
    const lines = screen.getAllByTestId('line');
    expect(lines).toHaveLength(3);
    expect(lines[0].getAttribute('data-datakey')).toBe('rate:MT940');
    expect(lines[0].getAttribute('data-stroke')).toBe('var(--color-chart-1)');
    expect(lines[0].getAttribute('data-type')).toBe('linear');
    expect(lines[0].getAttribute('data-connectnulls')).toBe('false');
    expect(lines[0].getAttribute('data-dot')).toBe('false');
    expect(lines[0].getAttribute('data-strokewidth')).toBe('2');
    expect(lines[1].getAttribute('data-stroke')).toBe('var(--color-chart-5)');
    expect(lines[2].getAttribute('data-stroke')).toBe('var(--color-faint)');
    expect(lines[2].getAttribute('data-name')).toBe('Mystery');
    expect(screen.getByTestId('line-chart').getAttribute('data-syncid')).toBe('tep-reports');
    expect(screen.getByTestId('line-chart').getAttribute('data-syncmethod')).toBe('value');
  });

  it('shows a legend for several feeds and none for a single feed', () => {
    const { rerender } = render(<FeedRateLinesChart data={DATA} feeds={['MT940', 'Ledger']} />);
    expect(screen.getByRole('list', { name: 'Coverage rate by feed legend' }).textContent).toContain('Ledger (ERP)');
    rerender(<FeedRateLinesChart data={DATA} feeds={['MT940']} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/MT940/)).toBeDefined();
  });

  it('renders the table twin with rate and count per feed and "no data" for absent points', async () => {
    const user = userEvent.setup();
    render(<FeedRateLinesChart data={DATA} feeds={['MT940', 'Ledger']} />);
    await user.click(screen.getByRole('radio', { name: 'Table' }));
    const rows = screen.getAllByRole('row');
    expect(rows[0].textContent).toContain('Ledger (ERP)');
    expect(rows[1].textContent).toContain('40.00% (1,000)');
    expect(rows[2].textContent).toContain('50.00% (2,000)');
    expect(rows[2].textContent).toContain('no data');
  });

  it('tooltip shows the row title and one row per feed with rate and count', () => {
    tooltipRow = DATA[0];
    try {
      render(<FeedRateLinesChart data={DATA} feeds={['MT940', 'Ledger']} />);
      const tooltip = screen.getByTestId('tooltip');
      expect(within(tooltip).getByText('Jan 2024')).toBeDefined();
      expect(within(tooltip).getByText('40.00%')).toBeDefined();
      expect(within(tooltip).getByText('MT940 · 1,000 txns')).toBeDefined();
      expect(within(tooltip).getByText('10.00%')).toBeDefined();
      expect(within(tooltip).getByText('Ledger (ERP) · 100 txns')).toBeDefined();
    } finally {
      tooltipRow = null;
    }
  });

  it('tooltip shows "no data" and the bare feed label for a feed absent in the period', () => {
    tooltipRow = DATA[1];
    try {
      render(<FeedRateLinesChart data={DATA} feeds={['MT940', 'Ledger']} />);
      const tooltip = screen.getByTestId('tooltip');
      expect(within(tooltip).getByText('Feb 2024')).toBeDefined();
      expect(within(tooltip).getByText('50.00%')).toBeDefined();
      expect(within(tooltip).getByText('MT940 · 2,000 txns')).toBeDefined();
      expect(within(tooltip).getByText('no data')).toBeDefined();
      expect(within(tooltip).getByText('Ledger (ERP)')).toBeDefined();
    } finally {
      tooltipRow = null;
    }
  });
});
