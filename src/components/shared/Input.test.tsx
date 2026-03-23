import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  it('renders without label', () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeDefined();
  });

  it('renders with label', () => {
    render(<Input label="Name" />);
    expect(screen.getByLabelText('Name')).toBeDefined();
  });

  it('auto-generates id from label', () => {
    render(<Input label="First Name" />);
    const input = screen.getByLabelText('First Name');
    expect(input.id).toBe('first-name');
  });

  it('uses provided id over auto-generated', () => {
    render(<Input label="Name" id="custom-id" />);
    const input = screen.getByLabelText('Name');
    expect(input.id).toBe('custom-id');
  });

  it('shows required asterisk when required', () => {
    const { container } = render(<Input label="Email" required />);
    const asterisk = container.querySelector('.text-red-500');
    expect(asterisk?.textContent).toBe('*');
  });

  it('does not show asterisk when not required', () => {
    const { container } = render(<Input label="Email" />);
    const asterisk = container.querySelector('.text-red-500');
    expect(asterisk).toBeNull();
  });

  it('applies error border class', () => {
    render(<Input label="Bad" error />);
    const input = screen.getByLabelText('Bad');
    expect(input.className).toContain('border-red-400');
  });

  it('applies normal border class when no error', () => {
    render(<Input label="Good" />);
    const input = screen.getByLabelText('Good');
    expect(input.className).toContain('border-input-border');
  });

  it('handles typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Test" onChange={onChange} />);
    await user.type(screen.getByLabelText('Test'), 'hello');
    expect(onChange).toHaveBeenCalled();
  });

  it('merges custom className', () => {
    render(<Input label="Custom" className="my-input" />);
    expect(screen.getByLabelText('Custom').className).toContain('my-input');
  });

  it('passes through HTML input attributes', () => {
    render(<Input label="Age" type="number" min={0} max={100} />);
    const input = screen.getByLabelText('Age') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
  });
});
