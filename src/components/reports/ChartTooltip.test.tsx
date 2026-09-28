import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartTooltipFrame, ChartTooltipRow } from './ChartTooltip';

describe('ChartTooltipFrame / ChartTooltipRow', () => {
  it('renders the title and value-first rows with an optional color key', () => {
    render(
      <ChartTooltipFrame title="March 2024">
        <ChartTooltipRow value="42,549" label="Tagged" color="var(--color-chart-1)" />
        <ChartTooltipRow value="45.52%" label="Tagging rate" />
      </ChartTooltipFrame>,
    );
    expect(screen.getByText('March 2024')).toBeDefined();
    expect(screen.getByText('42,549')).toBeDefined();
    expect(screen.getByText('Tagged')).toBeDefined();
    expect(screen.getByText('Tagging rate')).toBeDefined();
    const keys = document.querySelectorAll('[data-tooltip-key]');
    expect(keys).toHaveLength(1);
    expect((keys[0] as HTMLElement).style.backgroundColor).toBe('var(--color-chart-1)');
  });
});
