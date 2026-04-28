import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TagSpecDefinition, TransactionRow } from '../../types';

interface MockResult {
  rows: TransactionRow[] | null;
  loading: boolean;
  error: Error | null;
}

const mockUseTagSampleTransactions = vi.fn<() => MockResult>(() => ({
  rows: [],
  loading: false,
  error: null,
}));

vi.mock('../../hooks/useTagSampleTransactions', () => ({
  useTagSampleTransactions: () => mockUseTagSampleTransactions(),
}));

import { TagDetailPanel } from './TagDetailPanel';

function makeDef(overrides: Partial<TagSpecDefinition> = {}): TagSpecDefinition {
  return {
    Id: 'def-1',
    Context: [],
    Tag: 'SALARY',
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: '2026-01-01', EndDate: null },
    TagRuleExpressions: [
      [
        {
          SourceField: 'Description1',
          ExpressionPrompt: 'contains "SALARY"',
          ExpressionId: null,
          Regex: 'SALARY',
          RegexDetails: [],
        },
      ],
    ],
    Attributes: [],
    ...overrides,
  };
}

describe('TagDetailPanel', () => {
  beforeEach(() => {
    mockUseTagSampleTransactions.mockReset();
    mockUseTagSampleTransactions.mockReturnValue({ rows: [], loading: false, error: null });
  });

  it('renders nothing meaningful when closed', () => {
    const { container } = render(
      <TagDetailPanel
        open={false}
        definition={null}
        source="Backend"
        isUserCreated={false}
        onClose={() => {}}
      />,
    );
    expect(container.querySelector('header')).toBeNull();
  });

  it('renders the tag name, source, rules, and attributes when open', () => {
    render(
      <TagDetailPanel
        open
        definition={makeDef()}
        source="Backend"
        isUserCreated={false}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText('SALARY')).not.toBeNull();
    expect(screen.queryByText('Backend')).not.toBeNull();
    expect(screen.queryByText('Rules')).not.toBeNull();
    expect(screen.queryByText('Attributes')).not.toBeNull();
    expect(screen.queryByText('Recent transactions')).not.toBeNull();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <TagDetailPanel
        open
        definition={makeDef()}
        source="Backend"
        isUserCreated={false}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close tag details'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <TagDetailPanel
        open
        definition={makeDef()}
        source="Backend"
        isUserCreated={false}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the empty-rows message when no transactions match', () => {
    mockUseTagSampleTransactions.mockReturnValue({ rows: [], loading: false, error: null });
    render(
      <TagDetailPanel
        open
        definition={makeDef()}
        source="Backend"
        isUserCreated={false}
        onClose={() => {}}
      />,
    );
    expect(
      screen.queryByText('No transactions are currently tagged with this definition.'),
    ).not.toBeNull();
  });

  it('shows the loading state when fetching transactions', () => {
    mockUseTagSampleTransactions.mockReturnValue({ rows: null, loading: true, error: null });
    render(
      <TagDetailPanel
        open
        definition={makeDef()}
        source="Backend"
        isUserCreated={false}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText('Loading transactions…')).not.toBeNull();
  });
});
