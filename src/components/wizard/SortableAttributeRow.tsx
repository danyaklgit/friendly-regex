import { type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableAttributeRowProps {
  id: string;
  isFirst: boolean;
  isLast: boolean;
  readOnly?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: ReactNode;
}

/** Wraps an AttributeEditor with a left-rail of reorder controls: a drag
 *  handle for pointer/keyboard sorting (via @dnd-kit) plus explicit up/down
 *  arrow buttons. Mirrors the TransformationItem pattern; kept as a wrapper
 *  (rather than threaded into AttributeEditor) so the existing 1k-line editor
 *  card is untouched. */
export function SortableAttributeRow({
  id,
  isFirst,
  isLast,
  readOnly,
  onMoveUp,
  onMoveDown,
  children,
}: SortableAttributeRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !!readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1.5">
      {/* Reorder rail: grip on top, arrows below. Kept narrow so it doesn't
       *  visually compete with the editor card to its right. */}
      <div className="flex flex-col items-center shrink-0 pt-2 gap-0.5">
        <button
          type="button"
          className={`p-0.5 rounded transition-colors ${
            readOnly
              ? 'text-faint/30 cursor-not-allowed'
              : 'cursor-grab active:cursor-grabbing text-faint hover:text-body'
          }`}
          {...(readOnly ? {} : { ...attributes, ...listeners })}
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <GripIcon />
        </button>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst || readOnly}
          className={`p-0.5 rounded transition-colors ${
            isFirst || readOnly
              ? 'invisible'
              : 'text-faint hover:text-body cursor-pointer'
          }`}
          title="Move up"
          aria-label="Move up"
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast || readOnly}
          className={`p-0.5 rounded transition-colors ${
            isLast || readOnly
              ? 'invisible'
              : 'text-faint hover:text-body cursor-pointer'
          }`}
          title="Move down"
          aria-label="Move down"
        >
          <ChevronDownIcon />
        </button>
      </div>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <circle cx="4" cy="2" r="1" />
      <circle cx="8" cy="2" r="1" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="8" cy="6" r="1" />
      <circle cx="4" cy="10" r="1" />
      <circle cx="8" cy="10" r="1" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,8 6,4 10,8" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 6,8 10,4" />
    </svg>
  );
}
