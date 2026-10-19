import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TepHeaders } from '../../api/transactions';
import { CLIENT_SYNC_CONTROLS_STORAGE_KEY, DEFAULT_CLIENT_SYNC_CONTROLS } from '../../utils/clientSync/scope';
import { makeSummaryFixture, makePageFixture, makeTransactionFixture, makeTraceFixture } from '../../utils/clientSync/fixtures';

const hooks = vi.hoisted(() => ({
  useVipClients: vi.fn(), useClientSyncSummary: vi.fn(), useClientSyncTransactions: vi.fn(), useClientSyncTrace: vi.fn(),
  useAutoRefresh: vi.fn(), downloadClientSyncCsv: vi.fn(), getAllClientSyncTransactions: vi.fn(),
}));
vi.mock('../../api/clientSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/clientSync')>()),
  getAllClientSyncTransactions: hooks.getAllClientSyncTransactions,
}));
vi.mock('../../hooks/useVipClients', () => ({ useVipClients: hooks.useVipClients }));
vi.mock('../../hooks/useClientSync', () => ({
  useClientSyncSummary: hooks.useClientSyncSummary,
  useClientSyncTransactions: hooks.useClientSyncTransactions,
  useClientSyncTrace: hooks.useClientSyncTrace,
}));
vi.mock('../../hooks/useAutoRefresh', () => ({ useAutoRefresh: hooks.useAutoRefresh }));
vi.mock('../../utils/clientSync/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/clientSync/csv')>()),
  downloadClientSyncCsv: hooks.downloadClientSyncCsv,
}));
vi.mock('../integrationLogs/IntegrationLogFileModal', () => ({ IntegrationLogFileModal: () => null }));

import { ClientSyncTab } from './ClientSyncTab';

const HEADERS: TepHeaders = { userId: 'u', tenantCode: 't', languageCode: 'en', timeZone: 'UTC', requestId: 'r' };
const CLIENTS = [{ orgId: 'ORG-1', name: 'Acme Trading', accounts: [
  { iban: 'SA0380000000608010167519', bankCode: 'RJHISARI', accountName: 'Main SAR' },
  { iban: 'SA4420000001234567891234', bankCode: 'RJHISARI', accountName: 'Payroll' },
] }];
const summaryState = { report: makeSummaryFixture(), loading: false, error: null as string | null, refetch: vi.fn() };
const listState = { report: makePageFixture([makeTransactionFixture()], { TotalCount: 212 }), loading: false, error: null as string | null, refetch: vi.fn() };
const traceState = { report: makeTraceFixture(), loading: false, error: null as string | null, refetch: vi.fn() };

function storeControls(patch: Record<string, unknown>) {
  localStorage.setItem(CLIENT_SYNC_CONTROLS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_CLIENT_SYNC_CONTROLS, ...patch }));
}
function lastListRequest() {
  return hooks.useClientSyncTransactions.mock.lastCall?.[0];
}

