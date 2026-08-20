import { memo, useMemo, useLayoutEffect, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AnalyzedTransaction, TagSpecDefinition, TagAttribute, RuleExpression, TransactionRow } from '../../types';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { PREDEFINED_PATTERNS } from '../../constants/operations';
import { TagBadge } from './TagBadge';
import { HintsInfoIcon } from './HintsInfoIcon';
import { MoreTagsPopover } from './MoreTagsPopover';
import { Badge } from '../shared/Badge';
import { Tooltip } from '../shared/Tooltip';
import { getHints } from '../../utils/getHints';
import { containsRtl } from '../../utils/bidi';
import { SegmentedRtlText } from '../shared/CharacterBreakdown';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { decomposeExtractionRegex, engregxify } from '../../utils/engregxify';
import { getRegexDescription, getContextValue } from '../../types/tagSpec';
import { findTransactionTypeFilterDef } from '../../utils/transactionTypeFilterDef';
import { getColumnSpec } from '../../constants/transactionColumns';
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
import { getSortableFields } from '../../api/transactions';
import { ColumnManagerModal } from './ColumnManagerModal';
import { AmountText, LEDGER_AMOUNT_FIELDS } from '../shared/AmountText';

/** Above this many offerable columns the Columns button opens the manager
 *  modal directly instead of the dropdown — reordering 100+ rows inside the
 *  288px dropdown was the Ledger pain the manager replaces. */
const COLUMN_MANAGER_DIRECT_THRESHOLD = 40;

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
  /** Intraday only: MT940 rules (same bank/side) that match each row, keyed by
   *  row reference. Rendered as clickable "From MT940" suggestion pills in the
   *  Tags cell so the operator can clone one into an intraday tag. */
  mt940SuggestionsByRow?: Map<TransactionRow, TagSpecDefinition[]>;
  /** Clicking a suggestion clones that MT940 rule into a new intraday tag.
   *  Absent ⇒ suggestions aren't shown (e.g. read-only). */
  onCloneMt940Suggestion?: (def: TagSpecDefinition) => void;
  showAttributes?: boolean;
  relaxedMode?: boolean;
  /** Narrative field names (e.g. `AdditionalInformation`) whose RTL-containing
   *  cells render as a logical-order character breakdown instead of plain
   *  text — the "Character view" toggle. Empty = off. */
  charViewColumns?: ReadonlySet<string>;
  hiddenColumns?: Set<string>;
  columnOrder?: string[];
  onColumnsReady?: (columns: ColumnDef[]) => void;
  onVisibleColumnsReady?: (columns: ColumnDef[]) => void;
  builderHeight?: number;
  loading?: boolean;
  /** Force the skeleton rows even when the buffer is non-empty — used
   *  during a hide/unhide refill so the table shows a loading state
   *  instead of the stale (pre-refill) rows. */
  forceSkeleton?: boolean;
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
  /** DataSetType of the current checkout. Only used for display: Ledger
   *  workspaces relabel the reused data columns (see LEDGER_COLUMN_LABELS). */
  dataSetType?: string;
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
// Max width for a Character-view cell in compact mode (where columns have no
// explicit width). Without a bound the exploded per-character boxes lay out on
// ONE line — an Arabic-heavy intraday narrative then balloons the column and
// the width-pin captures that transient, leaving empty horizontal scroll past
// the last column. Bounding it makes the boxes wrap (their intended layout).
const CHAR_VIEW_MAX_WIDTH = 480;
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
  // Ledger model V2 narrative/free-text fields (gotcha #29: preserve
  // consecutive spaces — operators split rules on padding runs). V2.1 moved
  // Zoho's text into TransactionNarrative and its reference into ExternalRef;
  // the old pair stays listed for future ERPs that fill it.
  'data:Narrative',
  'data:TransactionRef',
  'data:SourceRef',
  'data:Notes',
  'data:TransactionNarrative',
  'data:TransactionNotes',
  'data:ExternalRef',
]);

type ColumnDef =
  | { type: 'data'; key: string; field: string }
  | { type: 'attribute'; key: string; name: string }
  | { type: 'tags'; key: string }
  | { type: 'dates'; key: string; fields: { key: string; label: string }[] }
  | { type: 'debit'; key: string }
  | { type: 'credit'; key: string };

/** Synthetic ID for the rule-builder live preview definition. Rows that
 *  only match this definition have no real tag yet, so surfaces like the
 *  "Hide Tag Specs" action must ignore it when collecting hideable defs. */
export const PREVIEW_TEMP_DEF_ID = 'preview-temp';

const SIDE_AMOUNT_FIELDS = new Set(['Side', 'Amount']);
const DATE_FIELDS = new Set(['StatementDate', 'PostingDate', 'EntryDate', 'ValueDate']);

/**
 * Column display names derive MECHANICALLY from the API field name
 * (Transactions column spec, Rule 1) — one deterministic function, no
 * per-dataset label maps. What the operator sees in the header, the column
 * picker, and the context modal is the same word the API returns. The only
 * non-derived names are the synthetic columns below (Tags, Debit/Credit
 * Amount) which have no single field.
 */
