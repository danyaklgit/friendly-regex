import { useMemo } from 'react';
import type { TagHierarchyRawNode } from '../../api/tagsHierarchy';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { computeDiff } from '../../utils/tagHierarchyDiff';
import { getNodeName } from '../../utils/tagHierarchyNode';

interface SyncReviewModalProps {
  open: boolean;
  onClose: () => void;
  currentNodes: TagHierarchyRawNode[];
  originalNodes: TagHierarchyRawNode[];
  onConfirm: () => void;
  syncing: boolean;
  demoMode?: boolean;
}

export function SyncReviewModal({ open, onClose, currentNodes, originalNodes, onConfirm, syncing, demoMode }: SyncReviewModalProps) {
  const diff = useMemo(
    () => computeDiff(currentNodes, originalNodes),
    [currentNodes, originalNodes],
  );

  const totalChanges = diff.added.length + diff.removed.length + diff.modified.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review Changes"
      footer={
        <>
          <Button data-tour="sync-review-close" variant="ghost" onClick={onClose} disabled={syncing}>{demoMode ? 'Close' : 'Cancel'}</Button>
          {!demoMode && (
            <Button variant="primary" onClick={onConfirm} disabled={syncing || totalChanges === 0}>
              {syncing ? 'Syncing...' : 'Sync Tags'}
            </Button>
          )}
        </>
      }
    >
      {totalChanges === 0 ? (
        <p className="text-sm text-muted py-6 text-center">No changes to sync.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {diff.added.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-heading mb-2 flex items-center gap-2">
                Added <Badge variant="success">{diff.added.length}</Badge>
              </h3>
              <div className="flex flex-col gap-1">
                {diff.added.map((n) => (
                  <div key={n.Tag} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 dark:bg-green-900/10 text-sm">
                    <span className="text-green-600 dark:text-green-400 font-medium">+</span>
                    <span className="font-medium text-heading">{n.Tag}</span>
                    <span className="text-muted">— {getNodeName(n)}</span>
                    <Badge>{n.Level}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.modified.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-heading mb-2 flex items-center gap-2">
                Modified <Badge variant="warning">{diff.modified.length}</Badge>
              </h3>
              <div className="flex flex-col gap-1">
                {diff.modified.map((m) => (
                  <div key={m.tag} className="px-3 py-1.5 rounded-md bg-yellow-50 dark:bg-yellow-900/10 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-600 dark:text-yellow-400 font-medium">~</span>
                      <span className="font-medium text-heading">{m.tag}</span>
                      <span className="text-muted">— {m.name}</span>
                    </div>
                    <ul className="ml-6 mt-1 text-xs text-muted list-disc">
                      {m.changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.removed.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-heading mb-2 flex items-center gap-2">
                Removed <Badge variant="danger">{diff.removed.length}</Badge>
              </h3>
              <div className="flex flex-col gap-1">
                {diff.removed.map((n) => (
                  <div key={n.Tag} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-50 dark:bg-red-900/10 text-sm">
                    <span className="text-red-600 dark:text-red-400 font-medium">-</span>
                    <span className="font-medium text-heading line-through">{n.Tag}</span>
                    <span className="text-muted">— {getNodeName(n)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
