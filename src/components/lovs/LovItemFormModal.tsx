import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import type { AttributeDetail, LOVListItem } from '../../types/lov';
import { TRANSFORMATION_METHODS } from '../../constants/transformations';
import { TRANSFORMATIONS_LIST_TAG } from '../../constants/lov';

export interface LovItemFormPayload {
  Id?: number;
  Value: string;
  /** undefined = "default to the value" (create) / an array replaces (edit). */
  Tags?: string[];
  Details: AttributeDetail[];
}

interface LovItemFormModalProps {
  open: boolean;
  onClose: () => void;
  listTag: string;
  listName: string;
  /** null = create mode. */
  item: LOVListItem | null;
  /** Loaded items of the list — drives the client-side duplicate check. */
  existingItems: LOVListItem[];
  onSave: (payload: LovItemFormPayload) => Promise<void>;
}

/** Split a comma / semicolon / newline separated tag string into clean tags. */
function parseTagsInput(text: string): string[] {
  return text.split(/[,;\n]/).map((t) => t.trim()).filter((t) => t.length > 0);
}

/**
 * Add / edit one LOV item. Value + lookup Tags + per-language Name and
 * Description (English required, Arabic optional). For the Post-extraction
 * Transformations list the Value is a picker over the engine-known methods
 * (the backend rejects anything else). Duplicate Values are rejected
 * client-side against the loaded items so the operator gets a friendly
 * message instead of a generic SFM_INVALID_INPUT_PARAMETERS.
 */
export function LovItemFormModal({ open, onClose, listTag, listName, item, existingItems, onSave }: LovItemFormModalProps) {
  const isTransformations = listTag === TRANSFORMATIONS_LIST_TAG;
  const [value, setValue] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [descEn, setDescEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [descAr, setDescAr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Re)seed from the target item on every open. EVERY language is prefilled
  // from `item.Details`: the central update replaces an item's details
  // wholesale, so an edit that sent English only used to DELETE the stored
  // Arabic row ("Arabic never saves"). Name/Description are the fallback for
  // payloads without Details (pre-delta GetListsByTags).
  useEffect(() => {
    if (!open) return;
    const en = item?.Details?.find((d) => d.LanguageCode === 'en');
    const ar = item?.Details?.find((d) => d.LanguageCode === 'ar');
    setValue(item?.Value ?? '');
    setTagsText((item?.Tags ?? []).join(', '));
    setNameEn(en?.Name ?? item?.Name ?? '');
    setDescEn(en?.ShortDescription ?? item?.Description ?? '');
    setNameAr(ar?.Name ?? '');
    setDescAr(ar?.ShortDescription ?? '');
    setError(null);
    setSaving(false);
  }, [open, item]);

  const trimmedValue = value.trim();
  const duplicate = useMemo(() => {
    const needle = trimmedValue.toLowerCase();
    if (!needle) return false;
    return existingItems.some((it) => {
      if (it.Value.trim().toLowerCase() !== needle) return false;
      // Editing an item keeps its own value legal.
      if (item && (it.Id != null && item.Id != null ? it.Id === item.Id : it.Value === item.Value)) return false;
      return true;
    });
  }, [existingItems, trimmedValue, item]);

  const tags = useMemo(() => parseTagsInput(tagsText), [tagsText]);
  const canSave = trimmedValue.length > 0 && nameEn.trim().length > 0 && !duplicate && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const details: AttributeDetail[] = [
      { LanguageCode: 'en', Name: nameEn.trim(), ShortDescription: descEn.trim() },
    ];
    if (nameAr.trim() || descAr.trim()) {
      details.push({ LanguageCode: 'ar', Name: nameAr.trim() || nameEn.trim(), ShortDescription: descAr.trim() });
    }
    try {
      await onSave({
        ...(item?.Id != null ? { Id: item.Id } : {}),
        Value: trimmedValue,
        // Create with empty tags → omit so the backend defaults them to the
        // value. Edit with an emptied field → replace with [value] so the
        // operator's intent (drop the extras) still lands.
        ...(tags.length > 0 ? { Tags: tags } : item ? { Tags: [trimmedValue] } : {}),
        Details: details,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const methodOptions = useMemo(
    () => TRANSFORMATION_METHODS.map((m) => ({ value: m.key, label: `${m.label} (${m.key})` })),
    [],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Edit item — ${listName}` : `Add item — ${listName}`}
      widthClass="max-w-2xl"
      zClass="z-[70]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave} loading={saving}>
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {isTransformations ? (
          <div className="flex flex-col gap-1">
            <Select
              label="Value (engine method) *"
              value={value}
              onChange={(e) => {
                const key = e.target.value;
                setValue(key);
                // Prefill the display fields from the transformation catalog
                // (same conventions the existing items follow: label as the
                // English name, args + example as the description, uppercase
                // method as the lookup tag). Only fills what is still empty
                // so an operator's own text is never overwritten.
                const method = TRANSFORMATION_METHODS.find((m) => m.key === key);
                if (method) {
                  setNameEn((prev) => (prev.trim() ? prev : method.label));
                  setDescEn((prev) => {
                    if (prev.trim()) return prev;
                    if (method.description) return method.description;
                    const argsLine = method.args.length > 0
                      ? `Args: ${method.args.map((a) => `${a.key}${a.required ? ' (required)' : ''}`).join(', ')}.`
                      : 'No args.';
                    return argsLine;
                  });
                  setTagsText((prev) => (prev.trim() ? prev : key.toUpperCase()));
                }
              }}
              options={methodOptions}
              placeholder="Pick a transformation method…"
              error={duplicate}
            />
            <p className="text-[11px] text-muted">
              Only methods the tagging engine implements are accepted. Adding a brand-new method still requires engine code; this list curates what the wizard offers.
            </p>
          </div>
        ) : (
          <Input
            label="Value *"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 001"
            error={duplicate}
            autoFocus
          />
        )}
        {duplicate && (
          <p className="text-xs text-red-600 dark:text-rose-400 -mt-3">An item with this value already exists in this list.</p>
        )}

        <div className="flex flex-col gap-1">
          <Input
            label="Lookup tags"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="Comma-separated. Defaults to the value."
          />
          <p className="text-[11px] text-muted">
            The tagging engine resolves an attribute&apos;s LOV value by item tag, so these are the values an extraction must produce. Leave empty to default to the value.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-body-secondary">English</div>
            <Input label="Name *" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Display name" />
            <Input label="Description" value={descEn} onChange={(e) => setDescEn(e.target.value)} placeholder="Optional short description" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-body-secondary">
              Arabic (optional)
              {item && <span className="ml-1.5 normal-case tracking-normal font-normal text-muted">— clear both fields to remove the Arabic texts</span>}
            </div>
            <Input label="Name" dir="auto" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="Arabic name" />
            <Input label="Description" dir="auto" value={descAr} onChange={(e) => setDescAr(e.target.value)} placeholder="Arabic description" />
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-rose-400">{error}</p>}
      </div>
    </Modal>
  );
}
