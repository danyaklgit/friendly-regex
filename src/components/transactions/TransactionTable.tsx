import { useMemo } from 'react';
import type { AnalyzedTransaction, TagSpecDefinition } from '../../types';
import { TagBadge } from './TagBadge';

interface TransactionTableProps {
  data: AnalyzedTransaction[];
  tagDefinitions: TagSpecDefinition[];
}

const FIELD_COLUMNS = ['Field86', 'Field87', 'Field88', 'Field89'];

export function TransactionTable({ data, tagDefinitions }: TransactionTableProps) {
  const getCertainty = (tagName: string) => {
    const def = tagDefinitions.find((d) => d.Tag === tagName);
    return def?.CertaintyLevelTag ?? 'HIGH';
  };

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

  // For a given row, get the value for an attribute (may come from any matched tag)
  const getAttributeValue = (item: AnalyzedTransaction, attrName: string): string | null => {
    for (const tagAttrs of Object.values(item.analysis.attributes)) {
      if (attrName in tagAttrs && tagAttrs[attrName] !== null) {
        return tagAttrs[attrName];
      }
    }
    return null;
  };

  // const filteredData = isTempMode ? data.filter((item) => Object.keys(item.analysis.attributes ?? {}).includes('(Preview)') === false) : data;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Name
            </th>
            {FIELD_COLUMNS.map((field) => (
              <th
                key={field}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
              >
                {field}
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Tags
            </th>
            {attributeColumns.map((attr) => (
              <th
                key={attr}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
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
                colSpan={1 + FIELD_COLUMNS.length + 1 + attributeColumns.length}
                className="px-4 py-8 text-center text-sm text-gray-400"
              >
                No transactions match the current filter.
              </td>
            </tr>
          ) : (
            data.map((item, i) => {
              return (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                    {item.row.Name}
                  </td>
                  {FIELD_COLUMNS.map((field) => (
                    <td key={field} className="px-4 py-3 text-sm text-gray-600 max-w-50 truncate">
                      {item.row[field] || <span className="text-gray-300">-</span>}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    {item.analysis.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.analysis.tags.map((tag) => (
                          <TagBadge key={tag} tag={tag} certainty={getCertainty(tag)} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  {attributeColumns.map((attr) => {
                    const val = getAttributeValue(item, attr);
                    return (
                      <td key={attr} className="px-4 py-3 text-sm text-gray-700">
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
