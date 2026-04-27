import { useMemo, useLayoutEffect, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { AnalyzedTransaction, TagSpecDefinition, TagAttribute, RuleExpression, TransactionRow } from '../../types';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { PREDEFINED_PATTERNS } from '../../constants/operations';
import { TagBadge } from './TagBadge';
import { Badge } from '../shared/Badge';
import { Tooltip } from '../shared/Tooltip';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { decomposeExtractionRegex } from '../../utils/engregxify';
import { regexifyExtraction } from '../../utils/regexify';
import { extractAttributes } from '../../utils/extractAttributes';
import { diffStrings } from '../../utils/textDiff';
import { DropdownBackdrop } from '../shared/DropdownBackdrop';

interface TransactionTableProps {
  data: AnalyzedTransaction[];
  tagDefinitions: TagSpecDefinition[];
  originalDefinitionIds?: Set<string>;
  definitionSourceMap?: Map<string, string>;
  highlightExpressions?: RuleExpression[];
  searchHighlights?: Map<string, string>;
  onTagClick?: (tagName: string, definitionId?: string) => void;
  onFlagDeadEnd?: (ids: string[], value: boolean) => Promise<void>;
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
}

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
];

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
  // __debit / __credit are added conditionally by the caller based on checkout side.
]);
const SIDE_AMOUNT_FIELDS = new Set(['Side', 'Amount']);
const DATE_FIELDS = new Set(['StatementDate', 'EntryDate', 'ValueDate']);
const DATE_COLUMN_LABELS: Record<string, string> = {
  StatementDate: 'Statement Date',
  EntryDate: 'Entry',
  ValueDate: 'Value',
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
    case 'debit': return 'text-red-400';
    case 'credit': return 'text-emerald-400';
  }
}

