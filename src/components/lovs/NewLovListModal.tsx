import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import type { AttributeDetail } from '../../types/lov';
import { normalizeLovListTag } from '../../api/lovManagement';
import { parseLovImport, type LovImportItem } from '../../utils/importLovJson';

interface NewLovListModalProps {
  open: boolean;
  onClose: () => void;
  /** Tags already in the catalog — client-side duplicate check. */
  existingTags: string[];
  onCreate: (payload: { Tag: string; Details: AttributeDetail[]; items?: LovImportItem[] }) => Promise<void>;
}

const IMPORT_PLACEHOLDER = [
  '{',
  '  "tag": "MY_BILLERS",',
  '  "nameEn": "My billers",',
  '  "descEn": "",',
  '  "nameAr": "",',
  '  "items": [',
  '    { "value": "001", "tags": ["001"], "nameEn": "Saudi Telecom", "nameAr": "" }',
  '  ]',
  '}',
].join('\n');

/**
 * Create a new, empty LOV list the operator can immediately use as an
 * attribute LOV. The tag is normalized to UPPER_SNAKE exactly like the
 * backend does, shown live so what the operator sees is what gets stored.
 *
 * "Import JSON" (same paste-and-load pattern as the tag / attribute modals)
 * prefills the fields AND can carry the list's items — they are bulk-created
 * right after the list.
 */
export function NewLovListModal({ open, onClose, existingTags, onCreate }: NewLovListModalProps) {
  const [tagRaw, setTagRaw] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [descEn, setDescEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [descAr, setDescAr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [pendingItems, setPendingItems] = useState<LovImportItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setTagRaw('');
    setNameEn('');
    setDescEn('');
    setNameAr('');
    setDescAr('');
    setError(null);
    setSaving(false);
    setImportOpen(false);
    setImportText('');
    setImportErrors([]);
    setImportWarnings([]);
    setPendingItems([]);
  }, [open]);

  const tag = useMemo(() => normalizeLovListTag(tagRaw), [tagRaw]);
  const duplicate = tag.length > 0 && existingTags.some((t) => t.toUpperCase() === tag);
  const canSave = tag.length > 0 && nameEn.trim().length > 0 && !duplicate && !saving;

  const handleJsonLoad = () => {
    const result = parseLovImport(importText);
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    setImportErrors([]);
    setImportWarnings(result.warnings);
    if (result.fields.tag) setTagRaw(result.fields.tag);
    if (result.fields.nameEn) setNameEn(result.fields.nameEn);
    if (result.fields.descEn) setDescEn(result.fields.descEn);
    if (result.fields.nameAr) setNameAr(result.fields.nameAr);
    if (result.fields.descAr) setDescAr(result.fields.descAr);
    setPendingItems(result.fields.items);
    setImportOpen(false);
  };

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const details: AttributeDetail[] = [{ LanguageCode: 'en', Name: nameEn.trim(), ShortDescription: descEn.trim() }];
    if (nameAr.trim() || descAr.trim()) {
      details.push({ LanguageCode: 'ar', Name: nameAr.trim() || nameEn.trim(), ShortDescription: descAr.trim() });
    }
    try {
      await onCreate({ Tag: tag, Details: details, ...(pendingItems.length > 0 ? { items: pendingItems } : {}) });
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
      headerAction={
        <Button variant="secondary" size="xs" onClick={() => { setImportOpen((v) => !v); setImportErrors([]); }}>
          {importOpen ? 'Hide JSON' : 'Import JSON'}
        </Button>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} disabled={!canSave} loading={saving}>
            {pendingItems.length > 0 ? `Create list + ${pendingItems.length} item${pendingItems.length === 1 ? '' : 's'}` : 'Create list'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {importOpen && (
          <div className="rounded-lg border border-border bg-surface-secondary p-3 space-y-2">
            <p className="text-xs text-body-secondary">
              Paste an LOV JSON payload to fill the fields below. An <span className="font-mono">items</span> array is bulk-created together with the list.
            </p>
            <textarea
              value={importText}
              onChange={(e) => { setImportText(e.target.value); if (importErrors.length) setImportErrors([]); }}
              placeholder={IMPORT_PLACEHOLDER}
              rows={8}
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
        {pendingItems.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-xs text-body">
              <span className="font-semibold">{pendingItems.length}</span> item{pendingItems.length === 1 ? '' : 's'} from the import will be created with the list.
            </p>
            <button
              type="button"
              onClick={() => setPendingItems([])}
              className="text-xs text-muted hover:text-body hover:underline shrink-0"
            >
              Discard items
            </button>
          </div>
        )}
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
