import { useMemo, useLayoutEffect, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AnalyzedTransaction, TagSpecDefinition, TagAttribute, RuleExpression, TransactionRow } from '../../types';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { PREDEFINED_PATTERNS } from '../../constants/operations';
import { TagBadge } from './TagBadge';
import { HintsInfoIcon } from './HintsInfoIcon';
import { Badge } from '../shared/Badge';
import { Tooltip } from '../shared/Tooltip';
import { getHints } from '../../utils/getHints';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { decomposeExtractionRegex, engregxify } from '../../utils/engregxify';
import { getRegexDescription } from '../../types/tagSpec';
import { regexifyExtraction } from '../../utils/regexify';
import { setScrolling } from '../../utils/scrollingSignal';
import { extractAttributes } from '../../utils/extractAttributes';
import type { DefinitionVersionInfo } from '../../utils/definitionVersions';
import { diffStrings } from '../../utils/textDiff';
import { DropdownBackdrop } from '../shared/DropdownBackdrop';
import { CommentDialog, type CommentDialogResult } from './CommentDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import type { SetTransactionsCommentEntry, SortOverride, SortableField } from '../../api/transactions';
import { SORTABLE_FIELDS } from '../../api/transactions';

const SORTABLE_FIELD_SET = new Set<string>(SORTABLE_FIELDS);

interface TransactionTableProps {
  data: AnalyzedTransaction[];
  tagDefinitions: TagSpecDefinition[];
  originalDefinitionIds?: Set<string>;
  definitionSourceMap?: Map<string, string>;
  definitionVersions?: Map<string, DefinitionVersionInfo>;
  highlightExpressions?: RuleExpression[];
  searchHighlights?: Map<string, string>;
  onTagClick?: (tagName: string, definitionId?: string) => void;
  onFlagDeadEnd?: (ids: string[], value: boolean) => Promise<void>;
  onFlagDeadEndWithComment?: (ids: string[], value: boolean, entries?: SetTransactionsCommentEntry[]) => Promise<void>;
  onSetComments?: (entries: SetTransactionsCommentEntry[]) => Promise<void>;
  onHideTagDefs?: (defIds: string[]) => void;
  showAttributes?: boolean;
  relaxedMode?: boolean;
  hiddenColumns?: Set<string>;
  columnOrder?: string[];
  onColumnsReady?: (columns: ColumnDef[]) => void;
  onVisibleColumnsReady?: (columns: ColumnDef[]) => void;
  builderHeight?: number;
  loading?: boolean;
  accentHue?: number;
  onRowContextMenu?: (row: TransactionRow, x: number, y: number) => void;
  /** Fired on double-click of a 'data:*' cell. Caller decides which fields
   *  to react to (e.g. the Rule Builder uses this to copy a row's
   *  TransactionTypeCode value into its dropdown). When omitted, cells
   *  behave normally (text selects on double-click). */
  onCellDoubleClick?: (field: string, value: string | number | boolean | null, row: TransactionRow) => void;
  /** Set of `data:*` field names that should render with an interactive
   *  affordance (cursor pointer + hover accent + native tooltip). Use to
   *  signal which cells `onCellDoubleClick` actually responds to so the
   *  operator doesn't have to guess. */
  interactiveCellFields?: ReadonlySet<string>;
  /** Native `title` attribute applied to interactive cells. Defaults to a
   *  generic "Double-click to use" message; pass a context-specific copy
   *  to make the affordance self-explanatory. */
  interactiveCellHint?: string;
  /** The saved definition being edited, if any. Enables Before/After diff tooltips on attribute cells whose rule has changed. */
  originalEditingDef?: TagSpecDefinition;
  /**
   * The definition currently scoping the table (e.g. when the user clicked a
   * tag to drill into one definition's matches, or is editing a definition).
   * When set, attribute cells prefer values from this definition over other
   * matched ones — important for multi-tagged rows where two defs share an
   * attribute name but extract different values.
   */
  activeDefinitionId?: string;
  /** Current alphabetical sort override, or null when default sort is in
   *  effect. Drives the chevron indicator on sortable column headers. */
  sortOverride?: SortOverride | null;
  /** Click handler for sortable column headers. Receives the next override
   *  the table wants to apply (null clears back to default sorting). */
  onSortChange?: (next: SortOverride | null) => void;
  /** Per-column width override map, keyed by `ColumnDef.key` (e.g.
   *  "data:AdditionalInformation"). Absent keys fall back to the column's
   *  natural width — the resize handle on the header is what populates
   *  entries here. */
  columnWidths?: Record<string, number>;
  /** Fired when the operator drags a column resize handle. Passing `null`
   *  for `width` clears the override and reverts to natural width. */
  onColumnWidthChange?: (key: string, width: number | null) => void;
}

// Default widths (in px) for columns whose natural width is too wide to
// render comfortably in the half-screen budget the table is given when
// the rule builder is open. The Additional Information narrative is the
// dominant case — without a sensible default it wraps to 5+ lines per
// row, which then prevents collapsing the rule builder from showing any
// extra rows in the table. Columns not listed here fall back to the
// browser's auto-layout sizing.
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  'data:AdditionalInformation': 320,
};
// Narrative columns: in non-compact mode their content wraps and gets
// clamped to 3 lines so a single long row doesn't crowd out the table.
// Other column types (numeric, codes, dates) clip with ellipsis in
// compact mode but don't need the line-clamp treatment because they
// don't carry multi-line content. Resize is allowed on every column;
// this set only controls the wrap/clamp behavior.
const NARRATIVE_COLUMN_KEYS = new Set([
  'data:AdditionalInformation',
  'data:Description1',
  'data:Description2',
  'data:TransactionDetails',
]);

type ColumnDef =
  | { type: 'data'; key: string; field: string }
  | { type: 'attribute'; key: string; name: string }
  | { type: 'tags'; key: string }
  | { type: 'dates'; key: string; fields: { key: string; label: string }[] }
  | { type: 'debit'; key: string }
  | { type: 'credit'; key: string };

const DEFAULT_COLUMN_ORDER = [
  'data:Sequence',
  'data:BankSwiftCode',
  'data:StatementDate',
  'data:EntryDate',
  'data:ValueDate',
  'data:TransactionTypeCode',
  'data:IBAN',
  'data:FundsCode',
  'data:TransactionStatusIndicator',
  'data:CurrencyCode',
  '__debit',
  '__credit',
  'data:BankReference',
  'data:Description1',
  'data:Description2',
  'data:AdditionalInformation',
  'data:TransactionDetails',
  'data:Comment',
];

/** Synthetic ID for the rule-builder live preview definition. Rows that
 *  only match this definition have no real tag yet, so surfaces like the
 *  "Hide Tag Specs" action must ignore it when collecting hideable defs. */
export const PREVIEW_TEMP_DEF_ID = 'preview-temp';

export const ALLOWED_COLUMN_KEYS = new Set([
  'data:Sequence',
  'data:StatementDate',
  'data:EntryDate',
  'data:ValueDate',
  '__debit',
  '__credit',
  'data:CurrencyCode',
  'data:TransactionTypeCode',
  'data:FundsCode',
  'data:BankSwiftCode',
  'data:IBAN',
  'data:BankReference',
  'data:TransactionStatusIndicator',
  'data:TransactionDetails',
  'data:AdditionalInformation',
  'data:Description1',
  'data:Description2',
  'data:Comment',
]);

/**
 * Columns shown by default on first load. Anything not in this set (and not in
 * the per-side debit/credit rule applied by the caller) starts hidden; users
 * can toggle it on via the column picker.
 * Note: EntryDate, ValueDate, Sequence, BankSwiftCode, FundsCode,
 * TransactionStatusIndicator, and TransactionDetails are intentionally hidden
 * by default.
 */
export const DEFAULT_VISIBLE_COLUMN_KEYS = new Set([
  'data:StatementDate',
  'data:TransactionTypeCode',
  'data:IBAN',
  'data:CurrencyCode',
  'data:BankReference',
  'data:Description1',
  'data:Description2',
  'data:AdditionalInformation',
  'data:Comment',
  // __debit / __credit are added conditionally by the caller based on checkout side.
]);
const SIDE_AMOUNT_FIELDS = new Set(['Side', 'Amount']);
const DATE_FIELDS = new Set(['StatementDate', 'EntryDate', 'ValueDate']);
const DATE_COLUMN_LABELS: Record<string, string> = {
  StatementDate: 'Statement Date',
  EntryDate: 'Entry Date',
  ValueDate: 'Value Date',
};

function getColumnLabel(col: ColumnDef): string {
  switch (col.type) {
    case 'data': return DATE_COLUMN_LABELS[col.field] ?? humanizeFieldName(col.field);
    case 'attribute': return humanizeFieldName(col.name);
    case 'tags': return 'Tags';
    case 'dates': return 'Dates';
    case 'debit': return 'Debit Amount';
    case 'credit': return 'Credit Amount';
  }
}

function getColumnInitials(col: ColumnDef): string {
  const label = getColumnLabel(col);
  // Split on spaces/slashes first, then split camelCase within each token
  const tokens = label.split(/[\s/]+/).filter(Boolean);
  const words = tokens.flatMap((t) => t.split(/(?=[A-Z])/)).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.map((w) => w[0]).join('').toUpperCase();
}

function getMinimapColor(type: ColumnDef['type']): string {
  switch (type) {
    case 'data': return 'text-slate-500';
    case 'attribute': return 'text-primary';
    case 'tags': return 'text-emerald-500';
    case 'dates': return 'text-slate-400';
    case 'debit': return 'text-red-400 dark:text-rose-300';
    case 'credit': return 'text-emerald-400 dark:text-emerald-300';
  }
}

function getMinimapBorderColor(type: ColumnDef['type']): string | null {
  switch (type) {
    case 'attribute': return '#3b82f6'; // blue-500
    case 'debit': return 'var(--th-debit-accent)';
    case 'credit': return 'var(--th-credit-accent)';
    default: return null;
  }
}

function getColumnAccentColor(index: number, total: number, baseHue = 190): string {
  const hueRange = 30;
  const t = index / Math.max(total - 1, 1); // 0 → 1
  const hue = baseHue - hueRange / 2 + t * hueRange;
  const lightness = 82 - t * 57; // 82% (lightest) → 25% (darkest)
  const saturation = 40 + t * 25; // 40% → 65%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function highlightText(text: string, regexes: RegExp[]): ReactNode {
  if (regexes.length === 0) return text;

  const ranges: [number, number][] = [];
  for (const regex of regexes) {
    const flags = 'g' + (regex.flags.includes('i') ? 'i' : '');
    const globalRegex = new RegExp(regex.source, flags);
    let match;
    while ((match = globalRegex.exec(text)) !== null) {
      if (match[0].length === 0) break;
      ranges.push([match.index, match.index + match[0].length]);
    }
  }

  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) {
      last[1] = Math.max(last[1], ranges[i][1]);
    } else {
      merged.push(ranges[i]);
    }
  }

  const parts: ReactNode[] = [];
  let pos = 0;
  for (const [start, end] of merged) {
    if (pos < start) parts.push(text.slice(pos, start));
    parts.push(
      <mark key={start} className="bg-primary/20 dark:bg-primary/40 rounded-sm text-heading dark:text-primary-light font-medium p-0.5 ring-1 ring-primary/40 dark:ring-primary/70 dark:shadow-[0_0_6px_var(--color-primary)]">
        {text.slice(start, end)}
      </mark>
    );
    pos = end;
  }
  if (pos < text.length) parts.push(text.slice(pos));

  return <>{parts}</>;
}

