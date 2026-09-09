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
import { TEP_BAG_SEPARATOR, isTepBagText, parseTepBag } from '../../utils/tepBag';

interface TransformationListProps {
  transformations: TransformationFormValue[];
  methods: TransformationMethodDef[];
  sampleValue?: string;
  onChange: (transformations: TransformationFormValue[]) => void;
  readOnly?: boolean;
  /**
   * Which side of the extraction pipeline this list represents. Drives the
   * header label ("Pre-extraction Transformations" vs the existing
   * "Post-extraction Transformations") and the preview's first row
   * ("Raw" vs "Extracted"). The default is `'post'` so every existing
   * caller continues to render the same string it does today.
   */
  variant?: 'pre' | 'post';
  /** Global "Character view" toggle — forwarded to the preview so its
   *  logical-order character breakdown only shows when the toggle is on. */
  characterView?: boolean;
}

export function TransformationList({
  transformations,
  methods,
  sampleValue,
  onChange,
  readOnly,
  variant = 'post',
  characterView = false,
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
      const idx = transformations.findIndex((t) => t.id === id);
      let next = transformations.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      );
      // `[_TEP_]` bag pipeline wiring: when the operator picks a field key on
      // a Split & Pick step (delimiter = the bag separator), prefill the NEXT
      // step's Replace Find with `key:` — the seeded pipeline strips the key
      // prefix from the picked pair before Trim. Only fires while that Find
      // is untouched (blank, or a previously-inserted `key:`), so a
      // hand-edited Find is never clobbered.
      if (idx !== -1 && isTepBagText(sampleValue)) {
        const updated = next[idx];
        if (
          updated.method === 'split_and_pick' &&
          (updated.args.delimiter ?? '').trim() === TEP_BAG_SEPARATOR &&
          updated.args.index !== transformations[idx].args.index
        ) {
          const entries = parseTepBag(sampleValue);
          const picked = entries.find((e) => String(e.index) === updated.args.index);
          const follower = next[idx + 1];
          if (picked?.key && follower?.method === 'replace') {
            const find = follower.args.find ?? '';
            const untouched =
              find.trim() === '' || entries.some((e) => e.key != null && find === `${e.key}:`);
            if (untouched) {
              next = next.map((t, i) =>
                i === idx + 1 ? { ...t, args: { ...t.args, find: `${picked.key}:` } } : t,
              );
            }
          }
        }
      }
      onChange(next);
    },
    [transformations, onChange, sampleValue],
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

  // Visually distinguish the two pipeline blocks. The extraction step
  // sits between them in the editor, so a tinted left rail (amber for
  // pre, sky for post) plus a faint matching surface color gives the
  // operator a quick read on which side of the extraction they're
  // editing without forcing them to read the section header.
  const variantClass = variant === 'pre'
    ? 'border-l-2 border-amber-400/60 bg-amber-50/40 dark:bg-amber-900/10'
    : 'border-l-2 border-sky-400/60 bg-sky-50/40 dark:bg-sky-900/10';

  return (
    <div className={`space-y-2 rounded-md px-3 py-2 ${variantClass}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary uppercase tracking-wide">
          {variant === 'pre' ? 'Pre-extraction Transformations' : 'Post-extraction Transformations'}
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
                  sampleValue={sampleValue}
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
        variant={variant}
        characterView={characterView}
      />
    </div>
  );
}
