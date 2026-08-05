import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedCodeBlock } from './VirtualizedCodeBlock';

describe('VirtualizedCodeBlock', () => {
  it('renders the top of the block but windows away far-off lines', () => {
    const text = Array.from({ length: 5000 }, (_, i) => `line-${i}`).join('\n');
    render(<VirtualizedCodeBlock text={text} />);
    // Early lines are mounted…
    expect(screen.getByText('line-0')).toBeTruthy();
    // …but a line thousands of rows down is NOT in the DOM (the whole point:
    // we don't mount all 5000 nodes at once).
    expect(screen.queryByText('line-4000')).toBeNull();
  });

  it('renders short content in full', () => {
    render(<VirtualizedCodeBlock text={'alpha\nbeta\ngamma'} />);
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.getByText('gamma')).toBeTruthy();
  });
});