export function ColumnPicker({ columns, hiddenColumns, onChange, columnOrder, onColumnOrderChange, defaultHiddenColumns, onReset, lockedVisibleKeys }: {
  columns: ColumnDef[];
  hiddenColumns: Set<string>;
  onChange: (hidden: Set<string>) => void;
  columnOrder?: string[];
  onColumnOrderChange?: (order: string[]) => void;
  defaultHiddenColumns?: Set<string>;
  onReset?: () => void;
  /** Column keys that must stay visible (rendered checked + disabled in the picker). */
  lockedVisibleKeys?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  // Auto-scroll the dropdown when dragging near edges
  useEffect(() => {
    if (dragIdx === null) {
      if (scrollRafRef.current) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null; }
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastY = 0;
    const EDGE = 40;
    const SPEED = 6;

    const onDrag = (e: DragEvent) => { lastY = e.clientY; };
    const tick = () => {
      const rect = container.getBoundingClientRect();
      const topDist = lastY - rect.top;
      const bottomDist = rect.bottom - lastY;
      if (topDist < EDGE && topDist > 0) {
        container.scrollTop -= SPEED * (1 - topDist / EDGE);
      } else if (bottomDist < EDGE && bottomDist > 0) {
        container.scrollTop += SPEED * (1 - bottomDist / EDGE);
      }
      scrollRafRef.current = requestAnimationFrame(tick);
    };

    document.addEventListener('drag', onDrag);
    scrollRafRef.current = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('drag', onDrag);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [dragIdx]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Exclude tags (always visible), attributes, and columns not in the allowed list
  const toggleable = columns.filter((col) => {
    if (col.type === 'tags') return false;
    if (col.type === 'attribute') return false;
    if (!ALLOWED_COLUMN_KEYS.has(col.key)) return false;
    return true;
  });

  // Apply column order (custom drag order, or default priority)
  const ordered = useMemo(() => {
    const order = columnOrder && columnOrder.length > 0 ? columnOrder : DEFAULT_COLUMN_ORDER;
    const orderMap = new Map(order.map((key, idx) => [key, idx]));
    return [...toggleable].sort((a, b) => {
      const ai = orderMap.get(a.key) ?? Infinity;
      const bi = orderMap.get(b.key) ?? Infinity;
      if (ai === Infinity && bi === Infinity) return 0;
      return ai - bi;
    });
  }, [toggleable, columnOrder]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ordered;
    const q = search.toLowerCase();
    return ordered.filter((col) => getColumnLabel(col).toLowerCase().includes(q));
  }, [ordered, search]);

  const visibleCount = toggleable.filter((col) => !hiddenColumns.has(col.key)).length;
  const totalCount = toggleable.length;

  const isDefault = useMemo(() => {
    if (columnOrder && columnOrder.length > 0) return false;
    if (!defaultHiddenColumns) return hiddenColumns.size === 0;
    if (hiddenColumns.size !== defaultHiddenColumns.size) return false;
    for (const key of hiddenColumns) {
      if (!defaultHiddenColumns.has(key)) return false;
    }
    return true;
  }, [hiddenColumns, defaultHiddenColumns, columnOrder]);

  const handleDrop = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || !onColumnOrderChange) return;
    const newOrder = [...ordered];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    onColumnOrderChange(newOrder.map((c) => c.key));
  }, [ordered, onColumnOrderChange]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${hiddenColumns.size > 0
          ? 'bg-primary/10 border-primary/30 text-primary-dark'
          : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
          }`}
      >
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
          </svg>
          Columns
          <span className="font-semibold  rounded-full p-0  flex gap-0.5 items-center text-xs">
            <span>{visibleCount}</span>
            <span>/</span>
            <span>{totalCount}</span>
          </span>
        </span>
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => { setOpen(false); setSearch(''); }} />
          <div ref={scrollContainerRef} className="absolute top-full mt-1 right-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64 max-h-72 overflow-y-auto custom-scrollbar px-1.5 pb-1.5">
            <div className="sticky top-0 bg-surface z-10 border-b border-border-subtle mb-1 pt-2 pb-1.5">
              <div className="px-2 pb-1.5">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search columns..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-input-bg text-heading placeholder:text-faint outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-body hover:bg-surface-hover rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleCount === totalCount}
                    ref={(el) => { if (el) el.indeterminate = visibleCount > 0 && visibleCount < totalCount; }}
                    onChange={() => {
                      // Preserve hidden state of non-toggleable columns
                      const nonToggleableHidden = new Set([...hiddenColumns].filter((k) => !toggleable.some((c) => c.key === k)));
                      if (visibleCount === totalCount) {
                        // Hide all toggleable
                        const next = new Set([...nonToggleableHidden, ...toggleable.map((c) => c.key)]);
                        onChange(next);
                      } else {
                        // Show all toggleable (keep non-toggleable hidden)
                        onChange(nonToggleableHidden);
                      }
                    }}
                    className="rounded border-border-strong"
                  />
                  {visibleCount === totalCount ? 'Hide All' : 'Show All'}
                </label>
                {onReset && !isDefault && (
                  <button
                    onClick={onReset}
                    className="text-[11px] text-primary hover:text-primary-dark px-2 py-0.5 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            {filtered.map((col, i) => {
              const label = getColumnLabel(col);
              const isLocked = !!lockedVisibleKeys?.has(col.key);
              const isHidden = !isLocked && hiddenColumns.has(col.key);
              const isSearching = search.trim().length > 0;
              const isDragOver = !isSearching && overIdx === i && dragIdx !== null && dragIdx !== i;
              return (
                <div
                  key={col.key}
                  draggable={!isSearching}
                  onDragStart={(e) => {
                    setDragIdx(i);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setOverIdx((prev) => prev === i ? prev : i);
                  }}
                  onDragLeave={() => { if (overIdx === i) setOverIdx(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx !== null) handleDrop(dragIdx, i);
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  className={`flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-hover rounded cursor-grab active:cursor-grabbing select-none transition-colors ${isDragOver ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'
                    } ${dragIdx === i ? 'opacity-40' : ''}`}
                  title={isLocked ? 'Always shown while the view is filtered to a single side.' : undefined}
                >
                  <svg className="w-3 h-3 text-faint shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                  </svg>
                  <label className={`flex items-center gap-2 flex-1 ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      disabled={isLocked}
                      onChange={() => {
                        if (isLocked) return;
                        const next = new Set(hiddenColumns);
                        if (isHidden) next.delete(col.key);
                        else next.add(col.key);
                        onChange(next);
                      }}
                      className="rounded border-border-strong"
                    />
                    <span className={
                      `truncate ${col.type === 'attribute' ? 'text-primary-dark' : 'text-black dark:text-white'}
                      ${isHidden ? 'font-normal' : 'font-medium'}
                      `
                    }>{label}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export type { ColumnDef };

/**
 * Wraps a data-cell's content so it respects the cell's `max-width`
 * without bleeding into the next column. Auto-layout tables don't honor
 * `max-width` on `<td>` for `whitespace-nowrap` content unless the
 * overflow is handled here.
 *
 * - Compact mode + width override: single line, ellipsis truncate
 * - Non-compact mode + narrative column: three-line clamp (whitespace
 *   preserved so multi-paragraph narratives still read naturally)
 * - Non-compact mode + non-narrative column: natural wrap (default)
 *
 * Without a width override the wrapper degrades to a passthrough so
 * legacy columns keep their previous behavior.
 */
function CellContentWrapper({
  relaxedMode,
  narrative,
  hasWidth,
  children,
}: {
  relaxedMode: boolean;
  narrative: boolean;
  hasWidth: boolean;
  children: React.ReactNode;
}) {
  if (relaxedMode) {
    if (!hasWidth) return <>{children}</>;
    return <div className="truncate">{children}</div>;
  }
  if (narrative) {
    return <div className="line-clamp-3 whitespace-pre-wrap break-words">{children}</div>;
  }
  if (hasWidth) {
    return <div className="break-words">{children}</div>;
  }
  return <>{children}</>;
}

/**
 * Vertical drag handle pinned to the right edge of a resizable column
 * header. Holds a pointer-down listener that switches to window-level
 * mousemove / mouseup so the drag survives leaving the cell, and pushes
 * the new width through `onChange` while the operator is still dragging
 * (so the layout previews live, not just on release). Double-click
 * clears any override and reverts to the column's natural / default
 * width so it's easy to undo an over-zoom.
 *
 * Width is floored at 120px so the column can't shrink small enough to
 * eat its own header label, and capped at 1200px to avoid an accidental
 * drag past the visible viewport.
 */
function ColumnResizeHandle({
  currentWidth,
  onChange,
}: {
  currentWidth: number;
  onChange: (next: number | null) => void;
}) {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Left button only — right-click / context menu interactions on
      // the handle would otherwise spawn a stale resize session.
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = currentWidth > 0 ? currentWidth : (e.currentTarget.parentElement?.getBoundingClientRect().width ?? 200);
      const onMove = (ev: PointerEvent) => {
        const next = Math.max(120, Math.min(1200, startWidth + (ev.clientX - startX)));
        onChange(next);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [currentWidth, onChange],
  );
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize column. Double-click to reset."
      onPointerDown={handlePointerDown}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(null);
      }}
      title="Drag to resize. Double-click to reset."
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize group/resize select-none"
    >
      <div className="absolute inset-y-0 right-0 w-px bg-border-strong/40 group-hover/resize:bg-primary group-hover/resize:w-0.5 transition-all" />
    </div>
  );
}

/**
 * Tiny chevron indicator for sortable column headers. When inactive, both
 * up and down arrows render at low opacity (revealed on header hover via
 * group-hover) so operators discover that the header is interactive. When
 * a direction is active, only that arrow renders at full strength.
 */
