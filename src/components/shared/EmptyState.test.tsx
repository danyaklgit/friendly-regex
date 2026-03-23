import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText('No results')).toBeDefined();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Try adjusting your filters" />);
    expect(screen.getByText('Try adjusting your filters')).toBeDefined();
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByText('Try adjusting')).toBeNull();
  });

  it('renders action when provided', () => {
    render(<EmptyState title="Empty" action={<button>Add new</button>} />);
    expect(screen.getByText('Add new')).toBeDefined();
  });

  it('does not render action when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    // Only the icon and title should exist
    expect(container.querySelectorAll('h3')).toHaveLength(1);
  });
});
