import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UndoChangesDialog } from './UndoChangesDialog';
import type { ChangeSummary } from '../../hooks/useLocalChanges';

const mockSummary: ChangeSummary = {
  changes: [
    { tag: 'SALARY', type: 'added', details: ['New tag'] },
    { tag: 'RENT', type: 'removed', details: [] },
    { tag: 'UTIL', type: 'modified', details: ['Changed regex', 'Updated context'] },
  ],
} as ChangeSummary;

describe('UndoChangesDialog', () => {
  it('renders nothing visible when closed', () => {
    render(
      <UndoChangesDialog
        open={false}
        bank="RIBL"
        side="DEBIT"
        changeSummary={mockSummary}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByText('Review your changes')).toBeNull();
  });

  it('renders changes when open', () => {
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={mockSummary}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('Review your changes')).toBeDefined();
    expect(screen.getByText('SALARY')).toBeDefined();
    expect(screen.getByText('RENT')).toBeDefined();
    expect(screen.getByText('UTIL')).toBeDefined();
  });

  it('displays bank and side', () => {
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={mockSummary}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('RIBL')).toBeDefined();
    expect(screen.getByText('DEBIT')).toBeDefined();
  });

  it('shows change details', () => {
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={mockSummary}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('Changed regex')).toBeDefined();
    expect(screen.getByText('Updated context')).toBeDefined();
  });

  it('shows change count', () => {
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={mockSummary}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText(/3 changes/)).toBeDefined();
  });

  it('shows singular "change" for single change', () => {
    const single: ChangeSummary = {
      changes: [{ tag: 'X', type: 'added', details: [] }],
    } as ChangeSummary;
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={single}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText(/1 change\b/)).toBeDefined();
  });

  it('calls onClose when Cancel clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={mockSummary}
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm and onClose when Undo clicked', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={mockSummary}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await user.click(screen.getByText('Undo Changes'));
    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('handles null changeSummary', () => {
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={null}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('No detailed changes available.')).toBeDefined();
  });

  it('sorts changes: removed first, then modified, then added', () => {
    render(
      <UndoChangesDialog
        open={true}
        bank="RIBL"
        side="DEBIT"
        changeSummary={mockSummary}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    const tags = screen.getAllByText(/SALARY|RENT|UTIL/).map(el => el.textContent);
    // Removed (RENT) should come first, then Modified (UTIL), then Added (SALARY)
    expect(tags).toEqual(['RENT', 'UTIL', 'SALARY']);
  });
});
