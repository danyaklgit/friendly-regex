import { useState, useMemo } from 'react';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { Button } from '../shared/Button';
import { useLovAttributes } from '../../context/LovAttributesContext';
import type { BackendAttribute } from '../../types/lov';

interface AttributeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: { Id?: number; Value: string; PossibleLOVTag?: string | null; Details: { LanguageCode: string; Name: string; ShortDescription: string }[] }) => Promise<void>;
  existing?: BackendAttribute;
}

function toPascalCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export function AttributeFormModal({ open, onClose, onSave, existing }: AttributeFormModalProps) {
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

  const computedValue = useMemo(() => {
    if (isEdit) return existing!.Value;
    return toPascalCase(nameEn);
  }, [isEdit, existing, nameEn]);

  // Detect a duplicate `Value` against the existing attribute list. The backend
  // enforces uniqueness on Value, so blocking client-side avoids a silent
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

  const canSave =
    nameEn.trim().length > 0 &&
    shortDescEn.trim().length > 0 &&
    nameAr.trim().length > 0 &&
    shortDescAr.trim().length > 0 &&
    computedValue.length > 0 &&
    !duplicateAttribute;

  const handleSave = async () => {
    if (!canSave) return;
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
        <div className="grid grid-cols-2 gap-4">
          <div className={`min-w-0 rounded-lg p-3 border ${duplicateAttribute ? 'bg-red-50 dark:bg-rose-900/20 border-red-400 dark:border-rose-400' : 'bg-surface-secondary border-border'}`}>
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
        {duplicateAttribute && (
          <p
            role="alert"
            className="text-xs text-red-600 dark:text-rose-300 inline-flex items-start gap-1.5 -mt-2"
          >
            <span aria-hidden="true" className="font-bold leading-none">!</span>
            <span>
              An attribute named <span className="font-mono font-semibold">{duplicateAttribute.Value}</span> already exists. Pick a different name to continue.
            </span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">English</p>
            <Input label="Name" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Bank Name" required maxLength={100} error={!!duplicateAttribute} />
            <Input label="Short Description" value={shortDescEn} onChange={(e) => setShortDescEn(e.target.value)} placeholder="Brief description" required />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">Arabic</p>
            <Input label="Name" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="e.g. اسم البنك" dir="rtl" required maxLength={100} />
            <Input label="Short Description" value={shortDescAr} onChange={(e) => setShortDescAr(e.target.value)} placeholder="وصف مختصر" dir="rtl" required />
          </div>
        </div>
      </div>
    </Modal>
  );
}
