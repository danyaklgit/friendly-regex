import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionsList } from './TransactionsList';
import { makePageFixture, makeTransactionFixture } from '../../utils/clientSync/fixtures';
import type { ClientSyncTransactionsPage } from '../../api/clientSync';

type ListProps = ComponentProps<typeof TransactionsList>;

const TAG_OPTIONS = [
  { value: 'UNTAGGED', label: 'Untagged', count: '15' },
  { value: 'IncomingTransfer', label: 'IncomingTransfer', count: '120' },
];

function baseProps(overrides: Partial<ListProps> = {}) {
  return {
    page: makePageFixture() as ClientSyncTransactionsPage | null,
    loading: false,
    error: null as string | null,
    onRetry: vi.fn(),
    show: 'ALL' as const,
    onShowChange: vi.fn(),
    search: '',
    onSearchChange: vi.fn(),
    side: 'ALL' as const,
    onSideChange: vi.fn(),
    tags: [] as string[],
    onTagsChange: vi.fn(),
    tagOptions: TAG_OPTIONS,
    canLoadMore: false,
    onLoadMore: vi.fn(),
    selectedId: null as string | null,
    onSelect: vi.fn(),
    showIban: false,
    withDate: false,
    onExport: vi.fn(),
    ...overrides,
  } satisfies ListProps;
}

function renderList(overrides: Partial<ListProps> = {}) {
  const props = baseProps(overrides);
  render(<TransactionsList {...props} />);
  return props;
}