function getMinimapBorderColor(type: ColumnDef['type']): string | null {
  switch (type) {
    case 'attribute': return '#3b82f6'; // blue-500
    case 'debit': return '#ef4444';     // red-500
    case 'credit': return '#10b981';    // emerald-500
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

export function ColumnPicker({ columns, hiddenColumns, onChange, columnOrder, onColumnOrderChange, defaultHiddenColumns, onReset }: {
  columns: ColumnDef[];
  hiddenColumns: Set<string>;
  onChange: (hidden: Set<string>) => void;
  columnOrder?: string[];
  onColumnOrderChange?: (order: string[]) => void;
  defaultHiddenColumns?: Set<string>;
  onReset?: () => void;
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
          <div ref={scrollContainerRef} className="absolute top-full mt-1 right-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64 max-h-72 overflow-y-auto custom-scrollbar p-1.5">
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
              const isHidden = hiddenColumns.has(col.key);
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
                >
                  <svg className="w-3 h-3 text-faint shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                  </svg>
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => {
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

export function TransactionTable({ data, tagDefinitions, originalDefinitionIds, definitionSourceMap, highlightExpressions, searchHighlights, onTagClick, onFlagDeadEnd, showAttributes = true, relaxedMode = false, hiddenColumns = new Set(), columnOrder, onColumnsReady, onVisibleColumnsReady, builderHeight = 0, loading = false, accentHue = 190, onRowContextMenu, originalEditingDef, activeDefinitionId }: TransactionTableProps) {
  const { fieldMeta } = useTransactionData();
  const { lovLookup } = useLovAttributes();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((item) => getRowId(item.row))));
    }
  }, [data, selectedIds.size, getRowId]);

  const [flagLoading, setFlagLoading] = useState(false);
  const handleFlagDeadEnd = useCallback(async (value: boolean) => {
    if (!onFlagDeadEnd || selectedIds.size === 0) return;
    setFlagLoading(true);
    try {
      await onFlagDeadEnd(Array.from(selectedIds), value);
      setSelectedIds(new Set());
    } finally {
      setFlagLoading(false);
    }
  }, [onFlagDeadEnd, selectedIds]);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [data.length]);

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

  // Collect all distinct attribute names across all analyzed rows
  const attributeColumns = useMemo(() => {
    const names = new Set<string>();
    for (const item of data) {
      for (const tagAttrs of Object.values(item.analysis.attributes)) {
        for (const attrName of Object.keys(tagAttrs)) {
          names.add(attrName);
        }
      }
    }
    return Array.from(names).sort();
  }, [data]);

  // Map attribute names to their source field from definitions
  const attrSourceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of tagDefinitions) {
      for (const attr of def.Attributes) {
        if (!map.has(attr.AttributeTag)) {
          map.set(attr.AttributeTag, attr.AttributeRuleExpression.SourceField);
        }
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
        const op = attr.AttributeRuleExpression.Regex;

        // Check for extract_between_and_verify (has VerifyValue)
        if (attr.AttributeRuleExpression.VerifyValue) {
          try {
            map.set(attr.AttributeTag, {
              regex: new RegExp(op),
              sourceField: attr.AttributeRuleExpression.SourceField,
              verifyValue: attr.AttributeRuleExpression.VerifyValue,
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
            map.set(attr.AttributeTag, { regex: new RegExp(predefined.regex), sourceField: attr.AttributeRuleExpression.SourceField });
          } catch { /* skip */ }
          continue;
        }

        // Use ValidationClass regex to validate the extracted value
        const vcRegex = validationClassRegexMap.get(attr.ValidationRuleTag);
        if (vcRegex) {
          try {
            map.set(attr.AttributeTag, {
              regex: new RegExp(vcRegex),
              sourceField: attr.AttributeRuleExpression.SourceField,
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
      // Combine Side + Amount into Debit/Credit columns
      if (SIDE_AMOUNT_FIELDS.has(field)) {
        if (!debitCreditInserted) {
          cols.push({ type: 'debit', key: '__debit' });
          cols.push({ type: 'credit', key: '__credit' });
          debitCreditInserted = true;
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

    // Group attributes by their source field key
    const attrsBySourceKey = new Map<string, ColumnDef[]>();
    for (const attr of attrs) {
      if (attr.type === 'attribute') {
        const sourceField = attrSourceMap.get(attr.name);
        const sourceKey = sourceField ? `data:${sourceField}` : null;
        if (sourceKey) {
          if (!attrsBySourceKey.has(sourceKey)) attrsBySourceKey.set(sourceKey, []);
          attrsBySourceKey.get(sourceKey)!.push(attr);
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

    // Orphan attributes (no matching source field in view) go at the end
    for (const remaining of attrsBySourceKey.values()) {
      final.push(...remaining);
    }

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
    const expr = attr.AttributeRuleExpression;
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
  // normalized regex, and transformation pipeline.
  const attrRulesEqual = (a: TagAttribute, b: TagAttribute): boolean => {
    if (a.AttributeRuleExpression.SourceField !== b.AttributeRuleExpression.SourceField) return false;
    if (normalizeRegex(a.AttributeRuleExpression.Regex) !== normalizeRegex(b.AttributeRuleExpression.Regex)) return false;
    const ta = a.Transformations ?? [];
    const tb = b.Transformations ?? [];
    if (ta.length !== tb.length) return false;
    for (let i = 0; i < ta.length; i++) {
      if (ta[i].Method !== tb[i].Method) return false;
      const aa = ta[i].Args ?? [];
      const bb = tb[i].Args ?? [];
      if (aa.length !== bb.length) return false;
      for (let j = 0; j < aa.length; j++) {
        if (aa[j].Key !== bb[j].Key || aa[j].Value !== bb[j].Value) return false;
      }
    }
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
    // 1) Client-computed value (reflects live rule-builder drafts/edits).
    // analysis.attributes is keyed by def.Id. When activeDefinitionId is set
    // (e.g. the user clicked into a tag's matches, or is editing a def), prefer
    // that def's value — important for multi-tagged rows where two defs share
    // an attribute name but extract different values.
    if (activeDefinitionId) {
      const tagAttrs = item.analysis.attributes[activeDefinitionId];
      if (tagAttrs && attrName in tagAttrs && tagAttrs[attrName] !== null) {
        return tagAttrs[attrName];
      }
    }
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
    // When the user is actively editing this attribute's rule and the draft
    // didn't match, stop here — falling back to server-computed values would
    // display the pre-edit result and falsely suggest the draft still works.
    if (isAttributeBeingEdited(item, attrName)) return null;
    // 2) Server-provided fallback — the API response carries pre-computed values
    // in OpsAttributes (single-tag rows) or OpsMultiTags[*].Attributes (multi-tag
    // rows). Use them when the client couldn't extract (e.g. regex has no capture
    // group, or the source field on this row is empty).
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
    const primary = scan(row.OpsAttributes);
    if (primary !== null) return primary;
    const multi = row.OpsMultiTags;
    if (Array.isArray(multi)) {
      // When activeDefinitionId is set, find that specific entry first.
      // Otherwise fall back to the first non-empty across all entries.
      if (activeDefinitionId) {
        for (const mt of multi) {
          if (mt && typeof mt === 'object') {
            const m = mt as { TagSpecDefinitionId?: unknown; Attributes?: unknown };
            if (m.TagSpecDefinitionId === activeDefinitionId) {
              const v = scan(m.Attributes);
              if (v !== null) return v;
            }
          }
        }
      }
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

  // Get the source field for an attribute cell based on the tag that produced it for this row
  const getAttributeSourceField = (item: AnalyzedTransaction, attrName: string): string | null => {
    for (const def of item.analysis.matchedDefinitions) {
      const attr = def.Attributes.find((a) => a.AttributeTag === attrName);
      if (attr) return attr.AttributeRuleExpression.SourceField;
    }
    return null;
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

  return (
    <div className="rounded-lg border border-border flex flex-col relative" style={{ maxHeight: `calc(100vh - 17.3rem${builderHeight > 0 ? ` - ${builderHeight + 25}px` : ''})`, minHeight: '300px' }}>
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
        return (
          <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 shrink-0">
            <span className="text-xs font-medium text-primary-dark">
              {selectedIds.size} selected
            </span>
            {!allDeadEnd && (
              <button
                onClick={() => handleFlagDeadEnd(true)}
                disabled={flagLoading}
                className="text-xs px-2.5 py-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {flagLoading ? 'Flagging...' : 'Flag as Dead End'}
              </button>
            )}
            {!noneDeadEnd && (
              <button
                onClick={() => handleFlagDeadEnd(false)}
                disabled={flagLoading}
                className="text-xs px-2.5 py-1 rounded border border-border-strong bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {flagLoading ? 'Unflagging...' : 'Unflag Dead End'}
              </button>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted hover:text-body ml-auto"
            >
              Clear selection
            </button>
          </div>
        );
      })()}

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
                return (
                  <th
                    key={col.key}
                    className={`px-3 ${cellPy} text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${isAttr ? 'text-primary-dark bg-white dark:bg-slate-800' : 'text-body-secondary bg-surface-secondary'
                      }`}
                    style={{ ...getCellStyle(idx, true),paddingBottom: 8, boxShadow: hasOverflow ? `inset 0 -3px 0 ${columnAccentColors.get(col.key)}` : undefined }}
                  >
                    {col.type === 'data' && humanizeFieldName(col.field)}
                    {col.type === 'attribute' && humanizeFieldName(col.name)}
                    {col.type === 'tags' && (
                      <div className="flex items-center gap-1.5">
                        {onFlagDeadEnd && (
                          <input
                            type="checkbox"
                            checked={data.length > 0 && selectedIds.size === data.length}
                            onChange={toggleSelectAll}
                            className="rounded border-border-strong"
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
              data.map((item, i) => {
                const rowId = getRowId(item.row);
                const isSelected = selectedIds.has(rowId);
                const isDeadEnd = item.row['IsDeadEnd'] === true;
                return (
                  <tr key={i} className={`group transition-colors ${isDeadEnd ? 'bg-red-100/60 dark:bg-red-950/30 text-red-400 dark:text-red-500/70' : 'hover:bg-surface-hover'} ${isSelected ? 'bg-primary/10!' : ''}`} onContextMenu={onRowContextMenu ? (e) => { e.preventDefault(); onRowContextMenu(item.row, e.clientX, e.clientY); } : undefined}>
                    {visibleColumns.map((col, colIdx) => {
                      const isStickyCol = stickyLefts.has(colIdx) || stickyRights.has(colIdx);
                      const stickyBg = isStickyCol ? 'bg-surface group-hover:bg-surface-hover' : '';

                      switch (col.type) {
                        case 'data': {
                          const isHighlighted = highlightSource?.rowIdx === i && highlightSource.field === col.field;
                          return (
                            <td key={col.key} className={`px-3 ${cellPy} text-xs text-body-secondary ${relaxedMode ? 'whitespace-nowrap' : 'max-w-200'} ${stickyBg} ${isHighlighted ? 'ring-1 ring-primary/30 ring-inset bg-primary/5 dark:bg-primary/10' : ''}`} style={getCellStyle(colIdx, false)}>
                              {renderCellContent(col.field, item.row[col.field])}
                              {stickyEdgeShadow(colIdx)}
                            </td>
                          );
                        }
                        case 'dates':
                          return (
                            <td key={col.key} className={`px-3 ${cellPy} text-xs text-body-secondary ${stickyBg}`} style={getCellStyle(colIdx, false)}>
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
                        case 'debit': {
                          const side = String(item.row['Side'] ?? '');
                          const isDebit = side === 'DR' || side === 'RC';
                          const isReturn = side === 'RC';
                          const amt = isDebit ? item.row['Amount'] : null;
                          return (
                            <td key={col.key} className={`px-3 ${cellPy} text-xs text-right font-medium whitespace-nowrap ${amt != null ? 'text-red-600' : 'text-faint'} ${stickyBg} `} style={getCellStyle(colIdx, false)}>
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
                        case 'credit': {
                          const side = String(item.row['Side'] ?? '');
                          const isCredit = side === 'CR' || side === 'RD';
                          const isReturn = side === 'RD';
                          const amt = isCredit ? item.row['Amount'] : null;
                          return (
                            <td key={col.key} className={`px-3 ${cellPy} text-xs text-right font-medium whitespace-nowrap ${amt != null ? 'text-emerald-500' : 'text-faint'} ${stickyBg}`} style={getCellStyle(colIdx, false)}>
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
                          // Untagged transactions should not display any attribute value
                          if (item.analysis.tags.length === 0) {
                            return (
                              <td
                                key={col.key}
                                className={`px-3 ${cellPy} text-xs text-left ${isStickyCol ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-primary/5'}`}
                                style={getCellStyle(colIdx, false)}
                              >
                                <span className="text-faint">-</span>
                                {stickyEdgeShadow(colIdx)}
                              </td>
                            );
                          }
                          const val = getAttributeValue(item, col.name);
                          const validation = attrValidationMap.get(col.name);
                          let validationIcon: ReactNode = null;
                          let validationPassed: boolean | null = null;
                          if (validation) {
                            if (validation.verifyValue) {
                              validationPassed = val === validation.verifyValue;
                            } else if (validation.validateExtracted) {
                              // Validate the extracted value against the ValidationClass regex
                              validationPassed = val ? validation.regex.test(val) : null;
                            } else {
                              const sourceVal = String(item.row[validation.sourceField] ?? '');
                              validationPassed = validation.regex.test(sourceVal);
                            }
                            validationIcon = validationPassed
                              ? <span className="text-emerald-500 mr-1" title="Valid">&#10003;</span>
                              : <span className="text-red-400 mr-1" title="Invalid">&#10007;</span>;
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
                              className={`px-3 ${cellPy} text-xs ${relaxedMode ? 'whitespace-nowrap' : ''}
                              ${validationIcon ? 'text-center' : 'text-left'}
                              ${validationPassed === true ? 'text-emerald-500' : validationPassed === false ? 'text-red-400' : 'text-primary-dark'}
                              ${isAttrHighlighted ? 'ring-2 ring-blue-400/60 ring-inset bg-blue-50 dark:bg-blue-900/30' : isStickyCol ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-primary/5'}`}
                              style={getCellStyle(colIdx, false)}
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
                                <div className="w-full h-full flex items-center">
                                  {displayVal ? <span>{validationIcon}{displayVal}</span> : <span className="text-faint">-</span>}
                                </div>
                              </Tooltip>
                              {stickyEdgeShadow(colIdx)}
                            </td>
                          );
                        }
                        case 'tags': {
                          return (
                            <td key={col.key} className={`px-3 ${cellPy} ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                              <div className="flex items-center gap-1.5">
                                {onFlagDeadEnd && (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelect(rowId)}
                                    className="rounded border-border-strong shrink-0"
                                  />
                                )}
                                <div className="flex-1">
                                  {item.analysis.tags.length > 0 ? (
                                    <div className={`flex gap-1 ${relaxedMode ? 'flex-nowrap' : 'flex-wrap'}`}>
                                      {isDeadEnd && (
                                        <Badge variant="none" size="sm" className="border border-red-200 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 px-2.5 shrink-0">Dead End</Badge>
                                      )}
                                      {item.analysis.tags.map((tag, ti) => {
                                        const defId = item.analysis.matchedDefinitions[ti]?.Id;
                                        const isUserCreated = defId ? !(originalDefinitionIds?.has(defId)) : false;
                                        const source = isUserCreated ? 'Frontend' : (defId ? (definitionSourceMap?.get(defId) ?? null) : null);
                                        const badge = (
                                          <TagBadge
                                            tag={tag}
                                            certainty={getCertainty(tag)}
                                            isUserCreated={isUserCreated}
                                            onClick={onTagClick ? () => onTagClick(tag, defId) : undefined}
                                          />
                                        );
                                        if (!source) return <span key={tag}>{badge}</span>;
                                        return (
                                          <Tooltip key={tag} content={`Source: ${source}`} placement="top">
                                            <span>{badge}</span>
                                          </Tooltip>
                                        );
                                      })}
                                    </div>
                                  ) : isDeadEnd ? (
                                    <Badge variant="none" size="sm" className="border border-red-200 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 px-2.5">Dead End</Badge>
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
