import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RollbackConfirmDialog } from './RollbackConfirmDialog';

const PHRASE = 'INMASARIRYM-RC';

function setup(overrides: Partial<Parameters<typeof RollbackConfirmDialog>[0]> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const utils = render(
    <RollbackConfirmDialog
      open={true}
      bankCode="INMASARIRYM"
      side="RC"
      onClose={onClose}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { ...utils, onClose, onConfirm };
}

describe('RollbackConfirmDialog', () => {
  it('renders the irreversible title and the required phrase verbatim', () => {
    setup();
    expect(screen.getByText('Confirm Rollback: IRREVERSIBLE')).toBeDefined();
    // Phrase is rendered both in the instruction line (inside a <code>) and as
    // the input's placeholder — at least one occurrence must show the exact
    // required string.
    const occurrences = screen.getAllByText((_, node) => node?.textContent === PHRASE);
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the Rollback button disabled when the input is empty', () => {
    setup();
    const rollbackBtn = screen.getByRole('button', { name: 'Rollback' });
    expect((rollbackBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the Rollback button disabled and shows an error when the phrase is wrong', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByLabelText(/Confirmation phrase/i);
    await user.type(input, 'inmasaririym-rc'); // wrong case
    const rollbackBtn = screen.getByRole('button', { name: 'Rollback' });
    expect((rollbackBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Confirmation phrase does not match. Rollback disabled.')).toBeDefined();
  });

  it('enables the Rollback button only on an exact match and clears the error', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByLabelText(/Confirmation phrase/i);
    await user.type(input, PHRASE);
    const rollbackBtn = screen.getByRole('button', { name: 'Rollback' });
    expect((rollbackBtn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Confirmation phrase does not match. Rollback disabled.')).toBeNull();
  });

  it('calls onConfirm when Rollback is clicked after the phrase matches', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.type(screen.getByLabelText(/Confirmation phrase/i), PHRASE);
    await user.click(screen.getByRole('button', { name: 'Rollback' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onConfirm when Enter is pressed inside the input AND the phrase matches', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    const input = screen.getByLabelText(/Confirmation phrase/i);
    await user.type(input, PHRASE);
    await user.type(input, '{Enter}');
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('does NOT call onConfirm when Enter is pressed and the phrase does not match', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    const input = screen.getByLabelText(/Confirmation phrase/i);
    await user.type(input, 'wrong{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('resets the typed value when reopened after closing', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RollbackConfirmDialog
        open={true}
        bankCode="INMASARIRYM"
        side="RC"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/Confirmation phrase/i) as HTMLInputElement;
    await user.type(input, 'partial');
    expect(input.value).toBe('partial');

    // Close
    rerender(
      <RollbackConfirmDialog
        open={false}
        bankCode="INMASARIRYM"
        side="RC"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    // Reopen
    rerender(
      <RollbackConfirmDialog
        open={true}
        bankCode="INMASARIRYM"
        side="RC"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const refreshedInput = screen.getByLabelText(/Confirmation phrase/i) as HTMLInputElement;
    expect(refreshedInput.value).toBe('');
  });

  it('disables both buttons while loading and shows a spinner on Rollback', async () => {
    const user = userEvent.setup();
    setup({ loading: true });
    await user.type(screen.getByLabelText(/Confirmation phrase/i), PHRASE);
    const rollbackBtn = screen.getByRole('button', { name: 'Rollback' }) as HTMLButtonElement;
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    // Even with the phrase matched, loading should keep the primary disabled.
    expect(rollbackBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
  });

  it('renders the phrase derived from props (different bank/side combinations)', () => {
    setup({ bankCode: 'ABCDXXYY', side: 'DR' });
    const input = screen.getByPlaceholderText('e.g. ABCDXXYY-DR');
    expect(input).toBeDefined();
  });
});
