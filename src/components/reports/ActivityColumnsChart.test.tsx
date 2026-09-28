import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ActivityColumnsChart } from './ActivityColumnsChart';
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
    BarChart: ({ children, syncId, syncMethod }: { children?: ReactNode; syncId?: string; syncMethod?: string }) => (
      <div data-testid="bar-chart" data-syncid={syncId} data-syncmethod={syncMethod}>{children}</div>
    ),
    Bar: echo('bar'), XAxis: echo('x-axis'), YAxis: echo('y-axis'),
    CartesianGrid: () => null,
    Tooltip: ({ content: C }: { content?: (props: { active?: boolean; payload?: Array<{ payload: unknown }> }) => ReactNode }) => (
      C && tooltipRow ? <div data-testid="tooltip">{C({ active: true, payload: [{ payload: tooltipRow }] })}</div> : null
    ),
  };
});

const DATA = toActivityData(buildActivityRows(makeActivityFixture(), {}));

describe('ActivityColumnsChart', () => {
  it('draws grouped (unstacked) check-in and rules-added columns in cyan and violet', () => {
    render(<ActivityColumnsChart data={DATA} />);
    const bars = screen.getAllByTestId('bar');
    expect(bars).toHaveLength(2);
    expect(bars[0].getAttribute('data-datakey')).toBe('checkIns');
    expect(bars[0].getAttribute('data-fill')).toBe('var(--color-chart-1)');
    expect(bars[0].getAttribute('data-stackid')).toBeNull();
    expect(bars[1].getAttribute('data-datakey')).toBe('rulesAdded');
    expect(bars[1].getAttribute('data-fill')).toBe('var(--color-chart-3)');
    expect(bars[1].getAttribute('data-isanimationactive')).toBe('false');
    const legend = screen.getByRole('list', { name: 'Check-ins and rules added legend' });
    expect(legend.textContent).toContain('Check-ins');
    expect(legend.textContent).toContain('Rules added (net)');
    expect(screen.getByTestId('bar-chart').getAttribute('data-syncid')).toBe('tep-activity');
    expect(screen.getByTestId('bar-chart').getAttribute('data-syncmethod')).toBe('value');
  });

  it('renders the table twin with all six measured fields, quiet months at zero', async () => {
    const user = userEvent.setup();
    render(<ActivityColumnsChart data={DATA} />);
    await user.click(screen.getByRole('radio', { name: 'Table' }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(6); // header + May..Sep
    const cells = (row: HTMLElement) => Array.from(row.querySelectorAll('th, td')).map((c) => c.textContent);
    expect(cells(rows[0])).toEqual(['Period', 'Check-ins', 'Rules added', 'Saves', 'Rollbacks', 'Operators', 'Workspaces']);
    expect(cells(rows[3])).toEqual(['July 2026', '0', '0', '0', '0', '0', '0']);
    expect(rows[3].className).toContain('text-faint');
    expect(cells(rows[4])).toEqual(['August 2026', '88', '115', '12', '2', '5', '22']);
  });

  it('tooltip shows the row title and all six measured fields', () => {
    tooltipRow = DATA[3];
    try {
      render(<ActivityColumnsChart data={DATA} />);
      const tooltip = screen.getByTestId('tooltip');
      expect(within(tooltip).getByText('August 2026')).toBeDefined();
      expect(within(tooltip).getByText('88')).toBeDefined();
      expect(within(tooltip).getByText('115')).toBeDefined();
      expect(within(tooltip).getByText('12')).toBeDefined();
      expect(within(tooltip).getByText('2')).toBeDefined();
      expect(within(tooltip).getByText('5')).toBeDefined();
      expect(within(tooltip).getByText('22')).toBeDefined();
    } finally {
      tooltipRow = null;
    }
  });
});
