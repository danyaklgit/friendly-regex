import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RerunJobProvider, useRerunJob } from './RerunJobContext';

vi.mock('../api/transactions', async (importActual) => {
  const actual = await importActual<typeof import('../api/transactions')>();
  return {
    ...actual,
    rerunPushProcessedStatements: vi.fn(),
    getRerunPushProcessedStatementsProgress: vi.fn(),
  };
});

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
    refreshIfNeeded: vi.fn().mockResolvedValue(undefined),
    userId: 'user-1',
  }),
}));

vi.mock('./TepConfigContext', () => ({
  useTepConfig: () => ({
    ttpTenantCode: 'TENANT',
    languageCode: 'en',
    timeZone: 'UTC',
    ttpRequestId: 'req-1',
  }),
}));

import {
  rerunPushProcessedStatements,
  getRerunPushProcessedStatementsProgress,
  type RerunJobProgress,
} from '../api/transactions';

const mockedKickoff = vi.mocked(rerunPushProcessedStatements);
const mockedProgress = vi.mocked(getRerunPushProcessedStatementsProgress);

function progress(overrides: Partial<RerunJobProgress> = {}): RerunJobProgress {
  return {
    Id: 'job-1',
    FromId: 'from-1',
    TotalStatements: 4,
    ProcessedStatements: 0,
    FailedCount: 0,
    Status: 'IN_PROGRESS',
    StartedAt: '2026-06-23T09:15:00Z',
    CompletedAt: null,
    PhaseMessage: 'Queued',
    ErrorMessage: null,
    FailedStatements: [],
    ...overrides,
  };
}

function Harness() {
  const { phase, progress: p, resultDescription, startJob } = useRerunJob();
  return (
    <div>
      <span data-testid="phase">{phase}</span>
      <span data-testid="desc">{resultDescription}</span>
      <span data-testid="processed">{p?.ProcessedStatements ?? -1}</span>
      <button onClick={() => startJob('from-1', 'PPS-1')}>start</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <RerunJobProvider>
      <Harness />
    </RerunJobProvider>,
  );
}

describe('RerunJobContext', () => {
  beforeEach(() => {
    mockedKickoff.mockReset();
    mockedProgress.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves to "done" with no polling when there is nothing to rerun', async () => {
    mockedKickoff.mockResolvedValue({
      JobId: null,
      ResultDescription: 'Nothing to rerun.',
      SFM: { Constant: 'SFM_SUCCESS' },
    });
    renderHarness();
    await act(async () => {
      fireEvent.click(screen.getByText('start'));
    });
    expect(screen.getByTestId('phase').textContent).toBe('done');
    expect(screen.getByTestId('desc').textContent).toBe('Nothing to rerun.');
    expect(mockedProgress).not.toHaveBeenCalled();
  });

  it('moves to "error" when the kickoff SFM is not success', async () => {
    mockedKickoff.mockResolvedValue({
      JobId: null,
      ResultDescription: 'Invalid FromId.',
      SFM: { Constant: 'SFM_GENERAL_ERROR' },
    });
    renderHarness();
    await act(async () => {
      fireEvent.click(screen.getByText('start'));
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
  });

  it('polls every 30s and settles on COMPLETED', async () => {
    vi.useFakeTimers();
    mockedKickoff.mockResolvedValue({
      JobId: 'job-1',
      ResultDescription: 'Rerun job started for 4 failed statement(s).',
      SFM: { Constant: 'SFM_SUCCESS' },
    });
    mockedProgress
      .mockResolvedValueOnce({
        Progress: progress({ ProcessedStatements: 2 }),
        ResultDescription: 'Rerun job in progress: 2 of 4 replayed, 0 failed so far.',
        SFM: { Constant: 'SFM_SUCCESS' },
      })
      .mockResolvedValueOnce({
        Progress: progress({ ProcessedStatements: 4, Status: 'COMPLETED', CompletedAt: '2026-06-23T09:16:00Z' }),
        ResultDescription: 'Rerun job completed: 4 of 4 succeeded, 0 failed.',
        SFM: { Constant: 'SFM_SUCCESS' },
      });

    renderHarness();

    await act(async () => {
      fireEvent.click(screen.getByText('start'));
    });
    expect(screen.getByTestId('phase').textContent).toBe('polling');

    // First poll at 30s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId('processed').textContent).toBe('2');
    expect(screen.getByTestId('phase').textContent).toBe('polling');

    // Second poll at 60s -> COMPLETED.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId('phase').textContent).toBe('done');
    expect(screen.getByTestId('processed').textContent).toBe('4');
  });

  it('treats a FAILED job status as an error phase', async () => {
    vi.useFakeTimers();
    mockedKickoff.mockResolvedValue({
      JobId: 'job-1',
      ResultDescription: 'started',
      SFM: { Constant: 'SFM_SUCCESS' },
    });
    mockedProgress.mockResolvedValueOnce({
      Progress: progress({ Status: 'FAILED', ErrorMessage: 'Service restarted.', FailedCount: 1 }),
      ResultDescription: 'Rerun job failed: Service restarted.',
      SFM: { Constant: 'SFM_SUCCESS' },
    });

    renderHarness();
    await act(async () => {
      fireEvent.click(screen.getByText('start'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
  });
});
