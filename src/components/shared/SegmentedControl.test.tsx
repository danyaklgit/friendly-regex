import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [{ value: 'Day', label: 'Day' }, { value: 'Week', label: 'Week', title: 'Weeks start on Sunday' }] as const;

describe('SegmentedControl', () => {
  it('renders a labelled radiogroup with the active option checked', () => {
    render(<SegmentedControl label="Granularity" options={[...OPTIONS]} value="Week" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Granularity' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Day' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: 'Week' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Week' }).getAttribute('title')).toBe('Weeks start on Sunday');
  });

  it('calls onChange with the clicked value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl label="Granularity" options={[...OPTIONS]} value="Week" onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Day' }));
    expect(onChange).toHaveBeenCalledWith('Day');
  });

  it('does nothing while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl label="Granularity" options={[...OPTIONS]} value="Week" onChange={onChange} disabled />);
    await user.click(screen.getByRole('radio', { name: 'Day' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
