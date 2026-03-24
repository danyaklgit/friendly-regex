import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('renders label text', () => {
    render(<Toggle label="Enable feature" checked={false} onChange={() => {}} />);
    expect(screen.getByText('Enable feature')).toBeDefined();
  });

  it('renders switch role with aria-checked false', () => {
    render(<Toggle label="Off" checked={false} onChange={() => {}} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('renders switch role with aria-checked true', () => {
    render(<Toggle label="On" checked={true} onChange={() => {}} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('calls onChange with toggled value when clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle label="Toggle" checked={false} onChange={onChange} />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when checked and clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle label="Toggle" checked={true} onChange={onChange} />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('applies active styling when checked', () => {
    render(<Toggle label="Active" checked={true} onChange={() => {}} />);
    const sw = screen.getByRole('switch');
    expect(sw.className).toContain('bg-primary');
  });

  it('applies inactive styling when unchecked', () => {
    render(<Toggle label="Inactive" checked={false} onChange={() => {}} />);
    const sw = screen.getByRole('switch');
    expect(sw.className).toContain('bg-surface');
  });
});
