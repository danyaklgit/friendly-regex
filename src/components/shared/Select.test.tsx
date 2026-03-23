import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('Select', () => {
  it('renders all options', () => {
    render(<Select options={options} />);
    const opts = screen.getAllByRole('option');
    expect(opts).toHaveLength(3);
    expect(opts[0].textContent).toBe('Alpha');
    expect(opts[1].textContent).toBe('Beta');
    expect(opts[2].textContent).toBe('Gamma');
  });

  it('renders with label', () => {
    render(<Select label="Country" options={options} />);
    expect(screen.getByLabelText('Country')).toBeDefined();
  });

  it('auto-generates id from label', () => {
    render(<Select label="My Field" options={options} />);
    const select = screen.getByLabelText('My Field');
    expect(select.id).toBe('my-field');
  });

  it('uses provided id', () => {
    render(<Select label="Field" id="custom" options={options} />);
    expect(screen.getByLabelText('Field').id).toBe('custom');
  });

  it('shows required asterisk', () => {
    const { container } = render(<Select label="Required" options={options} required />);
    expect(container.querySelector('.text-red-500')?.textContent).toBe('*');
  });

  it('applies error styling', () => {
    render(<Select label="Error" options={options} error />);
    const select = screen.getByLabelText('Error');
    expect(select.className).toContain('border-red-400');
  });

  it('applies normal styling without error', () => {
    render(<Select label="Normal" options={options} />);
    expect(screen.getByLabelText('Normal').className).toContain('border-input-border');
  });

  it('handles change events', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="Pick" options={options} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Pick'), 'b');
    expect(onChange).toHaveBeenCalled();
    expect((screen.getByLabelText('Pick') as HTMLSelectElement).value).toBe('b');
  });

  it('merges custom className', () => {
    render(<Select label="Styled" options={options} className="extra" />);
    expect(screen.getByLabelText('Styled').className).toContain('extra');
  });

  it('can be disabled', () => {
    render(<Select label="Disabled" options={options} disabled />);
    expect((screen.getByLabelText('Disabled') as HTMLSelectElement).disabled).toBe(true);
  });
});
