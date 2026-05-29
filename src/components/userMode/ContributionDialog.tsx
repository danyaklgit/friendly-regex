import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';

/** The fields the table fills in before opening the dialog; the dialog only
 *  collects `saveType` + optional `reason`. */
export interface ContributionDraft {
  transactionId: string;
  bankReference: string;
  entryDate: string;
  originalTag: string | null;
  originalGroups: string[];
  newTag: string;
  newGroups: string[];
  newTagIsCustom: boolean;
}

interface ContributionDialogProps {
  open: boolean;
  draft: ContributionDraft;
  onClose: () => void;
  onSubmit: (saveType: 'self' | 'review', reason?: string) => void;
}

/**
 * After a user picks (or creates) a new tag, this dialog asks how they want to
 * record the change. Two paths:
 *   - **Save for Myself** → no description, applies locally to this row only.
 *   - **Submit for Review** → reveals a textarea where the user explains the
 *     context. Stays in localStorage either way; there's no backend to receive
 *     the review request yet. The path exists so the UX is in place for when
 *     the backend lands.
 */
export function ContributionDialog({ open, draft, onClose, onSubmit }: ContributionDialogProps) {
  const [mode, setMode] = useState<'choose' | 'review'>('choose');
  const [reason, setReason] = useState('');

  const handleClose = () => {
    setMode('choose');
    setReason('');
    onClose();
  };

  const handleSaveSelf = () => {
    onSubmit('self');
    setMode('choose');
    setReason('');
  };

  const handleSubmitReview = () => {
    if (!reason.trim()) return;
    onSubmit('review', reason.trim());
    setMode('choose');
    setReason('');
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={mode === 'choose' ? 'Save your contribution' : 'Submit for review'}
      footer={
        mode === 'choose' ? (
          <>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button variant="outline" onClick={handleSaveSelf}>Save for myself</Button>
            <Button variant="primary" onClick={() => setMode('review')}>Submit for review</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setMode('choose')}>Back</Button>
            <Button variant="primary" onClick={handleSubmitReview} disabled={!reason.trim()}>
              Submit for review
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <Summary draft={draft} />
        {mode === 'choose' ? (
          <p className="text-sm text-body-secondary">
            Would you like to submit your contribution for our review or keep it for yourself?
          </p>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-body pl-1">
              Reason <span className="text-red-500 dark:text-rose-300">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Kindly provide specific details regarding your submission, including the context and the reasons for submitting it."
              rows={4}
              autoFocus
              className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function Summary({ draft }: { draft: ContributionDraft }) {
  return (
    <div className="rounded-md border border-border bg-surface-secondary p-3 text-xs space-y-1">
      <Row label="Bank Reference" value={draft.bankReference || '—'} mono />
      <Row label="From" value={draft.originalTag ?? '—'} strike />
      <Row label="To" value={draft.newTag + (draft.newTagIsCustom ? ' (Custom)' : '')} />
    </div>
  );
}

function Row({ label, value, strike, mono }: { label: string; value: string; strike?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted shrink-0 w-28">{label}:</span>
      <span className={`${mono ? 'font-mono' : ''} ${strike ? 'line-through text-faint' : 'text-body'}`}>
        {value}
      </span>
    </div>
  );
}
