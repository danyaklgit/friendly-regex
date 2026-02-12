import type { AnalyzedTransaction } from '../../hooks/useTransactionAnalysis';
import type { TagSpecDefinition } from '../../types';
import { TagBadge } from './TagBadge';
import { AttributeDisplay } from './AttributeDisplay';

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
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Attributes
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((item, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                {item.row.Name}
              </td>
              {FIELD_COLUMNS.map((field) => (
                <td key={field} className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
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
              <td className="px-4 py-3">
                <AttributeDisplay attributes={item.analysis.attributes} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
