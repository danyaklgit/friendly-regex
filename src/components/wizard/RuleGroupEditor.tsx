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
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white flex flex-col items-start">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Rule Set {groupIndex + 1}
        </span>
        {canRemoveGroup && (
          <Button variant="ghost" size="sm" onClick={onRemoveGroup} className="text-red-400 hover:text-red-600">
            Remove group
          </Button>
        )}
      </div>

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
      <Button variant="ghost" size="sm" onClick={onAddCondition} className="mt-1 ">
        + Add condition
      </Button>

    </div>
  );
}
