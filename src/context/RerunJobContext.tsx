import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useTepConfig } from './TepConfigContext';
import {
  rerunPushProcessedStatements,
  getRerunPushProcessedStatementsProgress,
  type RerunJobProgress,
  type TepHeaders,
} from '../api/transactions';
import { Toast } from '../components/shared/Toast';

// Poll cadence for an in-flight bulk rerun job. The persistent toast message
// refreshes on each poll.
const POLL_INTERVAL_MS = 30_000;
// A poll-level SFM_GENERAL_ERROR is a transport/lookup blip, not a job failure
// (contract §5.6) — keep polling, but give up after this many in a row.
const MAX_POLL_ERRORS = 5;

export type RerunJobPhase = 'idle' | 'starting' | 'polling' | 'done' | 'error';

interface TrackedJob {
  jobId: string;
  fromId: string;
  label: string;
}

interface RerunJobContextValue {
  phase: RerunJobPhase;
  progress: RerunJobProgress | null;
  resultDescription: string;
  errorMessage: string | null;
  /** True while a job is starting or being polled. */
  isActive: boolean;
  job: TrackedJob | null;
  /** Kick off a bulk rerun from `fromId` and begin polling. `label` is shown in toasts. */
  startJob: (fromId: string, label: string) => Promise<void>;
  /** Clear a terminal (done/error) job back to idle. No-op while active. */
  dismiss: () => void;
}

const RerunJobContext = createContext<RerunJobContextValue | null>(null);

export function RerunJobProvider({ children }: { children: ReactNode }) {
  const { getAuthHeaders, refreshIfNeeded, userId } = useAuth();
  const tepConfig = useTepConfig();

  const [phase, setPhase] = useState<RerunJobPhase>('idle');
  const [progress, setProgress] = useState<RerunJobProgress | null>(null);
  const [resultDescription, setResultDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [job, setJob] = useState<TrackedJob | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const errCountRef = useRef(0);

  // Latest auth/config, read at call time so the long-lived poll never closes
  // over a stale token.
  const authStateRef = useRef({ getAuthHeaders, refreshIfNeeded, userId, tepConfig });
  authStateRef.current = { getAuthHeaders, refreshIfNeeded, userId, tepConfig };

  const prepareAuth = useCallback(async (): Promise<{ token: string; tepHeaders: TepHeaders }> => {
    const { getAuthHeaders: gh, refreshIfNeeded: refresh, userId: uid, tepConfig: cfg } =
      authStateRef.current;
    await refresh();
    const headers = gh();
    const token = headers.Authorization?.replace('Bearer ', '') ?? '';
    if (!token || !uid) throw new Error('Not authenticated');
    const tepHeaders: TepHeaders = {
      userId: uid,
      tenantCode: cfg.ttpTenantCode,
      languageCode: cfg.languageCode,
      timeZone: cfg.timeZone,
      requestId: cfg.ttpRequestId,
    };
    return { token, tepHeaders };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const poll = useCallback(async (jobId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { token, tepHeaders } = await prepareAuth();
      const data = await getRerunPushProcessedStatementsProgress(jobId, token, tepHeaders, controller.signal);
      if (controller.signal.aborted) return;

      if (data.SFM?.Constant === 'SFM_GENERAL_ERROR') {
        // Transport/lookup blip — keep polling unless it keeps failing.
        errCountRef.current += 1;
        if (errCountRef.current >= MAX_POLL_ERRORS) {
          stopPolling();
          setErrorMessage(data.ResultDescription || 'Lost contact with the rerun job.');
          setPhase('error');
        }
        return;
      }

      errCountRef.current = 0;
      const p = data.Progress;
      setProgress(p);
      setResultDescription(data.ResultDescription);
      if (p && (p.Status === 'COMPLETED' || p.Status === 'FAILED')) {
        stopPolling();
        if (p.Status === 'FAILED') {
          setErrorMessage(data.ResultDescription || p.ErrorMessage || 'Rerun job failed.');
          setPhase('error');
        } else {
          setPhase('done');
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      errCountRef.current += 1;
      if (errCountRef.current >= MAX_POLL_ERRORS) {
        stopPolling();
        setErrorMessage(err instanceof Error ? err.message : 'Lost contact with the rerun job.');
        setPhase('error');
      }
    }
  }, [prepareAuth, stopPolling]);

  const startJob = useCallback(async (fromId: string, label: string) => {
    // Single tracked job: replace any prior one (its server job keeps running).
    stopPolling();
    errCountRef.current = 0;
    setProgress(null);
    setErrorMessage(null);
    setResultDescription('');
    setJob(null);
    setPhase('starting');
    try {
      const { token, tepHeaders } = await prepareAuth();
      const data = await rerunPushProcessedStatements(fromId, token, tepHeaders);
      if (data.SFM?.Constant !== 'SFM_SUCCESS') {
        setResultDescription(data.ResultDescription || '');
        setErrorMessage(data.ResultDescription || 'Failed to start the bulk rerun.');
        setPhase('error');
        return;
      }
      setResultDescription(data.ResultDescription || '');
      if (!data.JobId) {
        // Nothing to rerun — success, no job to poll.
        setPhase('done');
        return;
      }
      setJob({ jobId: data.JobId, fromId, label });
      setPhase('polling');
      const jobId = data.JobId;
      pollRef.current = setInterval(() => { void poll(jobId); }, POLL_INTERVAL_MS);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start the bulk rerun.');
      setPhase('error');
    }
  }, [poll, prepareAuth, stopPolling]);

  const dismiss = useCallback(() => {
    setPhase((prev) => {
      if (prev === 'starting' || prev === 'polling') return prev;
      setProgress(null);
      setErrorMessage(null);
      setResultDescription('');
      setJob(null);
      return 'idle';
    });
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const value = useMemo<RerunJobContextValue>(() => ({
    phase,
    progress,
    resultDescription,
    errorMessage,
    isActive: phase === 'starting' || phase === 'polling',
    job,
    startJob,
    dismiss,
  }), [phase, progress, resultDescription, errorMessage, job, startJob, dismiss]);

  const noop = useCallback(() => {}, []);

  return (
    <RerunJobContext.Provider value={value}>
      {children}
      {(phase === 'starting' || phase === 'polling') && (
        <Toast
          type="info"
          persistent
          message={resultDescription || 'Starting bulk rerun…'}
          onClose={noop}
        />
      )}
      {phase === 'done' && (
        <Toast
          type="success"
          duration={6000}
          message={resultDescription || 'Rerun job finished.'}
          onClose={dismiss}
        />
      )}
      {phase === 'error' && (
        <Toast
          type="error"
          duration={8000}
          message={errorMessage || resultDescription || 'Rerun job failed.'}
          onClose={dismiss}
        />
      )}
    </RerunJobContext.Provider>
  );
}

export function useRerunJob(): RerunJobContextValue {
  const ctx = useContext(RerunJobContext);
  if (!ctx) throw new Error('useRerunJob must be used within a RerunJobProvider');
  return ctx;
}
