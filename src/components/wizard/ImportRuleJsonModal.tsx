import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { parseRuleImport } from '../../utils/importRuleJson';
import type { WizardFormState } from '../../types/wizard';

interface ImportRuleJsonModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the parsed form state when the operator confirms the import.
   *  The caller seeds the wizard (`initialFormState`) so the operator reviews
   *  and saves through the normal flow. */
  onImport: (formState: WizardFormState) => void;
}

/**
 * Paste a rule JSON payload to pre-populate the Tag Wizard. The payload mirrors
 * the wizard form model 1:1 (see the Rule JSON schema doc / the external
 * generator skill). We parse + validate here and hand a `WizardFormState` back;
 * nothing is saved until the operator finishes the wizard.
 *
 * Validation errors block the import and are listed inline; warnings (e.g. an
 * unknown transformation method, or a missing transaction type) are surfaced
 * but don't block — the operator can fix them in the wizard.
 */
export function ImportRuleJsonModal({ open, onClose, onImport }: ImportRuleJsonModalProps) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const reset = () => {
    setText('');
    setErrors([]);
    setWarnings([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleImport = () => {
    const result = parseRuleImport(text);
    if (!result.ok) {
      setErrors(result.errors);
      setWarnings([]);
      return;
    }
    // Success — hand the form state up and close. Warnings are non-blocking, so
    // we proceed; the wizard surfaces the same gaps (e.g. missing txn type).
    onImport(result.formState);
    reset();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import rule from JSON"
      widthClass="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={handleImport} disabled={text.trim().length === 0}>
            Import &amp; review
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-body-secondary">
          Paste a rule JSON payload below. It opens the rule builder pre-filled — tag, conditions,
          attributes and transformations — for you to review and save. Nothing is saved until you
          finish the wizard.
        </p>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); if (errors.length) setErrors([]); }}
          placeholder={'{\n  "tag": "POSCharges",\n  "transactionTypeCode": "TRF",\n  "ruleGroups": [ … ],\n  "attributes": [ … ]\n}'}
          rows={14}
          spellCheck={false}
          className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 font-mono text-xs text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
        />

        {errors.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:border-rose-400/40 dark:bg-rose-900/20 p-3">
            <p className="text-xs font-semibold text-red-700 dark:text-rose-300 mb-1">
              {errors.length} problem{errors.length === 1 ? '' : 's'} — fix and try again:
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-xs text-red-700 dark:text-rose-300">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-400/40 dark:bg-amber-900/20 p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Warnings:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-xs text-amber-700 dark:text-amber-300">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
