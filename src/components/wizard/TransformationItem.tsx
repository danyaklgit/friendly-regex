import { type ReactNode } from 'react';
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
  reorderDisabled?: boolean;
  readOnly?: boolean;
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
  reorderDisabled,
  readOnly,
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

  // Every transformation method stays available in every slot — operators
  // can legitimately chain duplicates (Trim → Replace → Trim) and the old
  // gate that hid no-arg methods after they'd been used once forced an
  // awkward workaround.
  const methodOptions = buildMethodOptions(methods);

  const hasArgs = !!methodDef && methodDef.args.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex ${hasArgs ? 'items-end' : 'items-center'} gap-1.5 group`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className={`shrink-0 p-0.5 rounded transition-colors ${hasArgs ? 'mb-2' : ''} ${reorderDisabled ? 'text-faint/30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing text-faint hover:text-body'}`}
        {...(reorderDisabled ? {} : { ...attributes, ...listeners })}
        title="Drag to reorder"
      >
        <GripIcon />
      </button>

      {/* Step number */}
      <span className={`shrink-0 w-4 text-right text-xs font-mono text-faint ${hasArgs ? 'mb-2' : ''}`}>{index + 1}.</span>

      {/* Method selector */}
      <div className="w-44 shrink-0 flex flex-col gap-1">
        {hasArgs && (
          <span className="text-xs font-medium text-body pl-1">Method</span>
        )}
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
          disabled={readOnly}
        />
      </div>

      {/* Dynamic args. `items-end` mirrors the outer row so siblings whose
          labels wrap to two lines (e.g. "Pick Index (0-based)") don't drop
          their input below the rest of the row — every input bottom-aligns
          on the same baseline regardless of label height. */}
      {hasArgs && (
        <div className="flex items-end gap-1.5 flex-1 min-w-0">
          {methodDef!.args.map((argDef) => {
            const isCheckbox = argDef.type === 'checkbox';
            const checked = transformation.args[argDef.key] === 'true';
            return (
              <div
                key={argDef.key}
                // Checkbox cells are sized to a fixed width that fits the
                // toggle comfortably; the label above the toggle wraps to
                // multiple lines when needed instead of stretching the cell
                // horizontally. The previous `shrink-0 + whitespace-nowrap`
                // combo let long labels (e.g. "Break at special character")
                // size the cell to the full label, squeezing sibling text /
                // number inputs to the point where their placeholders got
                // clipped — even on the cell with the matching arg.
                className={isCheckbox ? 'w-28 shrink-0' : 'flex-1 min-w-0'}
              >
                {isCheckbox ? (
                  // Boolean args ride the Record<string,string> form-state as
                  // 'true' / 'false' so the existing {Key, Value} wire format
                  // stays untouched. Label sits above the toggle to match the
                  // sibling Input components, and the toggle box mirrors the
                  // Input's px-3 py-2 + text-sm + rounded-lg border so the row
                  // reads as a single rhythm of equal-height fields.
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-body pl-1 leading-tight">
                      {argDef.label}
                      {argDef.required && <span className="text-red-500 ml-0.5">*</span>}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      aria-label={argDef.label}
                      disabled={readOnly}
                      onClick={() =>
                        onUpdate({
                          args: { ...transformation.args, [argDef.key]: checked ? 'false' : 'true' },
                        })
                      }
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors w-full
                        ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                        ${checked
                          ? 'border-primary/40 bg-primary/10 text-primary-dark dark:text-primary'
                          : 'border-input-border bg-input-bg text-body hover:bg-surface-hover'}`}
                    >
                      <span
                        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0
                          ${checked ? 'bg-primary' : 'bg-border-strong dark:bg-faint'}`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform
                            ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                        />
                      </span>
                      <span className="whitespace-nowrap text-left font-normal text-faint">
                        {checked ? 'On' : 'Off'}
                      </span>
                    </button>
                  </div>
                ) : (
                  <Input
                    label={argDef.label}
                    placeholder={argDef.placeholder}
                    type={argDef.type}
                    value={transformation.args[argDef.key] ?? ''}
                    disabled={readOnly}
                    required={argDef.required}
                    onChange={(e) =>
                      onUpdate({ args: { ...transformation.args, [argDef.key]: e.target.value } })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Up/Down arrows + Remove */}
      <div className={`flex items-center shrink-0 w-8 justify-center ${hasArgs ? 'mb-1' : ''}`}>
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

      {!readOnly && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onRemove}
          className={`shrink-0 text-red-400 hover:text-red-500 ${hasArgs ? 'mb-1' : ''}`}
        >
          Remove Transformation
        </Button>
      )}
    </div>
  );
}

/** Strip surrounding quotes from a string */
function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '');
}

/** Compute LCS kept-index sets for both strings */
function lcsKeptSets(a: string, b: string): { keptA: Set<number>; keptB: Set<number> } {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const keptA = new Set<number>();
  const keptB = new Set<number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { keptA.add(i - 1); keptB.add(j - 1); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return { keptA, keptB };
}

/** Highlight removed characters in the input (red).
 *  Only highlights when characters were actually removed (output shorter),
 *  not when they were just changed (e.g. case change). */
function highlightRemoved(text: string, kept: Set<number>, outputLen: number): ReactNode {
  if (outputLen >= text.length) return <>{text}</>;

  const spans: ReactNode[] = [];
  let k = 0;
  while (k < text.length) {
    const isRemoved = !kept.has(k);
    let end = k;
    while (end < text.length && !kept.has(end) === isRemoved) end++;
    const chunk = text.slice(k, end);
    spans.push(isRemoved
      ? <span key={k} className="text-amber-500 font-medium bg-amber-500/20 rounded-sm border border-amber-500/25">{chunk}</span>
      : <span key={k}>{chunk}</span>);
    k = end;
  }
  return <>{spans}</>;
}

/** Highlight added/changed characters in the output (primary) */
function highlightAdded(text: string, kept: Set<number>): ReactNode {
  const spans: ReactNode[] = [];
  let k = 0;
  while (k < text.length) {
    const isAdded = !kept.has(k);
    let end = k;
    while (end < text.length && !kept.has(end) === isAdded) end++;
    const chunk = text.slice(k, end);
    spans.push(isAdded
      ? <span key={k} className="text-primary font-medium">{chunk}</span>
      : <span key={k}>{chunk}</span>);
    k = end;
  }
  return <>{spans}</>;
}

/** Build a rich sublabel node from the description's example portion.
 *  Tolerates both the ASCII arrow (`->`) and the Unicode arrow (`→`), and
 *  finds the example pair anywhere in the description rather than after a
 *  strict "Args: …." / "No args." preamble. Backend payloads from
 *  ATTRIBUTE_TRANSFORMATON use either arrow depending on the entry, and
 *  newer entries embed the example mid-sentence (e.g. "…Example: \"X\" → \"Y\"")
 *  without the preamble the old matcher required. */
function buildExampleNode(description?: string): ReactNode | undefined {
  if (!description) return undefined;
  // Normalize Unicode → to ASCII -> so a single matcher handles both arrows.
  const normalized = description.replace(/→/g, '->');
  // First try a quoted pair anywhere in the string: "input" -> "output".
  // Backend descriptions like `length="5", char="0": "42" -> "00042"` have
  // multiple quoted spans; the regex picks the leftmost pair where the
  // closer of the first quoted run is immediately followed by `\s*->\s*`
  // and another quoted run — which lands on the example, not the arg
  // bindings.
  const quoted = normalized.match(/"([^"]*)"\s*->\s*"([^"]*)"/);
  let inputRaw: string | undefined;
  let outputRaw: string | undefined;
  if (quoted) {
    inputRaw = quoted[1];
    outputRaw = quoted[2];
  } else {
    // Bare (unquoted) pair as a fallback. Restrict to single words / short
    // runs so a description sentence with a stray `->` doesn't get hijacked.
    const bare = normalized.match(/(?:Example:\s*)?(\S[^\s][^\n]{0,40}?)\s*->\s*([^\s][^\n]{0,40})/);
    if (bare) {
      inputRaw = bare[1].trim();
      outputRaw = bare[2].trim();
    }
  }
  if (inputRaw === undefined || outputRaw === undefined) return undefined;

  const hasArgs = /Args[^.]*\./i.test(description) && !/No args\./i.test(description);
  const inner0 = stripQuotes(inputRaw);
  // Keep quotes when whitespace matters (leading/trailing spaces or multiple consecutive spaces).
  const keepQuotes = inner0 !== inner0.trim() || /\s{2,}/.test(inner0);
  const input = keepQuotes ? `"${inner0}"` : inner0;
  const output = keepQuotes ? `"${stripQuotes(outputRaw)}"` : stripQuotes(outputRaw);

  const { keptA, keptB } = lcsKeptSets(input, output);
  return (
    <span className="font-mono">
      {hasArgs ? input : highlightRemoved(input, keptA, output.length)} &rarr; {highlightAdded(output, keptB)}
    </span>
  );
}

function buildMethodOptions(methods: TransformationMethodDef[]) {
  const options: { value: string; label: string; sublabel?: string; sublabelNode?: ReactNode }[] = [];
  for (const cat of TRANSFORMATION_CATEGORIES) {
    const inCategory = methods.filter((m) => m.category === cat);
    for (const m of inCategory) {
      options.push({ value: m.key, label: m.label, sublabel: cat, sublabelNode: buildExampleNode(m.description) });
    }
  }
  // Include any methods not in known categories
  const known = new Set(TRANSFORMATION_CATEGORIES as readonly string[]);
  for (const m of methods) {
    if (!known.has(m.category)) {
      options.push({ value: m.key, label: m.label, sublabel: m.category, sublabelNode: buildExampleNode(m.description) });
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

