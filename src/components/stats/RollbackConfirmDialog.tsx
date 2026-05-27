import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';

interface RollbackConfirmDialogProps {
  open: boolean;
  /** Raw `row.bank` value (BankSwiftCode as stored on the library). Becomes part of the required phrase. */
  bankCode: string;
  /** Raw `row.side` value (CR / DR / RC / RD). Becomes the suffix of the required phrase. */
  side: string;
  /** Disables the primary button and shows a spinner during the API call. */
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Typed-phrase confirmation for the irreversible Rollback action.
 *
 * The primary button stays disabled until the user types the exact
 * case-sensitive `<BankSwiftCode>-<Side>` of the library being rolled back
 * (e.g. `INMASARIRYM-RC`). This makes accidental rollback structurally
 * impossible: mis-targeting a different library is caught because the phrase
 * encodes the library identity.
 *
 * The dialog does NOT auto-dismiss on confirm — the parent's `onConfirm`
 * handler controls lifecycle (so it can keep the dialog open with a spinner
 * during the async API call and close it from its own `finally` block).
 */
export function RollbackConfirmDialog({
  open,
  bankCode,
  side,
  loading,
  onClose,
  onConfirm,
}: RollbackConfirmDialogProps) {
  const requiredPhrase = useMemo(() => `${bankCode}-${side}`, [bankCode, side]);
  const [typed, setTyped] = useState('');

  // Reset on every fresh open so a cancelled attempt doesn't leave a
  // half-typed phrase behind on the next show.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const phraseMatches = typed === requiredPhrase;
  const phraseError = typed.length > 0 && !phraseMatches;
  const canSubmit = phraseMatches && !loading;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      onConfirm();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm Rollback: IRREVERSIBLE"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={!canSubmit}
            loading={loading}
          >
            Rollback
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-body-secondary leading-relaxed">
          Rolling back will discard <span className="font-semibold text-red-600 dark:text-rose-300">ALL progress</span>{' '}
          in this draft and restore the library to the latest{' '}
          <span className="font-semibold">RELEASED (production)</span> version. This is permanent and will
          overwrite any in-progress changes. A backup snapshot will be created for audit, but recovery
          requires manual restore by admins.
        </p>

        <div className="space-y-2 rounded-md border border-red-200 dark:border-red-800/60 bg-red-50/60 dark:bg-red-900/10 p-3">
          <p className="text-sm text-body">
            To confirm, type the exact confirmation phrase (case-sensitive):{' '}
            <code className="font-mono text-primary-dark bg-primary/10 px-1.5 py-0.5 rounded select-all">
              {requiredPhrase}
            </code>
          </p>
          <Input
            label="Confirmation phrase (case-sensitive)"
            className="font-mono"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`e.g. ${requiredPhrase}`}
            error={phraseError}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {phraseError && (
            <p className="text-xs text-red-500 dark:text-rose-300 pl-1">
              Confirmation phrase does not match. Rollback disabled.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
