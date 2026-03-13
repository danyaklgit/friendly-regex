import { useMemo } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { ChangeSummary, DefinitionChange } from '../../hooks/useLocalChanges';

interface UndoChangesDialogProps {
  open: boolean;
  bank: string;
  side: string;
  changeSummary: ChangeSummary | null;
  onClose: () => void;
  onConfirm: () => void;
}

const TYPE_LABELS: Record<DefinitionChange['type'], { label: string; color: string; icon: string }> = {
  added: { label: 'Added', color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800', icon: '+' },
  removed: { label: 'Removed', color: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800', icon: '\u2212' },
  modified: { label: 'Modified', color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800', icon: '\u270E' },
};

function ChangeItem({ change }: { change: DefinitionChange }) {
  const { label, color, icon } = TYPE_LABELS[change.type];

  return (
    <div className={`rounded-lg border px-3 py-2 ${color}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold w-4 text-center">{icon}</span>
        <span className="font-medium text-sm">{change.tag}</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</span>
      </div>
      {change.details.length > 0 && (
        <ul className="mt-1.5 ml-6 space-y-0.5">
          {change.details.map((detail, i) => (
            <li key={i} className="text-xs opacity-80">{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UndoChangesDialog({ open, bank, side, changeSummary, onClose, onConfirm }: UndoChangesDialogProps) {
  const sortedChanges = useMemo(() => {
    if (!changeSummary) return [];
    const order: Record<DefinitionChange['type'], number> = { removed: 0, modified: 1, added: 2 };
    return [...changeSummary.changes].sort((a, b) => order[a.type] - order[b.type]);
  }, [changeSummary]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Undo Changes"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger_ghost"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Undo Changes
          </Button>
        </>
      }
    >
      <p className="text-sm text-body-secondary mb-3">
        Are you sure you want to undo all changes for <span className="font-semibold text-heading">{bank}</span> / <span className="font-semibold text-heading">{side}</span>?
      </p>

      {sortedChanges.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            {sortedChanges.length} change{sortedChanges.length !== 1 ? 's' : ''} will be reverted
          </p>
          {sortedChanges.map((change, i) => (
            <ChangeItem key={`${change.tag}-${change.type}-${i}`} change={change} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted italic">No detailed changes available.</p>
      )}
    </Modal>
  );
}
