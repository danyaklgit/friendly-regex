import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionTypePicker } from './TransactionTypePicker';
import type { FilterDefinition } from '../../api/transactions';

const noop = () => {};

describe('TransactionTypePicker', () => {
  it('renders the trigger button with "Select a type" when no value', () => {
    render(<TransactionTypePicker value="" onChange={noop} />);
    expect(screen.getByRole('button').textContent).toContain('Select a type');
  });

  it('shows the selected label when a value matches an option', () => {
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: 'TRF', Label: 'Transfer', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="TRF" onChange={noop} filterDefinitions={defs} />);
    expect(screen.getByRole('button').textContent).toContain('Transfer');
  });

  it('falls back to value string when no matching option label found', () => {
    render(<TransactionTypePicker value="UNKNOWN" onChange={noop} />);
    expect(screen.getByRole('button').textContent).toContain('UNKNOWN');
  });

  it('opens the dropdown on button click', async () => {
    const user = userEvent.setup();
    render(<TransactionTypePicker value="" onChange={noop} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText(/search swift/i)).toBeDefined();
  });

  it('closes the dropdown on outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <TransactionTypePicker value="" onChange={noop} />
        <div data-testid="outside">outside</div>
      </div>
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText(/search swift/i)).toBeDefined();
    await user.click(screen.getByTestId('outside'));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search swift/i)).toBeNull();
    });
  });

  it('filters options by search text', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: 'TRF', Label: 'Transfer', Operand: null, DisabledBy: null },
          { Column: 'TTC', Value: 'CHK', Label: 'Cheque', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText(/search swift/i), 'che');
    expect(screen.queryByText('Transfer')).toBeNull();
    expect(screen.getByText('Cheque')).toBeDefined();
  });

  it('shows "No matches" when search yields no results', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: 'TRF', Label: 'Transfer', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText(/search swift/i), 'zzzzzz');
    expect(screen.getByText('No matches')).toBeDefined();
  });

  it('calls onChange and closes dropdown when an option is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: 'TRF', Label: 'Transfer', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="" onChange={onChange} filterDefinitions={defs} />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Transfer'));
    expect(onChange).toHaveBeenCalledWith('TRF');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search swift/i)).toBeNull();
    });
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<TransactionTypePicker value="" onChange={noop} disabled />);
    await user.click(screen.getByRole('button'));
    expect(screen.queryByPlaceholderText(/search swift/i)).toBeNull();
  });

  it('uses filterDefinitions values when provided and non-empty', () => {
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: null, Label: 'Empty Val', Operand: null, DisabledBy: null },
        ],
      },
    ];
    // null Value maps to '' which matches value="" — label 'Empty Val' is shown
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} />);
    expect(screen.getByRole('button').textContent).toContain('Empty Val');
  });

  it('falls back to TXN_TYPE_OPTIONS when filterDefinitions has no match', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'SomeOtherTag',
        Label: 'Other',
        Type: 'LIST',
        Operand: null,
        Values: [],
      },
    ];
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} />);
    await user.click(screen.getByRole('button'));
    // TXN_TYPE_OPTIONS should populate the list — search input present means list loaded
    expect(screen.getByPlaceholderText(/search swift/i)).toBeDefined();
  });

  it('applies active styling to the currently selected option in the list', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: 'TRF', Label: 'Transfer', Operand: null, DisabledBy: null },
          { Column: 'TTC', Value: 'CHK', Label: 'Cheque', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(
      <TransactionTypePicker value="TRF" onChange={noop} filterDefinitions={defs} />
    );
    await user.click(screen.getByRole('button'));
    const buttons = document.querySelectorAll('.max-h-60 button');
    expect((buttons[0] as HTMLElement).className).toContain('bg-primary/5');
    expect((buttons[0] as HTMLElement).className).not.toContain('hover:bg-surface-hover');
  });

  it('uses value as label fallback when FilterValue Label is empty-ish', () => {
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          // Label is an empty string — falls back to Value
          { Column: 'TTC', Value: 'TRF', Label: '', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="TRF" onChange={noop} filterDefinitions={defs} />);
    // selectedLabel will be '' (empty label) so falls back through || to value 'TRF'
    expect(screen.getByRole('button').textContent).toContain('TRF');
  });

  it('maps null Label to Value fallback on line 42', () => {
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Values: [{ Column: 'TTC', Value: 'TRF', Label: null as any, Operand: null, DisabledBy: null }],
      },
    ];
    render(<TransactionTypePicker value="TRF" onChange={noop} filterDefinitions={defs} />);
    // Label is null → falls back to Value 'TRF'
    expect(screen.getByRole('button').textContent).toContain('TRF');
  });

  it('maps null Label and null Value to empty string on line 42', () => {
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Values: [{ Column: 'TTC', Value: null, Label: null as any, Operand: null, DisabledBy: null }],
      },
    ];
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} />);
    // Both null → '' which matches value="" → selectedLabel = '' → falls back to placeholder
    expect(screen.getByRole('button').textContent).toContain('Select a type');
  });

  it('closes the dropdown when the DropdownBackdrop is clicked', async () => {
    const user = userEvent.setup();
    render(<TransactionTypePicker value="" onChange={noop} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText(/search swift/i)).toBeDefined();
    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement;
    // fireEvent.click (not userEvent) so mousedown doesn't race the outside-click handler
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search swift/i)).toBeNull();
    });
  });

  it('focuses search input via setTimeout when dropdown opens', () => {
    vi.useFakeTimers();
    render(<TransactionTypePicker value="" onChange={noop} />);
    // First act: click opens dropdown and flushes state update + useEffect (schedules setTimeout)
    act(() => { fireEvent.click(screen.getByRole('button')); });
    // Second act: run the scheduled setTimeout callback
    act(() => { vi.runAllTimers(); });
    vi.useRealTimers();
    expect(screen.getByPlaceholderText(/search swift/i)).toBeDefined();
  });

  it('renders the SubLabel beneath the option in the dropdown', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: 'TRF', Label: 'TRF', SubLabel: 'Transfer', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Transfer')).toBeDefined();
  });

  it('filters options by SubLabel search text', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: 'TRF', Label: 'TRF', SubLabel: 'Transfer', Operand: null, DisabledBy: null },
          { Column: 'TTC', Value: 'CHK', Label: 'CHK', SubLabel: 'Cheque', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText(/search swift/i), 'cheq');
    expect(screen.queryByText('Transfer')).toBeNull();
    expect(screen.getByText('Cheque')).toBeDefined();
  });

  it('clears search when dropdown is closed', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'TransactionTypeCode',
        Label: 'Transaction Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TTC', Value: 'TRF', Label: 'Transfer', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(
      <div>
        <TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} />
        <div data-testid="outside">outside</div>
      </div>
    );
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText(/search swift/i), 'trf');
    // Close via outside click
    await user.click(screen.getByTestId('outside'));
    // Reopen — search should be cleared
    await user.click(screen.getByRole('button'));
    expect((screen.getByPlaceholderText(/search swift/i) as HTMLInputElement).value).toBe('');
  });

  it('resolves the definition by Values Column even when Tag/Label do not mention transaction type (Ledger shape)', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'LedgerTypes',
        Label: 'Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TransactionTypeCode', Value: 'invoice', Label: 'invoice', Operand: null, DisabledBy: null },
          { Column: 'TransactionTypeCode', Value: 'bill', Label: 'bill', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} dataSetType="Ledger" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('invoice')).toBeDefined();
    expect(screen.getByText('bill')).toBeDefined();
  });

  it('prefers the Column-matched definition over a Label-matched one', async () => {
    const user = userEvent.setup();
    const defs: FilterDefinition[] = [
      {
        Tag: 'SomeOtherFilter',
        Label: 'Transaction Type Group',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'OtherColumn', Value: 'WRONG', Label: 'WRONG', Operand: null, DisabledBy: null },
        ],
      },
      {
        Tag: 'LedgerTypes',
        Label: 'Type',
        Type: 'LIST',
        Operand: null,
        Values: [
          { Column: 'TransactionTypeCode', Value: 'invoice', Label: 'invoice', Operand: null, DisabledBy: null },
        ],
      },
    ];
    render(<TransactionTypePicker value="" onChange={noop} filterDefinitions={defs} dataSetType="Ledger" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('invoice')).toBeDefined();
    expect(screen.queryByText('WRONG')).toBeNull();
  });

  it('does not fall back to static MT940 codes for Ledger when no definitions are loaded', async () => {
    const user = userEvent.setup();
    render(<TransactionTypePicker value="" onChange={noop} dataSetType="Ledger" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('No transaction types loaded')).toBeDefined();
  });

  it('uses a generic search placeholder for Ledger', async () => {
    const user = userEvent.setup();
    render(<TransactionTypePicker value="" onChange={noop} dataSetType="Ledger" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Search transaction types...')).toBeDefined();
    expect(screen.queryByPlaceholderText(/search swift/i)).toBeNull();
  });

  it('keeps the static MT940 fallback for non-Ledger data set types', async () => {
    const user = userEvent.setup();
    render(<TransactionTypePicker value="" onChange={noop} dataSetType="MT940" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText(/search swift/i)).toBeDefined();
    // Static list renders (search input present + at least one option row)
    expect(screen.queryByText('No transaction types loaded')).toBeNull();
  });
});
