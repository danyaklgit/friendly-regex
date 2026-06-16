import { useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import type { AttributeFormValue, TagSpecLibrary, TransactionRow } from '../../types';
import { AttributeEditor } from './AttributeEditor';
import { SortableAttributeRow } from './SortableAttributeRow';
import { Button } from '../shared/Button';
import { computeDuplicateAttributeIndexes } from '../../utils/attributeFingerprint';
import { getAttributeConfigSuggestions, type AttributeConfigSuggestion } from '../../utils/attributeConfigSuggestions';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useScrollNewItemIntoView } from '../../hooks/useScrollNewItemIntoView';

interface StepAttributesProps {
  attributes: AttributeFormValue[];
  onAdd: () => void;
  onRemove: (attrId: string) => void;
  onClone: (attrId: string) => void;
  onUpdate: (attrId: string, updates: Partial<AttributeFormValue>) => void;
  onReorder: (attributes: AttributeFormValue[]) => void;
  transactions?: TransactionRow[];
  startCollapsed?: boolean;
  readOnly?: boolean;
  suggestedAttributeNames?: { name: string; count: number }[];
  suggestedTagName?: string;
  /** Forwarded to each AttributeEditor so it can render a comment icon and
   *  scope the backend distinct-values query to this TagSpec definition. */
  libraryId?: string;
  definitionId?: string;
  /** Lifecycle of the parent library; forwarded to AttributeEditor so the
   *  distinct-values modal picks the right column family (ops vs active). */
  tagSpecKind?: 'ops' | 'active';
  /** Forwarded from TransactionsTab so the Create Rule button can disable
   *  while any attribute is still mid-edit. */
  onAttributeEditingChange?: (attributeId: string, editing: boolean) => void;
  /** All known TagSpec libraries. Used to compute same-bank extraction
   *  suggestions per attribute row. When empty / undefined, the Suggestions
   *  button stays hidden. */
  libraries?: TagSpecLibrary[];
  /** Bank SWIFT code the current rule is scoped to (from `activeCheckout` or
   *  the editing definition's parent library). Suggestions are sourced from
   *  this bank only — across CR / DR / RC / RD sides. */
  bankSwiftCode?: string | null;
  /** Global "Character view" toggle, forwarded to each AttributeEditor so the
   *  extraction / transformation previews show the character breakdown only
   *  when it's on. */
  characterView?: boolean;
}

export function StepAttributes({ attributes, onAdd, onRemove, onClone, onUpdate, onReorder, transactions, startCollapsed, readOnly, suggestedAttributeNames, suggestedTagName, libraryId, definitionId, tagSpecKind, onAttributeEditingChange, libraries, bankSwiftCode, characterView = false }: StepAttributesProps) {
  // For each attribute, the index of the earlier row sharing its (trimmed,
  // case-insensitive) name, or null when it's unique. Only the later
  // duplicate carries the flag so the original stays clean.
  const duplicateOfIndex = useMemo(() => computeDuplicateAttributeIndexes(attributes), [attributes]);

  // Scroll a freshly added attribute into view (Add Attribute).
  const listRef = useRef<HTMLDivElement>(null);
  useScrollNewItemIntoView(attributes.length, listRef);

  // Per-attribute-name extraction config suggestions sourced from same-bank
  // sibling definitions. Computed once per (libraries, bank, lov, current
  // def) tuple and shared across every row that picks the same attribute
  // name — recomputing per row would re-walk every library on every render.
  // Suggestions for the current definition are filtered out so the operator
  // never sees themselves suggested back when editing in place.
  const { extractionMethods } = useLovAttributes();
  const suggestionsByName = useMemo<Map<string, AttributeConfigSuggestion[]>>(() => {
    const map = new Map<string, AttributeConfigSuggestion[]>();
    if (!libraries || libraries.length === 0 || !bankSwiftCode) return map;
    const seenNames = new Set<string>();
    for (const attr of attributes) {
      const key = attr.attributeTag.trim().toLowerCase();
      if (!key || seenNames.has(key)) continue;
      seenNames.add(key);
      const suggestions = getAttributeConfigSuggestions(
        libraries,
        bankSwiftCode,
        attr.attributeTag,
        extractionMethods,
        definitionId,
      );
      if (suggestions.length > 0) map.set(key, suggestions);
    }
    return map;
  }, [libraries, bankSwiftCode, attributes, extractionMethods, definitionId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = attributes.findIndex((a) => a.id === active.id);
      const newIndex = attributes.findIndex((a) => a.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const updated = [...attributes];
      const [removed] = updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, removed);
      onReorder(updated);
    },
    [attributes, onReorder],
  );

  const handleMove = useCallback(
    (fromIndex: number, direction: 'up' | 'down') => {
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= attributes.length) return;
      const updated = [...attributes];
      [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
      onReorder(updated);
    },
    [attributes, onReorder],
  );

  return (
    <div data-tour="wizard-attributes">
      <p className="text-xs text-muted mb-2">
        Define attributes to extract from transactions when this tag matches.
        Attributes are optional — you can skip this step.
      </p>

      {attributes.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={attributes.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div ref={listRef} className="space-y-1">
              {attributes.map((attr, i) => (
                <SortableAttributeRow
                  key={attr.id}
                  id={attr.id}
                  isFirst={i === 0}
                  isLast={i === attributes.length - 1}
                  readOnly={readOnly}
                  onMoveUp={() => handleMove(i, 'up')}
                  onMoveDown={() => handleMove(i, 'down')}
                >
                  <AttributeEditor
                    attribute={attr}
                    onUpdate={(updates) => onUpdate(attr.id, updates)}
                    onRemove={() => onRemove(attr.id)}
                    onClone={() => onClone(attr.id)}
                    transactions={transactions}
                    startCollapsed={startCollapsed && attr.attributeTag.trim().length > 0}
                    readOnly={readOnly}
                    isDuplicateName={duplicateOfIndex[i] !== null}
                    suggestedAttributeNames={suggestedAttributeNames}
                    suggestedTagName={suggestedTagName}
                    libraryId={libraryId}
                    definitionId={definitionId}
                    tagSpecKind={tagSpecKind}
                    onEditingChange={onAttributeEditingChange}
                    configSuggestions={suggestionsByName.get(attr.attributeTag.trim().toLowerCase())}
                    characterView={characterView}
                  />
                </SortableAttributeRow>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-4 bg-surface-secondary rounded-lg border border-dashed border-border-strong">
          <p className="text-sm text-muted my-2">No attributes defined yet</p>
        </div>
      )}

      {!readOnly && (
        <Button variant="secondary" size="xs" onClick={onAdd} className="mt-4">
          Add Attribute
        </Button>
      )}
    </div>
  );
}
