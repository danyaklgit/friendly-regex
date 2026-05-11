import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { TagBadge } from '../transactions/TagBadge';
import { diffDefinition } from '../../hooks/useLocalChanges';
import type { TagSpecLibrary, TagSpecDefinition } from '../../types';

interface ComparisonModalProps {
  open: boolean;
  onClose: () => void;
  activeLib: TagSpecLibrary;
  inProgressLib: TagSpecLibrary;
  /** When provided, each Added / Modified / Removed row becomes clickable and
   *  jumps the user to the Transactions view filtered to the matching rule. */
  onTagClick?: (def: TagSpecDefinition) => void;
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

function LoadingOverlay() {
  // Rendered into document.body so it sits above the modal layer (which has
  // z-50 by default) and intercepts every pointer event — the user cannot
  // click anything on the modal while the redirect is in flight.
  return createPortal(
    <div
      className="fixed inset-0 z-60 bg-black/40 dark:bg-black/60 flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Opening transactions"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 px-5 py-3 rounded-lg bg-surface-elevated shadow-2xl border border-border">
        <svg
          className="w-5 h-5 animate-spin shrink-0 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-body font-medium">Opening transactions…</span>
      </div>
    </div>,
    document.body,
  );
}

export function ComparisonModal({ open, onClose, activeLib, inProgressLib, onTagClick }: ComparisonModalProps) {
  const diff = useMemo(
    () => computeDiff(activeLib.TagSpecDefinitions, inProgressLib.TagSpecDefinitions),
    [activeLib, inProgressLib],
  );

  // The clicked row's definition Id, used to show an inline spinner while the
  // parent finishes the redirect to the Transactions view. Cleared on unmount
  // when the modal closes after the redirect.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const isPending = pendingId !== null;

  const handleTagClick = (def: TagSpecDefinition) => {
    if (!onTagClick || isPending) return;
    setPendingId(def.Id);
    // Delay long enough that the spinner gets at least half a rotation before
    // the modal unmounts and the Transactions view takes over.
    setTimeout(() => onTagClick(def), 500);
  };

  const rowInteractive = (def: TagSpecDefinition) => {
    if (!onTagClick) return { className: '' };
    const thisPending = pendingId === def.Id;
    return {
      role: 'button' as const,
      tabIndex: isPending ? -1 : 0,
      'aria-busy': thisPending || undefined,
      'aria-disabled': isPending && !thisPending ? true : undefined,
      onClick: () => handleTagClick(def),
      onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => {
        if (isPending) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTagClick(def);
        }
      },
      title: thisPending ? 'Opening transactions…' : 'Open this rule’s transactions',
      className: `rounded px-1 -mx-1 transition-colors ${
        thisPending
          ? 'bg-primary/10'
          : isPending
            ? 'opacity-50 pointer-events-none'
            : 'cursor-pointer hover:bg-surface-hover'
      }`,
    };
  };

  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;

  return (
    <>
    {isPending && <LoadingOverlay />}
    <Modal
      open={open}
      onClose={onClose}
      title="Compare: Active vs In Progress"
      footer={<Button data-tour="comparison-modal-close" variant="secondary" onClick={onClose}>Close</Button>}
    >
      {!hasChanges ? (
        <p className="text-sm text-body-secondary py-4">No differences found between the active and in-progress versions.</p>
      ) : (
        <div className="space-y-5">
          {diff.added.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-emerald-300 mb-2">
                Added ({diff.added.length})
              </h3>
              <ul className="space-y-1">
                {diff.added.map(d => {
                  const interactive = rowInteractive(d);
                  return (
                    <li
                      key={d.Id}
                      {...interactive}
                      className={`flex items-center gap-2 text-sm text-body ${interactive.className}`}
                    >
                      <span className="text-green-600 dark:text-emerald-300 font-medium">+</span>
                      <TagBadge tag={d.Tag} />
                      <span className="text-body-secondary">— {d.StatusTag}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {diff.modified.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-yellow-700 dark:text-amber-300 mb-2">
                Modified ({diff.modified.length})
              </h3>
              <ul className="space-y-2">
                {diff.modified.map(({ active, inProgress }) => {
                  const details = diffDefinition(active, inProgress);
                  const interactive = rowInteractive(inProgress);
                  return (
                    <li key={active.Id} {...interactive} className={`text-sm ${interactive.className}`}>
                      <div className="flex items-center gap-2 text-body">
                        <span className="text-yellow-600 dark:text-amber-300 font-medium">~</span>
                        <TagBadge tag={inProgress.Tag} />
                      </div>
                      {details.length > 0 && (
                        <ul className="ml-5 text-xs text-body-secondary space-y-0.5 mt-0.5">
                          {details.map((detail, i) => (
                            <li key={i}>{detail}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {diff.removed.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-rose-300 mb-2">
                Removed ({diff.removed.length})
              </h3>
              <ul className="space-y-1">
                {diff.removed.map(d => {
                  const interactive = rowInteractive(d);
                  return (
                    <li
                      key={d.Id}
                      {...interactive}
                      className={`flex items-center gap-2 text-sm text-body ${interactive.className}`}
                    >
                      <span className="text-red-600 dark:text-rose-300 font-medium">-</span>
                      <TagBadge tag={d.Tag} />
                      <span className="text-body-secondary">— {d.StatusTag}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {diff.unchanged > 0 && (
            <p className="text-xs text-faint">{diff.unchanged} definition{diff.unchanged !== 1 ? 's' : ''} unchanged.</p>
          )}
        </div>
      )}
    </Modal>
    </>
  );
}
