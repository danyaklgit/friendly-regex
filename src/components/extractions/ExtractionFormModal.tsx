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
  /** Optional callback the modal invokes when the operator clicks Create
   *  with a duplicate Name (English or Arabic). The parent owns the
   *  app's toast surface; this hook lets us route the error through
   *  the same Toast pattern used for the success / save-failed cases
   *  instead of inline copy that crowds the modal body. */
  onValidationError?: (message: string) => void;
  existing?: BackendExtraction;
}

export function ExtractionFormModal({ open, onClose, onSave, onValidationError, existing }: ExtractionFormModalProps) {
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

  // Duplicate detection by Name, per locale. Two extractions sharing a
  // visible Name would collide in the dropdown — operators couldn't
  // tell them apart by label and the extraction picker shows the Name,
  // not the regex. Case-insensitive trimmed compare so "Saudi IBAN" and
  // "  saudi iban  " count as the same name. Edit mode excludes the
  // current row from the search so re-saving an unchanged Name doesn't
  // flag itself as a duplicate.
  const findDuplicateByName = (lang: 'en' | 'ar', name: string) => {
    const needle = name.trim().toLowerCase();
    if (!needle) return null;
    return backendExtractions.find((e) => {
      if (isEdit && e.Id === existing!.Id) return false;
      const detail = e.Details.find((d) => d.LanguageCode === lang);
      return detail?.Name.trim().toLowerCase() === needle;
    }) ?? null;
  };
  const duplicateNameEn = useMemo(
    () => findDuplicateByName('en', nameEn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nameEn, backendExtractions, isEdit, existing],
  );
  const duplicateNameAr = useMemo(
    () => findDuplicateByName('ar', nameAr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nameAr, backendExtractions, isEdit, existing],
  );

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

  // Required-field gating + regex validity + duplicate-regex stay as
  // disable-button conditions because they're either trivially obvious
  // (missing required field) or already accompanied by inline guidance
  // (regex parse error / duplicate regex banner). Duplicate-NAME is
  // routed through a click-time toast instead — the operator might
  // genuinely want to keep typing and a permanently-disabled Create
  // button on a partially-filled name field reads as a dead end.
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
    // Duplicate-name gate fires at click time and surfaces through
    // the parent's Toast surface (set via `onValidationError`). The
    // inputs still carry their red error state so the operator can
    // see which field needs attention; the toast says WHY.
    if (duplicateNameEn || duplicateNameAr) {
      const messages: string[] = [];
      if (duplicateNameEn) messages.push('An extraction with this English Name already exists.');
      if (duplicateNameAr) messages.push('An extraction with this Arabic Name already exists.');
      messages.push('Pick a different name to continue.');
      onValidationError?.(messages.join(' '));
      return;
    }
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
              error={!!duplicateNameEn}
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
              error={!!duplicateNameAr}
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