describe('TransactionsList', () => {
  it('renders the header counts, the segments with server counts, the search box and the export button', async () => {
    const user = userEvent.setup();
    const props = renderList({ page: makePageFixture([makeTransactionFixture()], { TotalCount: 212, ShowCounts: [{ Key: 'ALL', Count: 212 }, { Key: 'UNTAGGED', Count: 15 }] }) });
    expect(screen.getByRole('heading', { name: 'Transactions' })).not.toBeNull();
    expect(screen.getByText('212 read, newest first')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'All 212' })).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Untagged 15' })).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Layers differ' })).not.toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Untagged 15' }));
    expect(props.onShowChange).toHaveBeenCalledWith('UNTAGGED');
    await user.type(screen.getByPlaceholderText('Search transactions'), 'F');
    expect(props.onSearchChange).toHaveBeenCalledWith('F');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(props.onExport).toHaveBeenCalledTimes(1);
  });

  it('renders a row with time, feed, amount, sender and reference, tag with attribute count, KB and Out cells; click selects it', async () => {
    const user = userEvent.setup();
    const props = renderList();
    const row = screen.getByRole('row', { name: 'Transaction FT26288H51MC' });
    const r = within(row);
    expect(r.getByText(/^\d{2}:\d{2}:\d{2}$/)).not.toBeNull();
    expect(r.getByText('INTERIM TL')).not.toBeNull();
    expect(r.getByText('CR 12,500.00')).not.toBeNull();
    expect(r.getByText('SAR')).not.toBeNull();
    expect(r.getByText('AL FARIS CO')).not.toBeNull();
    expect(r.getByText('FT26288H51MC')).not.toBeNull();
    expect(r.getByText('IncomingTransfer')).not.toBeNull();
    expect(r.getByText('3 attributes')).not.toBeNull();
    expect(r.getByText('Promoted')).not.toBeNull();
    expect(r.getByText('Confirmed')).not.toBeNull();
    expect(r.getByText('C-100')).not.toBeNull();
    expect(r.getByText('Sent')).not.toBeNull();
    expect(r.getByText(/33\.0 s after receipt/)).not.toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'IBAN' })).toBeNull();
    await user.click(row);
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ Id: 'tx-1' }));
  });

  it('marks the selected row, shows the IBAN column when asked, prefixes dates when the range spans days, and shows the narrative tooltip', async () => {
    const user = userEvent.setup();
    renderList({ selectedId: 'tx-1', showIban: true, withDate: true });
    const row = screen.getByRole('row', { name: 'Transaction FT26288H51MC' });
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('columnheader', { name: 'IBAN' })).not.toBeNull();
    expect(within(row).getByText('SA0380000000608010167519')).not.toBeNull();
    expect(within(row).getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)).not.toBeNull();
    await user.hover(within(row).getByText('FT26288H51MC'));
    expect(await screen.findByText('INV 2231 AL FARIS CO')).not.toBeNull();
  });

  it('renders untagged, layers-differ, failed-out and sparse rows without throwing', async () => {
    const user = userEvent.setup();
    renderList({
      page: makePageFixture([
        makeTransactionFixture({ Id: 'u', BankReference: 'REF-U', IsUntagged: true, Tag: '', AttributeCount: 0, ReceivedAtUtc: null, Kb: { Status: 'NotEligible', Certainty: '', CertaintyRank: 0, CustomerCode: null, CustomerNameEn: null }, Out: { Status: 'NEVER', LastCallUtc: null, LastError: null, ReceiptToPushMs: null } }),
        makeTransactionFixture({ Id: 'l', BankReference: 'REF-L', LayersDiffer: true, OpsTag: 'BillPayment', Out: { Status: 'FAILED', LastCallUtc: '2026-10-15T07:00:00Z', LastError: 'HTTP 502 from BwaTech', ReceiptToPushMs: null } }),
      ]),
    });
    const untagged = within(screen.getByRole('row', { name: 'Transaction REF-U' }));
    expect(untagged.getByText('Untagged')).not.toBeNull();
    expect(untagged.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(untagged.queryByText(/Invalid Date/)).toBeNull();
    const layers = within(screen.getByRole('row', { name: 'Transaction REF-L' }));
    await user.hover(layers.getByLabelText('Operator tag not released yet'));
    expect(await screen.findByText('Operator tag BillPayment not released yet')).not.toBeNull();
    expect(layers.getByText('Failed').getAttribute('title')).toBe('HTTP 502 from BwaTech');
  });

  it('a row without an Id is not selectable and has no pointer cursor', async () => {
    const user = userEvent.setup();
    const props = renderList({ page: makePageFixture([makeTransactionFixture({ Id: '', BankReference: 'REF-NOID' })]) });
    const row = screen.getByRole('row', { name: 'Transaction REF-NOID' });
    expect(row.className.includes('cursor-pointer')).toBe(false);
    await user.click(row);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('is memoized so a parent re-render with the same props skips the rows', () => {
    expect((TransactionsList as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('footer: Showing N of Total with +50 and +200 only while more can be loaded', async () => {
    const user = userEvent.setup();
    const props = renderList({ page: makePageFixture([makeTransactionFixture()], { TotalCount: 212 }), canLoadMore: true });
    expect(screen.getByText('Showing 1 of 212')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: '+50' }));
    expect(props.onLoadMore).toHaveBeenCalledWith(50);
    await user.click(screen.getByRole('button', { name: '+200' }));
    expect(props.onLoadMore).toHaveBeenCalledWith(200);
  });

  it('hides load-more when everything is loaded, including when TotalCount is below the loaded count', () => {
    renderList({ page: makePageFixture([makeTransactionFixture()], { TotalCount: 0 }), canLoadMore: false });
    expect(screen.getByText('Showing 1 of 0')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '+50' })).toBeNull();
  });

  it('shows the empty state for zero rows, a skeleton before the first page, the error card above stale rows, and dims while loading', () => {
    const { unmount } = render(<TransactionsList {...baseProps({ page: makePageFixture([]) })} />);
    expect(screen.getByText('Nothing received for these accounts on these days.')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    const second = render(<TransactionsList {...baseProps({ page: null, loading: true })} />);
    expect(screen.getByRole('status', { name: 'Loading transactions' })).not.toBeNull();
    second.unmount();

    render(<TransactionsList {...baseProps({ loading: true, error: 'SFM_INVALID_INPUT_PARAMETERS' })} />);
    expect(screen.getByRole('alert').textContent).toContain('SFM_INVALID_INPUT_PARAMETERS');
    expect(screen.getByRole('row', { name: 'Transaction FT26288H51MC' })).not.toBeNull();
    expect(screen.getByTestId('transactions-frame').className).toContain('opacity-60');
  });

  it('shows the Side segments and the Tag picker with their counts, captioned as list-only filters', async () => {
    const user = userEvent.setup();
    const props = renderList();
    expect(screen.getByText('Filters apply to the list.')).not.toBeNull();
    const sideGroup = within(screen.getByRole('radiogroup', { name: 'Side' }));
    expect(sideGroup.getAllByRole('radio').map((r) => r.textContent)).toEqual(['All', 'CR', 'DR']);
    expect(sideGroup.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true');
    await user.click(sideGroup.getByRole('radio', { name: 'DR' }));
    expect(props.onSideChange).toHaveBeenCalledWith('DR');

    await user.click(screen.getByRole('button', { name: /^Tag: All/ }));
    const picker = within(await screen.findByRole('dialog', { name: 'Tag' }));
    expect(picker.getByText('120')).not.toBeNull();
    await user.click(picker.getByRole('checkbox', { name: /IncomingTransfer/ }));
    expect(props.onTagsChange).toHaveBeenCalledWith(['IncomingTransfer']);
  });

  it('names the selected tag on the trigger without its count, and disables the picker until the summary supplies choices', () => {
    const { unmount } = render(<TransactionsList {...baseProps({ tags: ['IncomingTransfer'] })} />);
    expect(screen.getByRole('button', { name: /^Tag: IncomingTransfer$/ })).not.toBeNull();
    unmount();
    render(<TransactionsList {...baseProps({ tagOptions: [] })} />);
    expect((screen.getByRole('button', { name: /^Tag: All/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows Sender and Bank reference as two columns', () => {
    renderList();
    expect(screen.getByRole('columnheader', { name: 'Sender' })).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Bank reference' })).not.toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Sender / reference' })).toBeNull();
    const cells = within(screen.getByRole('row', { name: 'Transaction FT26288H51MC' })).getAllByRole('cell');
    const senderIndex = cells.findIndex((c) => c.textContent === 'AL FARIS CO');
    expect(senderIndex).toBeGreaterThan(-1);
    expect(cells[senderIndex + 1].textContent).toBe('FT26288H51MC');
  });

  it('disables the export button while exporting and reports an export failure', () => {
    const { unmount } = render(<TransactionsList {...baseProps({ exporting: true })} />);
    expect((screen.getByRole('button', { name: 'Exporting…' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(<TransactionsList {...baseProps({ exportError: 'HTTP 500' })} />);
    expect(screen.getByRole('alert').textContent).toBe('Export failed: HTTP 500');
  });
});
