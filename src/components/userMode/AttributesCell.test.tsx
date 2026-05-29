import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttributesCell } from './AttributesCell';

describe('AttributesCell', () => {
  it('renders an empty-state message when there are no attributes', () => {
    render(<AttributesCell attributes={{}} />);
    expect(screen.getByText('No attributes')).toBeDefined();
  });

  it('renders all entries inline when there are 4 or fewer', () => {
    render(<AttributesCell attributes={{ A: '1', B: '2', C: '3', D: '4' }} />);
    expect(screen.getByText('A:')).toBeDefined();
    expect(screen.getByText('D:')).toBeDefined();
    // No "+N more" affordance.
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('shows the first 4 inline and a "+N more" affordance when there are extras', () => {
    render(
      <AttributesCell
        attributes={{ A: '1', B: '2', C: '3', D: '4', E: '5', F: '6', G: '7' }}
      />,
    );
    expect(screen.getByText('A:')).toBeDefined();
    expect(screen.getByText('D:')).toBeDefined();
    // E, F, G are not in the inline list — they live behind the popover.
    expect(screen.queryByText('G:')).toBeNull();
    expect(screen.getByText('+3 more')).toBeDefined();
  });

  it('reveals the overflow entries when the "+N more" affordance is hovered', async () => {
    const user = userEvent.setup();
    render(
      <AttributesCell
        attributes={{ A: '1', B: '2', C: '3', D: '4', E: '5', F: '6' }}
      />,
    );
    await user.hover(screen.getByText('+2 more'));
    expect(await screen.findByText('E:')).toBeDefined();
    expect(screen.getByText('F:')).toBeDefined();
  });

});