describe('ClientSyncTab', () => {
  beforeEach(() => {
    localStorage.clear();
    hooks.useVipClients.mockReset().mockReturnValue({ clients: CLIENTS, loading: false, error: null, refetch: vi.fn() });
    hooks.useClientSyncSummary.mockReset().mockReturnValue(summaryState);
    hooks.useClientSyncTransactions.mockReset().mockReturnValue(listState);
    hooks.useClientSyncTrace.mockReset().mockReturnValue({ report: null, loading: false, error: null, refetch: vi.fn() });
    hooks.useAutoRefresh.mockReset();
    hooks.downloadClientSyncCsv.mockReset();
    hooks.getAllClientSyncTransactions.mockReset();
    summaryState.refetch.mockClear();
    listState.refetch.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows the pick-a-client state with no cards and disabled fetches until a client is chosen', async () => {
    const user = userEvent.setup();
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    expect(screen.getByText('Pick a client to see its accounts.')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'In from BwaTech' })).toBeNull();
    expect(hooks.useClientSyncSummary.mock.lastCall?.[3]).toBe(false);
    expect(hooks.useClientSyncTransactions.mock.lastCall?.[3]).toBe(false);
    await user.click(screen.getByText('Select a client'));
    await user.click(screen.getByText('Acme Trading'));
    expect(hooks.useClientSyncSummary.mock.lastCall?.[0]).toMatchObject({ OrgId: 'ORG-1', Layer: 'ALL' });
    expect(hooks.useClientSyncSummary.mock.lastCall?.[3]).toBe(true);
    expect(lastListRequest()).toMatchObject({ OrgId: 'ORG-1', Show: 'ALL', PageIndex: 1, PageSize: 100 });
    expect(JSON.parse(localStorage.getItem(CLIENT_SYNC_CONTROLS_STORAGE_KEY) ?? '{}')).toMatchObject({ orgId: 'ORG-1' });
  });

  it('restores the stored client and renders the cards, accounts, warnings and list', () => {
    storeControls({ orgId: 'ORG-1' });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    expect(screen.getByRole('region', { name: 'In from BwaTech' })).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Accounts' })).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Warnings' })).not.toBeNull();
    expect(screen.getByRole('row', { name: 'Transaction FT26288H51MC' })).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'IBAN' })).not.toBeNull();
  });

  it('a warning click sets the quick filter and scrolls the list into view', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('button', { name: /5 rows failed on the last push/ }));
    expect(lastListRequest()).toMatchObject({ Show: 'OUT_FAILED' });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('load-more grows the window, and a scope change resets filter, limit and selection', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('radio', { name: /^Untagged/ }));
    await user.click(screen.getByRole('button', { name: '+50' }));
    expect(lastListRequest()).toMatchObject({ Show: 'UNTAGGED', PageSize: 150 });
    await user.click(screen.getByRole('row', { name: 'Transaction FT26288H51MC' }));
    expect(hooks.useClientSyncTrace.mock.lastCall?.[0]).toBe('tx-1');
    await user.click(screen.getByRole('radio', { name: 'Intraday' }));
    expect(lastListRequest()).toMatchObject({ Layer: 'INTRADAY', Show: 'ALL', PageSize: 100 });
    expect(hooks.useClientSyncTrace.mock.lastCall?.[0]).toBeNull();
  });

  it('debounces search by 400 ms before it reaches the request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    storeControls({ orgId: 'ORG-1' });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.type(screen.getByPlaceholderText('Search transactions'), 'FT26');
    expect(lastListRequest()?.Search).toBeUndefined();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(lastListRequest()).toMatchObject({ Search: 'FT26' });
    vi.useRealTimers();
  });

  it('clears the debounced search immediately when the scope changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    storeControls({ orgId: 'ORG-1' });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.type(screen.getByPlaceholderText('Search transactions'), 'FT26');
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(lastListRequest()).toMatchObject({ Search: 'FT26' });
    await user.click(screen.getByRole('radio', { name: 'Intraday' }));
    expect(lastListRequest()).toMatchObject({ Layer: 'INTRADAY' });
    expect(lastListRequest()?.Search).toBeUndefined();
    vi.useRealTimers();
  });

  it('opens the drawer on a row click and closes it', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    hooks.useClientSyncTrace.mockReturnValue(traceState);
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('row', { name: 'Transaction FT26288H51MC' }));
    expect(screen.getByRole('dialog', { name: 'Transaction trace' }).getAttribute('aria-hidden')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(hooks.useClientSyncTrace.mock.lastCall?.[0]).toBeNull();
  });

  it('auto-refresh tick refetches summary and list only, honouring the toggle', () => {
    storeControls({ orgId: 'ORG-1', autoRefresh: false });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    const options = hooks.useAutoRefresh.mock.lastCall?.[0];
    expect(options).toMatchObject({ enabled: false, intervalMs: 30000 });
    act(() => { options.onTick(); });
    expect(summaryState.refetch).toHaveBeenCalledTimes(1);
    expect(listState.refetch).toHaveBeenCalledTimes(1);
  });

  it('auto-refresh tick skips refetching while the summary or the list is still loading', () => {
    storeControls({ orgId: 'ORG-1' });
    hooks.useClientSyncSummary.mockReturnValue({ ...summaryState, loading: true });
    const { unmount } = render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    act(() => { hooks.useAutoRefresh.mock.lastCall?.[0].onTick(); });
    expect(summaryState.refetch).not.toHaveBeenCalled();
    expect(listState.refetch).not.toHaveBeenCalled();
    unmount();

    hooks.useClientSyncSummary.mockReturnValue(summaryState);
    hooks.useClientSyncTransactions.mockReturnValue({ ...listState, loading: true });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    act(() => { hooks.useAutoRefresh.mock.lastCall?.[0].onTick(); });
    expect(summaryState.refetch).not.toHaveBeenCalled();
    expect(listState.refetch).not.toHaveBeenCalled();
  });

  it('with no report for the new scope, shows the skeletons: no old row to click and nothing to export', () => {
    storeControls({ orgId: 'ORG-1' });
    hooks.useClientSyncSummary.mockReturnValue({ ...summaryState, report: null, loading: true });
    hooks.useClientSyncTransactions.mockReturnValue({ ...listState, report: null, loading: true });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    expect(screen.getByRole('status', { name: 'Loading transactions' })).not.toBeNull();
    expect(screen.queryByRole('row', { name: 'Transaction FT26288H51MC' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'In from BwaTech' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ignores a click on a row without an Id', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    hooks.useClientSyncTransactions.mockReturnValue({ ...listState, report: makePageFixture([makeTransactionFixture({ Id: '', BankReference: 'REF-NOID' })]) });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('row', { name: 'Transaction REF-NOID' }));
    expect(hooks.useClientSyncTrace.mock.lastCall?.[0]).toBeNull();
  });

  it('clears a stored client that is no longer among the loaded VIP clients', () => {
    storeControls({ orgId: 'ORG-GONE', ibans: ['SA0380000000608010167519'] });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    expect(screen.getByText('Pick a client to see its accounts.')).not.toBeNull();
    expect(hooks.useClientSyncSummary.mock.lastCall?.[3]).toBe(false);
    expect(JSON.parse(localStorage.getItem(CLIENT_SYNC_CONTROLS_STORAGE_KEY) ?? '{}')).toMatchObject({ orgId: '', ibans: [] });
  });

  it('keeps a stored client while the VIP list is loading or failed, and drops stored accounts not on the chosen client', () => {
    storeControls({ orgId: 'ORG-GONE' });
    hooks.useVipClients.mockReturnValue({ clients: [], loading: true, error: null, refetch: vi.fn() });
    const { unmount } = render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    expect(JSON.parse(localStorage.getItem(CLIENT_SYNC_CONTROLS_STORAGE_KEY) ?? '{}')).toMatchObject({ orgId: 'ORG-GONE' });
    unmount();
    hooks.useVipClients.mockReturnValue({ clients: [], loading: false, error: 'VIP list unavailable', refetch: vi.fn() });
    const failed = render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    expect(JSON.parse(localStorage.getItem(CLIENT_SYNC_CONTROLS_STORAGE_KEY) ?? '{}')).toMatchObject({ orgId: 'ORG-GONE' });
    failed.unmount();

    hooks.useVipClients.mockReturnValue({ clients: CLIENTS, loading: false, error: null, refetch: vi.fn() });
    storeControls({ orgId: 'ORG-1', ibans: ['SA4420000001234567891234', 'SA9999999999999999999999'] });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    expect(hooks.useClientSyncSummary.mock.lastCall?.[0]).toMatchObject({ OrgId: 'ORG-1', IBANs: ['SA4420000001234567891234'] });
    expect(JSON.parse(localStorage.getItem(CLIENT_SYNC_CONTROLS_STORAGE_KEY) ?? '{}')).toMatchObject({ orgId: 'ORG-1', ibans: ['SA4420000001234567891234'] });
  });

  it('exports the loaded rows directly when every matching row is already loaded', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1', mode: 'range', from: '2026-10-01', to: '2026-10-10' });
    const loaded = makePageFixture([makeTransactionFixture()], { TotalCount: 1, AttributeColumns: ['SenderBank', 'kb_outlet_customer_code'] });
    hooks.useClientSyncTransactions.mockReturnValue({ ...listState, report: loaded });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(hooks.getAllClientSyncTransactions).not.toHaveBeenCalled();
    expect(hooks.downloadClientSyncCsv).toHaveBeenCalledWith(loaded.Transactions, ['SenderBank', 'kb_outlet_customer_code'], 'ORG-1', '2026-10-01', '2026-10-10');
  });

  it('fetches every page of the same filtered query before exporting when more rows match than are loaded', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1', mode: 'range', from: '2026-10-01', to: '2026-10-10' });
    const all = [makeTransactionFixture(), makeTransactionFixture({ Id: 'tx-2', BankReference: 'REF-2' })];
    hooks.getAllClientSyncTransactions.mockResolvedValue({ rows: all, attributeColumns: ['SenderBank'] });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(within(screen.getByRole('radiogroup', { name: 'Side' })).getByRole('radio', { name: 'CR' }));
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(hooks.getAllClientSyncTransactions).toHaveBeenCalledTimes(1);
    expect(hooks.getAllClientSyncTransactions.mock.lastCall?.[0]).toMatchObject({ OrgId: 'ORG-1', Side: 'CR', Show: 'ALL' });
    expect(hooks.getAllClientSyncTransactions.mock.lastCall?.[1]).toBe('tok');
    await waitFor(() => expect(hooks.downloadClientSyncCsv).toHaveBeenCalledWith(all, ['SenderBank'], 'ORG-1', '2026-10-01', '2026-10-10'));
  });

  it('reports a failed full export and keeps the button usable', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    hooks.getAllClientSyncTransactions.mockRejectedValue(new Error('Failed to load the client sync transactions'));
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText('Export failed: Failed to load the client sync transactions')).not.toBeNull();
    expect(hooks.downloadClientSyncCsv).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('side and tag filters reach the request and reset the window; a scope change clears them', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('button', { name: '+50' }));
    expect(lastListRequest()).toMatchObject({ PageSize: 150 });
    await user.click(within(screen.getByRole('radiogroup', { name: 'Side' })).getByRole('radio', { name: 'DR' }));
    expect(lastListRequest()).toMatchObject({ Side: 'DR', PageSize: 100 });

    await user.click(screen.getByRole('button', { name: '+50' }));
    await user.click(screen.getByRole('button', { name: /^Tag: All/ }));
    const picker = within(await screen.findByRole('dialog', { name: 'Tag' }));
    await user.click(picker.getByRole('checkbox', { name: /Untagged/ }));
    await user.click(picker.getByRole('checkbox', { name: /IncomingTransfer/ }));
    expect(lastListRequest()).toMatchObject({ Side: 'DR', Tags: ['UNTAGGED', 'IncomingTransfer'], PageSize: 100 });
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('radio', { name: 'Intraday' }));
    expect(lastListRequest()).toMatchObject({ Layer: 'INTRADAY' });
    expect(lastListRequest()?.Side).toBeUndefined();
    expect(lastListRequest()?.Tags).toBeUndefined();
  });

  it('customer type and certainty filters send KbCustomerTypes and KbCertaintyRanks, reset the window, and clear on a scope change', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    const base = makeSummaryFixture();
    hooks.useClientSyncSummary.mockReturnValue({
      ...summaryState,
      report: makeSummaryFixture({ KnowledgeBase: { ...base.KnowledgeBase, ByCustomerType: [{ Key: 'TC', Count: 812 }, { Key: 'CC', Count: 95 }] } }),
    });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('button', { name: '+50' }));
    await user.click(screen.getByRole('button', { name: /^Customer type: All/ }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Customer type' })).getByRole('checkbox', { name: /TC/ }));
    await user.keyboard('{Escape}');
    expect(lastListRequest()).toMatchObject({ KbCustomerTypes: ['TC'], PageSize: 100 });

    await user.click(screen.getByRole('button', { name: '+50' }));
    await user.click(screen.getByRole('button', { name: /^Certainty: All/ }));
    const certainty = within(await screen.findByRole('dialog', { name: 'Certainty' }));
    // The fixture lists Likely (rank 3) before Confirmed (rank 5); the request carries ranks as numbers.
    await user.click(certainty.getByRole('checkbox', { name: /Confirmed/ }));
    await user.click(certainty.getByRole('checkbox', { name: /Likely/ }));
    await user.keyboard('{Escape}');
    expect(lastListRequest()).toMatchObject({ KbCustomerTypes: ['TC'], KbCertaintyRanks: [3, 5], PageSize: 100 });

    await user.click(screen.getByRole('radio', { name: 'Intraday' }));
    expect(lastListRequest()?.KbCustomerTypes).toBeUndefined();
    expect(lastListRequest()?.KbCertaintyRanks).toBeUndefined();
  });

  it('hides the Customer type filter when the summary lists no types, and merges certainty entries that share a rank', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    const base = makeSummaryFixture();
    hooks.useClientSyncSummary.mockReturnValue({
      ...summaryState,
      report: makeSummaryFixture({ KnowledgeBase: { ...base.KnowledgeBase, ByCustomerType: [], ByCertainty: [
        { Rank: 5, Label: 'VERY STRONG', Count: 30, ReceivedAs: ['VERY STRONG'] },
        { Rank: 0, Label: 'ODD', Count: 2, ReceivedAs: ['ODD'] },
        { Rank: 0, Label: 'WEIRD', Count: 1, ReceivedAs: ['WEIRD'] },
      ] } }),
    });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    expect(screen.queryByRole('button', { name: /^Customer type/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Certainty: All/ }));
    const boxes = within(await screen.findByRole('dialog', { name: 'Certainty' })).getAllByRole('checkbox');
    expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual(['VERY STRONG30', 'ODD / WEIRD3']);
    expect(boxes[1].closest('label')?.getAttribute('title')).toBe('Received as ODD, WEIRD');
  });

  it('offers Untagged plus every published tag from the summary as tag choices, with their counts', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    hooks.useClientSyncSummary.mockReturnValue({
      ...summaryState,
      report: makeSummaryFixture({ Tagging: { ...makeSummaryFixture().Tagging, Untagged: 15, ByTag: [{ Key: 'IncomingTransfer', Count: 1200 }, { Key: 'BillPayment', Count: 40 }] } }),
    });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    await user.click(screen.getByRole('button', { name: /^Tag: All/ }));
    const boxes = within(await screen.findByRole('dialog', { name: 'Tag' })).getAllByRole('checkbox');
    expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual(['Untagged15', 'IncomingTransfer1,200', 'BillPayment40']);
  });

  it('shows the summary error card above stale content', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1' });
    hooks.useClientSyncSummary.mockReturnValue({ ...summaryState, error: 'SFM_INVALID_INPUT_PARAMETERS' });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    const alert = screen.getAllByRole('alert')[0];
    expect(alert.textContent).toContain('SFM_INVALID_INPUT_PARAMETERS');
    await user.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    expect(summaryState.refetch).toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'In from BwaTech' })).not.toBeNull();
  });

  it('blocks the request when the range exceeds 31 days', async () => {
    const user = userEvent.setup();
    storeControls({ orgId: 'ORG-1', mode: 'range', from: '2026-10-01', to: '2026-10-10' });
    render(<ClientSyncTab authToken="tok" tepHeaders={HEADERS} />);
    // DateField does not associate its label with the input; the From field is the first date text input.
    const from = screen.getAllByPlaceholderText('yyyy-mm-dd')[0] as HTMLInputElement;
    await user.clear(from);
    await user.type(from, '2026-08-01');
    expect(screen.getByText('Range can cover at most 31 days.')).not.toBeNull();
    expect(hooks.useClientSyncSummary.mock.lastCall?.[3]).toBe(false);
    expect(hooks.useClientSyncTransactions.mock.lastCall?.[3]).toBe(false);
  });
});
