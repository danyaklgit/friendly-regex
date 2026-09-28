import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary fallback={<p>Fallback</p>}>
        <p>Content</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('Content')).toBeDefined();
    expect(screen.queryByText('Fallback')).toBeNull();
  });

  it('renders the fallback when a child throws during render', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary fallback={<p>Fallback</p>}>
          <Boom />
        </ErrorBoundary>
      );
      expect(screen.getByText('Fallback')).toBeDefined();
      expect(screen.queryByText('Content')).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
});
