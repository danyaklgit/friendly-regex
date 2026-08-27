import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import type { AttributeDetail } from '../../types/lov';
import { normalizeLovListTag } from '../../api/lovManagement';

interface NewLovListModalProps {
  open: boolean;
  onClose: () => void;
  /** Tags already in the catalog — client-side duplicate check. */
  existingTags: string[];
  onCreate: (payload: { Tag: string; Details: AttributeDetail[] }) => Promise<void>;
}

/**
 * Create a new, empty LOV list the operator can immediately use as an
 * attribute LOV. The tag is normalized to UPPER_SNAKE exactly like the
 * backend does, shown live so what the operator sees is what gets stored.
 */
export function NewLovListModal({ open, onClose, existingTags, onCreate }: NewLovListModalProps) {
  const [tagRaw, setTagRaw] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [descEn, setDescEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [descAr, setDescAr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTagRaw('');
    setNameEn('');
    setDescEn('');
    setNameAr('');
    setDescAr('');
    setError(null);
    setSaving(false);
  }, [open]);

  const tag = useMemo(() => normalizeLovListTag(tagRaw), [tagRaw]);
  const duplicate = tag.length > 0 && existingTags.some((t) => t.toUpperCase() === tag);
  const canSave = tag.length > 0 && nameEn.trim().length > 0 && !duplicate && !saving;

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const details: AttributeDetail[] = [{ LanguageCode: 'en', Name: nameEn.trim(), ShortDescription: descEn.trim() }];
    if (nameAr.trim() || descAr.trim()) {
      details.push({ LanguageCode: 'ar', Name: nameAr.trim() || nameEn.trim(), ShortDescription: descAr.trim() });
    }
    try {
      await onCreate({ Tag: tag, Details: details });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New list"
      widthClass="max-w-xl"
      zClass="z-[70]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} disabled={!canSave} loading={saving}>Create list</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Input
            label="Tag *"
            value={tagRaw}
            onChange={(e) => setTagRaw(e.target.value)}
            placeholder="e.g. my billers"
            error={duplicate}
            autoFocus
          />
          <p className="text-[11px] text-muted">
            Stored as <span className="font-mono text-body">{tag || '—'}</span> (upper-case, underscores). This becomes the attribute LOV tag.
          </p>
          {duplicate && <p className="text-xs text-red-600 dark:text-rose-400">A list with this tag already exists.</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-body-secondary">English</div>
            <Input label="Name *" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Display name" />
            <Input label="Description" value={descEn} onChange={(e) => setDescEn(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-body-secondary">Arabic (optional)</div>
            <Input label="Name" dir="auto" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="Arabic name" />
            <Input label="Description" dir="auto" value={descAr} onChange={(e) => setDescAr(e.target.value)} placeholder="Arabic description" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-rose-400">{error}</p>}
      </div>
    </Modal>
  );
}