function SortChevron({ activeOrder }: { activeOrder: 'ASC' | 'DESC' | null }) {
  if (activeOrder === 'ASC') {
    return (
      <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m3 7 3-3 3 3" />
      </svg>
    );
  }
  if (activeOrder === 'DESC') {
    return (
      <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m3 5 3 3 3-3" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-70 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 5 3-3 3 3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 7 3 3 3-3" />
    </svg>
  );
}

export function TransactionTable({ data, tagDefinitions, originalDefinitionIds, definitionSourceMap, definitionVersions, highlightExpressions, searchHighlights, onTagClick, onFlagDeadEnd, onFlagDeadEndWithComment, onSetComments, onHideTagDefs, showAttributes = true, relaxedMode = false, hiddenColumns = new Set(), columnOrder, onColumnsReady, onVisibleColumnsReady, builderHeight = 0, loading = false, accentHue = 190, onRowContextMenu, onCellDoubleClick, interactiveCellFields, interactiveCellHint, originalEditingDef, activeDefinitionId, sortOverride = null, onSortChange, columnWidths, onColumnWidthChange }: TransactionTableProps) {
  // Resolve the effective width for a column: explicit override wins,
  // otherwise the catalog default, otherwise undefined (browser
  // auto-layout). Width overrides are intentionally scoped to non-compact
  // mode — operators rely on compact mode for its natural single-line
  // auto-layout, and carrying widths over would re-introduce the
  // overlapping-cell artifacts a saved override from non-compact mode
  // produced. The resize handle is hidden in compact mode for the same
  // reason: dragging it would not visibly take effect until the operator
  // switched modes, which reads as a broken control.
  const resolveColumnWidth = useCallback(
    (key: string): number | undefined => {
      if (relaxedMode) return undefined;
      const override = columnWidths?.[key];
      if (typeof override === 'number' && Number.isFinite(override) && override > 0) return override;
      return DEFAULT_COLUMN_WIDTHS[key];
    },
    [columnWidths, relaxedMode],
  );
  const { fieldMeta } = useTransactionData();
  const { lovLookup } = useLovAttributes();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Sticky "select-all" intent. Set true by the header checkbox and broken by
  // any manual deselect (or any of the bulk clear paths). When true, rows
  // appended via pagination get auto-joined to the selection so a "+25" load
  // doesn't visually drop the new rows out of the selected set.
  const [selectAllActive, setSelectAllActive] = useState<boolean>(false);

  // Map attribute name → LOVTag for LOV value resolution
  const attrLovTagMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of tagDefinitions) {
      for (const attr of def.Attributes) {
        if (attr.LOVTag && !map.has(attr.AttributeTag)) {
          map.set(attr.AttributeTag, attr.LOVTag);
        }
      }
    }
    return map;
  }, [tagDefinitions]);

  const getRowId = useCallback((row: AnalyzedTransaction['row']) =>
    String(row[fieldMeta.identifierField] ?? row['Id'] ?? ''),
    [fieldMeta.identifierField]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Manual deselect breaks the sticky select-all intent — the user is
        // now curating individual rows.
        setSelectAllActive(false);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // True when every visible row's id is already in `selectedIds`. Comparing
  // `selectedIds.size === data.length` would be wrong: rows with duplicate
  // (or empty) ids collapse into a single Set entry, so for large datasets
  // where `getRowId` isn't unique across all rows, the count comparison
  // says "not all selected" even after select-all has been clicked. Walking
  // the rows side-steps that.
  const allRowsSelected = useMemo(() => {
    if (data.length === 0) return false;
    for (const item of data) {
      if (!selectedIds.has(getRowId(item.row))) return false;
    }
    return true;
  }, [data, selectedIds, getRowId]);

  // Visible-row selection count. `selectedIds.size` is the *unique-id* count;
  // when multiple visible rows collapse to the same getRowId (duplicate or
  // missing identifiers), `.size` undercounts — clicking select-all on a 100-
  // row view can show "75 selected" because 25 rows share ids with the other
  // 75. Walking `data` and counting which rows map to a selected id gives the
  // user-facing total they expect (matches the loaded-row count).
  const visibleSelectedCount = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    let count = 0;
    for (const item of data) {
      if (selectedIds.has(getRowId(item.row))) count++;
    }
    return count;
  }, [data, selectedIds, getRowId]);

  const toggleSelectAll = useCallback(() => {
    if (allRowsSelected) {
      setSelectedIds(new Set());
      setSelectAllActive(false);
    } else {
      setSelectedIds(new Set(data.map((item) => getRowId(item.row))));
      setSelectAllActive(true);
    }
  }, [data, allRowsSelected, getRowId]);

  const [flagLoading, setFlagLoading] = useState(false);
  const handleFlagDeadEnd = useCallback(async (value: boolean) => {
    if (!onFlagDeadEnd || selectedIds.size === 0) return;
    setFlagLoading(true);
    try {
      await onFlagDeadEnd(Array.from(selectedIds), value);
      setSelectedIds(new Set());
      setSelectAllActive(false);
    } finally {
      setFlagLoading(false);
    }
  }, [onFlagDeadEnd, selectedIds]);

  type CommentDialogState =
    | { mode: 'comment-only' }
    | { mode: 'flag-with-comment'; flagAction: 'flag' | 'unflag' };

  const [commentDialogState, setCommentDialogState] = useState<CommentDialogState | null>(null);

  const openFlagDialog = useCallback((flagAction: 'flag' | 'unflag') => {
    setCommentDialogState({ mode: 'flag-with-comment', flagAction });
  }, []);
  const openCommentDialog = useCallback(() => {
    setCommentDialogState({ mode: 'comment-only' });
  }, []);
  const closeCommentDialog = useCallback(() => {
    setCommentDialogState(null);
  }, []);

  const selectedRowsForDialog = useMemo(() => {
    if (!commentDialogState) return [];
    const rows: TransactionRow[] = [];
    for (const id of selectedIds) {
      const item = data.find((d) => getRowId(d.row) === id);
      if (item) rows.push(item.row);
    }
    return rows;
  }, [commentDialogState, selectedIds, data, getRowId]);

  const handleCommentDialogConfirm = useCallback(async (result: CommentDialogResult) => {
    if (!commentDialogState) return;
    const ids = Array.from(selectedIds);
    if (commentDialogState.mode === 'flag-with-comment') {
      const value = commentDialogState.flagAction === 'flag';
      const entries = result.skipped ? undefined : result.entries;
      if (onFlagDeadEndWithComment) {
        await onFlagDeadEndWithComment(ids, value, entries);
      } else if (onFlagDeadEnd) {
        // Fallback when the parent hasn't wired the combined callback.
        await onFlagDeadEnd(ids, value);
      }
      setSelectedIds(new Set());
      setSelectAllActive(false);
      return;
    }
    if (commentDialogState.mode === 'comment-only') {
      if (result.skipped) return;
      if (onSetComments && result.entries.length > 0) {
        await onSetComments(result.entries);
      }
      setSelectedIds(new Set());
      setSelectAllActive(false);
    }
  }, [commentDialogState, selectedIds, onFlagDeadEndWithComment, onFlagDeadEnd, onSetComments]);

  // Clear the selection whenever the row count changes (pagination, filter,
  // refresh, etc.). Operator decision: paginating should not carry selection
  // forward — selection only applies to what's currently in view.
  //
  // The reset runs during render (not in an effect) so that React discards
  // the in-flight render and re-renders with an empty selection before
  // committing to the DOM. Otherwise there is a one-frame gap where the
  // action-bar count walks the new data with the stale selection set and
  // briefly shows the wrong number ("150 selected") before the effect
  // clears it.
  const prevDataLenRef = useRef<number>(data.length);
  if (data.length !== prevDataLenRef.current) {
    prevDataLenRef.current = data.length;
    if (selectedIds.size > 0) setSelectedIds(new Set());
    if (selectAllActive) setSelectAllActive(false);
  }

  // Hide Tag action state. Keyed by OpsTagSpecDefinitionId so two definitions
  // that happen to share a tag name stay independent — picking one only
  // hides that definition's rows. The picker covers the multi-def case;
  // single-def and zero-def cases route through the confirm dialog and the
  // disabled button respectively.
  type HideTagDef = { defId: string; name: string; version?: number };
  const [hideTagDialog, setHideTagDialog] = useState<
    | { kind: 'confirm'; def: HideTagDef }
    | { kind: 'picker'; defs: HideTagDef[]; picked: Set<string /* defId */> }
    | null
  >(null);

  const selectedTagDefs = useMemo(() => {
    if (selectedIds.size === 0) return [] as HideTagDef[];
    const map = new Map<string, HideTagDef>();
    for (const id of selectedIds) {
      const item = data.find((d) => getRowId(d.row) === id);
      if (!item) continue;
      item.analysis.matchedDefinitions.forEach((def, ti) => {
        if (!def || map.has(def.Id)) return;
        // The rule-builder preview pill represents a draft tag, not a real
        // tag spec — there's nothing to hide for it.
        if (def.Id === PREVIEW_TEMP_DEF_ID) return;
        const version = definitionVersions?.get(def.Id)?.version;
        map.set(def.Id, {
          defId: def.Id,
          name: item.analysis.tags[ti] ?? def.Tag,
          version,
        });
      });
    }
    return [...map.values()].sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      return byName !== 0 ? byName : (a.version ?? 0) - (b.version ?? 0);
    });
  }, [selectedIds, data, getRowId, definitionVersions]);

  const openHideTagDialog = useCallback(() => {
    if (selectedTagDefs.length === 0) return;
    if (selectedTagDefs.length === 1) {
      setHideTagDialog({ kind: 'confirm', def: selectedTagDefs[0] });
    } else {
      setHideTagDialog({
        kind: 'picker',
        defs: selectedTagDefs,
        picked: new Set(selectedTagDefs.map((d) => d.defId)),
      });
    }
  }, [selectedTagDefs]);

  const confirmHideTags = useCallback((defIds: string[]) => {
    if (!onHideTagDefs || defIds.length === 0) return;
    onHideTagDefs(defIds);
    setSelectedIds(new Set());
    setSelectAllActive(false);
    setHideTagDialog(null);
  }, [onHideTagDefs]);

  const theadRef = useRef<HTMLTableSectionElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewportIndicatorRef = useRef<HTMLDivElement>(null);
  const minimapBarRef = useRef<HTMLDivElement>(null);
  const scrollInfoRef = useRef({ scrollLeft: 0, clientWidth: 0, scrollWidth: 0 });
  const stickyLeftWidthRef = useRef(0);
  const tagsColWidthRef = useRef(0);

  const [stickyLefts, setStickyLefts] = useState<Map<number, number>>(new Map());
  const [stickyRights, setStickyRights] = useState<Map<number, number>>(new Map());
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [hasOverflow, setHasOverflow] = useState(false);

  const getCertainty = (tagName: string) => {
    const def = tagDefinitions.find((d) => d.Tag === tagName);
    return def?.CertaintyLevelTag ?? 'HIGH';
  };

  const highlightMap = useMemo(() => {
    if (!highlightExpressions || highlightExpressions.length === 0) return null;
    const map = new Map<string, RegExp[]>();
    for (const expr of highlightExpressions) {
      try {
        const regex = new RegExp(expr.Regex);
        if (!map.has(expr.SourceField)) map.set(expr.SourceField, []);
        map.get(expr.SourceField)!.push(regex);
      } catch {
        // skip invalid regex
      }
    }
    return map.size > 0 ? map : null;
  }, [highlightExpressions]);

  const searchHighlightMap = useMemo(() => {
    if (!searchHighlights || searchHighlights.size === 0) return null;
    const map = new Map<string, RegExp[]>();
    for (const [field, term] of searchHighlights) {
      if (!term) continue;
      try {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        map.set(field, [new RegExp(escaped, 'i')]);
      } catch {
        // skip
      }
    }
    return map.size > 0 ? map : null;
  }, [searchHighlights]);

  // Collect distinct attribute names to render as columns. When the table is
  // scoped to a single definition (tag-click drill-down or active edit), only
  // show that definition's own attributes — otherwise multi-tagged rows would
  // surface attribute columns belonging to *other* matched defs and look like
  // they extracted values that actually came from a different tag.
  const attributeColumns = useMemo(() => {
    if (activeDefinitionId) {
      const activeDef = tagDefinitions.find((d) => d.Id === activeDefinitionId);
      if (activeDef) {
        return activeDef.Attributes
          .map((a) => a.AttributeTag)
          .filter((name, i, arr) => arr.indexOf(name) === i)
          .sort();
      }
    }
    const names = new Set<string>();
    for (const item of data) {
      for (const tagAttrs of Object.values(item.analysis.attributes)) {
        for (const attrName of Object.keys(tagAttrs)) {
          names.add(attrName);
        }
      }
    }
    return Array.from(names).sort();
  }, [data, activeDefinitionId, tagDefinitions]);

  // Map attribute names to their source field from definitions.
  // Constants and any malformed null-AttributeRuleExpression attrs have no
  // source field — skip them so column placement falls through to the
  // unanchored bucket rather than crashing.
  const attrSourceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of tagDefinitions) {
      for (const attr of def.Attributes) {
        if (map.has(attr.AttributeTag)) continue;
        if (attr.Constant != null || !attr.AttributeRuleExpression) continue;
        map.set(attr.AttributeTag, attr.AttributeRuleExpression.SourceField);
      }
    }
    return map;
  }, [tagDefinitions]);

  // Map attribute names to their validation info (predefined patterns or extract_between_and_verify)
  const { validationClasses } = useLovAttributes();

  // Build a quick lookup: ValidationRuleTag → regex string
  const validationClassRegexMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const vc of validationClasses) {
      map.set(vc.Tag, vc.Regex);
    }
    return map;
  }, [validationClasses]);

  const attrValidationMap = useMemo(() => {
    const map = new Map<string, { regex: RegExp; sourceField: string; verifyValue?: string; validateExtracted?: boolean }>();
    for (const def of tagDefinitions) {
      for (const attr of def.Attributes) {
        if (map.has(attr.AttributeTag)) continue;
        // Constants have no regex / no source field — nothing to validate.
        // A null AttributeRuleExpression on a non-constant is a backend bug,
        // but the runtime extractor degrades to null rather than crashing
        // so we mirror that here.
        if (attr.Constant != null || !attr.AttributeRuleExpression) continue;
        const expr = attr.AttributeRuleExpression;
        const op = expr.Regex;

        // Check for extract_between_and_verify (has VerifyValue)
        if (expr.VerifyValue) {
          try {
            map.set(attr.AttributeTag, {
              regex: new RegExp(op),
              sourceField: expr.SourceField,
              verifyValue: expr.VerifyValue,
            });
          } catch { /* skip */ }
          continue;
        }

        // Find matching predefined pattern by checking the regex
        const predefined = PREDEFINED_PATTERNS.find((p) => {
          if (!p.validate) return false;
          try { return new RegExp(p.regex).source === new RegExp(op).source; } catch { return false; }
        });
        if (predefined) {
          try {
            map.set(attr.AttributeTag, { regex: new RegExp(predefined.regex), sourceField: expr.SourceField });
          } catch { /* skip */ }
          continue;
        }

        // Use ValidationClass regex to validate the extracted value
        const vcRegex = validationClassRegexMap.get(attr.ValidationRuleTag);
        if (vcRegex) {
          try {
            map.set(attr.AttributeTag, {
              regex: new RegExp(vcRegex),
              sourceField: expr.SourceField,
              validateExtracted: true,
            });
          } catch { /* skip */ }
        }
      }
    }
    return map;
  }, [tagDefinitions, validationClassRegexMap]);

  // Build ordered column list: attributes placed right after their source field (no identifier column)
  const columns: ColumnDef[] = useMemo(() => {
    const attrsBySource = new Map<string, string[]>();
    for (const attrName of attributeColumns) {
      const source = attrSourceMap.get(attrName);
      if (source) {
        if (!attrsBySource.has(source)) attrsBySource.set(source, []);
        attrsBySource.get(source)!.push(attrName);
      }
    }

    const cols: ColumnDef[] = [];
    const placedAttrs = new Set<string>();
    let debitCreditInserted = false;

    // Tags column first (sticky left)
    cols.push({ type: 'tags', key: '__tags' });

    for (const field of fieldMeta.dataFields) {
      // Combine Side + Amount into Debit/Credit columns.
      // Attributes sourced from `Amount` (or `Side`) still belong next to
      // their source — place them right after the synthetic debit/credit
      // pair instead of letting them fall through to the end-append loop.
      if (SIDE_AMOUNT_FIELDS.has(field)) {
        if (!debitCreditInserted) {
          cols.push({ type: 'debit', key: '__debit' });
          cols.push({ type: 'credit', key: '__credit' });
          debitCreditInserted = true;
        }
        const attrs = attrsBySource.get(field);
        if (attrs) {
          for (const attr of attrs) {
            if (placedAttrs.has(attr)) continue;
            cols.push({ type: 'attribute', key: `attr:${attr}`, name: attr });
            placedAttrs.add(attr);
          }
        }
        continue;
      }
      cols.push({ type: 'data', key: `data:${field}`, field });
      const attrs = attrsBySource.get(field);
      if (attrs) {
        for (const attr of attrs) {
          cols.push({ type: 'attribute', key: `attr:${attr}`, name: attr });
          placedAttrs.add(attr);
        }
      }
    }

    for (const attr of attributeColumns) {
      if (!placedAttrs.has(attr)) {
        cols.push({ type: 'attribute', key: `attr:${attr}`, name: attr });
      }
    }

    return cols;
  }, [fieldMeta.dataFields, attributeColumns, attrSourceMap]);

  useEffect(() => {
    onColumnsReady?.(columns);
  }, [columns, onColumnsReady]);

  const visibleColumns = useMemo(() => {
    let result = columns;
    if (!showAttributes) result = result.filter((col) => col.type !== 'attribute');
    if (hiddenColumns.size > 0) result = result.filter((col) => col.type === 'attribute' || !hiddenColumns.has(col.key));

    // Separate tags, attributes, and sortable columns
    const tags = result.filter((col) => col.type === 'tags');
    const attrs = result.filter((col) => col.type === 'attribute');
    const sortable = result.filter((col) => col.type !== 'tags' && col.type !== 'attribute');

    // Sort only non-attribute columns by custom or default order
    const order = columnOrder && columnOrder.length > 0 ? columnOrder : DEFAULT_COLUMN_ORDER;
    const orderMap = new Map(order.map((key, idx) => [key, idx]));
    sortable.sort((a, b) => {
      const ai = orderMap.get(a.key) ?? Infinity;
      const bi = orderMap.get(b.key) ?? Infinity;
      if (ai === Infinity && bi === Infinity) return 0;
      return ai - bi;
    });

    // Group attributes by their source field key. Constants and any
    // attribute whose source field isn't resolvable have no key — they go
    // into a separate "sourceless" bucket so they aren't silently
    // dropped. Previously the `if (sourceKey)` guard skipped them
    // entirely, which is why constant-mode attributes never appeared in
    // the table even after a successful save.
    const attrsBySourceKey = new Map<string, ColumnDef[]>();
    const sourcelessAttrs: ColumnDef[] = [];
    for (const attr of attrs) {
      if (attr.type === 'attribute') {
        const sourceField = attrSourceMap.get(attr.name);
        const sourceKey = sourceField ? `data:${sourceField}` : null;
        if (sourceKey) {
          if (!attrsBySourceKey.has(sourceKey)) attrsBySourceKey.set(sourceKey, []);
          attrsBySourceKey.get(sourceKey)!.push(attr);
        } else {
          sourcelessAttrs.push(attr);
        }
      }
    }

    // Re-insert attributes after their source field
    const final: ColumnDef[] = [...tags];
    for (const col of sortable) {
      final.push(col);
      const followingAttrs = attrsBySourceKey.get(col.key);
      if (followingAttrs) {
        final.push(...followingAttrs);
        attrsBySourceKey.delete(col.key);
      }
    }

    // Orphan attributes (source field exists but is currently hidden) go
    // at the end, followed by sourceless attributes (constants).
    for (const remaining of attrsBySourceKey.values()) {
      final.push(...remaining);
    }
    final.push(...sourcelessAttrs);

    return final;
  }, [columns, showAttributes, hiddenColumns, columnOrder, attrSourceMap]);

  useEffect(() => {
    onVisibleColumnsReady?.(visibleColumns);
  }, [visibleColumns, onVisibleColumnsReady]);

  // Determine which column indices should be sticky, split into left/right groups
  const { leftIndices, rightIndices } = useMemo(() => {
    const left = new Set<number>();
    const right = new Set<number>();

    // Tags column is always sticky left
    const tagsIdx = visibleColumns.findIndex((col) => col.type === 'tags');
    if (tagsIdx !== -1) left.add(tagsIdx);

    return { leftIndices: left, rightIndices: right };
  }, [visibleColumns]);

  // Boundary columns: last left-sticky gets right shadow, first right-sticky gets left shadow
  const { lastLeftIdx, firstRightIdx } = useMemo(() => {
    let lastLeft = -1;
    let firstRight = -1;
    for (const idx of leftIndices) {
      if (idx > lastLeft) lastLeft = idx;
    }
    for (const idx of rightIndices) {
      if (firstRight === -1 || idx < firstRight) firstRight = idx;
    }
    return { lastLeftIdx: lastLeft, firstRightIdx: firstRight };
  }, [leftIndices, rightIndices]);

  // Measure header cell widths and compute left/right offsets for sticky columns
  useLayoutEffect(() => {
    if (!theadRef.current) return;

    const ths = theadRef.current.querySelectorAll('th');

    // Capture column widths for minimap
    const widths: number[] = [];
    ths.forEach((th) => widths.push(th.offsetWidth));
    setColWidths(widths);

    if (leftIndices.size === 0 && rightIndices.size === 0) {
      setStickyLefts(new Map());
      setStickyRights(new Map());
      return;
    }

    // Compute left offsets (cumulate left to right)
    const lefts = new Map<number, number>();
    let cumLeft = 0;
    for (let i = 0; i < visibleColumns.length; i++) {
      if (leftIndices.has(i)) {
        lefts.set(i, cumLeft);
        cumLeft += ths[i]?.offsetWidth ?? 0;
      }
    }

    // Compute right offsets (cumulate right to left)
    const rights = new Map<number, number>();
    let cumRight = 0;
    for (let i = visibleColumns.length - 1; i >= 0; i--) {
      if (rightIndices.has(i)) {
        rights.set(i, cumRight);
        cumRight += ths[i]?.offsetWidth ?? 0;
      }
    }

    setStickyLefts(lefts);
    setStickyRights(rights);
    stickyLeftWidthRef.current = cumLeft;

    // Measure Tags column width for minimap coordinate mapping
    const tagsIdx = visibleColumns.findIndex((col) => col.type === 'tags');
    tagsColWidthRef.current = tagsIdx !== -1 ? (ths[tagsIdx]?.offsetWidth ?? 0) : 0;
  }, [visibleColumns, leftIndices, rightIndices, data]);

  // --- Minimap scroll tracking (via refs, no re-renders) ---

  const updateViewportIndicator = useCallback(() => {
    const { scrollLeft, clientWidth, scrollWidth } = scrollInfoRef.current;
    const el = viewportIndicatorRef.current;
    if (!el || scrollWidth <= 0) return;

    // Minimap excludes Tags column — map to non-Tags coordinate space
    const tagsW = tagsColWidthRef.current;
    const nonTagsTotal = scrollWidth - tagsW;
    if (nonTagsTotal <= 0) return;

    const vpLeft = (scrollLeft / nonTagsTotal) * 100;
    const vpWidth = ((clientWidth - tagsW) / nonTagsTotal) * 100;
    el.style.left = `${vpLeft}%`;
    el.style.width = `${vpWidth}%`;

    const bar = minimapBarRef.current;
    if (!bar) return;
    const barWidth = bar.offsetWidth;
    if (barWidth <= 0) return;

    const vpEnd = vpLeft + vpWidth;
    const children = bar.children;
    for (let i = 0; i < children.length - 1; i++) {
      const child = children[i] as HTMLElement;
      const blockStart = (child.offsetLeft / barWidth) * 100;
      const blockEnd = ((child.offsetLeft + child.offsetWidth) / barWidth) * 100;
      const inView = blockStart < vpEnd && blockEnd > vpLeft;
      child.style.opacity = inView ? '1' : '0.4';
      const span = child.querySelector('span');
      if (span) {
        span.style.fontWeight = inView ? '700' : '300';
        span.style.fontSize = inView ? '10px' : '9px';
        if (inView) {
          span.classList.remove('text-slate-600');
        } else {
          span.classList.add('text-slate-600');
        }
      }
    }
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const update = () => {
      scrollInfoRef.current = {
        scrollLeft: el.scrollLeft,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      };
      setHasOverflow(el.scrollWidth > el.clientWidth + 10);
      updateViewportIndicator();
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [visibleColumns, data, updateViewportIndicator]);

  // External "scroll to a specific attribute column" trigger. The rule
  // builder lives above the table; the Attribute Editor's "View Attr Column"
  // button dispatches `tep:view-attr-column` with the attribute name as the
  // event detail. We locate the matching `<th data-column-key="attr:<name>">`
  // via the live DOM (not React state) so the lookup stays correct across
  // column re-orderings the operator may have applied. The container's
  // `scrollIntoView({ block: 'start' })` pulls the table into the page
  // viewport (the page is what scrolls vertically here, not the table),
  // then `el.scrollTo({ left })` puts the targeted column horizontally
  // visible. While scrolling, every `<th>` + `<td>` at the matched
  // colIndex gets a flash class — much easier to spot than a single
  // highlighted header once the operator's eye lands on the table.
  // The DOM-walk approach sidesteps the need to thread a "flashing column
  // key" through every td branch in the cell renderer (debit/credit, tags,
  // attribute, data, sticky variants).
  useEffect(() => {
    function onViewAttrColumn(e: Event) {
      const detail = (e as CustomEvent<{ attributeName?: string }>).detail;
      const name = detail?.attributeName;
      if (!name) return;
      const container = scrollContainerRef.current;
      if (!container) return;
      const th = container.querySelector<HTMLElement>(
        `th[data-column-key="attr:${CSS.escape(name)}"]`,
      );
      if (!th) return;
      const headerRow = th.parentElement;
      const colIndex = headerRow ? Array.from(headerRow.children).indexOf(th) : -1;
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Defer the horizontal scroll so the vertical scroll above has time to
      // settle. `scrollIntoView` on the th itself would also scroll the page
      // vertically again (overscrolling past the header), so compute the
      // target left manually using the th's offset within the scroll
      // container.
      const headerSticky = stickyLeftWidthRef.current;
      const targetLeft = th.offsetLeft - headerSticky - 16;
      requestAnimationFrame(() => {
        container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
        // Collect every cell in the matched column position across both the
        // header row and every body row, then drop the flash class after
        // the timeout. Querying by nth-child(colIndex+1) on tr children
        // catches the header th AND every body td in one selector — keeps
        // the cleanup loop trivial. nth-child is 1-based.
        if (colIndex < 0) return;
        const cells = container.querySelectorAll<HTMLElement>(
          `tr > :nth-child(${colIndex + 1})`,
        );
        const FLASH = ['tep-col-flash'];
        cells.forEach((cell) => cell.classList.add(...FLASH));
        window.setTimeout(() => {
          cells.forEach((cell) => cell.classList.remove(...FLASH));
        }, 1800);
      });
    }
    window.addEventListener('tep:view-attr-column', onViewAttrColumn);
    return () => window.removeEventListener('tep:view-attr-column', onViewAttrColumn);
  }, []);

  // Per-column accent colors for minimap ↔ header visual link
  const columnAccentColors = useMemo(() => {
    const total = visibleColumns.length;
    return new Map(visibleColumns.map((col, i) => [col.key, getColumnAccentColor(i, total, accentHue)]));
  }, [visibleColumns, accentHue]);

  // Minimap: proportional block widths (excludes always-visible Tags column)
  const minimapBlocks = useMemo(() => {
    let total = 0;
    for (let i = 0; i < visibleColumns.length; i++) {
      if (visibleColumns[i].type === 'tags') continue;
      total += colWidths[i] ?? 0;
    }
    if (total === 0) return [];
    const blocks: { col: typeof visibleColumns[0]; widthPct: number; origIdx: number }[] = [];
    for (let i = 0; i < visibleColumns.length; i++) {
      if (visibleColumns[i].type === 'tags') continue;
      blocks.push({ col: visibleColumns[i], widthPct: ((colWidths[i] ?? 0) / total) * 100, origIdx: i });
    }
    return blocks;
  }, [visibleColumns, colWidths]);

  // Minimap: click/drag to scroll
  const scrollToMinimapX = useCallback((clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const { scrollWidth, clientWidth } = scrollInfoRef.current;
    const tagsW = tagsColWidthRef.current;
    const nonTagsTotal = scrollWidth - tagsW;
    const target = ratio * nonTagsTotal - (clientWidth - tagsW) / 2;
    scrollContainerRef.current?.scrollTo({ left: Math.max(0, target) });
  }, []);

  const getColumnAtMinimapX = useCallback((clientX: number, rect: DOMRect): number => {
    if (minimapBlocks.length === 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let cum = 0;
    for (const block of minimapBlocks) {
      cum += block.widthPct;
      if (cum >= ratio * 100) return block.origIdx;
    }
    return minimapBlocks[minimapBlocks.length - 1].origIdx;
  }, [minimapBlocks]);

  const flashColumnHeader = useCallback((colIdx: number) => {
    if (!theadRef.current) return;
    const th = theadRef.current.querySelectorAll('th')[colIdx] as HTMLElement | undefined;
    if (!th) return;
    th.style.transition = 'background-color 0.1s ease-in';
    th.style.backgroundColor = 'rgb(253 224 71)';
    setTimeout(() => {
      th.style.transition = 'background-color 0.8s ease-out';
      th.style.backgroundColor = '';
    }, 150);
  }, []);

  const handleMinimapPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    scrollToMinimapX(e.clientX, rect);
    const colIdx = getColumnAtMinimapX(e.clientX, rect);
    flashColumnHeader(colIdx);
  }, [scrollToMinimapX, getColumnAtMinimapX, flashColumnHeader]);

  const handleMinimapPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return;
    scrollToMinimapX(e.clientX, e.currentTarget.getBoundingClientRect());
  }, [scrollToMinimapX]);

  // --- end minimap ---

  // Build a human description of an attribute's extraction rule. Prefers the
  // RegexDetails[].Description saved on the attribute (which includes optional
  // modifiers like occurrence/numChars/toStr), falling back to a reverse-parse
  // of the regex when that's absent.
  const ruleDescription = (attr: TagAttribute): string => {
    // Constant-mode attribute: there's no extraction expression to describe.
    if (attr.Constant != null) {
      return `= "${attr.Constant}" (constant)`;
    }
    const expr = attr.AttributeRuleExpression;
    if (!expr) return '';
    const stored = expr.RegexDetails?.find((d) => d.LanguageCode === 'en')?.Description;
    if (stored) return stored;
    const decomposed = decomposeExtractionRegex(expr.Regex);
    switch (decomposed.operation) {
      case 'extract_between':
        return `Extract between '${decomposed.prefix ?? ''}' and '${decomposed.suffix ?? ''}'`;
      case 'extract_after':
        return `Extract after '${decomposed.prefix ?? ''}'`;
      case 'extract_before':
        return `Extract before '${decomposed.suffix ?? ''}'`;
      case 'extract_skip_take': {
        const n = decomposed.fromPosition ?? 0;
        const take = decomposed.tillEndOfInput || !decomposed.numChars
          ? 'everything till end of input'
          : `${decomposed.numChars} character${decomposed.numChars === 1 ? '' : 's'}`;
        return `Skip ${n} character${n === 1 ? '' : 's'}, then take ${take}`;
      }
      case 'extract_matching':
      default:
        return `Extract matching '${decomposed.pattern || expr.Regex}'`;
    }
  };

  // Normalize a regex string to the form the wizard's form round-trip
  // produces. The form loads a saved regex via decomposeExtractionRegex (which
  // keeps only operation + prefix/suffix/pattern) and re-emits it via
  // regexifyExtraction. That round-trip isn't byte-identical — e.g. a raw
  // leading `^` in the saved regex gets escaped to `\^`. To decide whether
  // the user actually edited an attribute, compare both sides through this
  // same pipeline so cosmetic round-trip differences don't register as edits.
  const normalizeRegex = (regex: string): string => {
    const decomposed = decomposeExtractionRegex(regex);
    return regexifyExtraction(decomposed.operation, decomposed);
  };

  // Compare two attribute rules for semantic equality — source field,
  // normalized regex, and transformation pipeline. For constant-mode
  // attributes (no regex/source/transformations), compare the literal value.
  // Local helper: compare two same-side transformation lists element-by-
  // element. Pulled out so the pre and post lists go through the SAME
  // shape check — adding only one of them would leave the diff blind to
  // pre-extraction-only edits (and the "saved-vs-draft" tooltip would
  // claim the attribute is unchanged when its runtime output now differs).
  const transformationsEqual = (
    ta: TagAttribute['Transformations'],
    tb: TagAttribute['Transformations'],
  ): boolean => {
    const la = ta ?? [];
    const lb = tb ?? [];
    if (la.length !== lb.length) return false;
    for (let i = 0; i < la.length; i++) {
      if (la[i].Method !== lb[i].Method) return false;
      const aa = la[i].Args ?? [];
      const bb = lb[i].Args ?? [];
      if (aa.length !== bb.length) return false;
      for (let j = 0; j < aa.length; j++) {
        if (aa[j].Key !== bb[j].Key || aa[j].Value !== bb[j].Value) return false;
      }
    }
    return true;
  };
  const attrRulesEqual = (a: TagAttribute, b: TagAttribute): boolean => {
    const aIsConstant = a.Constant != null;
    const bIsConstant = b.Constant != null;
    if (aIsConstant !== bIsConstant) return false; // mode change
    if (aIsConstant && bIsConstant) return a.Constant === b.Constant;
    // Both extraction-mode beyond here.
    const aExpr = a.AttributeRuleExpression;
    const bExpr = b.AttributeRuleExpression;
    if (!aExpr || !bExpr) return aExpr === bExpr;
    if (aExpr.SourceField !== bExpr.SourceField) return false;
    if (normalizeRegex(aExpr.Regex) !== normalizeRegex(bExpr.Regex)) return false;
    if (!transformationsEqual(a.PreExtractionTransformations, b.PreExtractionTransformations)) return false;
    if (!transformationsEqual(a.Transformations, b.Transformations)) return false;
    return true;
  };

  // Returns true when this attribute's rule is currently being edited in the
  // rule builder AND the draft rule differs from the saved one. Used to
  // suppress the server-side fallback in getAttributeValue — otherwise a
  // non-matching draft would show the old (saved) value, giving a false
  // impression that the draft still works.
  const isAttributeBeingEdited = (item: AnalyzedTransaction, attrName: string): boolean => {
    if (!originalEditingDef) return false;
    for (const def of item.analysis.matchedDefinitions) {
      if (def.Id !== originalEditingDef.Id) continue;
      const currentAttr = def.Attributes.find((a) => a.AttributeTag === attrName);
      const originalAttr = originalEditingDef.Attributes.find((a) => a.AttributeTag === attrName);
      if (currentAttr && originalAttr && !attrRulesEqual(originalAttr, currentAttr)) return true;
    }
    return false;
  };

  const getAttributeValue = (item: AnalyzedTransaction, attrName: string): string | null => {
    const row = item.row as unknown as Record<string, unknown>;
    const scan = (list: unknown): string | null => {
      if (!Array.isArray(list)) return null;
      for (const entry of list) {
        if (entry && typeof entry === 'object') {
          const e = entry as { Key?: unknown; Value?: unknown };
          if (e.Key === attrName && e.Value != null && e.Value !== '') {
            return String(e.Value);
          }
        }
      }
      return null;
    };

    // ─── Scoped lookup ─────────────────────────────────────────────────────
    // When the table is scoped to a specific definition (tag-click drill-down
    // or active edit), only that definition's data is relevant. Falling
    // through to other matched defs would surface another tag's extracted
    // values for multi-tagged rows, which is wrong.
    if (activeDefinitionId) {
      // 1) Client-computed value — but only if it actually extracted
      // something. A null here just means the client regex didn't match this
      // row's source field; the server may still have the value in
      // OpsAttributes / OpsMultiTags, so fall through rather than returning.
      const tagAttrs = item.analysis.attributes[activeDefinitionId];
      if (tagAttrs && attrName in tagAttrs && tagAttrs[attrName] !== null) {
        return tagAttrs[attrName];
      }
      if (isAttributeBeingEdited(item, attrName)) return null;
      // 2) Server-provided fallback — only the active def's entry counts.
      const multi = row.OpsMultiTags;
      if (Array.isArray(multi)) {
        for (const mt of multi) {
          if (mt && typeof mt === 'object') {
            const m = mt as { TagSpecDefinitionId?: unknown; Attributes?: unknown };
            if (m.TagSpecDefinitionId === activeDefinitionId) {
              const v = scan(m.Attributes);
              if (v !== null) return v;
              break;
            }
          }
        }
      }
      // OpsAttributes belongs to row.OpsTagSpecDefinitionId — only use it if
      // the row's primary tag is the active def.
      if (row.OpsTagSpecDefinitionId === activeDefinitionId) {
        return scan(row.OpsAttributes);
      }
      return null;
    }

    // ─── Unscoped lookup (whole table view) ───────────────────────────────
    // 1) Client-computed value (reflects live rule-builder drafts/edits).
    // Iterate in tagDefinitions order (which puts the rule-builder draft / temp
    // definition FIRST) so a draft attribute with a post-extraction
    // transformation overrides the same attribute name in other matched saved
    // defs that don't carry that transformation.
    for (const def of tagDefinitions) {
      const tagAttrs = item.analysis.attributes[def.Id];
      if (tagAttrs && attrName in tagAttrs && tagAttrs[attrName] !== null) {
        return tagAttrs[attrName];
      }
    }
    // Fallback for any matched defs not present in tagDefinitions (defensive).
    for (const tagAttrs of Object.values(item.analysis.attributes)) {
      if (attrName in tagAttrs && tagAttrs[attrName] !== null) {
        return tagAttrs[attrName];
      }
    }
    if (isAttributeBeingEdited(item, attrName)) return null;
    // 2) Server-provided fallback — the API response carries pre-computed values
    // in OpsAttributes (single-tag rows) or OpsMultiTags[*].Attributes (multi-tag
    // rows). Use them when the client couldn't extract (e.g. regex has no capture
    // group, or the source field on this row is empty).
    const primary = scan(row.OpsAttributes);
    if (primary !== null) return primary;
    const multi = row.OpsMultiTags;
    if (Array.isArray(multi)) {
      for (const mt of multi) {
        if (mt && typeof mt === 'object') {
          const v = scan((mt as { Attributes?: unknown }).Attributes);
          if (v !== null) return v;
        }
      }
    }
    return null;
  };

  // Pulls the server-computed `IsValid` flag for an attribute out of the
  // GetMT940Transactions response (OpsAttributes for single-tag rows,
  // OpsMultiTags[*].Attributes for multi-tag rows). Returns `null` when the
  // server didn't include the attribute on this row — the caller falls back
  // to client-side ValidationClass regex testing in that case (wizard
  // preview, sample mode, etc.). Scoping rules mirror getAttributeValue so
  // a drill-down view doesn't pick up the wrong tag's validation flag.
  const getAttributeIsValid = (item: AnalyzedTransaction, attrName: string): boolean | null => {
    const row = item.row as unknown as Record<string, unknown>;
    const scan = (list: unknown): boolean | null => {
      if (!Array.isArray(list)) return null;
      for (const entry of list) {
        if (entry && typeof entry === 'object') {
          const e = entry as { Key?: unknown; IsValid?: unknown };
          if (e.Key === attrName && typeof e.IsValid === 'boolean') {
            return e.IsValid;
          }
        }
      }
      return null;
    };

    if (activeDefinitionId) {
      const multi = row.OpsMultiTags;
      if (Array.isArray(multi)) {
        for (const mt of multi) {
          if (mt && typeof mt === 'object') {
            const m = mt as { TagSpecDefinitionId?: unknown; Attributes?: unknown };
            if (m.TagSpecDefinitionId === activeDefinitionId) {
              const v = scan(m.Attributes);
              if (v !== null) return v;
              break;
            }
          }
        }
      }
      if (row.OpsTagSpecDefinitionId === activeDefinitionId) {
        return scan(row.OpsAttributes);
      }
      return null;
    }

    const primary = scan(row.OpsAttributes);
    if (primary !== null) return primary;
    const multi = row.OpsMultiTags;
    if (Array.isArray(multi)) {
      for (const mt of multi) {
        if (mt && typeof mt === 'object') {
          const v = scan((mt as { Attributes?: unknown }).Attributes);
          if (v !== null) return v;
        }
      }
    }
    return null;
  };

  // Render a string with the differing slice wrapped in <mark>, using the
  // shared highlight style from highlightText above.
  const renderDiffed = (value: string, otherValue: string, side: 'old' | 'new'): ReactNode => {
    const diff = diffStrings(side === 'old' ? value : otherValue, side === 'old' ? otherValue : value);
    const middle = side === 'old' ? diff.oldMiddle : diff.newMiddle;
    if (!middle && diff.head === value) return value;
    return (
      <>
        {diff.head}
        {middle && (
          <mark className="bg-primary/20 dark:bg-primary/40 rounded-sm text-heading dark:text-primary-light font-medium px-0.5 ring-1 ring-primary/40 dark:ring-primary/70">
            {middle}
          </mark>
        )}
        {diff.tail}
      </>
    );
  };

  // Get tooltip for an attribute cell. Returns a ReactNode so we can render
  // the Before/After diff when the rule builder is editing an existing def
  // and this attribute's rule has actually changed.
  const getAttributeTooltip = (item: AnalyzedTransaction, attrName: string): ReactNode | null => {
    for (const def of item.analysis.matchedDefinitions) {
      const currentAttr = def.Attributes.find((a) => a.AttributeTag === attrName);
      if (!currentAttr) continue;

      // Constant mode has no source field — show a flat "Constant = …" line.
      // The before/after diff path below is meaningless for a literal value,
      // so short-circuit even when we're editing the source definition.
      if (currentAttr.Constant != null) {
        return `Constant = "${currentAttr.Constant}"`;
      }
      if (!currentAttr.AttributeRuleExpression) continue;
      const currentSource = humanizeFieldName(currentAttr.AttributeRuleExpression.SourceField);
      const currentRule = ruleDescription(currentAttr);

      const isEditingThisDef = originalEditingDef && def.Id === originalEditingDef.Id;
      const originalAttr = isEditingThisDef
        ? originalEditingDef.Attributes.find((a) => a.AttributeTag === attrName)
        : undefined;
      const shouldDiff = originalAttr && !attrRulesEqual(originalAttr, currentAttr);

      if (!shouldDiff) {
        return `Extracted from ${currentSource} — ${currentRule}`;
      }

      const oldValueRaw = extractAttributes([originalAttr], item.row)[originalAttr.AttributeTag];
      const newValueRaw = extractAttributes([currentAttr], item.row)[currentAttr.AttributeTag];
      const oldValue = oldValueRaw ?? '';
      const newValue = newValueRaw ?? '';

      return (
        <div className="text-xs leading-snug space-y-1.5 py-0.5">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-faint font-semibold">Before</div>
            <div className="font-mono text-primary-dark">
              {oldValueRaw === null ? <span className="text-faint italic">no match</span> : <>"{renderDiffed(oldValue, newValue, 'old')}"</>}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-primary font-semibold">After</div>
            <div className="font-mono text-primary-dark">
              {newValueRaw === null ? <span className="text-faint italic">no match</span> : <>"{renderDiffed(newValue, oldValue, 'new')}"</>}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Get the source field for an attribute cell based on the tag that produced
  // it for this row. Constants have no source field (the value is the value);
  // returning null keeps the row's source-field hover-highlight inert.
  const getAttributeSourceField = (item: AnalyzedTransaction, attrName: string): string | null => {
    for (const def of item.analysis.matchedDefinitions) {
      const attr = def.Attributes.find((a) => a.AttributeTag === attrName);
      if (!attr) continue;
      if (attr.Constant != null || !attr.AttributeRuleExpression) return null;
      return attr.AttributeRuleExpression.SourceField;
    }
    return null;
  };

  // True when ANY matched definition produces this attribute as a constant for
  // this row. Used by the cell renderer to suppress the validation tick/cross
  // — constants have no regex and no source field, so the "valid against the
  // attrValidationMap regex" mental model doesn't apply even if another rule
  // on the page registers validation for the same attribute name.
  const isAttributeFromConstant = (item: AnalyzedTransaction, attrName: string): boolean => {
    for (const def of item.analysis.matchedDefinitions) {
      const attr = def.Attributes.find((a) => a.AttributeTag === attrName);
      if (attr && attr.Constant != null) return true;
    }
    return false;
  };

  // Track which source field cell to highlight: { rowIndex, fieldName }
  const [highlightSource, setHighlightSource] = useState<{ rowIdx: number; field: string; attrKey: string } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const renderCellContent = (field: string, value: string | number | boolean | null) => {
    if (value == null) return <span className="text-faint">-</span>;
    // Dates come back as ISO strings — strip the time portion for display.
    const raw = String(value);
    const text = DATE_FIELDS.has(field) ? raw.split('T')[0] : raw;
    const regexes = [
      ...(highlightMap?.get(field) ?? []),
      ...(searchHighlightMap?.get(field) ?? []),
    ];
    if (regexes.length > 0) return highlightText(text, regexes);
    return text;
  };

  const getCellStyle = (colIdx: number, isHeader: boolean): React.CSSProperties => {
    const isStickyLeft = stickyLefts.has(colIdx);
    const isStickyRight = stickyRights.has(colIdx);
    const isStickyCol = isStickyLeft || isStickyRight;
    if (!isStickyCol && !isHeader) return {};

    const style: React.CSSProperties = { position: 'sticky' };

    if (isHeader) {
      style.top = 0;
      style.zIndex = isStickyCol ? 30 : 10;
    }

    if (isStickyLeft) {
      style.left = stickyLefts.get(colIdx)!;
      if (!isHeader) style.zIndex = 20;
    } else if (isStickyRight) {
      style.right = stickyRights.get(colIdx)!;
      if (!isHeader) style.zIndex = 20;
    }

    return style;
  };

  const stickyEdgeShadow = (colIdx: number): ReactNode => {
    if (colIdx === lastLeftIdx) {
      return (
        <div
          style={{
            position: 'absolute', top: 0, bottom: 0, left: '100%', width: 6,
            background: 'linear-gradient(to right, rgba(0,0,0,0.08), transparent)',
            pointerEvents: 'none',
          }}
        />
      );
    }
    if (colIdx === firstRightIdx) {
      return (
        <div
          style={{
            position: 'absolute', top: 0, bottom: 0, right: '100%', width: 6,
            background: 'linear-gradient(to left, rgba(0,0,0,0.08), transparent)',
            pointerEvents: 'none',
          }}
        />
      );
    }
    return null;
  };

  const cellPy = relaxedMode ? 'py-1' : 'py-2';

  const hasSelection = selectedIds.size > 0;

  // --- Column Search spotlight (press "/") ---
  const [columnSearchOpen, setColumnSearchOpen] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  const columnSearchRef = useRef<HTMLInputElement>(null);

  const columnSearchResults = useMemo(() => {
    if (!columnSearchQuery.trim()) return visibleColumns.map((col, i) => ({ col, idx: i }));
    const q = columnSearchQuery.toLowerCase();
    return visibleColumns
      .map((col, i) => ({ col, idx: i }))
      .filter(({ col }) => getColumnLabel(col).toLowerCase().includes(q));
  }, [columnSearchQuery, visibleColumns]);

  const [columnSearchSelected, setColumnSearchSelected] = useState(0);

  const scrollToColumn = useCallback((colIdx: number) => {
    if (!theadRef.current || !scrollContainerRef.current) return;
    const th = theadRef.current.querySelectorAll('th')[colIdx] as HTMLElement | undefined;
    if (!th) return;
    const container = scrollContainerRef.current;
    const thLeft = th.offsetLeft;
    const thWidth = th.offsetWidth;
    const containerWidth = container.clientWidth;
    const target = thLeft - containerWidth / 2 + thWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    flashColumnHeader(colIdx);
  }, [flashColumnHeader]);

  const handleColumnSearchSubmit = useCallback(() => {
    if (columnSearchResults.length === 0) return;
    const selected = columnSearchResults[Math.min(columnSearchSelected, columnSearchResults.length - 1)];
    scrollToColumn(selected.idx);
    setColumnSearchOpen(false);
    setColumnSearchQuery('');
    setColumnSearchSelected(0);
  }, [columnSearchResults, columnSearchSelected, scrollToColumn]);

  const columnSearchListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Esc closes spotlight from anywhere
      if (e.key === 'Escape' && columnSearchOpen) {
        setColumnSearchOpen(false);
        setColumnSearchQuery('');
        return;
      }
      // Don't trigger "/" if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '/') {
        e.preventDefault();
        setColumnSearchOpen(true);
        setColumnSearchQuery('');
        setColumnSearchSelected(0);
        setTimeout(() => columnSearchRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [columnSearchOpen]);

  // Approximate rendered height of the selection action bar (`px-4 py-2`
  // around text-xs buttons + border). When it's visible we add this to both
  // the container's floor and its ceiling so the body keeps its row budget
  // instead of getting squeezed into a scroll region.
  const ACTION_BAR_H = 40;
  const actionBarOffset = hasSelection && onFlagDeadEnd ? ACTION_BAR_H : 0;

  // Row virtualization. Without it, a Show-all on 44k rows mounts 44k
  // `<tr>` nodes (each with ~10-20 `<td>`s and their own analyzed
  // tag/attribute children) into the DOM and the browser crashes
  // outright. `useVirtualizer` only mounts the rows whose virtual
  // window intersects the viewport plus a small overscan buffer; the
  // scroll position is held by leading / trailing spacer `<tr>`s
  // sized to the rows that aren't mounted, so the scrollbar still
  // represents the full dataset and clicking the scrollbar mid-track
  // works exactly like before.
  //
  // `estimateSize` reflects the compact row height (`30.4px` matches
  // the skeleton rows). Rows with multi-line content (long
  // descriptions, multi-tag pills) get re-measured via the
  // ResizeObserver tanstack-virtual wires up internally, so the
  // virtual window stays accurate even when individual rows are
  // taller than the estimate.
  //
  // `overscan` stays modest (12 rows on each side). Trial showed that
  // bumping it higher (40) actually makes scroll feel laggier even
  // though more rows are buffered: per-re-render mount cost scales
  // with how many rows are mounted, and each row mounts ~14 Tooltips
  // (CLAUDE.md gotcha #14) plus other heavy cell content. The real
  // fix to "blank viewport during fast scroll" is making per-row
  // mount cheaper or memoizing the row component so unchanged rows
  // skip re-rendering on scroll-triggered updates — see the
  // architectural debt entries in docs/code-review.md. This modest
  // bump from the previous 8 just gives a little more headroom.
  //
  // The horizontal scroll lives on the SAME container; tanstack-
  // virtual only manages vertical, so sticky headers / sticky
  // columns / horizontal scroll all keep working untouched.
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 30.4,
    overscan: 12,
    // Stable per-row key so React can match measured heights across
    // re-renders when the underlying data shifts (filter change,
    // hide / unhide, +N append, etc.).
    getItemKey: (index) => getRowId(data[index].row),
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  // Mirror tanstack-virtual's `isScrolling` into the global scrolling
  // signal so Tooltip (and any future subscribers) can short-circuit
  // their heavy hook initialization while the table is in motion.
  // tanstack-virtual already debounces this flag — true on scroll
  // start, back to false ~150ms after the last scroll event — so the
  // signal flips at most twice per scroll gesture.
  //
  // Cleanup ensures we don't leave the global signal stuck true if
  // the table unmounts mid-scroll (e.g. tab change while the wheel
  // is still spinning).
  useEffect(() => {
    setScrolling(rowVirtualizer.isScrolling);
  }, [rowVirtualizer.isScrolling]);
  useEffect(() => {
    return () => setScrolling(false);
  }, []);
  // Total scroll height the table needs to feel like 44k rows are
  // there; the leading spacer `<tr>` consumes everything above the
  // first mounted row, the trailing spacer fills the rest.
  const totalVirtualHeight = rowVirtualizer.getTotalSize();
  const firstVirtual = virtualRows[0];
  const lastVirtual = virtualRows[virtualRows.length - 1];
  const paddingTop = firstVirtual ? firstVirtual.start : 0;
  const paddingBottom = lastVirtual ? Math.max(0, totalVirtualHeight - lastVirtual.end) : 0;

  return (
    <div
      className="rounded-lg border border-border flex flex-col relative"
      style={{
        maxHeight: `calc(100vh - 17.3rem${builderHeight > 0 ? ` - ${builderHeight + 25}px` : ''}${actionBarOffset ? ` + ${actionBarOffset}px` : ''})`,
        // Scale the minimum with row count so a one-row result doesn't trail
        // empty whitespace, while many-row sets still get a tall floor that
        // the maxHeight above will then clamp. Empty-data case (loading
        // skeleton) keeps the full 300px. Per-row estimate matches typical
        // compact-mode row heights; relaxed mode just yields a slightly
        // larger card, no regression.
        minHeight: data.length === 0
          ? '300px'
          : `${Math.min(300, 60 + data.length * 36) + actionBarOffset}px`,
      }}
    >
      {/* Column Search spotlight */}
      {columnSearchOpen && (
        <div className="absolute inset-0 z-50 flex items-start justify-center pt-4" onClick={() => { setColumnSearchOpen(false); setColumnSearchQuery(''); }}>
          <div className="absolute inset-0 bg-black/10 dark:bg-black/30 rounded-lg" />
          <div className="relative bg-surface-elevated rounded-xl shadow-2xl w-full max-w-md border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={columnSearchRef}
                type="text"
                placeholder="Column Search"
                value={columnSearchQuery}
                onChange={(e) => { setColumnSearchQuery(e.target.value); setColumnSearchSelected(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setColumnSearchOpen(false); setColumnSearchQuery(''); }
                  else if (e.key === 'Enter') { e.preventDefault(); handleColumnSearchSubmit(); }
                  else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setColumnSearchSelected((p) => {
                      const next = Math.min(p + 1, columnSearchResults.length - 1);
                      setTimeout(() => columnSearchListRef.current?.children[next]?.scrollIntoView({ block: 'nearest' }), 0);
                      return next;
                    });
                  }
                  else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setColumnSearchSelected((p) => {
                      const next = Math.max(p - 1, 0);
                      setTimeout(() => columnSearchListRef.current?.children[next]?.scrollIntoView({ block: 'nearest' }), 0);
                      return next;
                    });
                  }
                }}
                className="flex-1 text-sm bg-transparent text-heading placeholder:text-faint outline-none"
                autoFocus
              />
              <kbd className="text-[10px] text-faint bg-surface border border-border-strong rounded px-1.5 py-0.5 font-mono">/</kbd>
            </div>
            <div ref={columnSearchListRef} className="max-h-48 overflow-y-auto custom-scrollbar">
              {columnSearchResults.length === 0 ? (
                <div className="px-4 py-3 text-xs text-faint text-center">No matching columns</div>
              ) : (
                columnSearchResults.map(({ col, idx }, i) => (
                  <button
                    key={col.key}
                    className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 transition-colors ${i === columnSearchSelected ? 'bg-primary/10 text-primary-dark' : 'text-body hover:bg-surface-hover'}`}
                    onMouseEnter={() => setColumnSearchSelected(i)}
                    onClick={() => { scrollToColumn(idx); setColumnSearchOpen(false); setColumnSearchQuery(''); setColumnSearchSelected(0); }}
                  >
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0" style={{ backgroundColor: columnAccentColors.get(col.key), color: 'white' }}>
                      {getColumnInitials(col).slice(0, 2)}
                    </span>
                    <span className="truncate">{getColumnLabel(col)}</span>
                    {i === columnSearchSelected && (
                      <span className="ml-auto text-[10px] text-faint">Enter to jump</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Selection action bar */}
      {hasSelection && onFlagDeadEnd && (() => {
        const allDeadEnd = [...selectedIds].every((id) => {
          const item = data.find((d) => getRowId(d.row) === id);
          return item?.row['IsDeadEnd'] === true;
        });
        const noneDeadEnd = [...selectedIds].every((id) => {
          const item = data.find((d) => getRowId(d.row) === id);
          return item?.row['IsDeadEnd'] !== true;
        });
        // Dead-end means "can't be tagged today" — flagging a row that
        // already has detected tag specs contradicts that, and unflagging
        // one is just as nonsensical (the operator should hide the tag,
        // not toggle dead-end state). Block both buttons whenever any
        // selected row carries at least one tag.
        const anySelectedTagged = [...selectedIds].some((id) => {
          const item = data.find((d) => getRowId(d.row) === id);
          return item ? item.analysis.tags.length > 0 : false;
        });
        const deadEndDisabledTip = 'Selection includes tagged transactions. Untag them first, or narrow the selection to untagged rows.';
        const flagHandler = onFlagDeadEndWithComment ? openFlagDialog : null;
        return (
          <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 shrink-0">
            <span className="text-xs font-medium text-primary-dark">
              {visibleSelectedCount} selected
            </span>
            {!allDeadEnd && (() => {
              const flagBtn = (
                <button
                  onClick={() => flagHandler ? flagHandler('flag') : handleFlagDeadEnd(true)}
                  disabled={flagLoading || anySelectedTagged}
                  className="text-xs px-2.5 py-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {flagLoading ? 'Flagging...' : 'Flag as Dead End'}
                </button>
              );
              return anySelectedTagged
                ? <Tooltip content={deadEndDisabledTip} placement="bottom">{flagBtn}</Tooltip>
                : flagBtn;
            })()}
            {!noneDeadEnd && (() => {
              const unflagBtn = (
                <button
                  onClick={() => flagHandler ? flagHandler('unflag') : handleFlagDeadEnd(false)}
                  disabled={flagLoading || anySelectedTagged}
                  className="text-xs px-2.5 py-1 rounded border border-border-strong bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {flagLoading ? 'Unflagging...' : 'Unflag Dead End'}
                </button>
              );
              return anySelectedTagged
                ? <Tooltip content={deadEndDisabledTip} placement="bottom">{unflagBtn}</Tooltip>
                : unflagBtn;
            })()}
            {onSetComments && (
              <button
                onClick={openCommentDialog}
                className="text-xs px-2.5 py-1 rounded border border-primary/40 bg-primary/5 text-primary-dark hover:bg-primary/15 transition-colors"
              >
                Add Comment
              </button>
            )}
            {onHideTagDefs && (() => {
              const label = visibleSelectedCount > 1 ? 'Hide Tag Specs' : 'Hide Tag Spec';
              const hideBtn = (
                <button
                  onClick={openHideTagDialog}
                  disabled={selectedTagDefs.length === 0}
                  className="cursor-pointer text-xs px-2.5 py-1 rounded border border-slate-300 dark:border-slate-500 bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {label}
                </button>
              );
              return selectedTagDefs.length === 0 ? (
                <Tooltip content="No tag specs on selected rows" placement="bottom">{hideBtn}</Tooltip>
              ) : hideBtn;
            })()}
            <button
              onClick={() => { setSelectedIds(new Set()); setSelectAllActive(false); }}
              className="text-xs text-muted hover:text-body ml-auto"
            >
              Clear selection
            </button>
          </div>
        );
      })()}

      <CommentDialog
        open={commentDialogState !== null}
        mode={commentDialogState?.mode ?? 'comment-only'}
        flagAction={commentDialogState?.mode === 'flag-with-comment' ? commentDialogState.flagAction : undefined}
        selectedRows={selectedRowsForDialog}
        onClose={closeCommentDialog}
        onConfirm={handleCommentDialogConfirm}
      />

      <ConfirmDialog
        open={hideTagDialog?.kind === 'confirm'}
        onClose={() => setHideTagDialog(null)}
        onConfirm={() => {
          if (hideTagDialog?.kind === 'confirm') confirmHideTags([hideTagDialog.def.defId]);
        }}
        title="Hide tag spec"
        message={
          hideTagDialog?.kind === 'confirm'
            ? `Hide all rows matched by tag spec "${hideTagDialog.def.name}"${hideTagDialog.def.version ? ` (v${hideTagDialog.def.version})` : ''}? You can restore it from the side panel above the table.`
            : ''
        }
        confirmLabel="Hide"
        variant="primary"
      />

      <Modal
        open={hideTagDialog?.kind === 'picker'}
        onClose={() => setHideTagDialog(null)}
        title="Hide tag specs"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHideTagDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (hideTagDialog?.kind === 'picker') confirmHideTags([...hideTagDialog.picked]);
              }}
              disabled={hideTagDialog?.kind === 'picker' && hideTagDialog.picked.size === 0}
            >
              Hide selected
            </Button>
          </>
        }
      >
        {hideTagDialog?.kind === 'picker' && (
          <div className="space-y-2">
            <p className="text-sm text-body-secondary">
              The selected rows are matched by more than one tag spec. Pick which tag specs to hide — every row matched by a picked spec will disappear from the view.
            </p>
            <div className="border border-border rounded-lg divide-y divide-border max-h-72 overflow-auto bg-surface">
              {hideTagDialog.defs.map((def) => {
                const checked = hideTagDialog.picked.has(def.defId);
                return (
                  <label
                    key={def.defId}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-hover text-body"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setHideTagDialog((prev) => {
                          if (!prev || prev.kind !== 'picker') return prev;
                          const next = new Set(prev.picked);
                          if (next.has(def.defId)) next.delete(def.defId); else next.add(def.defId);
                          return { ...prev, picked: next };
                        });
                      }}
                    />
                    <span className="text-sm">
                      {def.name}
                      {def.version != null && (
                        <span className="ml-1.5 text-[10px] text-faint">v{def.version}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Column Minimap */}
      {(hasOverflow || (loading && data.length === 0)) && (
        <div
          ref={minimapBarRef}
          className="sticky top-0 z-20 h-5 bg-surface border-b border-border-subtle cursor-pointer select-none flex shrink-0"
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
        >
          {loading && data.length === 0 && minimapBlocks.length === 0 ? (
            <div className="w-full h-full animate-pulse bg-gray-200/30 dark:bg-gray-700/30" />
          ) : minimapBlocks.map((block) => (
            <Tooltip key={block.col.key} content={getColumnLabel(block.col)} placement="bottom">
              <div
                className="h-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors overflow-hidden flex items-center px-px"
                style={{ width: `${block.widthPct}%`, minWidth: 35, borderRight: '1px solid white', borderBottom: `3px solid ${getMinimapBorderColor(block.col.type) ?? columnAccentColors.get(block.col.key)}` }}
              >
                <span className={`text-[9px] pl-2 leading-none font-medium whitespace-nowrap ${getMinimapColor(block.col.type)}`}>
                  {getColumnInitials(block.col)}
                </span>
              </div>
            </Tooltip>
          ))}
          <div
            ref={viewportIndicatorRef}
            className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary rounded-sm pointer-events-none"
          />
        </div>
      )}

      {/* Scrollable table */}
      <div ref={scrollContainerRef} className="overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="min-w-full divide-y divide-divide">
          <thead ref={theadRef} className="bg-surface-secondary">
            {loading && data.length === 0 && visibleColumns.length <= 1 ? (
              <tr className="animate-pulse">
                <th className={`px-3 ${cellPy} text-left bg-surface-secondary`} style={{ paddingBottom: 8 }}>
                  <div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700" />
                </th>
                {Array.from({ length: 5 }, (_, i) => (
                  <th key={i} className={`px-3 ${cellPy} text-left bg-surface-secondary`} style={{ paddingBottom: 8 }}>
                    <div className={`h-3 rounded bg-gray-200 dark:bg-gray-700`} style={{ width: `${60 + i * 15}px` }} />
                  </th>
                ))}
              </tr>
            ) : (
            <tr>
              {visibleColumns.map((col, idx) => {
                const isAttr = col.type === 'attribute';
                const isSortable = col.type === 'data' && !!onSortChange && SORTABLE_FIELD_SET.has(col.field);
                const activeSort = isSortable && sortOverride && sortOverride.field === col.field ? sortOverride.order : null;
                const ariaSort: 'ascending' | 'descending' | 'none' | undefined =
                  isSortable ? (activeSort === 'ASC' ? 'ascending' : activeSort === 'DESC' ? 'descending' : 'none') : undefined;
                const handleSortClick = () => {
                  if (!isSortable || !onSortChange) return;
                  const field = col.field as SortableField;
                  if (!sortOverride || sortOverride.field !== field) onSortChange({ field, order: 'ASC' });
                  else if (sortOverride.order === 'ASC') onSortChange({ field, order: 'DESC' });
                  else onSortChange(null);
                };
                const sortTitle = !isSortable
                  ? undefined
                  : activeSort === 'ASC'
                    ? 'Sorted A→Z. Click to sort Z→A.'
                    : activeSort === 'DESC'
                      ? 'Sorted Z→A. Click to clear sort.'
                      : 'Click to sort A→Z.';
                // Compact mode keeps the original auto-layout behavior, so
                // the resize handle is suppressed there. Persisted widths
                // are preserved on disk — switching back to non-compact
                // restores them.
                const isResizable = !!onColumnWidthChange && !relaxedMode;
                const explicitWidth = resolveColumnWidth(col.key);
                return (
                  <th
                    key={col.key}
                    data-column-key={col.key}
                    className={`relative px-3 ${cellPy} text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${isAttr ? 'text-primary-dark bg-white dark:bg-slate-800' : 'text-body-secondary bg-surface-secondary'
                      }`}
                    style={{ ...getCellStyle(idx, true), paddingBottom: 8, width: explicitWidth, minWidth: explicitWidth, maxWidth: explicitWidth, boxShadow: hasOverflow ? `inset 0 -3px 0 ${columnAccentColors.get(col.key)}` : undefined }}
                    aria-sort={ariaSort}
                  >
                    {col.type === 'data' && (isSortable ? (
                      <button
                        type="button"
                        onClick={handleSortClick}
                        title={sortTitle}
                        className={`group inline-flex items-center gap-1 -my-1 -ml-1 pl-1 pr-1.5 py-1 rounded hover:bg-primary/10 transition-colors ${activeSort ? 'text-primary-dark dark:text-primary-light' : 'text-body-secondary'}`}
                      >
                        <span>{humanizeFieldName(col.field)}</span>
                        <SortChevron activeOrder={activeSort} />
                      </button>
                    ) : humanizeFieldName(col.field))}
                    {col.type === 'attribute' && humanizeFieldName(col.name)}
                    {isResizable && onColumnWidthChange && (
                      <ColumnResizeHandle
                        currentWidth={explicitWidth ?? 0}
                        onChange={(next) => onColumnWidthChange(col.key, next)}
                      />
                    )}
                    {col.type === 'tags' && (
                      <div className="flex items-center gap-1.5">
                        {onFlagDeadEnd && (
                          <input
                            type="checkbox"
                            checked={allRowsSelected}
                            onChange={toggleSelectAll}
                            disabled={loading}
                            aria-label={loading ? 'Loading transactions, selection disabled' : 'Select all rows'}
                            // `pointer-events-none` here suppresses the
                            // browser's native hover/focus ring on the
                            // disabled checkbox; `disabled` alone leaves
                            // a faint hover artifact on some platforms.
                            className={`rounded border-border-strong ${loading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                          />
                        )}
                        Tags
                      </div>
                    )}
                    {col.type === 'dates' && 'Dates'}
                    {col.type === 'debit' && 'Debit Amount'}
                    {col.type === 'credit' && 'Credit Amount'}
                    {stickyEdgeShadow(idx)}
                  </th>
                );
              })}
            </tr>
            )}
          </thead>
          <tbody className="bg-surface divide-y divide-divide">
            {loading && data.length === 0 ? (
              Array.from({ length: 50 }, (_, rowIdx) => (
                <tr key={`skel-${rowIdx}`} className="animate-pulse" style={{ height: '30.4px' }}>
                  <td colSpan={visibleColumns.length <= 1 ? 6 : visibleColumns.length} className="px-3" style={{ verticalAlign: 'middle' }}>
                    <div className="flex items-center gap-4">
                      <div className="h-3.5 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-3.5 flex-2 rounded bg-gray-200/60 dark:bg-gray-700/60" />
                      <div className="h-3.5 flex-3 rounded bg-gray-200/40 dark:bg-gray-700/40" />
                    </div>
                  </td>
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="px-3 py-6 text-center text-xs text-faint"
                >
                  No transactions match the current filter.
                </td>
              </tr>
            ) : (
              <>
                {/* Leading spacer occupies the height of every row above
                    the first virtually-mounted one. Its `td` spans the
                    whole table width so the spacer doesn't disrupt the
                    column grid; height is the scroll offset to the
                    first visible row. */}
                {paddingTop > 0 && (
                  <tr aria-hidden style={{ height: `${paddingTop}px` }}>
                    <td colSpan={visibleColumns.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const i = virtualRow.index;
                  const item = data[i];
                  const rowId = getRowId(item.row);
                  const isSelected = selectedIds.has(rowId);
                  const isDeadEnd = item.row['IsDeadEnd'] === true;
                  return (
                  <tr
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className={`group transition-colors ${isDeadEnd ? 'bg-red-100/60 dark:bg-red-950/30 text-red-400 dark:text-red-500/70' : 'hover:bg-surface-hover'} ${isSelected ? 'bg-primary/10!' : ''}`}
                    onContextMenu={onRowContextMenu ? (e) => { e.preventDefault(); onRowContextMenu(item.row, e.clientX, e.clientY); } : undefined}
                  >
                    {visibleColumns.map((col, colIdx) => {
                      const isStickyCol = stickyLefts.has(colIdx) || stickyRights.has(colIdx);
                      const stickyBg = isStickyCol ? 'bg-surface group-hover:bg-surface-hover' : '';

                      switch (col.type) {
                        case 'data': {
                          const isHighlighted = highlightSource?.rowIdx === i && highlightSource.field === col.field;
                          // Comments are free-form and frequently long — clamp the cell to one
                          // ellipsised line and surface the full text via tooltip on hover so
                          // the table layout never blows out horizontally.
                          if (col.field === 'Comment') {
                            const raw = item.row[col.field];
                            const full = raw == null ? '' : String(raw);
                            return (
                              <td
                                key={col.key}
                                className={`px-3 ${cellPy} text-xs text-body-secondary max-w-[28rem] ${stickyBg} ${isHighlighted ? 'ring-1 ring-primary/30 ring-inset bg-primary/5 dark:bg-primary/10' : ''}`}
                                style={getCellStyle(colIdx, false)}
                              >
                                {full ? (
                                  <Tooltip content={<div className="max-w-md break-words whitespace-pre-wrap">{full}</div>} placement="top">
                                    <div className="truncate">
                                      {renderCellContent(col.field, raw)}
                                    </div>
                                  </Tooltip>
                                ) : (
                                  <span className="text-faint">-</span>
                                )}
                                {stickyEdgeShadow(colIdx)}
                              </td>
                            );
                          }
                          {
                            const isInteractive =
                              !!onCellDoubleClick && !!interactiveCellFields?.has(col.field);
                            const cellWidth = resolveColumnWidth(col.key);
                            const isNarrative = NARRATIVE_COLUMN_KEYS.has(col.key);
                            const rawValue = item.row[col.field];
                            // Always expose the raw value via title when the
                            // cell is at risk of clipping (narrative columns,
                            // or any column with an explicit width override).
                            // The interactive double-click hint takes priority
                            // when set so the operator still sees it.
                            const titleAttr = isInteractive
                              ? (interactiveCellHint ?? 'Double-click to use')
                              : (isNarrative || cellWidth != null) && rawValue != null
                                ? String(rawValue)
                                : undefined;
                            return (
                              <td
                                key={col.key}
                                className={`px-3 ${cellPy} text-xs text-body-secondary ${relaxedMode ? 'whitespace-nowrap' : 'align-top'} ${cellWidth != null ? 'overflow-hidden' : ''} ${stickyBg} ${isHighlighted ? 'ring-1 ring-primary/30 ring-inset bg-primary/5 dark:bg-primary/10' : ''} ${isInteractive ? 'cursor-pointer hover:ring-1 hover:ring-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10 transition-shadow select-none' : ''}`}
                                style={{ ...getCellStyle(colIdx, false), width: cellWidth, maxWidth: cellWidth }}
                                title={titleAttr}
                                onDoubleClick={
                                  onCellDoubleClick
                                    ? () => onCellDoubleClick(col.field, item.row[col.field], item.row)
                                    : undefined
                                }
                              >
                                <CellContentWrapper
                                  relaxedMode={relaxedMode}
                                  narrative={isNarrative}
                                  hasWidth={cellWidth != null}
                                >
                                  {renderCellContent(col.field, rawValue)}
                                </CellContentWrapper>
                                {stickyEdgeShadow(colIdx)}
                              </td>
                            );
                          }
                        }
                        case 'dates': {
                          const cellWidth = resolveColumnWidth(col.key);
                          return (
                            <td
                              key={col.key}
                              className={`px-3 ${cellPy} text-xs text-body-secondary ${cellWidth != null ? 'overflow-hidden' : ''} ${stickyBg}`}
                              style={{ ...getCellStyle(colIdx, false), width: cellWidth, maxWidth: cellWidth }}
                            >
                              <div className={relaxedMode ? 'flex gap-2 whitespace-nowrap' : 'flex flex-col gap-0.5'}>
                                {col.fields.map((f) => {
                                  const val = item.row[f.key];
                                  if (val == null || val === '') return null;
                                  return (
                                    <span key={f.key} className="whitespace-nowrap">
                                      <span className="text-faint">{f.label}:</span>{' '}
                                      {String(val).split('T')[0]}
                                    </span>
                                  );
                                })}
                              </div>
                              {stickyEdgeShadow(colIdx)}
                            </td>
                          );
                        }
                        case 'debit': {
                          const side = String(item.row['Side'] ?? '');
                          const isDebit = side === 'DR' || side === 'RC';
                          const isReturn = side === 'RC';
                          const amt = isDebit ? item.row['Amount'] : null;
                          const cellWidth = resolveColumnWidth(col.key);
                          return (
                            <td
                              key={col.key}
                              className={`px-3 ${cellPy} text-xs text-right font-medium whitespace-nowrap ${cellWidth != null ? 'overflow-hidden' : ''} ${amt != null ? 'text-red-600 dark:text-rose-300' : 'text-faint'} ${stickyBg} `}
                              style={{ ...getCellStyle(colIdx, false), width: cellWidth, maxWidth: cellWidth }}
                            >
                              {amt != null ? (
                                <div className="flex items-center justify-end gap-1">
                                  {isReturn && <Badge variant="amber" size="xs" className="border border-amber-200">RTN</Badge>}
                                  <span><span aria-hidden="true">&#x2212;</span><span className="icon-saudi_riyal">&#xea;</span> {(() => { const parts = Number(amt).toFixed(2).split('.'); return <>{Number(parts[0]).toLocaleString()}<sup className="text-[0.65em] relative -top-[0.55em]">.{parts[1]}</sup></>; })()}</span>
                                </div>
                              ) : '-'}
                              {stickyEdgeShadow(colIdx)}
                            </td>
                          );
                        }
                        case 'credit': {
                          const side = String(item.row['Side'] ?? '');
                          const isCredit = side === 'CR' || side === 'RD';
                          const isReturn = side === 'RD';
                          const amt = isCredit ? item.row['Amount'] : null;
                          const cellWidth = resolveColumnWidth(col.key);
                          return (
                            <td
                              key={col.key}
                              className={`px-3 ${cellPy} text-xs text-right font-medium whitespace-nowrap ${cellWidth != null ? 'overflow-hidden' : ''} ${amt != null ? 'text-emerald-500 dark:text-emerald-300' : 'text-faint'} ${stickyBg}`}
                              style={{ ...getCellStyle(colIdx, false), width: cellWidth, maxWidth: cellWidth }}
                            >
                              {amt != null ? (
                                <div className="flex items-center justify-end gap-1">
                                  {isReturn && <Badge variant="amber" size="xs" className="border border-amber-200">RTN</Badge>}
                                  <span><span className="icon-saudi_riyal">&#xea;</span> {(() => { const parts = Number(amt).toFixed(2).split('.'); return <>{Number(parts[0]).toLocaleString()}<sup className="text-[0.65em] relative -top-[0.55em]">.{parts[1]}</sup></>; })()}</span>
                                </div>
                              ) : '-'}
                              {stickyEdgeShadow(colIdx)}
                            </td>
                          );
                        }
                        case 'attribute': {
                          const attrCellWidth = resolveColumnWidth(col.key);
                          // Untagged transactions should not display any attribute value
                          if (item.analysis.tags.length === 0) {
                            return (
                              <td
                                key={col.key}
                                className={`px-3 ${cellPy} text-xs text-left ${attrCellWidth != null ? 'overflow-hidden' : ''} ${isStickyCol ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-primary/5'}`}
                                style={{ ...getCellStyle(colIdx, false), width: attrCellWidth, maxWidth: attrCellWidth }}
                              >
                                <span className="text-faint">-</span>
                                {stickyEdgeShadow(colIdx)}
                              </td>
                            );
                          }
                          const val = getAttributeValue(item, col.name);
                          const validation = attrValidationMap.get(col.name);
                          // Suppress validation chrome when this row's value is
                          // a constant: no regex, no source field, nothing to
                          // validate. Another rule with the same attribute name
                          // might still register a validator on the map, which
                          // is why this lives at the per-row level.
                          const isConstantValue = isAttributeFromConstant(item, col.name);
                          let validationIcon: ReactNode = null;
                          let validationPassed: boolean | null = null;
                          if (!isConstantValue) {
                            // Null / empty extracted values are treated as
                            // valid by contract — there is nothing to test, so
                            // no row should ever be marked invalid solely
                            // because the source field didn't yield a value.
                            // Otherwise the server's `IsValid` flag on the
                            // OpsAttributes / OpsMultiTags entry is the
                            // authoritative answer, and client-side regex
                            // testing is the fallback for surfaces that lack
                            // it (wizard preview, sample mode).
                            if (val == null || val === '') {
                              validationPassed = true;
                            } else {
                              const serverIsValid = getAttributeIsValid(item, col.name);
                              if (serverIsValid !== null) {
                                validationPassed = serverIsValid;
                              } else if (validation) {
                                if (validation.verifyValue) {
                                  validationPassed = val === validation.verifyValue;
                                } else if (validation.validateExtracted) {
                                  validationPassed = validation.regex.test(val);
                                } else {
                                  const sourceVal = String(item.row[validation.sourceField] ?? '');
                                  validationPassed = validation.regex.test(sourceVal);
                                }
                              }
                            }
                            if (validationPassed !== null) {
                              validationIcon = validationPassed
                                ? <span className="text-emerald-500 dark:text-emerald-300 mr-1" title="Valid">&#10003;</span>
                                : <span className="text-red-400 dark:text-rose-300 mr-1" title="Invalid">&#10007;</span>;
                            }
                          }
                          const rawDisplayVal = val;
                          const attrLovTag = attrLovTagMap.get(col.name);
                          const trimmedVal = rawDisplayVal?.trim();
                          const lovMap = attrLovTag ? (lovLookup.get(attrLovTag) ?? lovLookup.get(attrLovTag.replace(/[_ ]/g, '').toLowerCase())) : undefined;
                          const displayVal = lovMap && trimmedVal ? (lovMap.get(trimmedVal) ?? rawDisplayVal) : rawDisplayVal;
                          const srcField = getAttributeSourceField(item, col.name);
                          const isAttrHighlighted = highlightSource?.rowIdx === i && highlightSource.attrKey === col.key;
                          return (
                            <td
                              key={col.key}
                              className={`px-3 ${cellPy} text-xs ${relaxedMode ? 'whitespace-nowrap' : ''} ${attrCellWidth != null ? 'overflow-hidden' : ''}
                              ${validationIcon ? 'text-center' : 'text-left'}
                              ${validationPassed === true ? 'text-emerald-500 dark:text-emerald-300' : validationPassed === false ? 'text-red-400 dark:text-rose-300' : 'text-primary-dark'}
                              ${isAttrHighlighted ? 'ring-2 ring-blue-400/60 ring-inset bg-blue-50 dark:bg-blue-900/30' : isStickyCol ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-primary/5'}`}
                              style={{ ...getCellStyle(colIdx, false), width: attrCellWidth, maxWidth: attrCellWidth }}
                              onMouseEnter={() => {
                                if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                                if (srcField) {
                                  highlightTimerRef.current = setTimeout(() => setHighlightSource({ rowIdx: i, field: srcField, attrKey: col.key }), 500);
                                }
                              }}
                              onMouseLeave={() => {
                                if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                                highlightTimerRef.current = null;
                                setHighlightSource(null);
                              }}
                            >
                              <Tooltip content={getAttributeTooltip(item, col.name) ?? col.name} offsetAmount={8} placement="bottom" delay={500}>
                                <div className={`w-full h-full flex items-center ${attrCellWidth != null ? (relaxedMode ? 'truncate' : 'overflow-hidden') : ''}`}>
                                  {displayVal ? <span className={attrCellWidth != null && relaxedMode ? 'truncate' : ''}>{validationIcon}{displayVal}</span> : <span className="text-faint">-</span>}
                                </div>
                              </Tooltip>
                              {stickyEdgeShadow(colIdx)}
                            </td>
                          );
                        }
                        case 'tags': {
                          const hints = getHints(item.row);
                          const hasHints = hints.length > 0;
                          const tagsCellWidth = resolveColumnWidth(col.key);
                          return (
                            <td
                              key={col.key}
                              className={`px-3 ${cellPy} ${tagsCellWidth != null ? 'overflow-hidden' : ''} ${stickyBg}`}
                              style={{ ...getCellStyle(colIdx, false), width: tagsCellWidth, maxWidth: tagsCellWidth }}
                            >
                              <div className="flex items-center gap-1.5">
                                {onFlagDeadEnd && (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelect(rowId)}
                                    disabled={loading}
                                    aria-label={loading ? 'Loading transactions, selection disabled' : 'Select row'}
                                    className={`rounded border-border-strong shrink-0 ${loading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                                  />
                                )}
                                <div className="flex-1">
                                  {item.analysis.tags.length > 0 ? (
                                    <div className={`flex items-center gap-1 ${relaxedMode ? 'flex-nowrap' : 'flex-wrap'}`}>
                                      {isDeadEnd && (
                                        <Badge variant="none" size="sm" className="border border-red-200 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 px-2.5 shrink-0">Dead End</Badge>
                                      )}
                                      {item.analysis.tags.map((tag, ti) => {
                                        const matchedDef = item.analysis.matchedDefinitions[ti];
                                        const defId = matchedDef?.Id;
                                        const isUserCreated = defId ? !(originalDefinitionIds?.has(defId)) : false;
                                        const source = isUserCreated ? 'Frontend' : (defId ? (definitionSourceMap?.get(defId) ?? null) : null);
                                        const versionInfo = defId ? definitionVersions?.get(defId) : undefined;
                                        const badge = (
                                          <TagBadge
                                            tag={tag}
                                            // Prefer the definition the row actually matched; only
                                            // fall back to name-lookup when no matched def is
                                            // available. Two definitions can share a Tag name with
                                            // different certainty, in which case name-lookup picks
                                            // the wrong one and the badge color drifts from the
                                            // tooltip's stated level.
                                            certainty={matchedDef?.CertaintyLevelTag ?? getCertainty(tag)}
                                            isUserCreated={isUserCreated}
                                            version={versionInfo?.version}
                                            onClick={onTagClick ? () => onTagClick(tag, defId) : undefined}
                                          />
                                        );
                                        if (!source && !matchedDef) return <span key={tag}>{badge}</span>;
                                        return (
                                          <Tooltip key={tag} content={renderTagTooltip(source, matchedDef, !!onTagClick, versionInfo)} placement="top">
                                            <span>{badge}</span>
                                          </Tooltip>
                                        );
                                      })}
                                      {hasHints && <HintsInfoIcon hints={hints} />}
                                    </div>
                                  ) : isDeadEnd ? (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="none" size="sm" className="border border-red-200 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 px-2.5">Dead End</Badge>
                                      {hasHints && <HintsInfoIcon hints={hints} />}
                                    </div>
                                  ) : hasHints ? (
                                    <HintsInfoIcon hints={hints} />
                                  ) : (
                                    <span className="text-faint text-xs">-</span>
                                  )}

                                </div>
                              </div>
                              {stickyEdgeShadow(colIdx)}
                            </td>
                          );
                        }
                      }
                    })}
                  </tr>
                  );
                })}
                {/* Trailing spacer occupies the height of every row
                    below the last virtually-mounted one. Together with
                    the leading spacer this preserves the scrollbar
                    proportions so the scrollbar feels like the full
                    44k-row dataset is rendered. */}
                {paddingBottom > 0 && (
                  <tr aria-hidden style={{ height: `${paddingBottom}px` }}>
                    <td colSpan={visibleColumns.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Tag-badge hover tooltip — shows the source, certainty, and matching rules.
 * Attributes are intentionally omitted; this is a "why did this tag match?"
 * affordance, not a full definition viewer.
 *
 * Exported so the rule builder's "live matching tags" preview can reuse the
 * same tooltip the transaction table uses (consistency across surfaces).
 */
export function renderTagTooltip(
  source: string | null,
  def: TagSpecDefinition | undefined,
  clickable: boolean,
  versionInfo?: DefinitionVersionInfo,
): ReactNode {
  const groups = def?.TagRuleExpressions ?? [];
  const hasRules = groups.some((g) => g.length > 0);
  const certainty = def?.CertaintyLevelTag;
  return (
    <div className="space-y-1.5 max-w-xs">
      {(source || certainty) && (
        <div className="text-[11px]">
          {source && (
            <>
              <span className="text-faint">Source:</span>{' '}
              <span className="font-semibold">{source}</span>
            </>
          )}
          {source && certainty && <span className="text-faint"> · </span>}
          {certainty && (
            <>
              <span className="font-semibold">{certainty}</span>
              <span className="text-faint"> certainty</span>
            </>
          )}
        </div>
      )}
      {versionInfo && versionInfo.total > 1 && (
        <div className="text-[11px]">
          <span className="text-faint">Definition</span>{' '}
          <span className="font-semibold">{versionInfo.version} of {versionInfo.total}</span>
          <span className="text-faint"> for this tag in the current library</span>
        </div>
      )}
      {def && (
        <div className="space-y-0.5 pt-1.5 border-t border-border/60">
          <div className="text-[10px] uppercase tracking-wide text-faint">Rules</div>
          {hasRules ? (
            groups.map((group, gi) => (
              <div key={gi}>
                {gi > 0 && (
                  <div className="text-[9px] font-bold text-purple-500 my-0.5">OR</div>
                )}
                <div className="space-y-0.5">
                  {group.map((cond, ci) => {
                    const text =
                      getRegexDescription(cond.RegexDetails) ||
                      cond.ExpressionPrompt ||
                      engregxify(cond.Regex);
                    return (
                      <div key={ci} className="flex flex-wrap items-baseline gap-x-1.5 leading-snug">
                        {ci > 0 && (
                          <span className="text-[9px] font-bold text-amber-600">AND</span>
                        )}
                        <span className="font-mono text-[10px] font-semibold text-primary-dark">
                          {humanizeFieldName(cond.SourceField)}
                        </span>
                        <span className="text-[11px]">{text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="text-[11px] italic text-faint">
              (no conditions — matches by context only)
            </div>
          )}
        </div>
      )}
      {clickable && (
        <div className="pt-1.5 border-t border-border/60 text-[10px] text-faint italic">
          Click to view tag
        </div>
      )}
    </div>
  );
}
