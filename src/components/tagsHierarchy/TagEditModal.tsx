import { useState, useMemo, useEffect, useRef } from 'react';
import type { TagHierarchyRawNode } from '../../api/tagsHierarchy';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { Button } from '../shared/Button';
import { getNodeName } from '../../utils/tagHierarchyNode';

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
  const [level, setLevel] = useState<'G' | 'T'>('T');
  const [parentTag, setParentTag] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const [parentSearch, setParentSearch] = useState('');
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const [groupSearch, setGroupSearch] = useState('');

  // Reset form state when modal opens or editingNode changes
  useEffect(() => {
    if (open) {
      setTag(editingNode?.Tag ?? '');
      setName(editingNode?.Details?.find((d) => d.LanguageCode === 'en')?.Name ?? '');
      setDescription(editingNode?.Details?.find((d) => d.LanguageCode === 'en')?.Description ?? '');
      setLevel(editingNode?.Level ?? 'T');
      setParentTag(editingNode?.ParentTag ?? '');
      setSelectedGroups(new Set(editingNode?.GroupTags ?? []));
      setParentSearch('');
      setParentDropdownOpen(false);
      setGroupSearch('');
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

  const groups = useMemo(
    () => allNodes.filter((n) => n.Level === 'G').sort((a, b) => a.Tag.localeCompare(b.Tag)),
    [allNodes],
  );

  const filteredGroups = useMemo(() => {
    const q = groupSearch.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter((g) => {
      // Always show selected groups so the user can deselect them
      if (selectedGroups.has(g.Tag)) return true;
      return g.Tag.toLowerCase().includes(q) || getNodeName(g).toLowerCase().includes(q);
    });
  }, [groups, groupSearch, selectedGroups]);

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

  const tagExists = useMemo(
    () => isCreate && allNodes.some((n) => n.Tag.toUpperCase() === tag.trim().toUpperCase()),
    [isCreate, allNodes, tag],
  );

  const canSave = tag.trim().length > 0 && !tagExists;

  const toggleGroup = (groupTag: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupTag)) next.delete(groupTag);
      else next.add(groupTag);
      return next;
    });
  };

  const handleSelectParent = (t: string) => {
    setParentTag(t);
    setParentSearch('');
    setParentDropdownOpen(false);
  };

  const handleSave = () => {
    if (!canSave) return;
    const node: TagHierarchyRawNode = {
      Tag: isCreate ? tag.trim() : editingNode!.Tag,
      Level: isCreate ? level : editingNode!.Level,
      StatusTag: editingNode?.StatusTag ?? 'ACTIVE',
      Actions: editingNode?.Actions ?? ['Move', 'Archive', 'Delete'],
      Details: [{ Name: name.trim() || tag.trim(), Description: description.trim(), LanguageCode: 'en' }],
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

            <div data-tour="tag-edit-groups" className="flex flex-col gap-1">
              <label className="text-xs font-medium text-body pl-1">Groups</label>
              <div className="rounded-lg border border-input-border bg-input-bg overflow-hidden">
                {groups.length > 5 && (
                  <div className="relative border-b border-input-border">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search groups..."
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-transparent text-heading placeholder:text-placeholder focus:outline-none"
                    />
                    {groupSearch && (
                      <button
                        type="button"
                        onClick={() => setGroupSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-hover text-muted hover:text-heading"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                <div data-tour="tag-edit-groups-list" className="max-h-60 overflow-y-auto custom-scrollbar p-2 flex flex-wrap gap-1.5">
                  {groups.length === 0 && (
                    <span className="text-xs text-muted">No groups available</span>
                  )}
                  {filteredGroups.length === 0 && groups.length > 0 && (
                    <span className="text-xs text-muted">No groups matching "{groupSearch}"</span>
                  )}
                  {filteredGroups.map((g) => {
                    const checked = selectedGroups.has(g.Tag);
                    const displayName = getNodeName(g);
                    return (
                      <button
                        key={g.Tag}
                        type="button"
                        onClick={() => toggleGroup(g.Tag)}
                        title={displayName !== g.Tag ? g.Tag : undefined}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer
                          ${checked
                            ? 'bg-primary/15 text-primary border border-primary/30'
                            : 'bg-surface-tertiary text-body border border-transparent hover:bg-surface-hover'
                          }`}
                      >
                        {displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
