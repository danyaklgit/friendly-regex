import { useState, useMemo, useEffect, useRef } from 'react';
import type { TagHierarchyRawNode } from '../../api/tagsHierarchy';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { Button } from '../shared/Button';
import { GroupPillSelector, type GroupPillOption } from '../shared/GroupPillSelector';
import { getNodeName } from '../../utils/tagHierarchyNode';
import { parseTagImport } from '../../utils/importTagJson';

interface TagEditModalProps {
  open: boolean;
  onClose: () => void;
  /** null = create mode, node = edit mode */
  editingNode: TagHierarchyRawNode | null;
  allNodes: TagHierarchyRawNode[];
  onSave: (node: TagHierarchyRawNode) => void;
}

export function TagEditModal({ open, onClose, editingNode, allNodes, onSave }: TagEditModalProps) {
  const isCreate = !editingNode;

  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Arabic counterparts. The backend stores translations per-language in
  // Details[]; this form previously only round-tripped the `en` entry, so
  // the `ar` entry was silently dropped on save. We now collect both and
  // pass both back so SaveTagsHierarchy persists the full translation.
  const [nameAr, setNameAr] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [level, setLevel] = useState<'G' | 'T'>('T');
  const [parentTag, setParentTag] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const [parentSearch, setParentSearch] = useState('');
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  // Paste-JSON import: fills the form fields from a pasted tag payload.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  // Reset form state when modal opens or editingNode changes
  useEffect(() => {
    if (open) {
      setTag(editingNode?.Tag ?? '');
      setName(editingNode?.Details?.find((d) => d.LanguageCode === 'en')?.Name ?? '');
      setDescription(editingNode?.Details?.find((d) => d.LanguageCode === 'en')?.Description ?? '');
      setNameAr(editingNode?.Details?.find((d) => d.LanguageCode === 'ar')?.Name ?? '');
      setDescriptionAr(editingNode?.Details?.find((d) => d.LanguageCode === 'ar')?.Description ?? '');
      setLevel(editingNode?.Level ?? 'T');
      setParentTag(editingNode?.ParentTag ?? '');
      setSelectedGroups(new Set(editingNode?.GroupTags ?? []));
      setParentSearch('');
      setParentDropdownOpen(false);
    }
  }, [open, editingNode]);

  // Close parent dropdown on outside click
  useEffect(() => {
    if (!parentDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (parentRef.current && !parentRef.current.contains(e.target as Node)) {
        setParentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [parentDropdownOpen]);

  const groupOptions = useMemo<GroupPillOption[]>(
    () =>
      allNodes
        .filter((n) => n.Level === 'G')
        .sort((a, b) => a.Tag.localeCompare(b.Tag))
        .map((g) => ({ tag: g.Tag, name: getNodeName(g) })),
    [allNodes],
  );

  const tagLeaves = useMemo(
    () => allNodes.filter((n) => n.Level === 'T' && n.Tag !== editingNode?.Tag).sort((a, b) => a.Tag.localeCompare(b.Tag)),
    [allNodes, editingNode],
  );

  const filteredParents = useMemo(() => {
    const q = parentSearch.toLowerCase().trim();
    if (!q) return tagLeaves;
    return tagLeaves.filter((n) => {
      const nodeName = n.Details?.find((d) => d.LanguageCode === 'en')?.Name ?? '';
      return n.Tag.toLowerCase().includes(q) || nodeName.toLowerCase().includes(q);
    });
  }, [tagLeaves, parentSearch]);

  // Case-sensitive: tag codes are stored and compared exactly as entered.
  const tagExists = useMemo(
    () => isCreate && allNodes.some((n) => n.Tag === tag.trim()),
    [isCreate, allNodes, tag],
  );

  const canSave = tag.trim().length > 0 && !tagExists;

  const handleSelectParent = (t: string) => {
    setParentTag(t);
    setParentSearch('');
    setParentDropdownOpen(false);
  };

  const handleJsonLoad = () => {
    const result = parseTagImport(importText);
    if (!result.ok) {
      setImportErrors(result.errors);
      setImportWarnings([]);
      return;
    }
    const f = result.fields;
    const warnings = [...result.warnings];
    setTag(f.tag);
    setName(f.nameEn);
    setDescription(f.descriptionEn);
    setNameAr(f.nameAr);
    setDescriptionAr(f.descriptionAr);
    setLevel(f.level);

    // Resolve groups against the known groups (accept a Tag Code or a display name).
    if (f.level === 'T' && f.groups.length > 0) {
      const resolved = new Set<string>();
      const unknown: string[] = [];
      for (const g of f.groups) {
        const match =
          groupOptions.find((o) => o.tag === g) ??
          groupOptions.find((o) => o.tag.toLowerCase() === g.toLowerCase() || o.name.toLowerCase() === g.toLowerCase());
        if (match) resolved.add(match.tag);
        else unknown.push(g);
      }
      setSelectedGroups(resolved);
      if (unknown.length > 0) warnings.push(`Unknown group(s) ignored: ${unknown.join(', ')}.`);
    } else {
      setSelectedGroups(new Set());
    }

    // Parent: set as given; warn if it isn't a known tag.
    if (f.level === 'T' && f.parentTag) {
      setParentTag(f.parentTag);
      if (!tagLeaves.some((l) => l.Tag === f.parentTag)) warnings.push(`Parent tag "${f.parentTag}" is not a known tag.`);
    } else {
      setParentTag('');
    }

    setImportErrors([]);
    setImportWarnings(warnings);
    setImportOpen(false);
    setImportText('');
  };

  const handleSave = () => {
    if (!canSave) return;
    // Build Details with both languages. The `en` entry is always present
    // (it carries the display name across the rest of the app); the `ar`
    // entry is only added when the operator filled in at least the Arabic
    // name, so we don't churn the persisted hierarchy with empty `ar`
    // rows on tags that pre-date this form.
    const details = [
      { Name: name.trim() || tag.trim(), Description: description.trim(), LanguageCode: 'en' },
    ];
    const nameArTrim = nameAr.trim();
    const descArTrim = descriptionAr.trim();
    if (nameArTrim || descArTrim) {
      details.push({ Name: nameArTrim, Description: descArTrim, LanguageCode: 'ar' });
    }
    const node: TagHierarchyRawNode = {
      Tag: isCreate ? tag.trim() : editingNode!.Tag,
      Level: isCreate ? level : editingNode!.Level,
      StatusTag: editingNode?.StatusTag ?? 'ACTIVE',
      Actions: editingNode?.Actions ?? ['Move', 'Archive', 'Delete'],
      Details: details,
      GroupTags: level === 'T' ? (selectedGroups.size > 0 ? Array.from(selectedGroups) : null) : null,
      ParentTag: level === 'T' ? (parentTag || null) : null,
    };
    onSave(node);
    onClose();
  };

  const parentDisplayName = parentTag
    ? (() => {
        const n = tagLeaves.find((l) => l.Tag === parentTag);
        const nm = n?.Details?.find((d) => d.LanguageCode === 'en')?.Name;
        return nm && nm !== parentTag ? `${parentTag} — ${nm}` : parentTag;
      })()
    : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? 'Create New Tag' : `Edit ${editingNode!.Tag}`}
      headerAction={
        <Button variant="secondary" size="xs" onClick={() => { setImportOpen((v) => !v); setImportErrors([]); }}>
          {importOpen ? 'Hide JSON' : 'Import JSON'}
        </Button>
      }
      footer={
        <>
          <Button data-tour="tag-edit-cancel" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button data-tour="tag-edit-create" variant="primary" onClick={handleSave} disabled={!canSave}>
            {isCreate ? 'Create' : 'Save'}
          </Button>
        </>
      }
    >
      <div data-tour="tag-edit-form" className="flex flex-col gap-4">
        {importOpen && (
          <div className="rounded-lg border border-border bg-surface-secondary p-3 flex flex-col gap-2">
            <p className="text-xs text-body-secondary">Paste a tag JSON payload to fill the fields below.</p>
            <textarea
              value={importText}
              onChange={(e) => { setImportText(e.target.value); if (importErrors.length) setImportErrors([]); }}
              placeholder={'{\n  "tag": "TransferOut",\n  "level": "T",\n  "nameEn": "Outbound Transfer",\n  "descriptionEn": "…",\n  "groups": ["OUTBOUND"]\n}'}
              rows={7}
              spellCheck={false}
              className="w-full rounded-md border border-input-border bg-input-bg px-3 py-2 font-mono text-xs text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="xs" onClick={() => { setImportOpen(false); setImportErrors([]); }}>Cancel</Button>
              <Button variant="primary" size="xs" onClick={handleJsonLoad} disabled={importText.trim().length === 0}>Load</Button>
            </div>
            {importErrors.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5 text-xs text-red-500 dark:text-rose-300">
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
        {isCreate && (
          <Select
            label="Type"
            required
            value={level}
            onChange={(e) => setLevel(e.target.value as 'G' | 'T')}
            options={[
              { value: 'T', label: 'Tag (T)' },
              { value: 'G', label: 'Group (G)' },
            ]}
          />
        )}

        <div data-tour="tag-edit-code">
          <Input
            label="Tag Code"
            required
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            disabled={!isCreate}
            placeholder="e.g. PAYMENTCR"
            error={tagExists}
          />
          {tagExists && <p className="text-xs text-red-500 mt-1 pl-1">Tag already exists</p>}
        </div>

        {/* Two-column English / Arabic translations. The backend Details
            array supports any number of languages, but the operator workflow
            today only covers these two — matching the rest of the app
            (ExtractionFormModal, AttributeFormModal). Arabic is optional;
            the row is omitted from the saved Details when both Arabic
            fields are blank so we don't pollute legacy tags with empty
            `ar` entries. */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">English</p>
            <div data-tour="tag-edit-name">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
              />
            </div>
            <div data-tour="tag-edit-description">
              <Input
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
              />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-body-secondary">Arabic</p>
            <div data-tour="tag-edit-name-ar">
              <Input
                label="Name"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="الاسم"
                dir="rtl"
              />
            </div>
            <div data-tour="tag-edit-description-ar">
              <Input
                label="Description"
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                placeholder="الوصف"
                dir="rtl"
              />
            </div>
          </div>
        </div>

        {level === 'T' && (
          <>
            {/* Searchable Parent Tag */}
            <div data-tour="tag-edit-parent" className={`flex flex-col gap-1 ${parentDropdownOpen ? 'mb-48' : ''}`} ref={parentRef}>
              <label className="text-xs font-medium text-body pl-1">Parent Tag</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search parent tags..."
                  value={parentDropdownOpen ? parentSearch : parentDisplayName}
                  onChange={(e) => { setParentSearch(e.target.value); setParentDropdownOpen(true); }}
                  onFocus={() => setParentDropdownOpen(true)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                />
                {parentTag && !parentDropdownOpen && (
                  <button
                    type="button"
                    onClick={() => handleSelectParent('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-hover text-muted hover:text-heading"
                    title="Clear"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {parentDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto custom-scrollbar rounded-lg border border-input-border bg-surface-primary shadow-lg">
                    <button
                      type="button"
                      onClick={() => handleSelectParent('')}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors cursor-pointer ${!parentTag ? 'text-primary font-medium' : 'text-muted'}`}
                    >
                      — None —
                    </button>
                    {filteredParents.length === 0 && (
                      <div className="px-3 py-1.5 text-[10px] text-muted">No matching tags</div>
                    )}
                    {filteredParents.map((n) => {
                      const nm = n.Details?.find((d) => d.LanguageCode === 'en')?.Name;
                      return (
                        <button
                          key={n.Tag}
                          type="button"
                          onClick={() => handleSelectParent(n.Tag)}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors cursor-pointer ${n.Tag === parentTag ? 'bg-primary/10 text-primary font-medium' : 'text-heading'}`}
                        >
                          {n.Tag}
                          {nm && nm !== n.Tag && (
                            <span className="ml-2 text-[10px] text-muted">— {nm}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div data-tour="tag-edit-groups">
              <GroupPillSelector
                label="Groups"
                groups={groupOptions}
                selected={selectedGroups}
                onChange={setSelectedGroups}
                listDataTour="tag-edit-groups-list"
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
