import { useCallback } from 'react';
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
import type { TransformationFormValue } from '../../types';
import type { TransformationMethodDef } from '../../constants/transformations';
import { TransformationItem } from './TransformationItem';
import { TransformationPreview } from './TransformationPreview';
import { Button } from '../shared/Button';

interface TransformationListProps {
  transformations: TransformationFormValue[];
  methods: TransformationMethodDef[];
  sampleValue?: string;
  onChange: (transformations: TransformationFormValue[]) => void;
  readOnly?: boolean;
}

export function TransformationList({
  transformations,
  methods,
  sampleValue,
  onChange,
  readOnly,
}: TransformationListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = transformations.findIndex((t) => t.id === active.id);
      const newIndex = transformations.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const updated = [...transformations];
      const [removed] = updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, removed);
      onChange(updated);
    },
    [transformations, onChange],
  );

  const handleAdd = useCallback(() => {
    onChange([
      ...transformations,
      { id: crypto.randomUUID(), method: '', args: {} },
    ]);
  }, [transformations, onChange]);

  // Shortcut for the single most common transformation operators tack onto
  // an extraction. Adds a `trim` row already configured (no-arg method,
  // method key set), so the operator doesn't pay the dropdown round-trip
  // for the everyday case. Duplicate trims are allowed — operators may
  // chain Trim → Replace → Trim to normalize before AND after a textual
  // edit; gating against repeats would force a round-trip through the
  // dropdown for a legitimate pattern.
  const handleAddTrim = useCallback(() => {
    onChange([
      ...transformations,
      { id: crypto.randomUUID(), method: 'trim', args: {} },
    ]);
  }, [transformations, onChange]);

  const handleRemove = useCallback(
    (id: string) => {
      onChange(transformations.filter((t) => t.id !== id));
    },
    [transformations, onChange],
  );

  const handleUpdate = useCallback(
    (id: string, updates: Partial<TransformationFormValue>) => {
      onChange(
        transformations.map((t) =>
          t.id === id ? { ...t, ...updates } : t,
        ),
      );
    },
    [transformations, onChange],
  );

  const handleMove = useCallback(
    (fromIndex: number, direction: 'up' | 'down') => {
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= transformations.length) return;
      const updated = [...transformations];
      [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
      onChange(updated);
    },
    [transformations, onChange],
  );

  // Disable adding / reordering when any existing transformation has no method selected
  const hasUnselected = transformations.some((t) => !t.method);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary uppercase tracking-wide">
          Post-extraction Transformations
        </p>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={handleAddTrim}
              disabled={hasUnselected}
              title="Add a Trim transformation"
            >
              + Add Trim
            </Button>
            <Button variant="ghost" size="xs" onClick={handleAdd} disabled={hasUnselected}>
              + Add Transformation
            </Button>
          </div>
        )}
      </div>

      {transformations.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={transformations.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {transformations.map((t, i) => (
                <TransformationItem
                  key={t.id}
                  transformation={t}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === transformations.length - 1}
                  methods={methods}
                  reorderDisabled={hasUnselected || readOnly}
                  readOnly={readOnly}
                  onUpdate={(updates) => handleUpdate(t.id, updates)}
                  onRemove={() => handleRemove(t.id)}
                  onMoveUp={() => handleMove(i, 'up')}
                  onMoveDown={() => handleMove(i, 'down')}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <TransformationPreview
        transformations={transformations.filter((t) => t.method)}
        sampleValue={sampleValue}
      />
    </div>
  );
}
