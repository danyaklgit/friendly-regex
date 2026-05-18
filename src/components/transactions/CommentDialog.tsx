import { useEffect, useMemo, useState } from 'react';
import type { TransactionRow } from '../../types';
import { Modal } from '../shared/Modal';
import { buildPayload, getRowId, splitRows, type CommentPayloadEntry } from './commentDialog.helpers';

export type CommentDialogResult =
  | { skipped: true }
  | { skipped: false; entries: CommentPayloadEntry[] };

interface CommentDialogProps {
  open: boolean;
  mode: 'comment-only' | 'flag-with-comment';
  flagAction?: 'flag' | 'unflag';
  selectedRows: TransactionRow[];
  onClose: () => void;
  onConfirm: (result: CommentDialogResult) => Promise<void>;
}

function formatAmount(value: unknown): string {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: unknown): string {
  if (value == null || value === '') return '';
  const s = String(value);
  // Date-only ISO (YYYY-MM-DD) or full ISO datetime — show the date part only.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

export function CommentDialog({
  open,
  mode,
  flagAction,
  selectedRows,
  onClose,
  onConfirm,
}: CommentDialogProps) {
  const split = useMemo(() => splitRows(selectedRows), [selectedRows]);
  const { rowsWithoutComment, rowsWithComment, hasBulkStep, totalSteps } = split;

  const [stepIndex, setStepIndex] = useState(0);
  const [bulkComment, setBulkComment] = useState('');
  const [perRowComments, setPerRowComments] = useState<Map<string, string>>(new Map());
  const [currentOverrideDraft, setCurrentOverrideDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset internal state every time the dialog opens or the selection changes.
  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setBulkComment('');
      setPerRowComments(new Map());
      setCurrentOverrideDraft('');
      setSubmitting(false);
      setError(null);
    }
  }, [open, selectedRows]);

  if (!open) return null;

  const isBulkStep = hasBulkStep && stepIndex === 0;
  const overrideIndex = hasBulkStep ? stepIndex - 1 : stepIndex;
  const currentOverrideRow = !isBulkStep ? rowsWithComment[overrideIndex] : undefined;
  const isLastStep = stepIndex === totalSteps - 1 || totalSteps === 0;

  const title = (() => {
    if (mode === 'flag-with-comment') {
      return flagAction === 'unflag' ? 'Unflag as Dead End' : 'Flag as Dead End';
    }
    return 'Add Comment';
  })();

  const persistCurrentDraft = (next: Map<string, string>): Map<string, string> => {
    if (!currentOverrideRow) return next;
    const id = getRowId(currentOverrideRow);
    if (!id) return next;
    const trimmed = currentOverrideDraft.trim();
    if (trimmed) next.set(id, currentOverrideDraft);
    else next.delete(id);
    return next;
  };

  const goToStep = (target: number) => {
    if (target < 0 || target >= totalSteps) return;
    // Save the current override draft when navigating away.
    const next = new Map(perRowComments);
    persistCurrentDraft(next);
    setPerRowComments(next);
    setStepIndex(target);
    const nextRow = hasBulkStep
      ? rowsWithComment[target - 1]
      : rowsWithComment[target];
    setCurrentOverrideDraft(nextRow ? (next.get(getRowId(nextRow)) ?? '') : '');
  };

  const handleNext = () => goToStep(stepIndex + 1);
  const handleBack = () => goToStep(stepIndex - 1);

  const handleKeep = () => {
    // Drop any draft for this row and advance.
    if (currentOverrideRow) {
      const id = getRowId(currentOverrideRow);
      const next = new Map(perRowComments);
      next.delete(id);
      setPerRowComments(next);
    }
    setCurrentOverrideDraft('');
    if (stepIndex + 1 < totalSteps) {
      const nextRow = hasBulkStep
        ? rowsWithComment[stepIndex]
        : rowsWithComment[stepIndex + 1];
      setStepIndex(stepIndex + 1);
      setCurrentOverrideDraft(nextRow ? (perRowComments.get(getRowId(nextRow)) ?? '') : '');
    } else {
      // Keep on the last step → finalize.
      void handleConfirm({ keepCurrent: true });
    }
  };

  const handleSkip = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ skipped: true });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to flag transactions');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (opts?: { keepCurrent?: boolean }) => {
    if (submitting) return;
    // Persist the current override draft into the map before building the payload,
    // unless the user explicitly chose Keep on this step.
    const finalPerRow = new Map(perRowComments);
    if (!opts?.keepCurrent) persistCurrentDraft(finalPerRow);

    const entries = buildPayload({
      rowsWithoutComment,
      bulkComment,
      perRowComments: finalPerRow,
    });

    if (mode === 'comment-only' && entries.length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ skipped: false, entries });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  // Live preview of how many entries the payload would contain — drives the
  // disabled state of the Confirm button in comment-only mode.
  const pendingEntriesCount = (() => {
    const preview = new Map(perRowComments);
    persistCurrentDraft(preview);
    return buildPayload({ rowsWithoutComment, bulkComment, perRowComments: preview }).length;
  })();

  const confirmDisabled =
    submitting || (mode === 'comment-only' && pendingEntriesCount === 0);

  const footer = (
    <>
      <button
        onClick={onClose}
        disabled={submitting}
        className="px-3 py-1.5 text-sm rounded border border-border bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      {isBulkStep && mode === 'flag-with-comment' && (
        <button
          onClick={handleSkip}
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded border border-border-strong bg-surface text-body-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {submitting ? 'Working...' : 'Skip comment'}
        </button>
      )}
      {!isBulkStep && stepIndex > 0 && (
        <button
          onClick={handleBack}
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded border border-border bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          Back
        </button>
      )}
      {!isBulkStep && currentOverrideRow && (
        <button
          onClick={handleKeep}
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded border border-border bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          Keep existing
        </button>
      )}
      {!isLastStep ? (
        <button
          onClick={handleNext}
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          Next
        </button>
      ) : (
        <button
          onClick={() => handleConfirm()}
          disabled={confirmDisabled}
          className="px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving...' : 'Confirm'}
        </button>
      )}
    </>
  );

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title={title} footer={footer}>
      <div className="space-y-4">
        {totalSteps > 1 && (
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <span className="font-medium text-body-secondary whitespace-nowrap">Step {stepIndex + 1} of {totalSteps}</span>
            <div className="w-24 h-0.5 bg-surface-tertiary rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        {mode === 'flag-with-comment' && (
          <div className="text-xs text-body-secondary bg-primary/5 border border-primary/20 rounded px-3 py-2">
            {flagAction === 'unflag'
              ? `Unflagging ${selectedRows.length} transaction(s) as dead end. You can optionally attach a comment to each.`
              : `Flagging ${selectedRows.length} transaction(s) as dead end. You can optionally attach a comment to each.`}
          </div>
        )}

        {isBulkStep ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-heading block">
              {`Add a comment to ${rowsWithoutComment.length} transaction${rowsWithoutComment.length === 1 ? '' : 's'} without an existing comment`}
            </label>
            <p className="text-xs text-muted">
              {rowsWithComment.length > 0
                ? `${rowsWithComment.length} other selected transaction${rowsWithComment.length === 1 ? '' : 's'} already ${rowsWithComment.length === 1 ? 'has' : 'have'} a comment — you'll be asked about each on the next steps.`
                : 'Leave empty to skip setting a comment.'}
            </p>
            <textarea
              value={bulkComment}
              onChange={(e) => setBulkComment(e.target.value)}
              rows={4}
              className="w-full text-sm rounded border border-border bg-surface text-body px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Type comment..."
              autoFocus
            />
          </div>
        ) : currentOverrideRow ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-heading">
              {`Row ${overrideIndex + 1} of ${rowsWithComment.length} already has a comment`}
            </div>
            <div className="rounded border border-border bg-surface-secondary px-3 py-2 text-xs space-y-1">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <span className="text-muted">Statement Date</span>
                <span className="text-body">{formatDate(currentOverrideRow['StatementDate'])}</span>
                <span className="text-muted">Amount</span>
                <span className="text-body">{formatAmount(currentOverrideRow['Amount'])}</span>
                <span className="text-muted">Description</span>
                <span className="text-body truncate" title={String(currentOverrideRow['Description1'] ?? '')}>
                  {String(currentOverrideRow['Description1'] ?? '') || <span className="text-muted">—</span>}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Existing comment</div>
              <blockquote className="border-l-2 border-border-strong pl-3 text-sm text-body-secondary italic">
                {String(currentOverrideRow['Comment'] ?? '')}
              </blockquote>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-heading block">New comment (leave empty + click Keep existing to preserve)</label>
              <textarea
                value={currentOverrideDraft}
                onChange={(e) => setCurrentOverrideDraft(e.target.value)}
                rows={4}
                className="w-full text-sm rounded border border-border bg-surface text-body px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Type replacement comment..."
                autoFocus
              />
            </div>
          </div>
        ) : (
          // Defensive: no rows at all (shouldn't normally happen because dialog
          // wouldn't open without a selection).
          <div className="text-sm text-muted">No transactions selected.</div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
