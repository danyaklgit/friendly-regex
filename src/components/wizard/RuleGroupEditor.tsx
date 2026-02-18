import { useState } from 'react';
import type { AndGroupFormValue, ConditionFormValue } from '../../types';
import { ConditionEditor } from './ConditionEditor';
import { Button } from '../shared/Button';
import { generateExpressionPrompt } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

interface RuleGroupEditorProps {
  group: AndGroupFormValue;
  groupIndex: number;
  onAddCondition: () => void;
  onRemoveCondition: (conditionId: string) => void;
  onUpdateCondition: (conditionId: string, updates: Partial<ConditionFormValue>) => void;
  onRemoveGroup: () => void;
  canRemoveGroup: boolean;
  startCollapsed?: boolean;
}

export function RuleGroupEditor({
  group,
  groupIndex,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
  onRemoveGroup,
  canRemoveGroup,
  startCollapsed,
}: RuleGroupEditorProps) {
  const [isExpanded, setIsExpanded] = useState(!startCollapsed);

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white flex flex-col items-start">
      <div
        className="flex items-center justify-between w-full cursor-pointer select-none"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-1.5">
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Rule Set {groupIndex + 1}
          </span>
          {!isExpanded && (() => {
            const filled = group.conditions.filter((c) => c.value.trim().length > 0);
            if (filled.length === 0) return (
              <span className="text-xs text-gray-400 ml-1">(empty)</span>
            );
            const first = filled[0];
            const preview = generateExpressionPrompt(first.operation, first.value, first.values, {
              prefix: first.prefix,
              suffix: first.suffix,
            });
            const rest = filled.length - 1;
            return (
              <span className="text-xs text-gray-400 ml-1">
                ( <span className="text-blue-500 italic">{humanizeFieldName(first.sourceField)}</span> → <span className="text-orange-500 italic">{preview}</span>
                {rest > 0 && <span className="ml-2 text-purple-600"> &amp; {rest} more</span>}
                {' '})
              </span>
            );
          })()}
        </div>
      </div>

      {isExpanded && (
        <>
          <div className='flex items-center justify-between mt-3 w-full'>
            <div className="space-y-0">
              {group.conditions.map((condition, i) => (
                <ConditionEditor
                  key={condition.id}
                  condition={condition}
                  onUpdate={(updates) => onUpdateCondition(condition.id, updates)}
                  onRemove={() => onRemoveCondition(condition.id)}
                  canRemove={group.conditions.length > 1}
                  showAnd={i > 0}
                  startCollapsed={startCollapsed && condition.value.trim().length > 0}
                />
              ))}
            </div>
          </div>
          <div className='flex justify-between w-full gap-1'>
            <Button variant="ghost" size="sm" onClick={onAddCondition} className="mt-1 ">
              + Add condition
            </Button>
            {canRemoveGroup && (
              <Button variant="ghost" size="sm" onClick={onRemoveGroup} className="text-red-400 hover:text-red-600">
                Remove group
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
