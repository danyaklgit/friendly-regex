import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ReconstructedLineChart } from './ReconstructedLineChart';
import { buildActivityRows, toActivityData, type ActivityDatum } from '../../utils/reports/activityRows';
import { makeActivityFixture } from '../../utils/reports/fixtures';

let tooltipRow: ActivityDatum | null = null;

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
    Line: echo('line'), XAxis: echo('x-axis'), YAxis: echo('y-axis'),
    CartesianGrid: () => null,
    Tooltip: ({ content: C }: { content?: (props: { active?: boolean; payload?: Array<{ payload: unknown }> }) => ReactNode }) => (
      C && tooltipRow ? <div data-testid="tooltip">{C({ active: true, payload: [{ payload: tooltipRow }] })}</div> : null
    ),
  };
});

const DATA = toActivityData(buildActivityRows(makeActivityFixture(), {}));

describe('ReconstructedLineChart', () => {
  it('draws one dashed muted line, no legend, and wears the ~ prefix while reconstructed', async () => {
    const user = userEvent.setup();
    render(<ReconstructedLineChart data={DATA} reconstructed total={50566} />);
    const lines = screen.getAllByTestId('line');
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute('data-datakey')).toBe('transactionsTagged');
    expect(lines[0].getAttribute('data-stroke')).toBe('var(--color-muted)');
    expect(lines[0].getAttribute('data-strokedasharray')).toBe('4 4');
    expect(lines[0].getAttribute('data-type')).toBe('linear');
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Transactions tagged, reconstructed estimate' })).toBeDefined();
    expect(screen.getByText(/~50,566 in range/)).toBeDefined();
    expect(screen.getByText(/re-tagged/)).toBeDefined();
    expect(screen.getByTestId('line-chart').getAttribute('data-syncid')).toBe('tep-activity');
    expect(screen.getByTestId('line-chart').getAttribute('data-syncmethod')).toBe('value');
    await user.click(screen.getByRole('radio', { name: 'Table' }));
    expect(screen.getAllByRole('row')[4].textContent).toBe('August 2026~50,560');
  });

  it('drops every caveat when the backend says the figure is recorded', async () => {
    const user = userEvent.setup();
    render(<ReconstructedLineChart data={DATA} reconstructed={false} total={50566} />);
    expect(screen.getByRole('heading', { name: 'Transactions tagged' })).toBeDefined();
    expect(screen.getByText('50,566 in range')).toBeDefined();
    expect(screen.queryByText(/re-tagged/)).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Table' }));
    expect(screen.getAllByRole('row')[4].textContent).toBe('August 202650,560');
  });

  it('tooltip shows the row title and the ~-prefixed estimate while reconstructed', () => {
    tooltipRow = DATA[3];
    try {
      render(<ReconstructedLineChart data={DATA} reconstructed total={50566} />);
      const tooltip = screen.getByTestId('tooltip');
      expect(within(tooltip).getByText('August 2026')).toBeDefined();
      expect(within(tooltip).getByText('~50,560')).toBeDefined();
      expect(within(tooltip).getByText('Transactions tagged (estimate)')).toBeDefined();
    } finally {
      tooltipRow = null;
    }
  });
});
