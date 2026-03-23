import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders message text', () => {
    render(<Toast message="Saved successfully" onClose={() => {}} />);
    expect(screen.getByText('Saved successfully')).toBeDefined();
  });

  it('applies success background by default', () => {
    const { container } = render(<Toast message="OK" onClose={() => {}} />);
    const toast = container.firstElementChild as HTMLElement;
    expect(toast.className).toContain('bg-green-600');
  });

  it('applies error background', () => {
    const { container } = render(<Toast message="Failed" type="error" onClose={() => {}} />);
    const toast = container.firstElementChild as HTMLElement;
    expect(toast.className).toContain('bg-red-600');
  });

  it('applies info background', () => {
    const { container } = render(<Toast message="Note" type="info" onClose={() => {}} />);
    const toast = container.firstElementChild as HTMLElement;
    expect(toast.className).toContain('bg-primary');
  });

  it('renders success icon for success type', () => {
    const { container } = render(<Toast message="Done" type="success" onClose={() => {}} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders error icon for error type', () => {
    const { container } = render(<Toast message="Err" type="error" onClose={() => {}} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('calls onClose after duration', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="Auto" onClose={onClose} duration={1000} />);
    vi.advanceTimersByTime(1200); // duration + exit animation
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
