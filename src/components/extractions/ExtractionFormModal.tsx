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
    Details: { LanguageCode: string; Name: string; ShortDescription: string }[];
  }) => Promise<void>;
  existing?: BackendExtraction;
}

export function ExtractionFormModal({ open, onClose, onSave, existing }: ExtractionFormModalProps) {
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
  // `regex` is the extraction's `Value` field — what gets POSTed to the API.
  const [regex, setRegex] = useState<string>(existing?.Value ?? '');
  const [saving, setSaving] = useState(false);

  // Duplicate detection by regex (the Value field): two extractions with the
  // same regex would be functionally redundant and break the dropdown.
  const duplicateExtraction = useMemo(() => {
    const needle = regex.trim();
    if (!needle) return null;
    return backendExtractions.find(
      (e) => e.Value?.trim() === needle && (!isEdit || e.Id !== existing!.Id),
    ) ?? null;
  }, [regex, backendExtractions, isEdit, existing]);

  // Validate that the regex actually parses. An invalid regex would break the
  // dropdown for every operator.
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
    regex.trim().length > 0 &&
    !regexError &&
    !duplicateExtraction;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        ...(isEdit ? { Id: existing!.Id } : {}),
        Value: regex.trim(),
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
          <Button variant="ghost" onClick={onClose} disabled={saving} data-tour="extraction-form-cancel">Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving} data-tour="extraction-form-submit">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-tour="extraction-form">
        <Input
          data-tour="extraction-form-regex"
          label="Regex"
          value={regex}
          onChange={(e) => setRegex(e.target.value)}
          placeholder="e.g. ^SA\d{2}[A-Z0-9]{18}$"
          required
          error={!!regexError || !!duplicateExtraction}
        />
        {regexError && (
          <p role="alert" className="text-xs text-red-600 dark:text-rose-300 -mt-2 font-mono">
            {regexError}
          </p>
        )}
        {duplicateExtraction && (
          <p
            role="alert"
            className="text-xs text-red-600 dark:text-rose-300 -mt-2 inline-flex items-start gap-1.5"
          >
            <span aria-hidden="true" className="font-bold leading-none">!</span>
            <span>
              An extraction with this regex already exists
              {duplicateExtraction.Details.find((d) => d.LanguageCode === 'en')?.Name
                ? <> (<span className="font-semibold">{duplicateExtraction.Details.find((d) => d.LanguageCode === 'en')?.Name}</span>)</>
                : null}
              . Pick a different pattern to continue.
            </span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">English</p>
            <Input
              data-tour="extraction-form-name-en"
              label="Name"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Saudi IBAN"
              required
              maxLength={100}
            />
            <Input
              data-tour="extraction-form-desc-en"
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
