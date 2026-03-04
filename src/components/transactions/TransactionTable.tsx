import { useMemo, useLayoutEffect, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { AnalyzedTransaction, TagSpecDefinition, RuleExpression } from '../../types';
import { useTransactionData } from '../../hooks/useTransactionData';
import { PREDEFINED_PATTERNS } from '../../constants/operations';
import { TagBadge } from './TagBadge';
import { Tooltip } from '../shared/Tooltip';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { decomposeExtractionRegex } from '../../utils/engregxify';

interface TransactionTableProps {
  data: AnalyzedTransaction[];
  tagDefinitions: TagSpecDefinition[];
  originalDefinitionIds?: Set<string>;
  highlightExpressions?: RuleExpression[];
  stickyFields?: Set<string>;
  onTagClick?: (tagName: string, definitionId?: string) => void;
  onFlagDeadEnd?: (ids: string[], value: boolean) => void;
  showAttributes?: boolean;
  relaxedMode?: boolean;
  hiddenColumns?: Set<string>;
  columnOrder?: string[];
  onColumnsReady?: (columns: ColumnDef[]) => void;
  builderHeight?: number;
  loading?: boolean;
  accentHue?: number;
}

type ColumnDef =
  | { type: 'data'; key: string; field: string }
  | { type: 'attribute'; key: string; name: string }
  | { type: 'tags'; key: string }
  | { type: 'dates'; key: string; fields: { key: string; label: string }[] }
  | { type: 'debit'; key: string }
  | { type: 'credit'; key: string };

const DEFAULT_COLUMN_ORDER = ['data:AdditionalInformation', 'data:Description1', 'data:Description2', 'data:BankReference', '__dates', '__debit', '__credit'];
const SIDE_AMOUNT_FIELDS = new Set(['Side', 'Amount']);
const DATE_GROUP_FIELDS = ['StatementDate', 'EntryDate', 'ValueDate'];
const DATE_GROUP_LABELS: Record<string, string> = {
  EntryDate: 'Entry',
  StatementDate: 'Statement',
  ValueDate: 'Value',
};

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
    const globalRegex = new RegExp(regex.source, 'g');
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
      <mark key={start} className="bg-orange-400 rounded-sm text-slate-900 font-medium p-0.5">
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
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Exclude tags (always visible) and attributes (follow their source field, not independently sortable)
  const toggleable = columns.filter((col) => {
    if (col.type === 'tags') return false;
    if (col.type === 'attribute') return false;
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
        <div className="absolute top-full mt-1 right-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-[220px] max-h-64 overflow-y-auto px-2 pb-2">
          <div className="sticky top-0 bg-surface z-10 flex items-center justify-between border-b border-border-subtle mb-1 pt-2 pb-1.5">
            <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-body hover:bg-surface-hover rounded cursor-pointer">
              <input
                type="checkbox"
                checked={visibleCount === totalCount}
                ref={(el) => { if (el) el.indeterminate = visibleCount > 0 && visibleCount < totalCount; }}
                onChange={() => {
                  if (visibleCount === totalCount) {
                    onChange(new Set(toggleable.map((c) => c.key)));
                  } else {
                    onChange(new Set());
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
          {ordered.map((col, i) => {
            const label = getColumnLabel(col);
            const isHidden = hiddenColumns.has(col.key);
            const isDragOver = overIdx === i && dragIdx !== null && dragIdx !== i;
            return (
              <div
                key={col.key}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setOverIdx(i);
                }}
                onDragLeave={() => { if (overIdx === i) setOverIdx(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx !== null) handleDrop(dragIdx, i);
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                className={`flex items-center gap-2 px-2 py-1 text-xs hover:bg-surface-hover rounded cursor-grab active:cursor-grabbing select-none transition-colors ${isDragOver ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'
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
      )}
    </div>
  );
}

export type { ColumnDef };

export function TransactionTable({ data, tagDefinitions, originalDefinitionIds, highlightExpressions, stickyFields, onTagClick, onFlagDeadEnd, showAttributes = true, relaxedMode = false, hiddenColumns = new Set(), columnOrder, onColumnsReady, builderHeight = 0, loading = false, accentHue = 190 }: TransactionTableProps) {
  const { fieldMeta } = useTransactionData();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const handleFlagDeadEnd = useCallback((value: boolean) => {
    if (!onFlagDeadEnd || selectedIds.size === 0) return;
    onFlagDeadEnd(Array.from(selectedIds), value);
    setSelectedIds(new Set());
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
  const attrValidationMap = useMemo(() => {
    const map = new Map<string, { regex: RegExp; sourceField: string; verifyValue?: string }>();
    for (const def of tagDefinitions) {
      for (const attr of def.Attributes) {
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
        }
      }
    }
    return map;
  }, [tagDefinitions]);

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
    const dateGroupSet = new Set(DATE_GROUP_FIELDS);
    let dateGroupInserted = false;
    let debitCreditInserted = false;

    // Tags column first (sticky left)
    cols.push({ type: 'tags', key: '__tags' });

    for (const field of fieldMeta.dataFields) {
      // Group date fields into a single "Dates" column
      if (dateGroupSet.has(field)) {
        if (!dateGroupInserted) {
          const presentDateFields = DATE_GROUP_FIELDS
            .filter((f) => fieldMeta.dataFields.includes(f))
            .map((f) => ({ key: f, label: DATE_GROUP_LABELS[f] }));
          cols.push({ type: 'dates', key: '__dates', fields: presentDateFields });
          dateGroupInserted = true;
        }
        continue;
      }
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

  // Determine which column indices should be sticky, split into left/right groups
  const { leftIndices, rightIndices } = useMemo(() => {
    const left = new Set<number>();
    const right = new Set<number>();

    // Tags column is always sticky left
    const tagsIdx = visibleColumns.findIndex((col) => col.type === 'tags');
    if (tagsIdx !== -1) left.add(tagsIdx);

    if (stickyFields && stickyFields.size > 0) {
      const midpoint = visibleColumns.length / 2;
      visibleColumns.forEach((col, idx) => {
        if (col.type === 'data' && stickyFields.has(col.field)) {
          if (idx < midpoint) left.add(idx);
          else right.add(idx);
        }
      });
    }

    return { leftIndices: left, rightIndices: right };
  }, [visibleColumns, stickyFields]);

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

  const getAttributeValue = (item: AnalyzedTransaction, attrName: string): string | null => {
    for (const tagAttrs of Object.values(item.analysis.attributes)) {
      if (attrName in tagAttrs && tagAttrs[attrName] !== null) {
        return tagAttrs[attrName];
      }
    }
    return null;
  };

  // Get tooltip for an attribute cell based on the tag that produced it for this row
  const getAttributeTooltip = (item: AnalyzedTransaction, attrName: string): string | null => {
    for (const def of item.analysis.matchedDefinitions) {
      const attr = def.Attributes.find((a) => a.AttributeTag === attrName);
      if (attr) {
        const expr = attr.AttributeRuleExpression;
        const source = humanizeFieldName(expr.SourceField);
        const decomposed = decomposeExtractionRegex(expr.Regex);
        switch (decomposed.operation) {
          case 'extract_between':
            return `Extracted from ${source} between '${decomposed.prefix}' and '${decomposed.suffix}'`;
          case 'extract_after':
            return `Extracted from ${source} after '${decomposed.prefix}'`;
          case 'extract_before':
            return `Extracted from ${source} before '${decomposed.suffix}'`;
          case 'extract_matching':
          default:
            return `Extracted from ${source} matching '${decomposed.pattern || expr.Regex}'`;
        }
      }
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
    const text = String(value);
    if (highlightMap) {
      const regexes = highlightMap.get(field);
      if (regexes) return highlightText(text, regexes);
    }
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

  return (
    <div className="rounded-lg border border-border flex flex-col" style={{ maxHeight: `calc(100vh - 15rem${builderHeight > 0 ? ` - ${builderHeight > 400 ? 100 : builderHeight + 25}px` : ''})` }}>
      {/* Selection action bar */}
      {hasSelection && onFlagDeadEnd && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 shrink-0">
          <span className="text-xs font-medium text-primary-dark">
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => handleFlagDeadEnd(true)}
            className="text-xs px-2.5 py-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
          >
            Flag as Dead End
          </button>
          <button
            onClick={() => handleFlagDeadEnd(false)}
            className="text-xs px-2.5 py-1 rounded border border-border-strong bg-surface text-body hover:bg-surface-hover transition-colors"
          >
            Unflag Dead End
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted hover:text-body ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Column Minimap */}
      {hasOverflow && (
        <div
          ref={minimapBarRef}
          className="sticky top-0 z-20 h-5 bg-surface border-b border-border-subtle cursor-pointer select-none flex shrink-0"
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
        >
          {minimapBlocks.map((block) => (
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
            className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-orange-500 rounded-sm pointer-events-none"
          />
        </div>
      )}

      {/* Scrollable table */}
      <div ref={scrollContainerRef} className="overflow-auto flex-1 min-h-0">
        <table className="min-w-full divide-y divide-divide">
          <thead ref={theadRef} className="bg-surface-secondary">
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
          </thead>
          <tbody className="bg-surface divide-y divide-divide">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="px-3 py-6 text-center text-xs text-faint"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Loading transactions…</span>
                    </div>
                  ) : (
                    'No transactions match the current filter.'
                  )}
                </td>
              </tr>
            ) : (
              data.map((item, i) => {
                const rowId = getRowId(item.row);
                const isSelected = selectedIds.has(rowId);
                const isDeadEnd = item.row['IsDeadEnd'] === true;
                return (
                  <tr key={i} className={`group transition-colors ${isDeadEnd ? 'bg-red-200/70 opacity-60' : 'hover:bg-surface-hover'} ${isSelected ? 'bg-primary/10!' : ''}`}>
                    {visibleColumns.map((col, colIdx) => {
                      const isStickyCol = stickyLefts.has(colIdx) || stickyRights.has(colIdx);
                      const stickyBg = isStickyCol ? 'bg-surface group-hover:bg-surface-hover' : '';

                      switch (col.type) {
                        case 'data': {
                          const isHighlighted = highlightSource?.rowIdx === i && highlightSource.field === col.field;
                          return (
                            <td key={col.key} className={`px-3 ${cellPy} text-xs text-body-secondary ${relaxedMode ? 'whitespace-nowrap' : 'max-w-200'} ${stickyBg} ${isHighlighted ? 'ring-2 ring-gray-400/60 ring-inset bg-gray-100 dark:bg-gray-700/40' : ''}`} style={getCellStyle(colIdx, false)}>
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
                                  {isReturn && <span className="text-[9px] font-semibold text-amber-500 bg-amber-50 border border-amber-200 rounded px-1">RTN</span>}
                                  <span><span className="icon-saudi_riyal">&#xea;</span> {Number(amt).toLocaleString()}</span>
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
                                  {isReturn && <span className="text-[9px] font-semibold text-amber-500 bg-amber-50 border border-amber-200 rounded px-1">RTN</span>}
                                  <span><span className="icon-saudi_riyal">&#xea;</span> {Number(amt).toLocaleString()}</span>
                                </div>
                              ) : '-'}
                              {stickyEdgeShadow(colIdx)}
                            </td>
                          );
                        }
                        case 'attribute': {
                          const val = getAttributeValue(item, col.name);
                          const validation = attrValidationMap.get(col.name);
                          let validationIcon: ReactNode = null;
                          let validationPassed: boolean | null = null;
                          if (validation) {
                            if (validation.verifyValue) {
                              validationPassed = val === validation.verifyValue;
                            } else {
                              const sourceVal = String(item.row[validation.sourceField] ?? '');
                              validationPassed = validation.regex.test(sourceVal);
                            }
                            validationIcon = validationPassed
                              ? <span className="text-emerald-500 mr-1" title="Valid">&#10003;</span>
                              : <span className="text-red-400 mr-1" title="Invalid">&#10007;</span>;
                          }
                          const displayVal = val ?? (validation ? String(item.row[validation.sourceField] ?? '') : null);
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
                              <div className="flex items-start gap-1.5">
                                {onFlagDeadEnd && (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelect(rowId)}
                                    className="rounded border-border-strong mt-0.5 shrink-0"
                                  />
                                )}
                                <div className="flex-1">
                                  {item.analysis.tags.length > 0 ? (
                                    <div className={`flex gap-1 ${relaxedMode ? 'flex-nowrap' : 'flex-wrap'}`}>
                                      {item.analysis.tags.map((tag, ti) => {
                                        const defId = item.analysis.matchedDefinitions[ti]?.Id;
                                        const isUserCreated = defId ? !(originalDefinitionIds?.has(defId)) : false;
                                        return (
                                          <TagBadge
                                            key={tag}
                                            tag={tag}
                                            certainty={getCertainty(tag)}
                                            isUserCreated={isUserCreated}
                                            onClick={onTagClick ? () => onTagClick(tag, defId) : undefined}
                                          />
                                        );
                                      })}
                                      {/* {hintList && (
                                        <Tooltip
                                          content={
                                            <div className="">
                                              {hintList.map((h, hi) => (
                                                <span key={hi}>{h}</span>
                                              ))}
                                            </div>
                                          }
                                          placement="left"
                                        >
                                          <span className="text-left pl-2 text-[10px] text-primary cursor-default mt-0.5 inline-block">
                                            Hints?
                                          </span>
                                        </Tooltip>
                                      )} */}
                                    </div>
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
