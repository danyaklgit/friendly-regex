import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientSyncCall, ClientSyncTrace } from '../../api/clientSync';
import type { IntegrationLog } from '../../api/transactions';
import { callToIntegrationLog } from '../../utils/clientSync/calls';
import { formatAmount, DASH } from '../../utils/clientSync/format';
import { Button } from '../shared/Button';
import { ReportErrorCard } from '../reports/ReportErrorCard';
import { IntegrationLogFileModal } from '../integrationLogs/IntegrationLogFileModal';
import type { FilePane } from './CallRow';
import { TraceStepIn } from './TraceStepIn';
import { TraceStepTagging } from './TraceStepTagging';
import { TraceStepKb } from './TraceStepKb';
import { TraceStepOut } from './TraceStepOut';

interface TraceDrawerProps {
  /** null = closed. */
  transactionId: string | null;
  trace: ClientSyncTrace | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  withDate: boolean;
}

interface OpenFile { log: IntegrationLog; pane: FilePane }

/**
 * Right-side trace drawer (spec 7.6), shell per TagDetailPanel: overlay,
 * role="dialog" aside, Escape and overlay click close it. The four steps
 * render from the trace; file buttons open the existing log-file viewer.
 */
export function TraceDrawer({ transactionId, trace, loading, error, onRetry, onClose, withDate }: TraceDrawerProps) {
  const open = transactionId !== null;
  const [file, setFile] = useState<OpenFile | null>(null);
  const [prevId, setPrevId] = useState(transactionId);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // A viewer opened for one row must not outlive the selection.
  if (prevId !== transactionId) {
    setPrevId(transactionId);
    setFile(null);
  }

  const fileOpen = file !== null;
  const closeFile = useCallback(() => setFile(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // The viewer sits on top: Escape dismisses it before the drawer.
      if (fileOpen) closeFile();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, fileOpen, closeFile]);

  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  const openFile = useCallback((call: ClientSyncCall, pane: FilePane) => {
    setFile({ log: callToIntegrationLog(call), pane });
  }, []);

  const tx = trace?.Transaction;

  return (
    <>
      <div
        data-testid="trace-overlay"
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <aside
        role="dialog"
        aria-label="Transaction trace"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-surface-elevated shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.45)] transition-transform duration-300 ease-out md:w-[min(52vw,640px)] ${open ? 'translate-x-0' : 'translate-x-[calc(100%+80px)]'}`}
      >
        <header className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-5 pb-3 pt-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Transaction trace</div>
              {tx ? (
                <>
                  <h2 className="truncate text-base font-semibold text-heading" dir="auto">{`${formatAmount(tx.Amount, tx.Side)} · ${tx.Sender || DASH}`}</h2>
                  <div className="truncate font-mono text-[11px] text-muted">{[tx.Id, tx.BankReference].filter(Boolean).join(' · ')}</div>
                </>
              ) : (
                <h2 className="truncate font-mono text-base font-semibold text-heading">{transactionId ?? ''}</h2>
              )}
            </div>
            <Button variant="ghost" size="xs" aria-label="Refresh trace" onClick={onRetry} loading={loading}>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.062 9A8.001 8.001 0 0119.418 7M18.938 15A8.001 8.001 0 014.582 17" />
              </svg>
            </Button>
            <button
              ref={closeBtnRef}
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-md p-1 text-body-secondary hover:bg-surface-hover hover:text-heading"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {error && <ReportErrorCard message={error} onRetry={onRetry} />}
          {!trace && !error && (
            <div role="status" aria-label="Loading trace" className="animate-pulse space-y-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-surface-tertiary" />)}
            </div>
          )}
          {trace && (
            <div data-testid="trace-frame" aria-busy={loading || undefined} className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              <TraceStepIn data={trace.In} withDate={withDate} onOpenFile={openFile} />
              <TraceStepTagging data={trace.Tagging} />
              <TraceStepKb data={trace.Kb} withDate={withDate} onOpenFile={openFile} />
              <TraceStepOut data={trace.Out} outStatus={trace.Transaction.Out.Status} withDate={withDate} onOpenFile={openFile} />
            </div>
          )}
        </div>
      </aside>
      {file && <IntegrationLogFileModal log={file.log} initialPane={file.pane} onClose={closeFile} />}
    </>
  );
}
