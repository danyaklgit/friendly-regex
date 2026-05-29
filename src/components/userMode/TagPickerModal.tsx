import { useMemo, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { GroupPillSelector, type GroupPillOption } from '../shared/GroupPillSelector';
import { TagTreePicker } from '../shared/TagTreePicker';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useUserMode } from '../../context/UserModeContext';
import type { TagTreeNode } from '../../api/tagsHierarchy';

interface TagPickerModalProps {
  open: boolean;
  /** The tag currently displayed on the row, used to seed the picker selection. */
  originalTag: string | null;
  onClose: () => void;
  /** Called when the user picks a tag (existing or freshly created). */
  onSelect: (tag: string, isCustom: boolean) => void;
}

/**
 * Tag-picker modal for the user-mode portal. Two paths:
 *   1. Pick an existing tag from the hierarchy via `TagTreePicker`. The
 *      tree includes any custom tags the device's users have created so far
 *      (custom tags are device-wide per the user-confirmed scope). When the
 *      modal opens with a pre-selected tag, the picker auto-expands the
 *      groups that contain it and scrolls the leaf into view.
 *   2. Click "Create new tag" — an inline form takes a name + one or more
 *      groups (rendered as toggleable pills) and synthesizes a leaf into
 *      the picker for future use.
 *
 * Tag selection commits via `onSelect(tag, isCustom)`. The caller (the table)
 * then opens the ContributionDialog to capture save-type + reason.
 */
export function TagPickerModal({ open, originalTag, onClose, onSelect }: TagPickerModalProps) {
  const { tagsHierarchy, tagsHierarchyLoading } = useTagSpecs();
  const { customTags, addCustomTag } = useUserMode();

  const [value, setValue] = useState<string>(originalTag ?? '');
  const [creating, setCreating] = useState(false);

  // Custom-tag form state
  const [newName, setNewName] = useState('');
  const [newGroups, setNewGroups] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);

  // Merge custom tags into the hierarchy tree under their assigned groups so
  // they appear alongside server-managed tags in the picker. We never mutate
  // the original nodes — produce a shallow copy of any group node we touch.
  const mergedTree = useMemo<TagTreeNode[]>(() => {
    if (customTags.length === 0) return tagsHierarchy;
    const byGroup = new Map<string, TagTreeNode>();
    for (const node of tagsHierarchy) byGroup.set(node.tag, { ...node, children: [...node.children] });
    for (const custom of customTags) {
      for (const groupTag of custom.groups) {
        const group = byGroup.get(groupTag);
        if (!group) continue;
        // Skip if the group already contains this tag (server- or device-side).
        if (group.children.some((c) => c.tag === custom.name)) continue;
        group.children = group.children.concat({
          tag: custom.name,
          level: 'T',
          name: custom.name,
          description: 'Custom (this device)',
          statusTag: 'ACTIVE',
          children: [],
        });
      }
    }
    return Array.from(byGroup.values());
  }, [tagsHierarchy, customTags]);

  const customTagNames = useMemo(() => new Set(customTags.map((c) => c.name)), [customTags]);

  const groupOptions = useMemo<GroupPillOption[]>(
    () => tagsHierarchy.map((g) => ({ tag: g.tag, name: g.name || g.tag })),
    [tagsHierarchy],
  );

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      setFormError('Tag name is required.');
      return;
    }
    if (newGroups.size === 0) {
      setFormError('Pick at least one group for this tag.');
      return;
    }
    addCustomTag({ name, groups: Array.from(newGroups), createdAt: new Date().toISOString() });
    // Treat it as if the user just picked this freshly-created tag.
    onSelect(name, true);
    // Reset local state so the next open is clean.
    setNewName('');
    setNewGroups(new Set());
    setCreating(false);
    setFormError(null);
  };

  const handlePick = () => {
    if (!value) return;
    const isCustom = customTagNames.has(value);
    onSelect(value, isCustom);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? 'Create a new tag' : 'Choose a tag'}
      footer={
        creating ? (
          <>
            <Button variant="secondary" onClick={() => { setCreating(false); setFormError(null); }}>
              Back
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={!newName.trim() || newGroups.size === 0}>
              Create &amp; use
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handlePick} disabled={!value || value === originalTag}>
              Use this tag
            </Button>
          </>
        )
      }
    >
      {creating ? (
        <div className="space-y-3">
          <Input
            label="Tag name"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); if (formError) setFormError(null); }}
            placeholder="e.g. RENT_PAYMENT"
            autoFocus
            error={!!formError && !newName.trim()}
          />
          <GroupPillSelector
            label="Groups"
            groups={groupOptions}
            selected={newGroups}
            onChange={(next) => { setNewGroups(next); if (formError) setFormError(null); }}
          />
          {formError && <p className="text-xs text-red-500 dark:text-rose-300">{formError}</p>}
          <p className="text-[11px] text-faint">
            Custom tags are stored on this browser only. Pick one or more groups and the new
            tag will show up under each of them for everyone using this device.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <TagTreePicker
            label="Tags"
            nodes={mergedTree}
            value={value}
            onChange={setValue}
            loading={tagsHierarchyLoading}
            autoRevealSelected
          />
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create a new tag
          </button>
        </div>
      )}
    </Modal>
  );
}
