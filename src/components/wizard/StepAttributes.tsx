import { useCallback, useMemo } from 'react';
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
import type { AttributeFormValue, TransactionRow } from '../../types';
import { AttributeEditor } from './AttributeEditor';
import { SortableAttributeRow } from './SortableAttributeRow';
import { Button } from '../shared/Button';
import { computeDuplicateAttributeIndexes } from '../../utils/attributeFingerprint';

interface StepAttributesProps {
  attributes: AttributeFormValue[];
  onAdd: () => void;
  onRemove: (attrId: string) => void;
  onUpdate: (attrId: string, updates: Partial<AttributeFormValue>) => void;
  onReorder: (attributes: AttributeFormValue[]) => void;
  transactions?: TransactionRow[];
  startCollapsed?: boolean;
  readOnly?: boolean;
  suggestedAttributeNames?: { name: string; count: number }[];
  suggestedTagName?: string;
  /** Forwarded to each AttributeEditor so it can render a comment icon. */
  libraryId?: string;
  definitionId?: string;
}

export function StepAttributes({ attributes, onAdd, onRemove, onUpdate, onReorder, transactions, startCollapsed, readOnly, suggestedAttributeNames, suggestedTagName, libraryId, definitionId }: StepAttributesProps) {
  // For each attribute, the index of the earlier row sharing its (trimmed,
  // case-insensitive) name, or null when it's unique. Only the later
  // duplicate carries the flag so the original stays clean.
  const duplicateOfIndex = useMemo(() => computeDuplicateAttributeIndexes(attributes), [attributes]);

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
            <div className="space-y-1">
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
                    transactions={transactions}
                    startCollapsed={startCollapsed && attr.attributeTag.trim().length > 0}
                    readOnly={readOnly}
                    isDuplicateName={duplicateOfIndex[i] !== null}
                    suggestedAttributeNames={suggestedAttributeNames}
                    suggestedTagName={suggestedTagName}
                    libraryId={libraryId}
                    definitionId={definitionId}
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
