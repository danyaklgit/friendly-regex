import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContributionDialog, type ContributionDraft } from './ContributionDialog';

const DRAFT: ContributionDraft = {
  transactionId: 'tx-1',
  bankReference: '1343040361FC',
  entryDate: '2024-01-08T00:00:00',
  originalTag: 'VAT on Transaction',
  originalGroups: ['Accounts'],
  newTag: 'TEST_TAG',
  newGroups: ['Inbound Transfers'],
  newTagIsCustom: false,
};

describe('ContributionDialog', () => {
  it('renders the bank-reference, from-tag and to-tag in the summary', () => {
    render(<ContributionDialog open={true} draft={DRAFT} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText('1343040361FC')).toBeDefined();
    expect(screen.getByText('VAT on Transaction')).toBeDefined();
    expect(screen.getByText('TEST_TAG')).toBeDefined();
  });

  it('shows a Custom badge in the summary when newTagIsCustom is true', () => {
    render(
      <ContributionDialog open={true} draft={{ ...DRAFT, newTagIsCustom: true }} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText('TEST_TAG (Custom)')).toBeDefined();
  });

  it('submits the "self" path with no reason when "Save for myself" is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ContributionDialog open={true} draft={DRAFT} onClose={vi.fn()} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Save for myself' }));
    expect(onSubmit).toHaveBeenCalledWith('self');
  });

  it('reveals the reason textarea on "Submit for review" and gates the submit on its content', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ContributionDialog open={true} draft={DRAFT} onClose={vi.fn()} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    const textarea = screen.getByPlaceholderText(/Kindly provide specific details/);
    expect(textarea).toBeDefined();
    // Submit button stays disabled while empty.
    const submitBtn = screen.getByRole('button', { name: 'Submit for review' }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    await user.type(textarea, 'Wrong tag — should be a salary deposit.');
    expect(submitBtn.disabled).toBe(false);
    await user.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledWith('review', 'Wrong tag — should be a salary deposit.');
  });

  it('"Back" from the review form returns to the choice screen', async () => {
    const user = userEvent.setup();
    render(<ContributionDialog open={true} draft={DRAFT} onClose={vi.fn()} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Save for myself' })).toBeDefined();
  });
});
