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
  const { lovOptions } = useLovAttributes();

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

  const canSave =
    nameEn.trim().length > 0 &&
    shortDescEn.trim().length > 0 &&
    nameAr.trim().length > 0 &&
    shortDescAr.trim().length > 0 &&
    computedValue.length > 0;

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
          <div className="bg-surface-secondary rounded-lg p-3 border border-border">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Value (auto-generated)</p>
            <p className="text-sm font-mono text-heading">{computedValue || '—'}</p>
          </div>
          <Select
            label="Suggested LOV"
            value={possibleLovTag}
            onChange={(e) => setPossibleLovTag(e.target.value)}
            options={lovOptions}
            placeholder="None"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">English</p>
            <Input label="Name" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Bank Name" required />
            <Input label="Short Description" value={shortDescEn} onChange={(e) => setShortDescEn(e.target.value)} placeholder="Brief description" required />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">Arabic</p>
            <Input label="Name" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="e.g. اسم البنك" dir="rtl" required />
            <Input label="Short Description" value={shortDescAr} onChange={(e) => setShortDescAr(e.target.value)} placeholder="وصف مختصر" dir="rtl" required />
          </div>
        </div>
      </div>
    </Modal>
  );
}
