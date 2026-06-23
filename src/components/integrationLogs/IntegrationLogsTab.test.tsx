import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { IntegrationLog } from '../../api/transactions';

vi.mock('../../api/transactions', async () => {
  const actual = await vi.importActual<typeof import('../../api/transactions')>(
    '../../api/transactions',
  );
  return {
    ...actual,
    getIntegrationLogs: vi.fn(),
    rerunIntegrationRequest: vi.fn(),
    getIntegrationLogFile: vi.fn(),
  };
});

const mockUseAuth = vi.fn(() => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
  userId: 'user-1',
  refreshIfNeeded: vi.fn().mockResolvedValue(undefined),
  isAudit: false,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../context/TepConfigContext', () => ({
  useTepConfig: () => ({
    ttpTenantCode: 'TENANT',
    languageCode: 'en',
    timeZone: 'UTC',
    ttpRequestId: 'req-1',
  }),
}));

const mockUseTransactionData = vi.fn(() => ({ isLiveMode: true }));
vi.mock('../../hooks/useTransactionData', () => ({
  useTransactionData: () => mockUseTransactionData(),
}));

// The bulk-rerun context owns its own polling + toast; here we stub it so the
// tab's wiring (button gating, launching a job) can be asserted in isolation.
const mockStartJob = vi.fn();
const mockUseRerunJob = vi.fn();
vi.mock('../../context/RerunJobContext', () => ({
  useRerunJob: () => mockUseRerunJob(),
  RerunJobProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Avoid dragging the modal's data-fetching into these tests.
vi.mock('./IntegrationLogFileModal', () => ({
  IntegrationLogFileModal: ({ log, onClose }: { log: IntegrationLog; onClose: () => void }) => (
    <div data-testid="file-modal">
      <span>Modal for {log.Id}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import {
  getIntegrationLogs,
  rerunIntegrationRequest,
} from '../../api/transactions';
import { IntegrationLogsTab } from './IntegrationLogsTab';

const mockedGetLogs = vi.mocked(getIntegrationLogs);
const mockedRerun = vi.mocked(rerunIntegrationRequest);

function makeLog(overrides: Partial<IntegrationLog> = {}): IntegrationLog {
  return {
    Id: 'log-1',
    Endpoint: 'ProcessTransactionsForTagging',
    StatementId: 'STMT-001',
    RequestFilePath: '/req/1',
    ResponseFilePath: '/res/1',
    CallStartDate: '2026-05-06T10:00:00',
    CallEndDate: '2026-05-06T10:00:01',
    StatusType: 'SUCCESS',
    StatusCode: '200',
    StatusDescription: 'OK',
    ...overrides,
  };
}

describe('IntegrationLogsTab', () => {
  beforeEach(() => {
    mockedGetLogs.mockReset();
    mockedRerun.mockReset();
    mockUseAuth.mockReturnValue({
      getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
      userId: 'user-1',
      refreshIfNeeded: vi.fn().mockResolvedValue(undefined),
      isAudit: false,
    });
    mockUseTransactionData.mockReturnValue({ isLiveMode: true });
    mockStartJob.mockReset();
    mockUseRerunJob.mockReturnValue({
      phase: 'idle',
      progress: null,
      resultDescription: '',
      errorMessage: null,
      isActive: false,
      job: null,
      startJob: mockStartJob,
      dismiss: vi.fn(),
    });
  });

  it('shows the live-mode-only message when not in live mode', () => {
    mockUseTransactionData.mockReturnValue({ isLiveMode: false });
    render(<IntegrationLogsTab />);
    expect(screen.queryByText(/Integration logs are only available in live mode/i)).not.toBeNull();
    expect(mockedGetLogs).not.toHaveBeenCalled();
  });

  it('fetches and renders rows on mount', async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [makeLog(), makeLog({ Id: 'log-2', StatementId: 'STMT-002', StatusType: 'ERROR' })],
      Total: 2,
      Page: 1,
      PageSize: 20,
    });
    render(<IntegrationLogsTab />);
    await waitFor(() => expect(mockedGetLogs).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('STMT-001')).not.toBeNull();
    expect(screen.queryByText('STMT-002')).not.toBeNull();
  });

  it('refetches live (debounced) when a filter changes — no Apply button', async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [],
      Total: 0,
      Page: 1,
      PageSize: 20,
    });
    render(<IntegrationLogsTab />);
    await waitFor(() => expect(mockedGetLogs).toHaveBeenCalledTimes(1));

    // No Apply button exists.
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/statement id/i), { target: { value: 'STMT-007' } });

    // Debounce window — at least one more call lands.
    await waitFor(
      () => expect(mockedGetLogs.mock.calls.length).toBeGreaterThanOrEqual(2),
      { timeout: 2000 },
    );
    const lastCall = mockedGetLogs.mock.calls[mockedGetLogs.mock.calls.length - 1];
    expect(lastCall[0].StatementId).toBe('STMT-007');
    expect(lastCall[0].Page).toBe(1);
  });

  it('hides the Rerun button when the user is an audit role', async () => {
    mockUseAuth.mockReturnValue({
      getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
      userId: 'user-1',
      refreshIfNeeded: vi.fn().mockResolvedValue(undefined),
      isAudit: true,
    });
    mockedGetLogs.mockResolvedValue({
      Items: [makeLog({ StatusType: 'ERROR' })],
      Total: 1,
      Page: 1,
      PageSize: 20,
    });
    render(<IntegrationLogsTab />);
    expect(await screen.findByText('STMT-001')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /rerun/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /view/i })).not.toBeNull();
  });

  it('confirms then re-runs and refetches', async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [makeLog({ Endpoint: 'PushProcessedStatement', StatusType: 'ERROR' })],
      Total: 1,
      Page: 1,
      PageSize: 20,
    });
    mockedRerun.mockResolvedValue(undefined);
    render(<IntegrationLogsTab />);
    expect(await screen.findByText('STMT-001')).not.toBeNull();
    expect(mockedGetLogs).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /rerun/i }));
    const confirmButton = await screen.findByRole('button', { name: 'Re-run now' });
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    await waitFor(() =>
      expect(mockedRerun).toHaveBeenCalledWith('log-1', 'test-token', expect.any(Object)),
    );
    await waitFor(() => expect(mockedGetLogs).toHaveBeenCalledTimes(2));
  });

  it('hides the Rerun button for ProcessTransactionsForTagging rows', async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [
        makeLog({ Id: 'p-1', Endpoint: 'ProcessTransactionsForTagging' }),
        makeLog({ Id: 'p-2', Endpoint: 'PushProcessedStatement', StatementId: 'STMT-002' }),
      ],
      Total: 2,
      Page: 1,
      PageSize: 20,
    });
    render(<IntegrationLogsTab />);
    expect(await screen.findByText('STMT-001')).not.toBeNull();
    // Only one Rerun button — the PushProcessedStatement row.
    const rerunButtons = screen.queryAllByRole('button', { name: /rerun/i });
    expect(rerunButtons).toHaveLength(1);
  });

  it("offers 'Rerun all failed from here' inside a PushProcessedStatement rerun popup", async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [makeLog({ Id: 'pps', Endpoint: 'PushProcessedStatement', StatementId: 'PPS-1', StatusType: 'ERROR' })],
      Total: 1,
      Page: 1,
      PageSize: 20,
    });
    render(<IntegrationLogsTab />);
    expect(await screen.findByText('PPS-1')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rerun' }));
    expect(await screen.findByRole('button', { name: 'Re-run now' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Rerun all failed from here' })).not.toBeNull();
  });

  it("does NOT offer the bulk button for a non-PushProcessedStatement rerun popup", async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [makeLog({ Id: 'pt', Endpoint: 'PatchTransactions', StatementId: 'PT-1', StatusType: 'ERROR' })],
      Total: 1,
      Page: 1,
      PageSize: 20,
    });
    render(<IntegrationLogsTab />);
    expect(await screen.findByText('PT-1')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rerun' }));
    expect(await screen.findByRole('button', { name: 'Re-run now' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Rerun all failed from here' })).toBeNull();
  });

  it('launches the bulk rerun job from the row id after the second confirmation', async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [makeLog({ Id: 'pps', Endpoint: 'PushProcessedStatement', StatementId: 'PPS-1', StatusType: 'ERROR' })],
      Total: 1,
      Page: 1,
      PageSize: 20,
    });
    render(<IntegrationLogsTab />);
    expect(await screen.findByText('PPS-1')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rerun' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rerun all failed from here' }));

    // Second (strong) confirmation, then launch.
    const confirm = await screen.findByRole('button', { name: 'Yes, rerun all' });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(mockStartJob).toHaveBeenCalledWith('pps', 'PPS-1');
  });

  it('opens the file modal when a row is viewed', async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [makeLog()],
      Total: 1,
      Page: 1,
      PageSize: 20,
    });
    render(<IntegrationLogsTab />);
    expect(await screen.findByText('STMT-001')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /view/i }));
    expect(await screen.findByTestId('file-modal')).not.toBeNull();
    expect(screen.queryByText('Modal for log-1')).not.toBeNull();
  });

  it('shows incremental load-more buttons and grows the window when clicked', async () => {
    // First fetch returns 50 of 491.
    mockedGetLogs.mockResolvedValueOnce({
      Items: Array.from({ length: 50 }, (_, i) => makeLog({ Id: `log-${i}`, StatementId: `S-${i}` })),
      Total: 491,
      Page: 1,
      PageSize: 50,
    });
    // After +25, fetch returns 75 of 491.
    mockedGetLogs.mockResolvedValueOnce({
      Items: Array.from({ length: 75 }, (_, i) => makeLog({ Id: `log-${i}`, StatementId: `S-${i}` })),
      Total: 491,
      Page: 1,
      PageSize: 75,
    });

    render(<IntegrationLogsTab />);
    await waitFor(() => expect(mockedGetLogs).toHaveBeenCalledTimes(1));

    // Footer renders "N loaded · TOTAL total" plus the +25/+50/+200/+500 buttons.
    expect(await screen.findByText(/loaded ·/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: '+25' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: '+50' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: '+200' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: '+500' })).toBeNull(); // only 441 remain — under 500

    fireEvent.click(screen.getByRole('button', { name: '+25' }));
    await waitFor(() => expect(mockedGetLogs).toHaveBeenCalledTimes(2));
    const secondCall = mockedGetLogs.mock.calls[1];
    expect(secondCall[0].PageSize).toBe(75);
    expect(secondCall[0].Page).toBe(1);
  });

  it('hides the load-more footer when everything fits in the initial window', async () => {
    mockedGetLogs.mockResolvedValue({
      Items: [makeLog()],
      Total: 1,
      Page: 1,
      PageSize: 50,
    });
    render(<IntegrationLogsTab />);
    expect(await screen.findByText('STMT-001')).not.toBeNull();
    expect(screen.queryByText(/loaded ·/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^\+\d+$/ })).toBeNull();
  });
});
