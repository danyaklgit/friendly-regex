import { useMemo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { AnalyzedTransaction, TagSpecDefinition, RuleExpression } from '../../types';
import { useTransactionData } from '../../hooks/useTransactionData';
import { PREDEFINED_PATTERNS } from '../../constants/operations';
import { TagBadge } from './TagBadge';

interface TransactionTableProps {
  data: AnalyzedTransaction[];
  tagDefinitions: TagSpecDefinition[];
  highlightExpressions?: RuleExpression[];
  stickyFields?: Set<string>;
}

type ColumnDef =
  | { type: 'identifier'; key: string }
  | { type: 'data'; key: string; field: string }
  | { type: 'attribute'; key: string; name: string }
  | { type: 'tags'; key: string };

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

export function TransactionTable({ data, tagDefinitions, highlightExpressions, stickyFields }: TransactionTableProps) {
  const { fieldMeta } = useTransactionData();
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [stickyLefts, setStickyLefts] = useState<Map<number, number>>(new Map());
  const [stickyRights, setStickyRights] = useState<Map<number, number>>(new Map());

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

  // Build ordered column list: attributes placed right after their source field
  const columns: ColumnDef[] = useMemo(() => {
    const attrsBySource = new Map<string, string[]>();
    for (const attrName of attributeColumns) {
      const source = attrSourceMap.get(attrName);
      if (source) {
        if (!attrsBySource.has(source)) attrsBySource.set(source, []);
        attrsBySource.get(source)!.push(attrName);
      }
    }

    const cols: ColumnDef[] = [{ type: 'identifier', key: '__id' }];
    const placedAttrs = new Set<string>();

    for (const field of fieldMeta.dataFields) {
      cols.push({ type: 'data', key: `data:${field}`, field });
      const attrs = attrsBySource.get(field);
      if (attrs) {
        for (const attr of attrs) {
          cols.push({ type: 'attribute', key: `attr:${attr}`, name: attr });
          placedAttrs.add(attr);
        }
      }
    }

    cols.push({ type: 'tags', key: '__tags' });

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

    // Tags column is always sticky right
    const tagsIdx = columns.findIndex((col) => col.type === 'tags');
    if (tagsIdx !== -1) right.add(tagsIdx);

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

  // Measure header cell widths and compute left/right offsets for sticky columns
  useLayoutEffect(() => {
    if (!theadRef.current || (leftIndices.size === 0 && rightIndices.size === 0)) {
      setStickyLefts(new Map());
      setStickyRights(new Map());
      return;
    }

    const ths = theadRef.current.querySelectorAll('th');

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

  return (
    <div className="overflow-auto rounded-lg border border-gray-200" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
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
                  {col.type === 'identifier' && `Identifier (${fieldMeta.identifierField})`}
                  {col.type === 'data' && col.field}
                  {col.type === 'attribute' && col.name}
                  {col.type === 'tags' && 'Tags'}
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
                    case 'identifier':
                      return (
                        <td key={col.key} className={`px-3 py-2 text-xs font-medium text-gray-900 whitespace-nowrap ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                          {String(item.row[fieldMeta.identifierField] ?? '')}
                        </td>
                      );
                    case 'data':
                      return (
                        <td key={col.key} className={`px-3 py-2 text-xs text-gray-600 max-w-200 ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                          {renderCellContent(col.field, item.row[col.field])}
                        </td>
                      );
                    case 'attribute': {
                      const val = getAttributeValue(item, col.name);
                      const validation = attrValidationMap.get(col.name);
                      let validationIcon: ReactNode = null;
                      let validationPassed: boolean | null = null;
                      if (validation) {
                        if (validation.verifyValue) {
                          // extract_between_and_verify: compare extracted value against verifyValue
                          validationPassed = val === validation.verifyValue;
                        } else {
                          // predefined pattern: test source field against regex
                          const sourceVal = String(item.row[validation.sourceField] ?? '');
                          validationPassed = validation.regex.test(sourceVal);
                        }
                        validationIcon = validationPassed
                          ? <span className="text-emerald-500 mr-1" title="Valid">&#10003;</span>
                          : <span className="text-red-400 mr-1" title="Invalid">&#10007;</span>;
                      }
                      // When validation fails and extraction returned null, show source field value
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
                        </td>
                      );
                    }
                    case 'tags':
                      return (
                        <td key={col.key} className={`px-3 py-2 ${stickyBg}`} style={getCellStyle(colIdx, false)}>
                          {item.analysis.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {item.analysis.tags.map((tag) => (
                                <TagBadge key={tag} tag={tag} certainty={getCertainty(tag)} />
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      );
                  }
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