function getColumnLabel(col: ColumnDef): string {
  switch (col.type) {
    case 'data': return humanizeFieldName(col.field);
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

// Merged, sorted [start, end) match ranges for a string against a set of
// regexes. Shared by `highlightText` (plain cells) and the char-view path
// (SegmentedRtlText) so a rule/search match highlights the same span in both.
function computeHighlightRanges(text: string, regexes: RegExp[]): [number, number][] {
  if (regexes.length === 0) return [];
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
  if (ranges.length === 0) return [];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
    else merged.push(ranges[i]);
  }
  return merged;
}

function highlightText(text: string, regexes: RegExp[]): ReactNode {
  const merged = computeHighlightRanges(text, regexes);
  if (merged.length === 0) return text;

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

export function ColumnPicker({ columns, hiddenColumns, onChange, columnOrder, onColumnOrderChange, defaultHiddenColumns, onReset, lockedVisibleKeys, dataSetType }: {
  columns: ColumnDef[];
  hiddenColumns: Set<string>;
  onChange: (hidden: Set<string>) => void;
  columnOrder?: string[];
  onColumnOrderChange?: (order: string[]) => void;
  defaultHiddenColumns?: Set<string>;
  onReset?: () => void;
  /** Column keys that must stay visible (rendered checked + disabled in the picker). */
  lockedVisibleKeys?: Set<string>;
  /** DataSetType of the current checkout — resolves the per-type column spec
   *  (default order fallback + the never-show exclusion). */
  dataSetType?: string;
}) {
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
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

  const columnSpec = getColumnSpec(dataSetType);
  // Exclude tags (always visible), attributes, and this DataSetType's
  // never-show fields. Anything else — including fields not in the spec (a
  // future backend addition) — stays offerable, defaulting to hidden.
  const toggleable = columns.filter((col) => {
    if (col.type === 'tags') return false;
    if (col.type === 'attribute') return false;
    if (columnSpec.neverShow.has(col.key)) return false;
    return true;
  });

  // Apply column order (custom drag order, or the per-type spec default)
  const ordered = useMemo(() => {
    const order = columnOrder && columnOrder.length > 0 ? columnOrder : columnSpec.defaultOrder;
    const orderMap = new Map(order.map((key, idx) => [key, idx]));
    return [...toggleable].sort((a, b) => {
      const ai = orderMap.get(a.key) ?? Infinity;
      const bi = orderMap.get(b.key) ?? Infinity;
      if (ai === Infinity && bi === Infinity) return 0;
      return ai - bi;
    });
  }, [toggleable, columnOrder, columnSpec]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ordered;
    const q = search.toLowerCase();
    return ordered.filter((col) => getColumnLabel(col).toLowerCase().includes(q));
  }, [ordered, search, dataSetType]);

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

  // Column manager modal (batch draft + Apply). On long lists (Ledger offers
  // 100+ columns) the dropdown is impractical for reordering, so the toolbar
  // button opens the manager DIRECTLY past this threshold; otherwise it stays
  // reachable via the "Manage…" action inside the dropdown.
  const openManagerDirectly = totalCount > COLUMN_MANAGER_DIRECT_THRESHOLD;
  const managerItems = useMemo(
    () => ordered.map((col) => ({ key: col.key, label: getColumnLabel(col) })),
    [ordered],
  );
  const handleManagerApply = useCallback((hidden: Set<string>, order: string[]) => {
    // The manager only knows offerable columns — preserve the hidden state of
    // anything else (attributes, never-show leftovers), matching Show All.
    const nonToggleableHidden = [...hiddenColumns].filter((k) => !toggleable.some((c) => c.key === k));
    // When the draft lands exactly on the spec defaults, clear the saved
    // prefs (onReset) instead of persisting values identical to them.
    const canonicalKeys = new Set(managerItems.map((it) => it.key));
    const canonicalOrder = [
      ...columnSpec.defaultOrder.filter((k) => canonicalKeys.has(k)),
      ...managerItems.map((it) => it.key).filter((k) => !columnSpec.defaultOrder.includes(k)),
    ];
    const defaults = defaultHiddenColumns ?? new Set<string>();
    const matchesDefaults =
      onReset &&
      hidden.size === [...defaults].filter((k) => canonicalKeys.has(k)).length &&
      [...hidden].every((k) => defaults.has(k)) &&
      order.length === canonicalOrder.length &&
      order.every((k, i) => k === canonicalOrder[i]);
    if (matchesDefaults) {
      onReset();
      return;
    }
    onChange(new Set([...nonToggleableHidden, ...hidden]));
    onColumnOrderChange?.(order);
  }, [hiddenColumns, toggleable, managerItems, columnSpec, defaultHiddenColumns, onReset, onChange, onColumnOrderChange]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => (openManagerDirectly ? setManagerOpen(true) : setOpen(!open))}
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
                <div className="flex items-center">
                  <button
                    onClick={() => { setOpen(false); setSearch(''); setManagerOpen(true); }}
                    className="text-[11px] text-primary hover:text-primary-dark px-2 py-0.5 hover:underline"
                  >
                    Manage…
                  </button>
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
      <ColumnManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        items={managerItems}
        canonicalOrder={columnSpec.defaultOrder}
        hiddenKeys={hiddenColumns}
        defaultHiddenKeys={defaultHiddenColumns}
        lockedKeys={lockedVisibleKeys}
        onApply={handleManagerApply}
      />
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
    // Narrative columns carry space-padding that rules split on, so preserve
    // consecutive spaces even in compact mode. `whitespace-pre` keeps the
    // value on one line (compact intent) without collapsing the runs; the
    // td's own `whitespace-nowrap` is overridden by this child.
    if (narrative) {
      // dir="auto" picks each value's base direction (Arabic vs English) so
      // mixed narratives render correctly per row instead of inheriting the
      // table's LTR base.
      return (
        <div dir="auto" className={hasWidth ? 'overflow-hidden text-ellipsis whitespace-pre' : 'whitespace-pre'}>
          {children}
        </div>
      );
    }
    if (!hasWidth) return <>{children}</>;
    return <div className="truncate">{children}</div>;
  }
  if (narrative) {
    return <div dir="auto" className="line-clamp-3 whitespace-pre-wrap break-words">{children}</div>;
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

// ─── Row-render helpers (module scope) ────────────────────────────────────
// Everything below was previously defined as closures inside TransactionTable
// and recreated on every render, which made it impossible to memoize the row
// component (every prop changed identity each render). They are hoisted here
// and parameterized on exactly what they read from the parent so the
// memoized TableRow can call them with values from its stable `ctx` prop.

type AttrValidation = { regex: RegExp; sourceField: string; verifyValue?: string; validateExtracted?: boolean };
type RowHighlight = { rowIdx: number; field: string; attrKey: string };

// Stable default for the `hiddenColumns` prop. An inline `new Set()` default
// would mint a fresh Set on every render for callers that omit the prop,
// invalidating the `visibleColumns` memo (and with it the row ctx) each time.
const EMPTY_HIDDEN_COLUMNS = new Set<string>();
// Stable default for the `charViewColumns` prop (same inline-`new Set()`
// caveat as EMPTY_HIDDEN_COLUMNS — a fresh set every render would bust the
// rowCtx memo and re-render every row on each parent commit).
const EMPTY_CHAR_VIEW_COLUMNS = new Set<string>();

// Cap how many tag badges render inline in the Tags cell. The overflow goes
// into a "+N" popover so a row matching many tags can't stretch the sticky
// Tags column wide enough to push the other columns off-screen.
const MAX_VISIBLE_TAGS = 3;

function getCellStyleFor(
  colIdx: number,
  isHeader: boolean,
  stickyLefts: Map<number, number>,
  stickyRights: Map<number, number>,
): React.CSSProperties {
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
}

function stickyEdgeShadowFor(colIdx: number, lastLeftIdx: number, firstRightIdx: number): ReactNode {
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
}

function renderCellContentFor(
  field: string,
  value: string | number | boolean | null,
  highlightMap: Map<string, RegExp[]> | null,
  searchHighlightMap: Map<string, RegExp[]> | null,
): ReactNode {
  if (value == null) return <span className="text-faint">-</span>;
  // Ledger amount fields (AmountFcy, TxnAmountFC/LC, VAT*, FXGainLoss) render
  // like the Debit/Credit money cells instead of as raw numbers.
  if (LEDGER_AMOUNT_FIELDS.has(field)) return <AmountText value={value as string | number} />;
  // Dates come back as ISO strings — strip the time portion for display.
  const raw = String(value);
  const text = DATE_FIELDS.has(field) ? raw.split('T')[0] : raw;
  const regexes = [
    ...(highlightMap?.get(field) ?? []),
    ...(searchHighlightMap?.get(field) ?? []),
  ];
  if (regexes.length > 0) return highlightText(text, regexes);
  return text;
}

function getCertaintyFor(tagDefinitions: TagSpecDefinition[], tagName: string) {
  const def = tagDefinitions.find((d) => d.Tag === tagName);
  return def?.CertaintyLevelTag ?? 'HIGH';
}

// Build a human description of an attribute's extraction rule. Prefers the
// RegexDetails[].Description saved on the attribute (which includes optional
// modifiers like occurrence/numChars/toStr), falling back to a reverse-parse
// of the regex when that's absent.
function ruleDescription(attr: TagAttribute): string {
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
}

// Normalize a regex string to the form the wizard's form round-trip
// produces. The form loads a saved regex via decomposeExtractionRegex (which
// keeps only operation + prefix/suffix/pattern) and re-emits it via
// regexifyExtraction. That round-trip isn't byte-identical — e.g. a raw
// leading `^` in the saved regex gets escaped to `\^`. To decide whether
// the user actually edited an attribute, compare both sides through this
// same pipeline so cosmetic round-trip differences don't register as edits.
function normalizeRegex(regex: string): string {
  const decomposed = decomposeExtractionRegex(regex);
  return regexifyExtraction(decomposed.operation, decomposed);
}

// Compare two same-side transformation lists element-by-element. Both the
// pre and post lists go through the SAME shape check — adding only one of
// them would leave the diff blind to pre-extraction-only edits (and the
// "saved-vs-draft" tooltip would claim the attribute is unchanged when its
// runtime output now differs).
function transformationsEqual(
  ta: TagAttribute['Transformations'],
  tb: TagAttribute['Transformations'],
): boolean {
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
}

// Compare two attribute rules for semantic equality — source field,
// normalized regex, and transformation pipeline. For constant-mode
// attributes (no regex/source/transformations), compare the literal value.
function attrRulesEqual(a: TagAttribute, b: TagAttribute): boolean {
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
}

// Returns true when this attribute's rule is currently being edited in the
// rule builder AND the draft rule differs from the saved one. Used to
// suppress the server-side fallback in getAttributeValueFor — otherwise a
// non-matching draft would show the old (saved) value, giving a false
// impression that the draft still works.
function isAttributeBeingEditedFor(
  item: AnalyzedTransaction,
  attrName: string,
  originalEditingDef: TagSpecDefinition | undefined,
): boolean {
  if (!originalEditingDef) return false;
  for (const def of item.analysis.matchedDefinitions) {
    if (def.Id !== originalEditingDef.Id) continue;
    const currentAttr = def.Attributes.find((a) => a.AttributeTag === attrName);
    const originalAttr = originalEditingDef.Attributes.find((a) => a.AttributeTag === attrName);
    if (currentAttr && originalAttr && !attrRulesEqual(originalAttr, currentAttr)) return true;
  }
  return false;
}

function getAttributeValueFor(
  item: AnalyzedTransaction,
  attrName: string,
  activeDefinitionId: string | undefined,
  tagDefinitions: TagSpecDefinition[],
  originalEditingDef: TagSpecDefinition | undefined,
): string | null {
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
    if (isAttributeBeingEditedFor(item, attrName, originalEditingDef)) return null;
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
  if (isAttributeBeingEditedFor(item, attrName, originalEditingDef)) return null;
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
}

// Pulls the server-computed `IsValid` flag for an attribute out of the
// GetTEPTransactions response (OpsAttributes for single-tag rows,
// OpsMultiTags[*].Attributes for multi-tag rows). Returns `null` when the
// server didn't include the attribute on this row — the caller falls back
// to client-side ValidationClass regex testing in that case (wizard
// preview, sample mode, etc.). Scoping rules mirror getAttributeValueFor so
// a drill-down view doesn't pick up the wrong tag's validation flag.
function getAttributeIsValidFor(
  item: AnalyzedTransaction,
  attrName: string,
  activeDefinitionId: string | undefined,
): boolean | null {
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
}

// Render a string with the differing slice wrapped in <mark>, using the
// shared highlight style from highlightText above.
function renderDiffed(value: string, otherValue: string, side: 'old' | 'new'): ReactNode {
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
}

// Get tooltip for an attribute cell. Returns a ReactNode so we can render
// the Before/After diff when the rule builder is editing an existing def
// and this attribute's rule has actually changed. Called lazily (only when
// the tooltip opens) — the diff path runs extractAttributes twice per call,
// which is far too expensive to compute eagerly for every mounted cell.
function getAttributeTooltipFor(
  item: AnalyzedTransaction,
  attrName: string,
  originalEditingDef: TagSpecDefinition | undefined,
): ReactNode | null {
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
}

// Get the source field for an attribute cell based on the tag that produced
// it for this row. Constants have no source field (the value is the value);
// returning null keeps the row's source-field hover-highlight inert.
function getAttributeSourceField(item: AnalyzedTransaction, attrName: string): string | null {
  for (const def of item.analysis.matchedDefinitions) {
    const attr = def.Attributes.find((a) => a.AttributeTag === attrName);
    if (!attr) continue;
    if (attr.Constant != null || !attr.AttributeRuleExpression) return null;
    return attr.AttributeRuleExpression.SourceField;
  }
  return null;
}

// True when ANY matched definition produces this attribute as a constant for
// this row. Used by the cell renderer to suppress the validation tick/cross
// — constants have no regex and no source field, so the "valid against the
// attrValidationMap regex" mental model doesn't apply even if another rule
// on the page registers validation for the same attribute name.
function isAttributeFromConstant(item: AnalyzedTransaction, attrName: string): boolean {
  for (const def of item.analysis.matchedDefinitions) {
    const attr = def.Attributes.find((a) => a.AttributeTag === attrName);
    if (attr && attr.Constant != null) return true;
  }
  return false;
}

/**
 * Everything a row needs from the parent that is NOT per-row. Bundled into
 * one object (memoized in TransactionTable) so TableRow's shallow memo
 * compare stays tiny and the dependency list is auditable in one place.
 * During scroll none of these change, so every already-mounted row skips
 * re-rendering entirely — the per-frame cost is just mounting the few rows
 * that newly enter the overscan window.
 */
interface RowCtx {
  visibleColumns: ColumnDef[];
  stickyLefts: Map<number, number>;
  stickyRights: Map<number, number>;
  lastLeftIdx: number;
  firstRightIdx: number;
  relaxedMode: boolean;
  charViewColumns: ReadonlySet<string>;
  loading: boolean;
  selectable: boolean;
  resolveColumnWidth: (key: string) => number | undefined;
  highlightMap: Map<string, RegExp[]> | null;
  searchHighlightMap: Map<string, RegExp[]> | null;
  onCellDoubleClick?: TransactionTableProps['onCellDoubleClick'];
  interactiveCellFields?: ReadonlySet<string>;
  interactiveCellHint?: string;
  attrValidationMap: Map<string, AttrValidation>;
  attrLovTagMap: Map<string, string>;
  lovLookup: Map<string, Map<string, string>>;
  activeDefinitionId?: string;
  tagDefinitions: TagSpecDefinition[];
  originalEditingDef?: TagSpecDefinition;
  originalDefinitionIds?: Set<string>;
  definitionSourceMap?: Map<string, string>;
  definitionVersions?: Map<string, DefinitionVersionInfo>;
  onTagClick?: (tagName: string, definitionId?: string) => void;
  onRowContextMenu?: TransactionTableProps['onRowContextMenu'];
  mt940SuggestionsByRow?: Map<TransactionRow, TagSpecDefinition[]>;
  onCloneMt940Suggestion?: (def: TagSpecDefinition) => void;
  txnTypeDescriptions: Map<string, string>;
  toggleSelect: (id: string) => void;
  setHighlightSource: React.Dispatch<React.SetStateAction<RowHighlight | null>>;
  highlightTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * One virtualized table row. Memoized so the parent's scroll-driven
 * re-renders (tanstack-virtual re-renders TransactionTable every time the
 * virtual window shifts) don't re-render rows that are already mounted —
 * before this existed, every mounted row re-ran its full cell loop (regex
 * validation, LOV lookups, attribute resolution) on every scroll frame,
 * which is what made fast scrolling lag and blank out.
 *
 * Per-row props are primitives or row-scoped objects; everything shared
 * comes through `ctx` (one memoized object, see RowCtx).
 */
const TableRow = memo(function TableRow({
  item,
  index,
  rowId,
  isSelected,
  isDeadEnd,
  band = false,
  rowHighlight,
  measureRef,
  ctx,
}: {
  item: AnalyzedTransaction;
  index: number;
  rowId: string;
  isSelected: boolean;
  isDeadEnd: boolean;
  /** Ledger journal-entry zebra band (default sort only): true on every
   *  other TransactionId group so a document's legs read as one block. */
  band?: boolean;
  /** The parent's highlightSource when it targets THIS row, else null —
   *  scoping the prop per-row keeps the memo hit rate high (only the row
   *  being hovered re-renders when the highlight moves). */
  rowHighlight: RowHighlight | null;
  measureRef: (node: Element | null) => void;
  ctx: RowCtx;
}) {
  const {
    visibleColumns, stickyLefts, stickyRights, lastLeftIdx, firstRightIdx,
    relaxedMode, charViewColumns, loading, selectable, resolveColumnWidth, highlightMap,
    searchHighlightMap, onCellDoubleClick, interactiveCellFields,
    interactiveCellHint, attrValidationMap, attrLovTagMap, lovLookup,
    activeDefinitionId, tagDefinitions, originalEditingDef,
    originalDefinitionIds, definitionSourceMap, definitionVersions,
    onTagClick, onRowContextMenu, mt940SuggestionsByRow, onCloneMt940Suggestion,
    txnTypeDescriptions,
    toggleSelect, setHighlightSource,
    highlightTimerRef,
  } = ctx;

  const cellPy = relaxedMode ? 'py-1' : 'py-2';
  const getCellStyle = (colIdx: number) => getCellStyleFor(colIdx, false, stickyLefts, stickyRights);
  const stickyEdgeShadow = (colIdx: number) => stickyEdgeShadowFor(colIdx, lastLeftIdx, firstRightIdx);
  const renderCellContent = (field: string, value: string | number | boolean | null) =>
    renderCellContentFor(field, value, highlightMap, searchHighlightMap);
  const getAttributeValue = (attrName: string) =>
    getAttributeValueFor(item, attrName, activeDefinitionId, tagDefinitions, originalEditingDef);

  // Ledger: a stale row (ERP no longer produces this leg — edited/deleted
  // after ingestion) stays visible for audit but is greyed. Only Ledger rows
  // carry IsStale, so this is inert elsewhere. Treat null as not-stale.
  const isStale = item.row['IsStale'] === true;

  return (
    <tr
      data-index={index}
      ref={measureRef}
      className={`group transition-colors ${isDeadEnd ? 'bg-red-100/60 dark:bg-red-950/30 text-red-400 dark:text-red-500/70' : `${band ? 'bg-surface-secondary' : ''} hover:bg-surface-hover`} ${isSelected ? 'bg-primary/10!' : ''} ${isStale ? 'opacity-55' : ''}`}
      onContextMenu={onRowContextMenu ? (e) => { e.preventDefault(); onRowContextMenu(item.row, e.clientX, e.clientY); } : undefined}
    >
      {visibleColumns.map((col, colIdx) => {
        const isStickyCol = stickyLefts.has(colIdx) || stickyRights.has(colIdx);
        // Sticky cells paint their own opaque background (they overlay
        // scrolling content) — keep it in step with the row band.
        const stickyBg = isStickyCol
          ? `${band && !isDeadEnd ? 'bg-surface-secondary' : 'bg-surface'} group-hover:bg-surface-hover`
          : '';

        switch (col.type) {
          case 'data': {
            const isHighlighted = rowHighlight?.field === col.field;
            // Ledger IsStale: render a STALE badge (not "true"/"false"); the
            // row is already greyed above.
            if (col.field === 'IsStale') {
              return (
                <td
                  key={col.key}
                  className={`px-3 ${cellPy} text-xs ${stickyBg}`}
                  style={getCellStyle(colIdx)}
                >
                  {item.row[col.field] === true ? (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-amber-200 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                      Stale
                    </span>
                  ) : (
                    <span className="text-faint">-</span>
                  )}
                  {stickyEdgeShadow(colIdx)}
                </td>
              );
            }
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
                  style={getCellStyle(colIdx)}
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
              // Character-view toggle: only RTL-containing cells in the
              // operator-selected columns switch to the logical-order
              // breakdown so bidi reordering can't hide where a split lands.
              const showCharView =
                charViewColumns.has(col.field) && rawValue != null && containsRtl(String(rawValue));
              // Same match ranges plain cells highlight with, so a rule/search
              // hit (e.g. the "/ORDP" prefix) is tinted in char-view too.
              const charViewHighlights = showCharView
                ? computeHighlightRanges(String(rawValue), [
                    ...(highlightMap?.get(col.field) ?? []),
                    ...(searchHighlightMap?.get(col.field) ?? []),
                  ])
                : [];
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
                  // Char-view cells must wrap (they carry per-character boxes),
                  // so they never take the compact `whitespace-nowrap` branch;
                  // a max-width bounds them so the boxes wrap instead of forcing
                  // one giant line.
                  className={`px-3 ${cellPy} text-xs text-body-secondary ${relaxedMode && !showCharView ? 'whitespace-nowrap' : 'align-top'} ${cellWidth != null ? 'overflow-hidden' : ''} ${stickyBg} ${isHighlighted ? 'ring-1 ring-primary/30 ring-inset bg-primary/5 dark:bg-primary/10' : ''} ${isInteractive ? 'cursor-pointer hover:ring-1 hover:ring-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10 transition-shadow select-none' : ''}`}
                  style={{ ...getCellStyle(colIdx), width: cellWidth, maxWidth: showCharView ? (cellWidth ?? CHAR_VIEW_MAX_WIDTH) : cellWidth }}
                  title={titleAttr}
                  onDoubleClick={
                    onCellDoubleClick
                      ? () => onCellDoubleClick(col.field, item.row[col.field], item.row)
                      : undefined
                  }
                >
                  {showCharView ? (
                    <SegmentedRtlText text={String(rawValue)} highlightRanges={charViewHighlights} />
                  ) : (
                    <CellContentWrapper
                      relaxedMode={relaxedMode}
                      narrative={isNarrative}
                      hasWidth={cellWidth != null}
                    >
                      {renderCellContent(col.field, rawValue)}
                    </CellContentWrapper>
                  )}
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
                style={{ ...getCellStyle(colIdx), width: cellWidth, maxWidth: cellWidth }}
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
                style={{ ...getCellStyle(colIdx), width: cellWidth, maxWidth: cellWidth }}
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
                style={{ ...getCellStyle(colIdx), width: cellWidth, maxWidth: cellWidth }}
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
                  style={{ ...getCellStyle(colIdx), width: attrCellWidth, maxWidth: attrCellWidth }}
                >
                  <span className="text-faint">-</span>
                  {stickyEdgeShadow(colIdx)}
                </td>
              );
            }
            const val = getAttributeValue(col.name);
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
                const serverIsValid = getAttributeIsValidFor(item, col.name, activeDefinitionId);
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
            const isAttrHighlighted = rowHighlight?.attrKey === col.key;
            return (
              <td
                key={col.key}
                className={`px-3 ${cellPy} text-xs ${relaxedMode ? 'whitespace-nowrap' : ''} ${attrCellWidth != null ? 'overflow-hidden' : ''}
                ${validationIcon ? 'text-center' : 'text-left'}
                ${validationPassed === true ? 'text-emerald-500 dark:text-emerald-300' : validationPassed === false ? 'text-red-400 dark:text-rose-300' : 'text-primary-dark'}
                ${isAttrHighlighted ? 'ring-2 ring-blue-400/60 ring-inset bg-blue-50 dark:bg-blue-900/30' : isStickyCol ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-primary/5'}`}
                style={{ ...getCellStyle(colIdx), width: attrCellWidth, maxWidth: attrCellWidth }}
                onMouseEnter={() => {
                  if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                  if (srcField) {
                    highlightTimerRef.current = setTimeout(() => setHighlightSource({ rowIdx: index, field: srcField, attrKey: col.key }), 500);
                  }
                }}
                onMouseLeave={() => {
                  if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                  highlightTimerRef.current = null;
                  setHighlightSource(null);
                }}
              >
                <Tooltip content={() => getAttributeTooltipFor(item, col.name, originalEditingDef) ?? col.name} offsetAmount={8} placement="bottom" delay={500}>
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
                style={{ ...getCellStyle(colIdx), width: tagsCellWidth, maxWidth: tagsCellWidth }}
              >
                <div className="flex items-start gap-1.5">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(rowId)}
                      disabled={loading}
                      aria-label={loading ? 'Loading transactions, selection disabled' : 'Select row'}
                      className={`rounded border-border-strong shrink-0 mt-0.5 ${loading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {item.analysis.tags.length > 0 ? (
                      (() => {
                        const renderTagBadge = (tag: string, ti: number) => {
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
                              certainty={matchedDef?.CertaintyLevelTag ?? getCertaintyFor(tagDefinitions, tag)}
                              isUserCreated={isUserCreated}
                              version={versionInfo?.version}
                              onClick={onTagClick ? () => onTagClick(tag, defId) : undefined}
                            />
                          );
                          if (!source && !matchedDef) return <span key={`${tag}-${ti}`}>{badge}</span>;
                          return (
                            <Tooltip key={`${tag}-${ti}`} content={() => renderTagTooltip(source, matchedDef, !!onTagClick, versionInfo)} placement="top">
                              <span>{badge}</span>
                            </Tooltip>
                          );
                        };
                        const tags = item.analysis.tags;
                        const visible = tags.slice(0, MAX_VISIBLE_TAGS);
                        const hiddenCount = tags.length - visible.length;
                        return (
                          <div className={`flex items-center gap-1 ${relaxedMode ? 'flex-nowrap' : 'flex-wrap'}`}>
                            {isDeadEnd && (
                              <Badge variant="none" size="sm" className="border border-red-200 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 px-2.5 shrink-0">Dead End</Badge>
                            )}
                            {visible.map((tag, ti) => renderTagBadge(tag, ti))}
                            {hiddenCount > 0 && (
                              <MoreTagsPopover hiddenCount={hiddenCount}>
                                {tags.slice(MAX_VISIBLE_TAGS).map((tag, i) => renderTagBadge(tag, MAX_VISIBLE_TAGS + i))}
                              </MoreTagsPopover>
                            )}
                            {hasHints && <HintsInfoIcon hints={hints} />}
                          </div>
                        );
                      })()
                    ) : isDeadEnd ? (
                      <div className="flex items-center gap-1">
                        <Badge variant="none" size="sm" className="border border-red-200 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 px-2.5">Dead End</Badge>
                        {hasHints && <HintsInfoIcon hints={hints} />}
                      </div>
                    ) : hasHints ? (
                      <HintsInfoIcon hints={hints} />
                    ) : (
                      // No tags, no dead-end flag, no hints: show an empty cell
                      // rather than a "-" placeholder.
                      null
                    )}

                    {/* Intraday: MT940 rules (same bank/side) that match this
                        row — click one to create an intraday tag cloned from
                        it. Reads only from the row + ctx, so it doesn't touch
                        the RowCtx memo contract (gotcha #23). */}
                    {onCloneMt940Suggestion && (() => {
                      // Once the row is tagged AT ALL — even with a tag other
                      // than the suggestion — it's been handled, so hide the
                      // whole "Clone from MT940" section. Suggestions are a
                      // starting point for still-untagged intraday rows only.
                      if (item.analysis.tags.length > 0) return null;
                      const suggestions = mt940SuggestionsByRow?.get(item.row);
                      if (!suggestions || suggestions.length === 0) return null;
                      // Divider from other content above (dead-end / hints) when
                      // present; on a bare untagged row the suggestions stand
                      // alone, so just a small gap.
                      const hasContentAbove = isDeadEnd || hasHints;
                      return (
                        <div className={`flex flex-col gap-1 ${hasContentAbove ? 'mt-1.5 pt-1.5 border-t border-dashed border-amber-300/40 dark:border-amber-500/25' : 'mt-1'}`}>
                          <Tooltip content="MT940 rules whose conditions match this transaction. Click one to create an intraday tag cloned from it (you can adjust it before saving)." placement="top">
                            <span className="inline-flex items-center gap-1 self-start text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400/90 cursor-help">
                              <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <rect x="9" y="9" width="11" height="11" rx="2" />
                                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                              </svg>
                              Clone from MT940
                            </span>
                          </Tooltip>
                          <div className="flex flex-wrap gap-1">
                            {suggestions.map((def) => {
                              const ttc = getContextValue(def.Context, 'TransactionTypeCode');
                              const ttcDesc = ttc ? txnTypeDescriptions.get(ttc) : undefined;
                              return (
                              <Tooltip
                                key={def.Id}
                                content={
                                  <div className="space-y-1.5 max-w-xs">
                                    {ttc && (
                                      <div className="text-[11px]">
                                        <span className="text-faint">Transaction type:</span>{' '}
                                        <span className="font-mono font-semibold">{ttc}</span>
                                        {ttcDesc && <span className="text-faint"> — {ttcDesc}</span>}
                                      </div>
                                    )}
                                    {renderTagTooltip(null, def, false, undefined)}
                                  </div>
                                }
                                placement="top"
                              >
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onCloneMt940Suggestion(def); }}
                                  className="max-w-full truncate text-[11px] font-medium rounded-md px-2 py-0.5 border border-amber-300/70 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:border-amber-400 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40 cursor-pointer transition-colors"
                                >
                                  {def.Tag}
                                </button>
                              </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
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
});

export function TransactionTable({ data, tagDefinitions, originalDefinitionIds, definitionSourceMap, definitionVersions, highlightExpressions, searchHighlights, onTagClick, onFlagDeadEnd, onFlagDeadEndWithComment, onSetComments, onHideTagDefs, mt940SuggestionsByRow, onCloneMt940Suggestion, showAttributes = true, relaxedMode = false, charViewColumns = EMPTY_CHAR_VIEW_COLUMNS, hiddenColumns = EMPTY_HIDDEN_COLUMNS, columnOrder, onColumnsReady, onVisibleColumnsReady, builderHeight = 0, loading = false, forceSkeleton = false, accentHue = 190, onRowContextMenu, onCellDoubleClick, interactiveCellFields, interactiveCellHint, originalEditingDef, activeDefinitionId, sortOverride = null, onSortChange, columnWidths, onColumnWidthChange, dataSetType }: TransactionTableProps) {
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
  const { fieldMeta, filterDefinitions } = useTransactionData();
  // Transaction-type code → human description, for the "Clone from MT940"
  // suggestion tooltip (shows the source MT940 rule's transaction type). Same
  // source the TransactionTypePicker reads (backend GetFilters catalog).
  const txnTypeDescriptions = useMemo(() => {
    const m = new Map<string, string>();
    const def = findTransactionTypeFilterDef(filterDefinitions);
    if (def) {
      for (const v of def.Values) {
        // Description lives in SubLabel (e.g. "TRF" → "Transfer"); Label is
        // usually just the code again, so fall back to it only when it adds
        // information over the raw Value.
        if (v.Value) {
          const desc = v.SubLabel ?? (v.Label && v.Label !== v.Value ? v.Label : '');
          m.set(v.Value, desc);
        }
      }
    }
    return m;
  }, [filterDefinitions]);
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

  // id -> row lookup, rebuilt only when `data` changes (NOT on selection).
  // Selection logic below previously did `data.find(...)` once per selected
  // id — O(n²) — which froze the UI for seconds after Show all + Select all
  // on tens of thousands of rows (and on every render via the action bar).
  // With this map every lookup is O(1).
  const rowById = useMemo(() => {
    const m = new Map<string, (typeof data)[number]>();
    for (const item of data) {
      const id = getRowId(item.row);
      if (!m.has(id)) m.set(id, item);
    }
    return m;
  }, [data, getRowId]);

  // Aggregate flags over the current selection, computed in ONE O(selected)
  // pass (O(1) lookups) and memoized — so the selection action bar can read
  // them without re-deriving on every render. Mirrors the previous inline
  // semantics: a selected id absent from the current data counts as
  // "not dead end" (so it can't make allDeadEnd true) and as "not tagged".
  const selectionSummary = useMemo(() => {
    let anyDeadEnd = false;
    let anyNotDeadEnd = false;
    let anyTagged = false;
    for (const id of selectedIds) {
      const item = rowById.get(id);
      if (!item) { anyNotDeadEnd = true; continue; }
      if (item.row['IsDeadEnd'] === true) anyDeadEnd = true; else anyNotDeadEnd = true;
      if (item.analysis.tags.length > 0) anyTagged = true;
    }
    return { allDeadEnd: !anyNotDeadEnd, noneDeadEnd: !anyDeadEnd, anySelectedTagged: anyTagged };
  }, [selectedIds, rowById]);

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
      const item = rowById.get(id);
      if (item) rows.push(item.row);
    }
    return rows;
  }, [commentDialogState, selectedIds, rowById]);

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

  // Clear the selection when the dataset is REPLACED (filter change, page
  // nav, hide refill — the first row id changes or the set shrinks), but
  // NOT when the same dataset merely GROWS. Show all / +N append rows, and
  // `analyzeRow` commits them to `data` (visibleData) in 500-row chunks, so
  // the length climbs over many renders after a single click — keying the
  // reset on raw length change wiped an in-progress selection every chunk
  // (the "select-all selects then deselects, count jumps by ~1500" bug).
  // Growth keeps the prefix (data[0]) stable; a replace changes it.
  //
  // The reset runs during render (not in an effect) so React discards the
  // in-flight render and re-renders with an empty selection before
  // committing — avoiding a one-frame gap where the action-bar count walks
  // the new data with the stale selection and briefly shows a wrong number.
  const currFirstRowId = data.length > 0 ? getRowId(data[0].row) : null;
  const prevDataSigRef = useRef<{ firstId: string | null; len: number }>({ firstId: currFirstRowId, len: data.length });
  if (currFirstRowId !== prevDataSigRef.current.firstId || data.length !== prevDataSigRef.current.len) {
    const prev = prevDataSigRef.current;
    const replaced = currFirstRowId !== prev.firstId || data.length < prev.len;
    const grew = !replaced && data.length > prev.len;
    prevDataSigRef.current = { firstId: currFirstRowId, len: data.length };
    if (replaced) {
      if (selectedIds.size > 0) setSelectedIds(new Set());
      if (selectAllActive) setSelectAllActive(false);
    } else if (grew && selectAllActive) {
      // "Select all" is active and the SAME dataset grew (Show all / +N
      // rows arriving, or analyzeRow committing chunks). Extend the
      // selection to the new rows so select-all stays comprehensive as the
      // table finishes loading, instead of freezing at the row count that
      // happened to be analyzed when the operator clicked.
      setSelectedIds(new Set(data.map((item) => getRowId(item.row))));
    }
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
      const item = rowById.get(id);
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
  }, [selectedIds, rowById, definitionVersions]);

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
  const tableRef = useRef<HTMLTableElement>(null);
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
        // Side ALSO gets a raw data column of its own (a Ledger workspace
        // spans both CR and DR rows, so the side is per-row information
        // there). The per-type column spec controls whether it defaults on
        // (Ledger) or stays offerable-but-hidden (everything else).
        if (field === 'Side') {
          cols.push({ type: 'data', key: 'data:Side', field: 'Side' });
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
    const spec = getColumnSpec(dataSetType);
    let result = columns;
    if (!showAttributes) result = result.filter((col) => col.type !== 'attribute');
    if (hiddenColumns.size > 0) result = result.filter((col) => col.type === 'attribute' || !hiddenColumns.has(col.key));
    // Per-type never-show fields stay out of the table even when a stale
    // saved preference (or the row payload) still carries them.
    result = result.filter((col) => col.type === 'attribute' || !spec.neverShow.has(col.key));

    // Separate tags, attributes, and sortable columns
    const tags = result.filter((col) => col.type === 'tags');
    const attrs = result.filter((col) => col.type === 'attribute');
    const sortable = result.filter((col) => col.type !== 'tags' && col.type !== 'attribute');

    // Sort only non-attribute columns by custom or the per-type default order
    const order = columnOrder && columnOrder.length > 0 ? columnOrder : spec.defaultOrder;
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
  }, [columns, showAttributes, hiddenColumns, columnOrder, attrSourceMap, dataSetType]);

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

  // --- Stable table width (compact-mode horizontal-scroll fix) ---
  //
  // Compact mode uses auto table-layout (resolveColumnWidth returns undefined),
  // so every column is only as wide as its widest MOUNTED cell. While
  // virtual-scrolling a fully-loaded set, the mounted window changes and the
  // narrative column's width swings with it (long "CASH MANAGEMENT…" rows vs a
  // short "/08"). When a narrow window mounts the table shrinks; if the operator
  // had scrolled right, the browser clamps scrollLeft to the smaller max and the
  // view snaps back to the left. Pin the table to the widest width it has been:
  // it then never shrinks mid-scroll (it only ever GROWS, which extends
  // rightward and never moves the viewport). The pin resets on structural
  // changes (visible columns / compact toggle / char-view columns) so a
  // genuinely narrower layout can shrink to fit.
  const maxTableWidthRef = useRef(0);
  const [stableMinWidth, setStableMinWidth] = useState(0);
  const growPin = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const w = el.scrollWidth;
    if (w > maxTableWidthRef.current) {
      maxTableWidthRef.current = w;
      setStableMinWidth(w);
    }
  }, []);
  // Counterpart to `growPin`: shrink the pin back DOWN to the table's real
  // (natural) width once the pin is holding it wider than it needs to be. This
  // reclaims the empty trailing gap left after a transiently-wide window (a long
  // narrative row, or the async "Clone from MT940" suggestion cell) stops being
  // the widest thing mounted — without it the pin stays stuck at that old
  // maximum forever and the leftover width shows as dead space past the last
  // column. Measured off the `<table>` itself (a sibling of the reservation
  // spacer, so its width is independent of the pin — no feedback loop). Only
  // shrinks when the natural width still covers the current viewport
  // (`natural >= scrollLeft + clientWidth`), so it can NEVER clamp scrollLeft
  // and re-introduce the mid-scroll snap the pin exists to prevent.
  const shrinkPinIfSafe = useCallback(() => {
    const el = scrollContainerRef.current;
    const table = tableRef.current;
    if (!el || !table) return;
    const natural = table.offsetWidth;
    if (natural < maxTableWidthRef.current && natural >= el.scrollLeft + el.clientWidth) {
      maxTableWidthRef.current = natural;
      setStableMinWidth(natural);
    }
  }, []);
  // String signature so churny prop identities (e.g. a fresh charViewColumns
  // Set each render) don't reset the pin unless the layout actually changed.
  const layoutSignature = useMemo(
    () =>
      `${relaxedMode}|${visibleColumns.map((c) => c.key).join(',')}|${[...(charViewColumns ?? [])].sort().join(',')}`,
    [relaxedMode, visibleColumns, charViewColumns],
  );
  useEffect(() => {
    // Drop the pin so the table can shrink to the new natural width, then
    // re-measure on the next frame (after the reset render paints without the
    // pin) and grow back to the fresh maximum.
    maxTableWidthRef.current = 0;
    setStableMinWidth(0);
    const raf = requestAnimationFrame(growPin);
    return () => cancelAnimationFrame(raf);
  }, [layoutSignature, growPin]);

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

    // Grow the width pin if this render mounted a wider row than we've seen,
    // then reclaim any stale over-reservation once the layout has settled
    // narrower again (safe-shrink can't move the viewport).
    growPin();
    shrinkPinIfSafe();
  }, [visibleColumns, leftIndices, rightIndices, data, growPin, shrinkPinIfSafe]);

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
      growPin();
      shrinkPinIfSafe();
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
  }, [visibleColumns, data, updateViewportIndicator, growPin, shrinkPinIfSafe]);

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

  // Resolve the column under the cursor by HIT-TESTING the rendered minimap
  // blocks, not by cumulative `widthPct`. The blocks carry a `minWidth: 35px`
  // floor, so once enough columns are shown the narrow ones stop tracking
  // their proportional widths and a widthPct-based lookup lands on the wrong
  // column (the reported "wrong column highlighted/scrolled"). The DOM rects
  // are the source of truth for what the operator actually sees.
  const getColumnAtMinimapX = useCallback((clientX: number): number => {
    const bar = minimapBarRef.current;
    if (!bar) return 0;
    const blockEls = Array.from(bar.querySelectorAll<HTMLElement>('[data-minimap-idx]'));
    if (blockEls.length === 0) return 0;
    for (const el of blockEls) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return Number(el.dataset.minimapIdx);
    }
    // Cursor fell in a sub-pixel gap or past an edge — clamp to first / last.
    if (clientX < blockEls[0].getBoundingClientRect().left) {
      return Number(blockEls[0].dataset.minimapIdx);
    }
    return Number(blockEls[blockEls.length - 1].dataset.minimapIdx);
  }, []);

  // Scroll the targeted column to the center of the viewport using its real
  // <th> offset (accurate regardless of the minimap's minWidth distortion).
  const scrollMinimapToColumn = useCallback((colIdx: number) => {
    const container = scrollContainerRef.current;
    const thead = theadRef.current;
    if (!container || !thead) return;
    const th = thead.querySelectorAll('th')[colIdx] as HTMLElement | undefined;
    if (!th) return;
    const target = th.offsetLeft - container.clientWidth / 2 + th.offsetWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, []);

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
    // A click jumps to (and flashes) the column actually under the cursor.
    // Drag scrubbing is handled by the proportional move handler below.
    const colIdx = getColumnAtMinimapX(e.clientX);
    scrollMinimapToColumn(colIdx);
    flashColumnHeader(colIdx);
  }, [getColumnAtMinimapX, scrollMinimapToColumn, flashColumnHeader]);

  const handleMinimapPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return;
    scrollToMinimapX(e.clientX, e.currentTarget.getBoundingClientRect());
  }, [scrollToMinimapX]);

  // --- end minimap ---

  // Track which source field cell to highlight: { rowIndex, fieldName }
  const [highlightSource, setHighlightSource] = useState<{ rowIdx: number; field: string; attrKey: string } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Header-only style helpers — rows use the module-scope versions via ctx.
  const getCellStyle = (colIdx: number, isHeader: boolean): React.CSSProperties =>
    getCellStyleFor(colIdx, isHeader, stickyLefts, stickyRights);

  const stickyEdgeShadow = (colIdx: number): ReactNode =>
    stickyEdgeShadowFor(colIdx, lastLeftIdx, firstRightIdx);

  // Shared row context. One memoized object so TableRow's shallow compare
  // sees a single stable prop across scroll-driven parent re-renders —
  // every dependency that can actually change row output is listed here;
  // anything else leaves mounted rows untouched (the whole point of the
  // row memoization, see TableRow's doc comment).
  const rowCtx: RowCtx = useMemo(() => ({
    visibleColumns,
    stickyLefts,
    stickyRights,
    lastLeftIdx,
    firstRightIdx,
    relaxedMode,
    charViewColumns,
    loading,
    selectable: !!onFlagDeadEnd,
    resolveColumnWidth,
    highlightMap,
    searchHighlightMap,
    onCellDoubleClick,
    interactiveCellFields,
    interactiveCellHint,
    attrValidationMap,
    attrLovTagMap,
    lovLookup,
    activeDefinitionId,
    tagDefinitions,
    originalEditingDef,
    originalDefinitionIds,
    definitionSourceMap,
    definitionVersions,
    onTagClick,
    onRowContextMenu,
    mt940SuggestionsByRow,
    onCloneMt940Suggestion,
    txnTypeDescriptions,
    toggleSelect,
    setHighlightSource,
    highlightTimerRef,
  }), [
    visibleColumns, stickyLefts, stickyRights, lastLeftIdx, firstRightIdx,
    relaxedMode, charViewColumns, loading, onFlagDeadEnd, resolveColumnWidth, highlightMap,
    searchHighlightMap, onCellDoubleClick, interactiveCellFields,
    interactiveCellHint, attrValidationMap, attrLovTagMap, lovLookup,
    activeDefinitionId, tagDefinitions, originalEditingDef,
    originalDefinitionIds, definitionSourceMap, definitionVersions,
    onTagClick, onRowContextMenu, mt940SuggestionsByRow, onCloneMt940Suggestion, txnTypeDescriptions, toggleSelect,
  ]);

  const cellPy = relaxedMode ? 'py-1' : 'py-2';

  const hasSelection = selectedIds.size > 0;

  // Sortable columns are per-DataSetType (statement text columns vs the
  // Ledger V2 names). Memoized so the header render's .has() checks stay
  // cheap and referentially stable while scrolling.
  const sortableFieldSet = useMemo(
    () => new Set<string>(getSortableFields(dataSetType)),
    [dataSetType],
  );

  // Ledger journal-entry zebra banding: under the DEFAULT sort the legs of
  // one accounting document are contiguous (PostingDate → TransactionId →
  // Sequence), so alternate the row background whenever the TransactionId
  // changes — the operator can see where one document ends and the next
  // begins. Disabled under a click-sort (legs scatter, so the band would
  // flip on nearly every row) and everywhere outside Ledger. One O(rows)
  // pass, re-run only when the row set changes.
  const ledgerBands = useMemo(() => {
    if (dataSetType !== 'Ledger' || sortOverride) return null;
    let band = false;
    let prev: string | null = null;
    return data.map(({ row }) => {
      const id = String(row['TransactionId'] ?? row['StatementId'] ?? '');
      if (prev !== null && id !== prev) band = !band;
      prev = id;
      return band;
    });
  }, [data, dataSetType, sortOverride]);

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
  }, [columnSearchQuery, visibleColumns, dataSetType]);

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
  // `overscan` is 24 rows on each side. The old ceiling (12) existed
  // because every scroll-triggered parent re-render re-rendered every
  // mounted row at full cost (regex validation, LOV lookups, ~14
  // floating-ui Tooltip mounts per row), so buffering more rows made
  // scrolling *worse*. Both costs are gone now: rows are memoized
  // (`TableRow` skips unchanged rows on scroll re-renders because
  // `rowCtx` is referentially stable while scrolling) and Tooltips
  // arm lazily on first hover (zero floating-ui hooks at row mount).
  // With mounted-row cost out of the scroll path, a deeper overscan
  // buffer is pure headroom against blanking during fast flicks.
  //
  // The horizontal scroll lives on the SAME container; tanstack-
  // virtual only manages vertical, so sticky headers / sticky
  // columns / horizontal scroll all keep working untouched.
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 30.4,
    overscan: 24,
    // Stable per-row key so React can match measured heights across
    // re-renders when the underlying data shifts (filter change,
    // hide / unhide, +N append, etc.).
    getItemKey: (index) => getRowId(data[index].row),
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  // Re-sync the virtualizer whenever the underlying row set changes. The
  // rows arrive AFTER mount (the live dual-query refill lands async, and
  // analyzeRow commits in idle-callback chunks), so the buffer the
  // virtualizer first measured is replaced a beat later. tanstack-virtual
  // only re-reads the scroll element + re-measures on a scroll/resize
  // event, so without this kick it keeps a stale scroll offset and
  // measurement cache and paints the rows at the wrong vertical offset —
  // a large empty gap that only collapses once the operator scrolls. This
  // effect keys off the row-set identity (length + first/last row id), so
  // it does NOT fire while scrolling (the signature is stable then) and
  // costs nothing on the hot path.
  //
  // A changed FIRST row id (or a transition out of empty) means the buffer
  // was REPLACED (filter change, hide refill, remount, classic page nav),
  // not appended to — snap the scroll back to the top so the fresh rows
  // render from offset 0. A pure `+N` append keeps the same first row id
  // and must keep the operator's scroll position, so it only re-measures.
  const firstRowId = data.length > 0 ? getRowId(data[0].row) : null;
  const lastRowId = data.length > 0 ? getRowId(data[data.length - 1].row) : null;
  const prevFirstRowIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (data.length === 0) { prevFirstRowIdRef.current = null; return; }
    if (firstRowId !== prevFirstRowIdRef.current) {
      scrollContainerRef.current?.scrollTo({ top: 0 });
      prevFirstRowIdRef.current = firstRowId;
    }
    rowVirtualizer.measure();
    // Keyed by the row-set signature; rowVirtualizer identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, firstRowId, lastRowId]);

  // Mirror tanstack-virtual's `isScrolling` into the global scrolling
  // signal. Tooltip reads it at event time (no subscription): rows
  // sliding under a stationary cursor mid-scroll fire mouseenter with
  // no user intent, and the signal is how Tooltip distinguishes those
  // from a real hover before arming its floating-ui machinery.
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
        // Cap the table to the viewport space below the builder so the two
        // fit without page scroll. When the builder is OPEN, FLOOR that cap
        // (`max(...)`) so a tall builder on a short window can't squeeze the
        // table down to a sliver that clips its rows (e.g. tall char-view
        // Arabic rows). Below the floor the page scrolls to reveal the table
        // instead. Without the floor, a squeezed calc drops below min-height,
        // CSS lets min-height win, and the card froze at ~one or two row
        // heights while the real rows overflowed and clipped.
        maxHeight: builderHeight > 0
          ? `max(32rem, calc(100vh - 17.3rem - ${builderHeight + 25}px${actionBarOffset ? ` + ${actionBarOffset}px` : ''}))`
          : `calc(100vh - 17.3rem${actionBarOffset ? ` + ${actionBarOffset}px` : ''})`,
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
        // Dead-end means "can't be tagged today" — flagging a row that
        // already has detected tag specs contradicts that, and unflagging
        // one is just as nonsensical (the operator should hide the tag,
        // not toggle dead-end state). Block both buttons whenever any
        // selected row carries at least one tag. These flags come from the
        // memoized `selectionSummary` (one O(selected) pass) so the action
        // bar stays O(1) per render even with tens of thousands selected.
        const { allDeadEnd, noneDeadEnd, anySelectedTagged } = selectionSummary;
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
                data-minimap-idx={block.origIdx}
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
        <table ref={tableRef} className="min-w-full divide-y divide-divide">
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
                const isSortable = col.type === 'data' && !!onSortChange && sortableFieldSet.has(col.field);
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
                        <span>{getColumnLabel(col)}</span>
                        <SortChevron activeOrder={activeSort} />
                      </button>
                    ) : getColumnLabel(col))}
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
            {forceSkeleton || (loading && data.length === 0) ? (
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
                  return (
                    <TableRow
                      key={virtualRow.key}
                      item={item}
                      index={i}
                      rowId={rowId}
                      isSelected={selectedIds.has(rowId)}
                      isDeadEnd={item.row['IsDeadEnd'] === true}
                      band={ledgerBands?.[i] ?? false}
                      rowHighlight={highlightSource?.rowIdx === i ? highlightSource : null}
                      measureRef={rowVirtualizer.measureElement}
                      ctx={rowCtx}
                    />
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
        {/* Invisible width-reservation spacer. Holds the scroll container's
            scrollWidth at the widest the table has been (`stableMinWidth`) so a
            narrow virtual window can't shrink the content and make the browser
            clamp scrollLeft (the horizontal-scroll "jump back to the left"
            bug). It reserves width WITHOUT stretching the table, so auto-layout
            no longer dumps slack into a flexible column (the ballooned Tags
            column). Zero height → no vertical footprint. */}
        {stableMinWidth > 0 && (
          <div aria-hidden style={{ width: `${stableMinWidth}px`, height: 0 }} />
        )}
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
