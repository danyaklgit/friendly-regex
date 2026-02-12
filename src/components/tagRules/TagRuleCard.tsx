import { useState } from 'react';
import type { TagSpecDefinition } from '../../types';
import { TagMetaBadges } from './TagMetaBadges';
import { RuleExpressionView } from './RuleExpressionView';
import { AttributeListView } from './AttributeListView';
import { Button } from '../shared/Button';

interface TagRuleCardProps {
  definition: TagSpecDefinition;
  onEdit: (def: TagSpecDefinition) => void;
  onDelete: (id: number) => void;
  onExport: (def: TagSpecDefinition) => void;
}

export function TagRuleCard({ definition, onEdit, onDelete, onExport }: TagRuleCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-gray-900">{definition.Tag}</span>
          <TagMetaBadges definition={definition} />
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="mt-3 space-y-4">
            {/* Validity */}
            <div className="text-xs text-gray-500">
              Valid from <span className="font-medium">{definition.Validity.StartDate}</span>
              {definition.Validity.EndDate
                ? <> to <span className="font-medium">{definition.Validity.EndDate}</span></>
                : <span className="italic"> (no end date)</span>
              }
            </div>

            {/* Tag Rules */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Matching Rules</h4>
              <RuleExpressionView expressions={definition.TagRuleExpressions} />
            </div>

            {/* Attributes */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Attributes</h4>
              <AttributeListView attributes={definition.Attributes} />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <Button size="sm" onClick={() => onEdit(definition)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => onExport(definition)}>Export</Button>
              <Button size="sm" variant="danger" onClick={() => onDelete(definition.Id)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
