import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedTotalsTable } from './FeedTotalsTable';
import { makeReportFixture } from '../../utils/reports/fixtures';

describe('FeedTotalsTable', () => {
  it('lists feeds by volume with a swatch, then the all-feeds footer', () => {
    const report = makeReportFixture();
    render(<FeedTotalsTable series={[...report.Series].reverse()} totals={report.Totals} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 2 feeds + footer
    expect(rows[1].textContent).toContain('MT940');
    expect(rows[1].textContent).toContain('6,000');
    expect(rows[1].textContent).toContain('63.33%');
    expect(rows[2].textContent).toContain('Ledger (ERP)');
    expect(rows[3].textContent).toContain('All feeds');
    expect(rows[3].textContent).toContain('6,300');
    const swatch = rows[1].querySelector('[data-feed-swatch]') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe('var(--color-chart-1)');
    expect(rows[1].querySelector('[title="MT940"]')).not.toBeNull();
  });
});
