import { useMemo } from 'react';
import type { TagHierarchyRawNode } from '../../api/tagsHierarchy';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';

interface SyncReviewModalProps {
  open: boolean;
  onClose: () => void;
  currentNodes: TagHierarchyRawNode[];
  originalNodes: TagHierarchyRawNode[];
  onConfirm: () => void;
  syncing: boolean;
  demoMode?: boolean;
}

interface NodeDiff {
  tag: string;
  name: string;
  changes: string[];
}

function getNodeName(node: TagHierarchyRawNode): string {
  return node.Details?.find((d) => d.LanguageCode === 'en')?.Name ?? node.Tag;
}

function arraysEqual(a: string[] | null, b: string[] | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export function computeDiff(
  current: TagHierarchyRawNode[],
  original: TagHierarchyRawNode[],
): { added: TagHierarchyRawNode[]; removed: TagHierarchyRawNode[]; modified: NodeDiff[] } {
  const originalMap = new Map(original.map((n) => [n.Tag, n]));
  const currentMap = new Map(current.map((n) => [n.Tag, n]));

  const added = current.filter((n) => !originalMap.has(n.Tag));
  const removed = original.filter((n) => !currentMap.has(n.Tag));

  const modified: NodeDiff[] = [];
  for (const node of current) {
    const orig = originalMap.get(node.Tag);
    if (!orig) continue;

    const changes: string[] = [];
    if (node.StatusTag !== orig.StatusTag) {
      changes.push(`Status: ${orig.StatusTag} → ${node.StatusTag}`);
    }

    const origName = getNodeName(orig);
    const curName = getNodeName(node);
    if (curName !== origName) changes.push(`Name: "${origName}" → "${curName}"`);

    const origDesc = orig.Details?.find((d) => d.LanguageCode === 'en')?.Description ?? '';
    const curDesc = node.Details?.find((d) => d.LanguageCode === 'en')?.Description ?? '';
    if (curDesc !== origDesc) changes.push('Description changed');

    if (!arraysEqual(node.GroupTags, orig.GroupTags)) {
      changes.push(`Groups: [${(orig.GroupTags ?? []).join(', ')}] → [${(node.GroupTags ?? []).join(', ')}]`);
    }

    if (node.ParentTag !== orig.ParentTag) {
      changes.push(`Parent: ${orig.ParentTag ?? 'none'} → ${node.ParentTag ?? 'none'}`);
    }

    if (changes.length > 0) {
      modified.push({ tag: node.Tag, name: curName, changes });
    }
  }

  return { added, removed, modified };
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
          <Button variant="ghost" onClick={onClose} disabled={syncing}>{demoMode ? 'Close' : 'Cancel'}</Button>
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
