import { useMemo, type ReactNode } from 'react';
import type { AnalyzedTransaction, TagSpecDefinition, RuleExpression } from '../../types';
import { useTransactionData } from '../../hooks/useTransactionData';
import { TagBadge } from './TagBadge';

interface TransactionTableProps {
  data: AnalyzedTransaction[];
  tagDefinitions: TagSpecDefinition[];
  highlightExpressions?: RuleExpression[];
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
      <mark key={start} className="bg-yellow-200 rounded-sm">
        {text.slice(start, end)}
      </mark>
    );
    pos = end;
  }
  if (pos < text.length) parts.push(text.slice(pos));

  return <>{parts}</>;
}

export function TransactionTable({ data, tagDefinitions, highlightExpressions }: TransactionTableProps) {
  const { fieldMeta } = useTransactionData();
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

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
              {`Identifier (${fieldMeta.identifierField})`}
            </th>
            {fieldMeta.dataFields.map((field) => (
              <th
                key={field}
                className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider"
              >
                {field}
              </th>
            ))}
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
              Tags
            </th>
            {attributeColumns.map((attr) => (
              <th
                key={attr}
                className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider"
              >
                {attr}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={1 + fieldMeta.dataFields.length + 1 + attributeColumns.length}
                className="px-3 py-6 text-center text-xs text-gray-400"
              >
                No transactions match the current filter.
              </td>
            </tr>
          ) : (
            data.map((item, i) => {
              return (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 text-xs font-medium text-gray-900 whitespace-nowrap">
                    {String(item.row[fieldMeta.identifierField] ?? '')}
                  </td>
                  {fieldMeta.dataFields.map((field) => (
                    <td key={field} className="px-3 py-2 text-xs text-gray-600 max-w-200">
                      {renderCellContent(field, item.row[field])}
                    </td>
                  ))}
                  <td className="px-3 py-2">
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
                  {attributeColumns.map((attr) => {
                    const val = getAttributeValue(item, attr);
                    return (
                      <td key={attr} className="px-3 py-2 text-xs text-gray-700">
                        {val ?? <span className="text-gray-300">-</span>}
                      </td>
                    );
                  })}
                </tr>
              )
            }))}
        </tbody>
      </table>
    </div>
  );
}
