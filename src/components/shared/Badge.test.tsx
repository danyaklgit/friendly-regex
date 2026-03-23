import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>ACTIVE</Badge>);
    expect(screen.getByText('ACTIVE')).toBeDefined();
  });

  it('applies default variant', () => {
    render(<Badge>Tag</Badge>);
    const el = screen.getByText('Tag');
    expect(el.className).toContain('bg-surface-tertiary');
  });

  it('applies success variant', () => {
    render(<Badge variant="success">OK</Badge>);
    expect(screen.getByText('OK').className).toContain('bg-green-100');
  });

  it('applies danger variant', () => {
    render(<Badge variant="danger">Error</Badge>);
    expect(screen.getByText('Error').className).toContain('bg-red-100');
  });

  it('applies warning variant', () => {
    render(<Badge variant="warning">Warn</Badge>);
    expect(screen.getByText('Warn').className).toContain('bg-yellow-100');
  });

  it('applies info variant', () => {
    render(<Badge variant="info">Info</Badge>);
    expect(screen.getByText('Info').className).toContain('bg-cyan-100');
  });

  it('applies primary variant', () => {
    render(<Badge variant="primary">Main</Badge>);
    expect(screen.getByText('Main').className).toContain('bg-primary');
  });

  it('applies xs size', () => {
    render(<Badge size="xs">Tiny</Badge>);
    expect(screen.getByText('Tiny').className).toContain('text-[10px]');
  });

  it('applies sm size by default', () => {
    render(<Badge>Normal</Badge>);
    expect(screen.getByText('Normal').className).toContain('text-xs');
  });

  it('handles onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Badge onClick={onClick}>Clickable</Badge>);
    await user.click(screen.getByText('Clickable'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('merges custom className', () => {
    render(<Badge className="extra">Styled</Badge>);
    expect(screen.getByText('Styled').className).toContain('extra');
  });

  it('applies none variant (no background)', () => {
    render(<Badge variant="none">Plain</Badge>);
    const el = screen.getByText('Plain');
    expect(el.className).not.toContain('bg-');
  });
});
