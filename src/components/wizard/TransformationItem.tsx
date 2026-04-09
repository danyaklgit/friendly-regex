import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TransformationFormValue } from '../../types';
import type { TransformationMethodDef } from '../../constants/transformations';
import { TRANSFORMATION_METHOD_MAP, TRANSFORMATION_CATEGORIES } from '../../constants/transformations';
import { SearchableSelect } from '../shared/SearchableSelect';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';

interface TransformationItemProps {
  transformation: TransformationFormValue;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  methods: TransformationMethodDef[];
  /** Methods already selected by sibling items (used to filter out no-arg duplicates) */
  usedNoArgMethods: Set<string>;
  reorderDisabled?: boolean;
  onUpdate: (updates: Partial<TransformationFormValue>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function TransformationItem({
  transformation,
  index,
  isFirst,
  isLast,
  methods,
  usedNoArgMethods,
  reorderDisabled,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: TransformationItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: transformation.id, disabled: !!reorderDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const methodDef = TRANSFORMATION_METHOD_MAP.get(transformation.method);

  // Build grouped options, filtering out no-arg methods already used by siblings
  const methodOptions = buildMethodOptions(methods).filter((opt) => {
    if (opt.value === transformation.method) return true; // always show current selection
    return !usedNoArgMethods.has(opt.value);
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 group"
    >
      {/* Drag handle */}
      <button
        type="button"
        className={`shrink-0 p-0.5 rounded transition-colors ${reorderDisabled ? 'text-faint/30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing text-faint hover:text-body'}`}
        {...(reorderDisabled ? {} : { ...attributes, ...listeners })}
        title="Drag to reorder"
      >
        <GripIcon />
      </button>

      {/* Step number */}
      <span className="shrink-0 w-4 text-right text-xs font-mono text-faint">{index + 1}.</span>

      {/* Method selector */}
      <div className="w-44 shrink-0">
        <SearchableSelect
          placeholder="Select method…"
          value={transformation.method}
          onChange={(val) => {
            const newDef = TRANSFORMATION_METHOD_MAP.get(val);
            const newArgs: Record<string, string> = {};
            if (newDef) {
              for (const arg of newDef.args) {
                newArgs[arg.key] = '';
              }
            }
            onUpdate({ method: val, args: newArgs });
          }}
          options={methodOptions}
        />
      </div>

      {/* Dynamic args */}
      {methodDef && methodDef.args.length > 0 && (
        <div className="flex gap-1.5 flex-1 min-w-0">
          {methodDef.args.map((argDef) => (
            <div key={argDef.key} className="flex-1 min-w-0">
              <Input
                placeholder={argDef.placeholder}
                type={argDef.type}
                value={transformation.args[argDef.key] ?? ''}
                onChange={(e) =>
                  onUpdate({ args: { ...transformation.args, [argDef.key]: e.target.value } })
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* Up/Down arrows + Remove */}
      <div className="flex items-center shrink-0 w-8 justify-center">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst || reorderDisabled}
          className={`p-0.5 rounded transition-colors ${isFirst || reorderDisabled ? 'invisible' : 'text-faint hover:text-body cursor-pointer'}`}
          title="Move up"
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast || reorderDisabled}
          className={`p-0.5 rounded transition-colors ${isLast || reorderDisabled ? 'invisible' : 'text-faint hover:text-body cursor-pointer'}`}
          title="Move down"
        >
          <ChevronDownIcon />
        </button>
      </div>

      <Button
        variant="ghost"
        size="xs"
        onClick={onRemove}
        className="shrink-0 text-red-400 hover:text-red-500"
      >
        Remove Transformation
      </Button>
    </div>
  );
}

function buildMethodOptions(methods: TransformationMethodDef[]) {
  const options: { value: string; label: string; sublabel?: string }[] = [];
  for (const cat of TRANSFORMATION_CATEGORIES) {
    const inCategory = methods.filter((m) => m.category === cat);
    for (const m of inCategory) {
      options.push({ value: m.key, label: m.label, sublabel: cat });
    }
  }
  // Include any methods not in known categories
  const known = new Set(TRANSFORMATION_CATEGORIES as readonly string[]);
  for (const m of methods) {
    if (!known.has(m.category)) {
      options.push({ value: m.key, label: m.label, sublabel: m.category });
    }
  }
  return options;
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
