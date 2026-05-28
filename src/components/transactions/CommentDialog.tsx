import { useEffect, useMemo, useState } from 'react';
import type { TransactionRow } from '../../types';
import { Modal } from '../shared/Modal';
import {
  buildApplyAllPayload,
  buildReviewPayload,
  distinctComments,
  getRowComment,
  getRowId,
  splitRows,
  type CommentPayloadEntry,
} from './commentDialog.helpers';

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
  const { rowsWithoutComment, rowsWithComment } = useMemo(() => splitRows(selectedRows), [selectedRows]);
  const distinct = useMemo(() => distinctComments(rowsWithComment), [rowsWithComment]);
  const hasExisting = rowsWithComment.length > 0;

  // When flagging/unflagging, some of the selected rows are already in the
  // target state — those will be no-ops on the backend. Surface the
  // effective count (rows that will actually change) so the operator's
  // mental model matches what happens, instead of being told "Flagging 50"
  // when 10 are already flagged. `IsDeadEnd` is the boolean mirror added on
  // ingest from `OpsIsDeadEnd` (see TransactionDataContext).
  const flagCounts = useMemo(() => {
    if (!flagAction) return null;
    let willChange = 0;
    let noOp = 0;
    for (const row of selectedRows) {
      const isCurrentlyDead = row['IsDeadEnd'] === true;
      const targetDead = flagAction === 'flag';
      if (isCurrentlyDead === targetDead) noOp++;
      else willChange++;
    }
    return { willChange, noOp };
  }, [selectedRows, flagAction]);

  const [path, setPath] = useState<'choose' | 'review'>('choose');
  const [bulkComment, setBulkComment] = useState('');
  const [perRow, setPerRow] = useState<Map<string, string | null>>(new Map());
  const [reviewIndex, setReviewIndex] = useState(0);
  const [currentDraft, setCurrentDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPath('choose');
      setBulkComment('');
      setPerRow(new Map());
      setReviewIndex(0);
      setCurrentDraft(selectedRows.length === 1 ? getRowComment(selectedRows[0]) : '');
      setSubmitting(false);
      setError(null);
    }
  }, [open, selectedRows]);

  if (!open) return null;

  // Single-selection shortcut: skip the choose/review machinery entirely and
  // show one prefilled editor with a single "Apply and finish" action.
  const isSingle = selectedRows.length === 1;
  const singleRow = isSingle ? selectedRows[0] : undefined;
  const singleExisting = singleRow ? getRowComment(singleRow) : '';

  const title = mode === 'flag-with-comment'
    ? (flagAction === 'unflag' ? 'Unflag as Dead End' : 'Flag as Dead End')
    : (isSingle && singleExisting ? 'Edit Comment' : 'Add Comment');

  const currentRow: TransactionRow | undefined = path === 'review' ? rowsWithComment[reviewIndex] : undefined;
  const isLastReview = reviewIndex >= rowsWithComment.length - 1;

  // The draft a row should show: a recorded decision wins (null → cleared/empty,
  // string → edited), otherwise the row's existing comment is prefilled.
  const draftForRow = (map: Map<string, string | null>, row: TransactionRow): string => {
    const id = getRowId(row);
    if (map.has(id)) {
      const v = map.get(id);
      return v === null ? '' : v ?? '';
    }
    return getRowComment(row);
  };

  // Persist a row's draft into the decision map: unchanged → keep (delete),
  // emptied → clear (null), edited → replace (string).
  const recordDraft = (map: Map<string, string | null>, row: TransactionRow, draft: string): void => {
    const id = getRowId(row);
    if (!id) return;
    const existing = getRowComment(row);
    if (draft.trim() === existing.trim()) map.delete(id);
    else if (draft.trim() === '') map.set(id, null);
    else map.set(id, draft);
  };

  const submit = async (entries: CommentPayloadEntry[]) => {
    if (submitting) return;
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

  const handleApplyAll = () => submit(buildApplyAllPayload(selectedRows, bulkComment));

  const handleApplyBulkOnly = () =>
    submit(buildReviewPayload({ rowsWithoutComment, bulkComment, perRow: new Map() }));

  // Single row: record the draft against its existing comment (unchanged → keep,
  // emptied → clear, edited → replace) and submit the resulting payload.
  const handleApplySingle = () => {
    if (!singleRow) return;
    const map = new Map<string, string | null>();
    recordDraft(map, singleRow, currentDraft);
    void submit(buildReviewPayload({ rowsWithoutComment: [], bulkComment: '', perRow: map }));
  };

  const startReview = () => {
    setPath('review');
    setReviewIndex(0);
    setCurrentDraft(rowsWithComment[0] ? draftForRow(perRow, rowsWithComment[0]) : '');
  };

  // Advance through the review rows, persisting `draft` for the current row.
  // `draft === ''` on a row whose existing comment is non-empty records a clear.
  const advanceReview = (draft: string) => {
    if (!currentRow) return;
    const next = new Map(perRow);
    recordDraft(next, currentRow, draft);
    setPerRow(next);
    if (isLastReview) {
      void submit(buildReviewPayload({ rowsWithoutComment, bulkComment, perRow: next }));
      return;
    }
    const nextRow = rowsWithComment[reviewIndex + 1];
    setReviewIndex(reviewIndex + 1);
    setCurrentDraft(nextRow ? draftForRow(next, nextRow) : '');
  };

  const handleBack = () => {
    if (reviewIndex === 0) {
      // Step back out to the choice screen, keeping recorded decisions.
      const next = new Map(perRow);
      if (currentRow) recordDraft(next, currentRow, currentDraft);
      setPerRow(next);
      setPath('choose');
      return;
    }
    const next = new Map(perRow);
    if (currentRow) recordDraft(next, currentRow, currentDraft);
    setPerRow(next);
    const prevRow = rowsWithComment[reviewIndex - 1];
    setReviewIndex(reviewIndex - 1);
    setCurrentDraft(prevRow ? draftForRow(next, prevRow) : '');
  };

  // When the dialog is in flag-with-comment mode, the action buttons make
  // the flag/unflag explicit so operators see exactly what's about to
  // happen — "Skip Comment and Flag" reads differently from "Skip Comment
  // and Unflag", and confusing the two is a hard-to-undo mistake at scale.
  const skipLabel = flagAction === 'unflag'
    ? 'Skip Comment and Unflag'
    : flagAction === 'flag'
      ? 'Skip Comment and Flag'
      : 'Skip comment';

  const applyAllDisabled = submitting || bulkComment.trim() === '';
  const applyBulkOnlyDisabled = submitting || (mode === 'comment-only' && bulkComment.trim() === '');
  // Nothing to apply when the comment is untouched (comment-only). Flag mode
  // always has an effect, so its action stays enabled.
  const singleApplyDisabled = submitting || (mode === 'comment-only' && currentDraft.trim() === singleExisting.trim());

  const footer = isSingle ? (
    <>
      <button
        onClick={onClose}
        disabled={submitting}
        className="px-3 py-1.5 text-sm rounded border border-border bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      {mode === 'flag-with-comment' && (
        <button
          onClick={handleSkip}
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded border border-border-strong bg-surface text-body-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {submitting ? 'Working...' : skipLabel}
        </button>
      )}
      <button
        onClick={handleApplySingle}
        disabled={singleApplyDisabled}
        className="px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Saving...' : 'Apply and finish'}
      </button>
    </>
  ) : path === 'choose' ? (
    <>
      <button
        onClick={onClose}
        disabled={submitting}
        className="px-3 py-1.5 text-sm rounded border border-border bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      {mode === 'flag-with-comment' && (
        <button
          onClick={handleSkip}
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded border border-border-strong bg-surface text-body-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {submitting ? 'Working...' : skipLabel}
        </button>
      )}
      {hasExisting ? (
        <>
          <button
            onClick={startReview}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded border border-border bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Review each
          </button>
          <button
            onClick={handleApplyAll}
            disabled={applyAllDisabled}
            className="px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : 'Apply Comment to all and finish'}
          </button>
        </>
      ) : (
        <button
          onClick={handleApplyBulkOnly}
          disabled={applyBulkOnlyDisabled}
          className="px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving...' : 'Apply'}
        </button>
      )}
    </>
  ) : (
    <>
      <button
        onClick={handleBack}
        disabled={submitting}
        className="px-3 py-1.5 text-sm rounded border border-border bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        Back
      </button>
      <button
        onClick={() => advanceReview('')}
        disabled={submitting}
        className="px-3 py-1.5 text-sm rounded border border-border bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        Clear comment
      </button>
      <button
        onClick={() => advanceReview(currentDraft)}
        disabled={submitting}
        className="px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {isLastReview ? (submitting ? 'Saving...' : 'Confirm') : 'Next'}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title={title} footer={footer}>
      <div className="space-y-4">
        {mode === 'flag-with-comment' && (
          <div className="text-xs text-body-secondary bg-primary/5 border border-primary/20 rounded px-3 py-2 space-y-1">
            <div>
              {(() => {
                const verb = flagAction === 'unflag' ? 'Unflagging' : 'Flagging';
                const effective = flagCounts?.willChange ?? selectedRows.length;
                const plural = effective === 1 ? '' : 's';
                return `${verb} ${effective} transaction${plural} as dead end. You can optionally attach a comment.`;
              })()}
            </div>
            {flagCounts && flagCounts.noOp > 0 && (
              <div className="text-[11px] text-muted">
                {flagCounts.noOp} of the {selectedRows.length} selected transaction{selectedRows.length === 1 ? '' : 's'} {flagCounts.noOp === 1 ? 'is' : 'are'} already {flagAction === 'unflag' ? 'unflagged' : 'flagged'} and will be skipped.
              </div>
            )}
          </div>
        )}

        {isSingle ? (
          <div className="space-y-1">
            <label htmlFor="singleComment" className="text-sm font-medium text-heading block">
              Comment
            </label>
            {singleExisting && (
              <p className="text-xs text-muted">Edit to replace, or clear the box to remove the comment.</p>
            )}
            <textarea
              id="singleComment"
              value={currentDraft}
              onChange={(e) => setCurrentDraft(e.target.value)}
              rows={4}
              className="w-full text-sm rounded border border-border bg-surface text-body px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Type comment..."
              autoFocus
            />
          </div>
        ) : path === 'choose' ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="bulkComment" className="text-sm font-medium text-heading block">
                {`Add a comment to the ${selectedRows.length} selected transaction${selectedRows.length === 1 ? '' : 's'}`}
              </label>
              <textarea
                id="bulkComment"
                value={bulkComment}
                onChange={(e) => setBulkComment(e.target.value)}
                rows={4}
                className="w-full text-sm rounded border border-border bg-surface text-body px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Type comment..."
                autoFocus
              />
            </div>

            {hasExisting && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted">
                  {`${rowsWithComment.length} selected transaction${rowsWithComment.length === 1 ? ' already has' : 's already have'} a comment. Apply to all to overwrite ${rowsWithComment.length === 1 ? 'it' : 'them'}, or review each one.`}
                </p>
                <div className="rounded border border-border bg-surface-secondary px-3 py-2 max-h-32 overflow-y-auto custom-scrollbar space-y-1.5">
                  {distinct.map((d) => (
                    <div key={d.comment} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 rounded bg-surface-tertiary text-body-secondary px-1.5 py-0.5 font-medium tabular-nums">
                        {d.count}
                      </span>
                      <span className="text-body-secondary break-words whitespace-pre-wrap min-w-0">{d.comment}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : currentRow ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span className="font-medium text-body-secondary whitespace-nowrap">Transaction {reviewIndex + 1} of {rowsWithComment.length}</span>
              <div className="w-24 h-0.5 bg-surface-tertiary rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${((reviewIndex + 1) / rowsWithComment.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="rounded border border-border bg-surface-secondary px-3 py-2 text-xs min-w-0">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                <span className="text-muted">Statement Date</span>
                <span className="text-body">{formatDate(currentRow['StatementDate'])}</span>
                <span className="text-muted">Amount</span>
                <span className="text-body">{formatAmount(currentRow['Amount'])}</span>
                <span className="text-muted">Description</span>
                <span className="text-body truncate min-w-0" title={String(currentRow['Description1'] ?? '')}>
                  {String(currentRow['Description1'] ?? '') || <span className="text-muted">—</span>}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="reviewDraft" className="text-sm font-medium text-heading block">
                Comment
              </label>
              <p className="text-xs text-muted">Edit to replace, leave unchanged to keep, or use Clear comment to remove it.</p>
              <textarea
                id="reviewDraft"
                value={currentDraft}
                onChange={(e) => setCurrentDraft(e.target.value)}
                rows={4}
                className="w-full text-sm rounded border border-border bg-surface text-body px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Type comment..."
                autoFocus
              />
            </div>
          </div>
        ) : (
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
