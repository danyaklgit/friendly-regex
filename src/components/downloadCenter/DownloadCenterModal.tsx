import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useDownloadCenter } from '../../context/DownloadCenterContext';
import { DownloadCenterFileRow } from './DownloadCenterFileRow';

/**
 * Modal listing the operator's export jobs. Polls every 3s for status
 * updates while open and at least one row is INPROGRESS (handled inside
 * the context provider). Empty + error + success states are mutually
 * exclusive; the loading state only surfaces on first open / Refresh
 * click — subsequent polls are silent so the list doesn't flicker.
 */
export function DownloadCenterModal() {
  const { isOpen, closeModal, files, loading, error, refresh, downloadFile, deleteFile, clearAll } = useDownloadCenter();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (!isOpen) return null;

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearAll();
      setConfirmClearOpen(false);
    } finally {
      setClearing(false);
    }
  };

  const headerAction = files.length > 0 ? (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => setConfirmClearOpen(true)}
      className="text-red-400 hover:text-red-500"
    >
      Clear All
    </Button>
  ) : undefined;

  return (
    <>
      <Modal open onClose={closeModal} title="Download Center" headerAction={headerAction}>
        {error && (
          <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="ghost" size="xs" onClick={() => void refresh()} className="text-rose-700 dark:text-rose-300">
              Retry
            </Button>
          </div>
        )}

        {loading && files.length === 0 && !error && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg border border-border bg-surface-secondary animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !error && files.length === 0 && (
          <div className="py-10 text-center text-sm text-muted">
            <div className="mb-2">You haven't exported anything yet.</div>
            <div className="text-xs text-faint">
              Use the Export button on the Transactions tab to queue your first export.
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file) => (
              <DownloadCenterFileRow
                key={file.Id}
                file={file}
                onDownload={downloadFile}
                onDelete={deleteFile}
              />
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={handleClearAll}
        title="Clear all exports?"
        message="This removes every export file from your Download Center. This cannot be undone."
        confirmLabel={clearing ? 'Clearing…' : 'Clear all'}
        variant="danger"
      />
    </>
  );
}
