import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConditionEditor } from './ConditionEditor';
import type { ConditionFormValue } from '../../types';

// The sample is deliberately ALL-NUMERIC and non-blank for Description1 — the
// exact shape that used to trip the value-scan heuristic into classifying a
// text field as 'numeric' (the order-dependent bug: after a few conditions
// narrow the live sample, Description 1 showed only numeric operations).
vi.mock('../../hooks/useTransactionData', () => ({
  useTransactionData: () => ({
    fieldMeta: { identifierField: '_id', dataFields: ['Description1'], sourceFields: ['Description1'] },
    transactions: [{ Description1: '123' }, { Description1: '456' }],
  }),
}));

function makeCondition(overrides: Partial<ConditionFormValue> = {}): ConditionFormValue {
  return {
    id: 'c1',
    sourceField: 'Description1',
    operation: '' as ConditionFormValue['operation'],
    value: '',
    ...overrides,
  };
}

describe('ConditionEditor operation list', () => {
  it('offers text operations for a text field even when the sample is all-numeric', () => {
    render(
      <ConditionEditor
        condition={makeCondition()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        canRemove
      />,
    );

    // Open the Operation dropdown (its trigger shows the placeholder).
    fireEvent.click(screen.getByText('Select operation'));

    // A text operation is offered, and the numeric-only ops are NOT.
    expect(screen.queryByText('Contains')).not.toBeNull();
    expect(screen.queryByText('Starts with')).not.toBeNull();
    expect(screen.queryByText('Greater than')).toBeNull();
    expect(screen.queryByText('Less than')).toBeNull();
  });
});
