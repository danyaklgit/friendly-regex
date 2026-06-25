import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchingRulesFilterButton } from './MatchingRulesFilterButton';

// ConditionEditor (rendered deep inside the modal) needs the transaction-data
// context for the Source Field options + field-kind inference.
vi.mock('../../hooks/useTransactionData', () => ({
  useTransactionData: () => ({
    fieldMeta: {
      identifierField: '_id',
      dataFields: ['AdditionalInformation'],
      sourceFields: ['AdditionalInformation'],
    },
    transactions: [{ AdditionalInformation: 'hello world' }],
  }),
}));

function openModal() {
  fireEvent.click(screen.getByRole('button', { name: /Matching Rules/i }));
}

describe('MatchingRulesFilterButton — Apply gating', () => {
  it('keeps Apply disabled while a filled condition is still being edited (Save not clicked)', () => {
    render(<MatchingRulesFilterButton value={[]} onChange={vi.fn()} />);
    openModal();

    const apply = () => screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    // Initial empty condition: Apply disabled (incomplete).
    expect(apply().disabled).toBe(true);

    // Fill the condition fully but DON'T click its inline Save.
    fireEvent.click(screen.getByText('Select source field'));
    fireEvent.click(screen.getByText('Additional Information'));
    fireEvent.click(screen.getByText('Select operation'));
    fireEvent.click(screen.getByText('Contains'));
    fireEvent.change(screen.getByPlaceholderText('Enter value...'), { target: { value: 'SADAD' } });

    // Values are now complete, but the row is still open in its editor — Apply
    // must remain disabled until the operator Saves the condition.
    expect(apply().disabled).toBe(true);

    // Click the condition's inline Save.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Now Apply is enabled.
    expect(apply().disabled).toBe(false);
  });
});
