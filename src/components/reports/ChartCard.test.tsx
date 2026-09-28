import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartCard } from './ChartCard';

describe('ChartCard', () => {
  it('renders title, subtitle, legend swatches, and the chart by default', () => {
    render(
      <ChartCard
        title="Coverage by business period"
        subtitle="Click a column"
        legend={[{ label: 'Tagged', color: 'var(--color-chart-1)', shape: 'rect' }, { label: 'Untagged', color: 'var(--color-chart-2)', shape: 'rect' }]}
        chart={<div data-testid="the-chart" />}
        table={<table data-testid="the-table" />}
        footnote="Categories overlap"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Coverage by business period' })).toBeDefined();
    expect(screen.getByText('Click a column')).toBeDefined();
    expect(screen.getByRole('list', { name: 'Coverage by business period legend' }).textContent).toContain('Tagged');
    expect(screen.getByTestId('the-chart')).toBeDefined();
    expect(screen.queryByTestId('the-table')).toBeNull();
    expect(screen.getByText('Categories overlap')).toBeDefined();
  });

  it('swaps to the table twin and back', async () => {
    const user = userEvent.setup();
    render(<ChartCard title="Rates" chart={<div data-testid="the-chart" />} table={<table data-testid="the-table" />} />);
    await user.click(screen.getByRole('radio', { name: 'Table' }));
    expect(screen.getByTestId('the-table')).toBeDefined();
    expect(screen.queryByTestId('the-chart')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Chart' }));
    expect(screen.getByTestId('the-chart')).toBeDefined();
  });

  it('omits the legend list when there are no legend items', () => {
    render(<ChartCard title="Rates" chart={<div />} table={<div />} />);
    expect(screen.queryByRole('list')).toBeNull();
  });
});
