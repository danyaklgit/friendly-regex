import { useState } from 'react';
import type { AndGroupFormValue, ConditionFormValue } from '../../types';
import { ConditionEditor } from './ConditionEditor';
import { Button } from '../shared/Button';

interface RuleGroupEditorProps {
  group: AndGroupFormValue;
  groupIndex: number;
  onAddCondition: () => void;
  onRemoveCondition: (conditionId: string) => void;
  onUpdateCondition: (conditionId: string, updates: Partial<ConditionFormValue>) => void;
  onRemoveGroup: () => void;
  canRemoveGroup: boolean;
}

export function RuleGroupEditor({
  group,
  groupIndex,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
  onRemoveGroup,
  canRemoveGroup,
}: RuleGroupEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);

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
          {!isExpanded && (
            <span className="text-xs text-gray-400 ml-1">
              ({group.conditions.length} condition{group.conditions.length !== 1 ? 's' : ''})
            </span>
          )}
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
