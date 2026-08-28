import { useState, useMemo } from 'react';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { Button } from '../shared/Button';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { parseAttributeImport } from '../../utils/importAttributeJson';
import type { BackendAttribute } from '../../types/lov';

interface AttributeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: { Id?: number; Value: string; PossibleLOVTag?: string | null; Details: { LanguageCode: string; Name: string; ShortDescription: string }[] }) => Promise<void>;
  /** Optional callback the modal invokes when the operator clicks Create
   *  with a duplicate Name (English or Arabic) or a colliding Value.
   *  The parent owns the app's toast surface; this hook routes the
   *  error through the same Toast pattern used for the
   *  success / save-failed cases instead of disabling the Create
   *  button (which reads as a dead end during authoring) or surfacing
   *  inline copy that crowds the modal body. */
  onValidationError?: (message: string) => void;
  existing?: BackendAttribute;
}

function toPascalCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export function AttributeFormModal({ open, onClose, onSave, onValidationError, existing }: AttributeFormModalProps) {
  const isEdit = !!existing;
  const { lovOptions, backendAttributes } = useLovAttributes();

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
  const [possibleLovTag, setPossibleLovTag] = useState(() => existing?.PossibleLOVTag ?? '');
  const [saving, setSaving] = useState(false);

  // Paste-JSON import: fills the form fields from a pasted attribute payload.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  const handleJsonLoad = () => {
    const result = parseAttributeImport(importText);
    if (!result.ok) {
      setImportErrors(result.errors);
      setImportWarnings([]);
      return;
    }
    const f = result.fields;
    setNameEn(f.nameEn);
    setShortDescEn(f.shortDescEn);
    setNameAr(f.nameAr);
    setShortDescAr(f.shortDescAr);
    const warnings = [...result.warnings];
    if (f.possibleLovTag) {
      if (lovOptions.some((o) => o.value === f.possibleLovTag)) {
        setPossibleLovTag(f.possibleLovTag);
      } else {
        setPossibleLovTag('');
        warnings.push(`Suggested LOV "${f.possibleLovTag}" is not a known LOV — left as None.`);
      }
    } else {
      setPossibleLovTag('');
    }
    setImportErrors([]);
    setImportWarnings(warnings);
    setImportOpen(false);
    setImportText('');
  };

  const computedValue = useMemo(() => {
    if (isEdit) return existing!.Value;
    return toPascalCase(nameEn);
  }, [isEdit, existing, nameEn]);

  // Detect a duplicate `Value` against the existing attribute list. The backend
  // enforces uniqueness on Value, so flagging client-side avoids a silent
  // "create" round-trip that swallows the SFM-only failure. Edit mode allows
  // the current row's own Value through.
  const duplicateAttribute = useMemo(() => {
    if (!computedValue) return null;
    const needle = computedValue.toLowerCase();
    return backendAttributes.find(
      (a) =>
        a.Value?.toLowerCase() === needle &&
        (!isEdit || a.Id !== existing!.Id),
    ) ?? null;
  }, [computedValue, backendAttributes, isEdit, existing]);

  // Duplicate detection by Name, per locale. Mirrors the same case-
  // insensitive trimmed compare the ExtractionFormModal uses so the two
  // settings screens behave consistently. Edit mode excludes the
  // current row so re-saving an unchanged Name doesn't flag itself.
  const findDuplicateByName = (lang: 'en' | 'ar', name: string) => {
    const needle = name.trim().toLowerCase();
    if (!needle) return null;
    return backendAttributes.find((a) => {
      if (isEdit && a.Id === existing!.Id) return false;
      const detail = a.Details.find((d) => d.LanguageCode === lang);
      return detail?.Name.trim().toLowerCase() === needle;
    }) ?? null;
  };
  const duplicateNameEn = useMemo(
    () => findDuplicateByName('en', nameEn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nameEn, backendAttributes, isEdit, existing],
  );
  const duplicateNameAr = useMemo(
    () => findDuplicateByName('ar', nameAr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nameAr, backendAttributes, isEdit, existing],
  );

  // Required-field gating stays as a disable-button condition because
  // missing required fields are trivially obvious from the form state.
  // Duplicate Name / Value go through the click-time toast instead so
  // a partially-typed name doesn't permanently dead-end the Create
  // button mid-authoring.
  const canSave =
    nameEn.trim().length > 0 &&
    shortDescEn.trim().length > 0 &&
    nameAr.trim().length > 0 &&
    shortDescAr.trim().length > 0 &&
    computedValue.length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    // Click-time validation for duplicate Name / Value. The offending
    // input(s) keep their red error state so the operator can see WHICH
    // field needs attention; the toast says WHY. Routed through
    // onValidationError so the modal stays unaware of the parent's
    // toast wiring.
    if (duplicateNameEn || duplicateNameAr || duplicateAttribute) {
      const messages: string[] = [];
      if (duplicateNameEn) messages.push('An attribute with this English Name already exists.');
      if (duplicateNameAr) messages.push('An attribute with this Arabic Name already exists.');
      // The Value collision is only worth surfacing when the English
      // name itself wasn't already flagged — the auto-generated Value
      // derives from the English name, so a name duplicate already
      // implies a Value duplicate and the operator only needs one
      // message.
      if (duplicateAttribute && !duplicateNameEn) {
        messages.push(`An attribute named "${duplicateAttribute.Value}" already exists.`);
      }
      messages.push('Pick a different name to continue.');
      onValidationError?.(messages.join(' '));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...(isEdit ? { Id: existing!.Id } : {}),
        Value: computedValue,
        PossibleLOVTag: possibleLovTag || null,
        Details: [
          { LanguageCode: 'en', Name: nameEn.trim(), ShortDescription: shortDescEn.trim() },
          { LanguageCode: 'ar', Name: nameAr.trim(), ShortDescription: shortDescAr.trim() },
        ],
      });
      onClose();
    } catch {
      // Error handled by caller
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Attribute' : 'Create New Attribute'}
      headerAction={
        <Button variant="secondary" size="xs" onClick={() => { setImportOpen((v) => !v); setImportErrors([]); }}>
          {importOpen ? 'Hide JSON' : 'Import JSON'}
        </Button>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving} data-tour="attribute-form-cancel">Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving} data-tour="attribute-form-submit">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-tour="attribute-form">
        {importOpen && (
          <div className="rounded-lg border border-border bg-surface-secondary p-3 space-y-2">
            <p className="text-xs text-body-secondary">
              Paste an attribute JSON payload to fill the fields below (Value is still auto-derived from the English name).
            </p>
            <textarea
              value={importText}
              onChange={(e) => { setImportText(e.target.value); if (importErrors.length) setImportErrors([]); }}
              placeholder={'{\n  "nameEn": "Terminal ID",\n  "shortDescEn": "POS terminal identifier",\n  "nameAr": "…",\n  "shortDescAr": "…",\n  "possibleLovTag": ""\n}'}
              rows={7}
              spellCheck={false}
              className="w-full rounded-md border border-input-border bg-input-bg px-3 py-2 font-mono text-xs text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="xs" onClick={() => { setImportOpen(false); setImportErrors([]); }}>Cancel</Button>
              <Button variant="primary" size="xs" onClick={handleJsonLoad} disabled={importText.trim().length === 0}>Load</Button>
            </div>
            {importErrors.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5 text-xs text-red-600 dark:text-rose-300">
                {importErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
        {importWarnings.length > 0 && (
          <ul className="list-disc pl-4 space-y-0.5 text-xs text-amber-600 dark:text-amber-300">
            {importWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-4">
          {/* Auto-derived Value tile picks up the red treatment whenever
              any duplicate is detected so the operator gets a visible
              cue without an inline banner crowding the modal. The toast
              fires on click and carries the actual explanation. */}
          <div className={`min-w-0 rounded-lg p-3 border ${(duplicateAttribute || duplicateNameEn || duplicateNameAr) ? 'bg-red-50 dark:bg-rose-900/20 border-red-400 dark:border-rose-400' : 'bg-surface-secondary border-border'}`}>
            <p className="text-xs font-semibold text-muted mb-2">Value (Auto Generated)</p>
            <p className="text-sm font-mono text-heading break-all">{computedValue || '—'}</p>
          </div>
          <Select
            label="Suggested LOV"
            value={possibleLovTag}
            onChange={(e) => setPossibleLovTag(e.target.value)}
            options={[{ value: '', label: 'None' }, ...lovOptions]}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">English</p>
            <Input data-tour="attribute-form-name-en" label="Name" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Bank Name" required maxLength={100} error={!!duplicateNameEn || !!duplicateAttribute} />
            <Input data-tour="attribute-form-desc-en" label="Short Description" value={shortDescEn} onChange={(e) => setShortDescEn(e.target.value)} placeholder="Brief description" required />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">Arabic</p>
            <Input data-tour="attribute-form-name-ar" label="Name" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="e.g. اسم البنك" dir="rtl" required maxLength={100} error={!!duplicateNameAr} />
            <Input data-tour="attribute-form-desc-ar" label="Short Description" value={shortDescAr} onChange={(e) => setShortDescAr(e.target.value)} placeholder="وصف مختصر" dir="rtl" required />
          </div>
        </div>
      </div>
    </Modal>
  );
}
