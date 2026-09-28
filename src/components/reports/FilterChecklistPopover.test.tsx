import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChecklistPopover } from './FilterChecklistPopover';

const OPTIONS = [
  { value: 'MT940', label: 'MT940' },
  { value: 'Ledger', label: 'Ledger (ERP)', title: 'Ledger' },
];

describe('FilterChecklistPopover', () => {
  it('names the trigger "Label: All" when nothing is selected, the single label for one, and a count for more', () => {
    const { rerender } = render(<FilterChecklistPopover label="Feed" options={OPTIONS} selected={[]} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Feed: All' })).toBeDefined();
    rerender(<FilterChecklistPopover label="Feed" options={OPTIONS} selected={['Ledger']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Feed: Ledger (ERP)' })).toBeDefined();
    rerender(<FilterChecklistPopover label="Feed" options={OPTIONS} selected={['Ledger', 'MT940']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Feed: 2 selected' })).toBeDefined();
  });

  it('opens a checklist, toggles values in option order, and clears with Show all', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterChecklistPopover label="Feed" options={OPTIONS} selected={['Ledger']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Feed: Ledger (ERP)' }));
    expect(screen.getByRole('dialog', { name: 'Feed' })).toBeDefined();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
    await user.click(boxes[0]);
    expect(onChange).toHaveBeenLastCalledWith(['MT940', 'Ledger']);
    await user.click(boxes[1]);
    expect(onChange).toHaveBeenLastCalledWith([]);
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<FilterChecklistPopover label="Feed" options={OPTIONS} selected={[]} onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Feed: All' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the empty label and no checkboxes when there are no options', async () => {
    const user = userEvent.setup();
    render(<FilterChecklistPopover label="Bank" options={[]} selected={[]} onChange={() => {}} emptyLabel="No banks loaded yet" />);
    await user.click(screen.getByRole('button', { name: 'Bank: All' }));
    expect(screen.getByText('No banks loaded yet')).toBeDefined();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('does not open while disabled', async () => {
    const user = userEvent.setup();
    render(<FilterChecklistPopover label="Feed" options={OPTIONS} selected={[]} onChange={() => {}} disabled />);
    await user.click(screen.getByRole('button', { name: 'Feed: All' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
