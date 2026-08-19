import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColumnManagerModal, type ColumnManagerItem } from './ColumnManagerModal';

const ITEMS: ColumnManagerItem[] = [
  { key: 'data:A', label: 'Alpha' },
  { key: 'data:B', label: 'Beta' },
  { key: 'data:C', label: 'Gamma' },
  { key: 'data:D', label: 'Delta' },
];
const CANONICAL = ['data:A', 'data:B', 'data:C', 'data:D'];

function setup(overrides: Partial<Parameters<typeof ColumnManagerModal>[0]> = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <ColumnManagerModal
      open
      onClose={onClose}
      items={ITEMS}
      canonicalOrder={CANONICAL}
      hiddenKeys={new Set(['data:C'])}
      defaultHiddenKeys={new Set(['data:C'])}
      onApply={onApply}
      {...overrides}
    />,
  );
  return { onApply, onClose };
}

function visiblePane() {
  return screen.getByText(/^Visible columns/).parentElement!;
}
function hiddenPane() {
  return screen.getByText(/^Hidden columns/).parentElement!;
}

describe('ColumnManagerModal', () => {
  it('splits columns into visible (current order) and hidden (canonical order) panes', () => {
    setup({ hiddenKeys: new Set(['data:D', 'data:B']) });
    expect(screen.getByText('Visible columns (2)')).toBeTruthy();
    expect(screen.getByText('Hidden columns (2)')).toBeTruthy();
    const hidden = within(hiddenPane()).getAllByTitle('Show column');
    expect(hidden).toHaveLength(2);
    // Canonical order: Beta before Delta.
    const hiddenLabels = within(hiddenPane()).getAllByText(/Beta|Delta/).map((el) => el.textContent);
    expect(hiddenLabels).toEqual(['Beta', 'Delta']);
  });

  it('does not call onApply until Apply is clicked, then commits the batch once', async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = setup();
    // Hide Alpha, show Gamma — two draft edits.
    await user.click(within(visiblePane()).getByLabelText('Hide Alpha'));
    await user.click(within(hiddenPane()).getByLabelText('Show Gamma'));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [hidden, order] = onApply.mock.calls[0];
    expect([...hidden]).toEqual(['data:A']);
    // Gamma kept its interleaved spot — re-showing restores the canonical position.
    expect(order).toEqual(['data:A', 'data:B', 'data:C', 'data:D']);
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel discards the draft without applying', async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = setup();
    await user.click(within(visiblePane()).getByLabelText('Hide Alpha'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Apply while the draft matches the live state', () => {
    setup();
    expect((screen.getByRole('button', { name: 'Apply changes' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('move-to-top repositions a visible column above all others', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ hiddenKeys: new Set() });
    // Delta (last) → top.
    await user.click(within(visiblePane()).getAllByLabelText('Move to top')[3]);
    await user.click(screen.getByRole('button', { name: 'Apply changes' }));
    const [, order] = onApply.mock.calls[0];
    expect(order).toEqual(['data:D', 'data:A', 'data:B', 'data:C']);
  });

  it('move up/down skips hidden neighbors (repositions relative to VISIBLE neighbors)', async () => {
    const user = userEvent.setup();
    // B hidden: visible = A, C, D. Moving D up should land it before C, after B's slot.
    const { onApply } = setup({ hiddenKeys: new Set(['data:B']) });
    await user.click(within(visiblePane()).getAllByLabelText('Move up')[2]);
    await user.click(screen.getByRole('button', { name: 'Apply changes' }));
    const [hidden, order] = onApply.mock.calls[0];
    expect([...hidden]).toEqual(['data:B']);
    expect(order).toEqual(['data:A', 'data:B', 'data:D', 'data:C']);
  });

  it('locked columns render without a hide control', () => {
    setup({ lockedKeys: new Set(['data:A']) });
    expect(within(visiblePane()).queryByLabelText('Hide Alpha')).toBeNull();
    expect(within(visiblePane()).getByLabelText('Hide Beta')).toBeTruthy();
  });

  it('Reset to defaults restores the canonical order and default hidden set as a draft', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({
      items: [ITEMS[1], ITEMS[0], ITEMS[2], ITEMS[3]], // custom order: B first
      hiddenKeys: new Set(['data:D']),
      defaultHiddenKeys: new Set(['data:C']),
    });
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onApply).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply changes' }));
    const [hidden, order] = onApply.mock.calls[0];
    expect([...hidden]).toEqual(['data:C']);
    expect(order).toEqual(CANONICAL);
  });

  it('search filters both panes and disables reordering', async () => {
    const user = userEvent.setup();
    setup({ hiddenKeys: new Set(['data:C']) });
    await user.type(screen.getByPlaceholderText('Search columns...'), 'gam');
    expect(within(hiddenPane()).getByText('Gamma')).toBeTruthy();
    expect(within(visiblePane()).queryByText('Alpha')).toBeNull();
    await user.clear(screen.getByPlaceholderText('Search columns...'));
    await user.type(screen.getByPlaceholderText('Search columns...'), 'alp');
    expect((within(visiblePane()).getByLabelText('Move up') as HTMLButtonElement).disabled).toBe(true);
  });
});
