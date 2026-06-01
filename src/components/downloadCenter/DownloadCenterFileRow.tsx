import { useCallback, useState } from 'react';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import type { DownloadCenterFile } from '../../types/downloadCenter';
import type { DownloadAttemptResult } from '../../context/DownloadCenterContext';

interface DownloadCenterFileRowProps {
  file: DownloadCenterFile;
  onDownload: (fileId: string) => Promise<DownloadAttemptResult>;
  onDelete: (fileId: string) => Promise<void>;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function StatusPill({ status }: { status: DownloadCenterFile['Status'] }) {
  switch (status) {
    case 'READY':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[11px] font-medium">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Ready
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 text-[11px] font-medium">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M4 4L12 12M12 4L4 12" strokeLinecap="round" />
          </svg>
          Failed
        </span>
      );
    case 'INPROGRESS':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-[11px] font-medium">
          <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          In progress
        </span>
      );
  }
}

export function DownloadCenterFileRow({ file, onDownload, onDelete }: DownloadCenterFileRowProps) {
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    setBusy('download');
    setInlineError(null);
    const result = await onDownload(file.Id);
    setBusy(null);
    if (result.kind === 'not_ready' || result.kind === 'error') {
      setInlineError(result.message);
    }
  }, [file.Id, onDownload]);

  const handleDelete = useCallback(async () => {
    setBusy('delete');
    setInlineError(null);
    try {
      await onDelete(file.Id);
    } catch (e) {
      setInlineError(e instanceof Error ? e.message : 'Failed to delete export.');
      setBusy(null);
    }
  }, [file.Id, onDelete]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg bg-surface-secondary">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <StatusPill status={file.Status} />
          <span className="font-mono text-xs text-body truncate" title={file.FileName}>
            {file.FileName}
          </span>
        </div>
        <div className="text-[11px] text-faint">
          Created: {formatDate(file.CreatedDate)}
          {file.CompletedDate && file.Status !== 'INPROGRESS' && (
            <> · Completed: {formatDate(file.CompletedDate)}</>
          )}
        </div>
        {file.Status === 'FAILED' && file.ErrorMessage && (
          <div className="mt-1.5 text-xs text-rose-600 dark:text-rose-400 break-words">
            {file.ErrorMessage}
          </div>
        )}
        {inlineError && (
          <div className="mt-1.5 text-xs text-rose-600 dark:text-rose-400 break-words">
            {inlineError}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {file.Status === 'READY' && (
          <Tooltip content="Download file" placement="top">
            <Button
              variant="primary"
              size="xs"
              onClick={handleDownload}
              loading={busy === 'download'}
              disabled={busy !== null}
            >
              Download
            </Button>
          </Tooltip>
        )}
        {/* Delete is hidden while the backend job is still running — the
            export hasn't materialised yet, so there's nothing to remove
            and a delete call mid-flight would race the job's final
            commit. Once the row flips to READY or FAILED the button
            comes back. */}
        {file.Status !== 'INPROGRESS' && (
          <Tooltip content="Remove from Download Center" placement="top">
            <Button
              variant="ghost"
              size="xs"
              onClick={handleDelete}
              loading={busy === 'delete'}
              disabled={busy !== null}
              className="text-red-400 hover:text-red-500"
            >
              Delete
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
