import { useEffect, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { useRerunJob, type RerunJobPhase } from '../../context/RerunJobContext';
import type { IntegrationLog, RerunJobProgress } from '../../api/transactions';

interface BulkRerunDialogProps {
  log: IntegrationLog;
  onClose: () => void;
}

interface Snapshot {
  phase: RerunJobPhase;
  progress: RerunJobProgress | null;
  resultDescription: string;
  errorMessage: string | null;
}

/**
 * Critical bulk action launched from inside the per-row rerun popup (only for
 * PushProcessedStatement rows). Shows a strong second confirmation, then a
 * live progress view. The poll itself lives in RerunJobContext, so closing this
 * dialog does NOT stop the job — the persistent toast keeps the operator posted.
 */
export function BulkRerunDialog({ log, onClose }: BulkRerunDialogProps) {
  const { phase, progress, resultDescription, errorMessage, isActive, startJob } = useRerunJob();
  const [started, setStarted] = useState(false);
  // Freeze the latest non-idle job state so a terminal result stays visible even
  // after the context resets to idle (e.g. the success toast auto-dismisses).
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (started && phase !== 'idle') {
      setSnap({ phase, progress, resultDescription, errorMessage });
    }
  }, [started, phase, progress, resultDescription, errorMessage]);

  const label = log.StatementId || log.Endpoint || log.Id;

  const handleConfirm = () => {
    setStarted(true);
    void startJob(log.Id, label);
  };

  // --- Confirm view ----------------------------------------------------------
  if (!started) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Rerun all failed from here"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirm}>
              Yes, rerun all
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-body-secondary">
          <p>
            This replays <span className="font-semibold text-body">every</span> failed Push Processed
            Statement from this entry onward (oldest first). A new log entry is created per statement.
          </p>
          <p className="font-medium text-danger">This is a bulk action and cannot be undone.</p>
          <p className="text-xs text-faint">
            Starting from: <span className="font-mono">{label}</span>
          </p>
          {isActive && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              A bulk rerun is already running. Starting a new one stops tracking the current job (it keeps
              running on the server).
            </p>
          )}
        </div>
      </Modal>
    );
  }

  // --- Progress view ---------------------------------------------------------
  const view = snap ?? { phase: 'starting' as RerunJobPhase, progress: null, resultDescription: '', errorMessage: null };
  const total = view.progress?.TotalStatements ?? 0;
  const processed = view.progress?.ProcessedStatements ?? 0;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const failed = view.progress?.FailedStatements ?? [];
  const running = view.phase === 'starting' || view.phase === 'polling';
  const isError = view.phase === 'error';

  return (
    <Modal
      open
      onClose={onClose}
      title="Rerun all failed from here"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
        <p className={isError ? 'text-danger' : 'text-body-secondary'}>
          {view.resultDescription || view.errorMessage || (view.phase === 'starting' ? 'Starting bulk rerun…' : 'Working…')}
        </p>

        {total > 0 && (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
              <div
                className={`h-full rounded-full transition-all duration-300 ${isError ? 'bg-danger' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-faint">
              <span>{processed} of {total} replayed</span>
              <span>{view.progress?.FailedCount ?? 0} failed</span>
            </div>
          </div>
        )}

        {failed.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-body-secondary">Failed statements</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto custom-scrollbar rounded-md border border-border p-2">
              {failed.map((f) => (
                <li key={f.Id} className="text-xs">
                  <span className="font-mono text-body">{f.Id}</span>
                  <span className="text-faint">: {f.ErrorMessage}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {running && (
          <p className="text-xs text-faint">
            You can close this. The job keeps running and the toast will keep you posted.
          </p>
        )}
      </div>
    </Modal>
  );
}
