import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowContextMenu } from './RowContextMenu';

describe('RowContextMenu', () => {
  it('shows "Trace transaction" right after "View Context" and calls back on click', () => {
    const onTrace = vi.fn();
    render(<RowContextMenu x={0} y={0} onViewContext={() => {}} onTraceTransaction={onTrace} onClose={() => {}} />);
    const labels = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    expect(labels.slice(0, 2)).toEqual(['View Context', 'Trace transaction']);
    fireEvent.click(screen.getByRole('button', { name: 'Trace transaction' }));
    expect(onTrace).toHaveBeenCalledTimes(1);
  });

  it('hides "Trace transaction" without the callback (sample mode, or a row with no Id)', () => {
    render(<RowContextMenu x={0} y={0} onViewContext={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Trace transaction' })).toBeNull();
  });
});
