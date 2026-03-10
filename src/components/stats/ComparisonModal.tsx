import { useMemo } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import type { TagSpecLibrary, TagSpecDefinition } from '../../types';

interface ComparisonModalProps {
  open: boolean;
  onClose: () => void;
  activeLib: TagSpecLibrary;
  inProgressLib: TagSpecLibrary;
}

interface DiffResult {
  added: TagSpecDefinition[];
  removed: TagSpecDefinition[];
  modified: { active: TagSpecDefinition; inProgress: TagSpecDefinition }[];
  unchanged: number;
}

function computeDiff(activeDefs: TagSpecDefinition[], inProgressDefs: TagSpecDefinition[]): DiffResult {
  const activeById = new Map(activeDefs.map(d => [d.Id, d]));
  const inProgressById = new Map(inProgressDefs.map(d => [d.Id, d]));

  const added: TagSpecDefinition[] = [];
  const removed: TagSpecDefinition[] = [];
  const modified: { active: TagSpecDefinition; inProgress: TagSpecDefinition }[] = [];

  for (const [id, def] of inProgressById) {
    const activeDef = activeById.get(id);
    if (!activeDef) {
      added.push(def);
    } else if (JSON.stringify(activeDef) !== JSON.stringify(def)) {
      modified.push({ active: activeDef, inProgress: def });
    }
  }

  for (const [id, def] of activeById) {
    if (!inProgressById.has(id)) {
      removed.push(def);
    }
  }

  const unchanged = inProgressDefs.length - added.length - modified.length;

  return { added, removed, modified, unchanged };
}

export function ComparisonModal({ open, onClose, activeLib, inProgressLib }: ComparisonModalProps) {
  const diff = useMemo(
    () => computeDiff(activeLib.TagSpecDefinitions, inProgressLib.TagSpecDefinitions),
    [activeLib, inProgressLib],
  );

  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compare: Active vs In Progress"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      {!hasChanges ? (
        <p className="text-sm text-body-secondary py-4">No differences found between the active and in-progress versions.</p>
      ) : (
        <div className="space-y-5">
          {diff.added.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-2">
                Added ({diff.added.length})
              </h3>
              <ul className="space-y-1">
                {diff.added.map(d => (
                  <li key={d.Id} className="flex items-center gap-2 text-sm text-body">
                    <span className="text-green-600 font-medium">+</span>
                    <span className="font-medium">{d.Tag}</span>
                    <span className="text-body-secondary">— {d.StatusTag}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {diff.modified.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-yellow-700 mb-2">
                Modified ({diff.modified.length})
              </h3>
              <ul className="space-y-2">
                {diff.modified.map(({ active, inProgress }) => (
                  <li key={active.Id} className="text-sm">
                    <div className="flex items-center gap-2 text-body">
                      <span className="text-yellow-600 font-medium">~</span>
                      <span className="font-medium">{inProgress.Tag}</span>
                    </div>
                    <div className="ml-5 text-xs text-body-secondary space-y-0.5 mt-0.5">
                      {active.StatusTag !== inProgress.StatusTag && (
                        <div>Status: <span className="text-red-600">{active.StatusTag}</span> → <span className="text-green-600">{inProgress.StatusTag}</span></div>
                      )}
                      {active.Tag !== inProgress.Tag && (
                        <div>Tag: <span className="text-red-600">{active.Tag}</span> → <span className="text-green-600">{inProgress.Tag}</span></div>
                      )}
                      {active.CertaintyLevelTag !== inProgress.CertaintyLevelTag && (
                        <div>Certainty: <span className="text-red-600">{active.CertaintyLevelTag}</span> → <span className="text-green-600">{inProgress.CertaintyLevelTag}</span></div>
                      )}
                      {JSON.stringify(active.TagRuleExpressions) !== JSON.stringify(inProgress.TagRuleExpressions) && (
                        <div>Rules: <span className="italic">changed</span></div>
                      )}
                      {JSON.stringify(active.Attributes) !== JSON.stringify(inProgress.Attributes) && (
                        <div>Attributes: <span className="italic">changed</span></div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {diff.removed.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-red-700 mb-2">
                Removed ({diff.removed.length})
              </h3>
              <ul className="space-y-1">
                {diff.removed.map(d => (
                  <li key={d.Id} className="flex items-center gap-2 text-sm text-body">
                    <span className="text-red-600 font-medium">-</span>
                    <span className="font-medium">{d.Tag}</span>
                    <span className="text-body-secondary">— {d.StatusTag}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {diff.unchanged > 0 && (
            <p className="text-xs text-faint">{diff.unchanged} definition{diff.unchanged !== 1 ? 's' : ''} unchanged.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
