import { useMemo, useLayoutEffect, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { AnalyzedTransaction, TagSpecDefinition, RuleExpression } from '../../types';
import { useTransactionData } from '../../hooks/useTransactionData';
import { PREDEFINED_PATTERNS } from '../../constants/operations';
import { TagBadge } from './TagBadge';
import { Tooltip } from '../shared/Tooltip';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

interface TransactionTableProps {
  data: AnalyzedTransaction[];
  tagDefinitions: TagSpecDefinition[];
  originalDefinitionIds?: Set<string>;
  highlightExpressions?: RuleExpression[];
  stickyFields?: Set<string>;
  onTagClick?: (tagName: string, definitionId?: string) => void;
}

type ColumnDef =
  | { type: 'data'; key: string; field: string }
  | { type: 'attribute'; key: string; name: string }
  | { type: 'tags'; key: string }
  | { type: 'dates'; key: string; fields: { key: string; label: string }[] }
  | { type: 'debit'; key: string }
  | { type: 'credit'; key: string };

const SIDE_AMOUNT_FIELDS = new Set(['Side', 'Amount']);
const DATE_GROUP_FIELDS = ['EntryDate', 'StatementDate', 'ValueDate'];
const DATE_GROUP_LABELS: Record<string, string> = {
  EntryDate: 'Entry',
  StatementDate: 'Statement',
  ValueDate: 'Value',
};

function getColumnLabel(col: ColumnDef): string {
  switch (col.type) {
    case 'data': return humanizeFieldName(col.field);
    case 'attribute': return col.name;
    case 'tags': return 'Tags';
    case 'dates': return 'Dates';
    case 'debit': return 'Debit Amount';
    case 'credit': return 'Credit Amount';
  }
}

function getColumnInitials(col: ColumnDef): string {
  const label = getColumnLabel(col);
  const words = label.split(/[\s/]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.map((w) => w[0]).join('').toUpperCase();
}

function getMinimapColor(type: ColumnDef['type']): string {
  switch (type) {
    case 'data': return 'bg-slate-300';
    case 'attribute': return 'bg-indigo-400';
    case 'tags': return 'bg-emerald-400';
    case 'dates': return 'bg-slate-300';
    case 'debit': return 'bg-emerald-300';
    case 'credit': return 'bg-red-300';
  }
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

export function TransactionTable({ data, tagDefinitions, originalDefinitionIds, highlightExpressions, stickyFields, onTagClick }: TransactionTableProps) {
  const { fieldMeta } = useTransactionData();
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewportIndicatorRef = useRef<HTMLDivElement>(null);
  const minimapBarRef = useRef<HTMLDivElement>(null);
  const scrollInfoRef = useRef({ scrollLeft: 0, clientWidth: 0, scrollWidth: 0 });

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

  // Determine which column indices should be sticky, split into left/right groups
  const { leftIndices, rightIndices } = useMemo(() => {
    const left = new Set<number>();
    const right = new Set<number>();

    // Tags column is always sticky left
    const tagsIdx = columns.findIndex((col) => col.type === 'tags');
    if (tagsIdx !== -1) left.add(tagsIdx);

    if (stickyFields && stickyFields.size > 0) {
      const midpoint = columns.length / 2;
      columns.forEach((col, idx) => {
        if (col.type === 'data' && stickyFields.has(col.field)) {
          if (idx < midpoint) left.add(idx);
          else right.add(idx);
        }
      });
    }

    return { leftIndices: left, rightIndices: right };
  }, [columns, stickyFields]);

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
    for (let i = 0; i < columns.length; i++) {
      if (leftIndices.has(i)) {
        lefts.set(i, cumLeft);
        cumLeft += ths[i]?.offsetWidth ?? 0;
      }
    }

    // Compute right offsets (cumulate right to left)
    const rights = new Map<number, number>();
    let cumRight = 0;
    for (let i = columns.length - 1; i >= 0; i--) {
      if (rightIndices.has(i)) {
        rights.set(i, cumRight);
        cumRight += ths[i]?.offsetWidth ?? 0;
      }
    }

    setStickyLefts(lefts);
    setStickyRights(rights);
  }, [columns, leftIndices, rightIndices, data]);

  // --- Minimap scroll tracking (via refs, no re-renders) ---

  const updateViewportIndicator = useCallback(() => {
    const { scrollLeft, clientWidth, scrollWidth } = scrollInfoRef.current;
    const el = viewportIndicatorRef.current;
    if (!el || scrollWidth <= 0) return;

    const vpLeft = (scrollLeft / scrollWidth) * 100;
    const vpWidth = (clientWidth / scrollWidth) * 100;
    el.style.left = `${vpLeft}%`;
    el.style.width = `${vpWidth}%`;

    const bar = minimapBarRef.current;
    if (!bar) return;
    const barWidth = bar.offsetWidth;
    if (barWidth <= 0) return;

    const vpStart = vpLeft;
    const vpEnd = vpLeft + vpWidth;
    const children = bar.children;
    for (let i = 0; i < children.length - 1; i++) {
      const child = children[i] as HTMLElement;
      const blockStart = (child.offsetLeft / barWidth) * 100;
      const blockEnd = ((child.offsetLeft + child.offsetWidth) / barWidth) * 100;
      const span = child.querySelector('span');
      if (span) {
        const inView = blockStart < vpEnd && blockEnd > vpStart;
        span.style.fontWeight = inView ? '700' : '300';
        span.style.fontSize = inView ? '10px' : '9px';
        // span.style.color = inView ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.6)';
        // span.classList.toggle('text-slate-300', inView);
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
  }, [columns, data, updateViewportIndicator]);

  // Minimap: proportional block widths
  const minimapBlocks = useMemo(() => {
    const total = colWidths.reduce((s, w) => s + w, 0);
    if (total === 0) return [];
    return columns.map((col, i) => ({
      col,
      widthPct: ((colWidths[i] ?? 0) / total) * 100,
    }));
  }, [columns, colWidths]);

  // Minimap: click/drag to scroll
  const scrollToMinimapX = useCallback((clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const { scrollWidth, clientWidth } = scrollInfoRef.current;
    const target = ratio * scrollWidth - clientWidth / 2;
    scrollContainerRef.current?.scrollTo({ left: Math.max(0, target) });
  }, []);

  const getColumnAtMinimapX = useCallback((clientX: number, rect: DOMRect): number => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const total = colWidths.reduce((s, w) => s + w, 0);
    if (total === 0) return 0;
    const target = ratio * total;
    let cum = 0;
    for (let i = 0; i < colWidths.length; i++) {
      cum += colWidths[i];
      if (cum >= target) return i;
    }
    return colWidths.length - 1;
  }, [colWidths]);

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

  const renderCellContent = (field: string, value: string | number | boolean | null) => {
    if (value == null) return <span className="text-gray-300">-</span>;
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

  return (
    <div className="rounded-lg border border-gray-200 flex flex-col" style={{ maxHeight: 'calc(100vh - 15.5rem)' }}>
      {/* Column Minimap */}
      {hasOverflow && (
        <div
          ref={minimapBarRef}
          className="relative h-5 bg-white border-b border-gray-100 cursor-pointer select-none flex shrink-0"
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
        >
          {minimapBlocks.map((block, i) => (
            <Tooltip key={columns[i].key} content={getColumnLabel(block.col)} placement="bottom">
              <div
                className={`h-full ${getMinimapColor(block.col.type)} opacity-80 hover:opacity-100 transition-opacity overflow-hidden flex items-center px-px`}
                style={{ width: `${block.widthPct}%`, borderRight: '1px solid white' }}
              >
                <span className="text-[9px] leading-none font-light text-slate-600 whitespace-nowrap">
                  {getColumnInitials(block.col)}
                </span>
              </div>
            </Tooltip>
          ))}
          <div
            ref={viewportIndicatorRef}
            className="absolute top-0 bottom-0 bg-blue-500/20 border-x-2 border-orange-500 rounded-sm pointer-events-none"
          />
        </div>
      )}

      {/* Scrollable table */}
      <div ref={scrollContainerRef} className="overflow-auto flex-1 min-h-0">
        <table className="min-w-full divide-y divide-gray-200">
          <thead ref={theadRef} className="bg-gray-50">
            <tr>
              {columns.map((col, idx) => {
                const isAttr = col.type === 'attribute';
                return (
                  <th
                    key={col.key}
                    className={`px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${isAttr ? 'text-indigo-600 bg-indigo-50' : 'text-gray-600 bg-gray-50'
                      }`}
                    style={getCellStyle(idx, true)}
                  >
                    {col.type === 'data' && humanizeFieldName(col.field)}
                    {col.type === 'attribute' && col.name}
                    {col.type === 'tags' && 'Tags'}
                    {col.type === 'dates' && 'Dates'}
                    {col.type === 'debit' && 'Debit Amount'}
                    {col.type === 'credit' && 'Credit Amount'}
                    {stickyEdgeShadow(idx)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-xs text-gray-400"
                >
                  No transactions match the current filter.
                </td>
              </tr>
            ) : (
              data.map((item, i) => (
                <tr key={i} className="group hover:bg-gray-50 transition-colors">
                  {columns.map((col, colIdx) => {
                    const isStickyCol = stickyLefts.has(colIdx) || stickyRights.has(colIdx);
                    const stickyBg = isStickyCol ? 'bg-white group-hover:bg-gray-50' : '';

                    switch (col.type) {
                      case 'data':
                        return (
                          <td key={col.key} className={`px-3 py-2 text-xs text-gray-600 max-w-200 ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                            {renderCellContent(col.field, item.row[col.field])}
                            {stickyEdgeShadow(colIdx)}
                          </td>
                        );
                      case 'dates':
                        return (
                          <td key={col.key} className={`px-3 py-1.5 text-xs text-gray-600 ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                            <div className="flex flex-col gap-0.5">
                              {col.fields.map((f) => {
                                const val = item.row[f.key];
                                if (val == null || val === '') return null;
                                return (
                                  <span key={f.key} className="whitespace-nowrap">
                                    <span className="text-gray-400">{f.label}:</span>{' '}
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
                        const amt = side === 'DR' ? item.row['Amount'] : null;
                        return (
                          <td key={col.key} className={`px-3 py-2 text-xs text-right font-medium whitespace-nowrap ${amt != null ? 'text-emerald-600' : 'text-gray-300'} ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                            {amt != null ? <div><span className="icon-saudi_riyal">&#xea;</span> {Number(amt).toLocaleString()}</div> : '-'}
                            {stickyEdgeShadow(colIdx)}
                          </td>
                        );
                      }
                      case 'credit': {
                        const side = String(item.row['Side'] ?? '');
                        const amt = side === 'CR' ? item.row['Amount'] : null;
                        return (
                          <td key={col.key} className={`px-3 py-2 text-xs text-right font-medium ${amt != null ? 'text-red-500' : 'text-gray-300'} ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                            {amt != null ? <div><span className="icon-saudi_riyal">&#xea;</span> {Number(amt).toLocaleString()}</div> : '-'}
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
                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2 text-xs
                              ${validationIcon ? 'text-center' : 'text-left'}
                              ${validationPassed === true ? 'text-emerald-500' : validationPassed === false ? 'text-red-400' : 'text-indigo-700'}
                              ${isStickyCol ? 'bg-indigo-50/80 group-hover:bg-indigo-100/60' : 'bg-indigo-50/30'}`}
                            style={getCellStyle(colIdx, false)}
                          >
                            {displayVal ? <>{validationIcon}{displayVal}</> : <span className="text-gray-300">-</span>}
                            {stickyEdgeShadow(colIdx)}
                          </td>
                        );
                      }
                      case 'tags': {
                        const hints = item.row['Hints'];
                        const hintList = Array.isArray(hints) && hints.length > 0 ? hints as string[] : null;
                        return (
                          <td key={col.key} className={`px-3 py-2 ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                            {item.analysis.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
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
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                            {hintList && (
                              <Tooltip
                                content={
                                  <div className="flex flex-col gap-0.5">
                                    {hintList.map((h, hi) => (
                                      <span key={hi}>{h}</span>
                                    ))}
                                  </div>
                                }
                                placement="left"
                              >
                                <span className="w-full text-left pl-2 text-[10px] text-blue-500 cursor-default mt-0.5 inline-block">
                                  Hints?
                                </span>
                              </Tooltip>
                            )}
                            {stickyEdgeShadow(colIdx)}
                          </td>
                        );
                      }
                    }
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
