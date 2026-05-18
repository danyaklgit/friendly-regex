import { useState, useMemo } from 'react';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { useLovAttributes } from '../../context/LovAttributesContext';
import type { BackendExtraction } from '../../types/lov';

interface ExtractionFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    Id?: number;
    Value: string;
    Regex: string;
    Details: { LanguageCode: string; Name: string; ShortDescription: string }[];
  }) => Promise<void>;
  existing?: BackendExtraction;
  // Regex pulled from the EXTRACTIONS LOV item for this existing extraction
  // (the API's Details/Value alone can't supply it). Passed in by the page so
  // the modal stays a pure form.
  existingRegex?: string;
}

function toUpperSnakeCase(str: string): string {
  return str
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function ExtractionFormModal({ open, onClose, onSave, existing, existingRegex }: ExtractionFormModalProps) {
  const isEdit = !!existing;
  const { backendExtractions } = useLovAttributes();

  const [nameEn, setNameEn] = useState(() =>
    existing?.Details.find((d) => d.LanguageCode === 'en')?.Name ?? ''
  );
  const [shortDescEn, setShortDescEn] = useState(() =>
    existing?.Details.find((d) => d.LanguageCode === 'en')?.ShortDescription ?? ''
  );
  const [nameAr, setNameAr] = useState(() =>
    existing?.Details.find((d) => d.LanguageCode === 'ar')?.Name ?? ''
  );
  const [shortDescAr, setShortDescAr] = useState(() =>
    existing?.Details.find((d) => d.LanguageCode === 'ar')?.ShortDescription ?? ''
  );
  const [regex, setRegex] = useState<string>(existingRegex ?? '');
  const [saving, setSaving] = useState(false);

  // Value is the tag identifier (e.g. "KSA_IBAN"). For create it's auto-
  // derived from the English Name in UPPER_SNAKE_CASE so it matches the
  // existing EXTRACTIONS LOV convention. In edit mode it's locked.
  const computedValue = useMemo(() => {
    if (isEdit) return existing!.Value;
    return toUpperSnakeCase(nameEn);
  }, [isEdit, existing, nameEn]);

  // Duplicate detection: case-insensitive Value comparison against existing
  // extractions, excluding the row being edited.
  const duplicateExtraction = useMemo(() => {
    if (!computedValue) return null;
    const needle = computedValue.toLowerCase();
    return backendExtractions.find(
      (e) => e.Value?.toLowerCase() === needle && (!isEdit || e.Id !== existing!.Id),
    ) ?? null;
  }, [computedValue, backendExtractions, isEdit, existing]);

  // Validate that the regex actually parses. An invalid regex saved to the
  // EXTRACTIONS LOV would break the dropdown for every operator.
  const regexError = useMemo<string | null>(() => {
    if (!regex.trim()) return null;
    try {
      new RegExp(regex);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid regex';
    }
  }, [regex]);

  const canSave =
    nameEn.trim().length > 0 &&
    shortDescEn.trim().length > 0 &&
    nameAr.trim().length > 0 &&
    shortDescAr.trim().length > 0 &&
    computedValue.length > 0 &&
    regex.trim().length > 0 &&
    !regexError &&
    !duplicateExtraction;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        ...(isEdit ? { Id: existing!.Id } : {}),
        Value: computedValue,
        Regex: regex.trim(),
        Details: [
          { LanguageCode: 'en', Name: nameEn.trim(), ShortDescription: shortDescEn.trim() },
          { LanguageCode: 'ar', Name: nameAr.trim(), ShortDescription: shortDescAr.trim() },
        ],
      });
      onClose();
    } catch {
      // surfaced by caller toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Extraction' : 'Create New Extraction'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className={`min-w-0 rounded-lg p-3 border ${duplicateExtraction ? 'bg-red-50 dark:bg-rose-900/20 border-red-400 dark:border-rose-400' : 'bg-surface-secondary border-border'}`}>
          <p className="text-xs font-semibold text-muted mb-2">Value (Auto Generated)</p>
          <p className="text-sm font-mono text-heading break-all">{computedValue || '—'}</p>
        </div>
        {duplicateExtraction && (
          <p
            role="alert"
            className="text-xs text-red-600 dark:text-rose-300 inline-flex items-start gap-1.5 -mt-2"
          >
            <span aria-hidden="true" className="font-bold leading-none">!</span>
            <span>
              An extraction named <span className="font-mono font-semibold">{duplicateExtraction.Value}</span> already exists. Pick a different name to continue.
            </span>
          </p>
        )}

        <Input
          label="Regex"
          value={regex}
          onChange={(e) => setRegex(e.target.value)}
          placeholder="e.g. ^SA\d{2}[A-Z0-9]{18}$"
          required
          error={!!regexError}
        />
        {regexError && (
          <p role="alert" className="text-xs text-red-600 dark:text-rose-300 -mt-2 font-mono">
            {regexError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">English</p>
            <Input
              label="Name"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Saudi IBAN"
              required
              maxLength={100}
              error={!!duplicateExtraction}
            />
            <Input
              label="Short Description"
              value={shortDescEn}
              onChange={(e) => setShortDescEn(e.target.value)}
              placeholder="What this pattern extracts"
              required
            />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">Arabic</p>
            <Input
              label="Name"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="e.g. آيبان السعودي"
              dir="rtl"
              required
              maxLength={100}
            />
            <Input
              label="Short Description"
              value={shortDescAr}
              onChange={(e) => setShortDescAr(e.target.value)}
              placeholder="وصف موجز"
              dir="rtl"
              required
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
