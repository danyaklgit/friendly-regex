import type { AndGroupFormValue, ConditionFormValue } from '../../types';
import { RuleGroupEditor } from './RuleGroupEditor';
import { Button } from '../shared/Button';

interface StepRuleExpressionsProps {
  ruleGroups: AndGroupFormValue[];
  onAddGroup: () => void;
  onRemoveGroup: (groupId: string) => void;
  onAddCondition: (groupId: string) => void;
  onRemoveCondition: (groupId: string, conditionId: string) => void;
  onUpdateCondition: (groupId: string, conditionId: string, updates: Partial<ConditionFormValue>) => void;
}

export function StepRuleExpressions({
  ruleGroups,
  onAddGroup,
  onRemoveGroup,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
}: StepRuleExpressionsProps) {
  return (
    <div className="space-y-0">
      <p className="text-sm text-gray-500 mb-4">
        Define when this tag should be applied. Each rule set uses AND logic (all conditions must match).
        Multiple rule sets use OR logic (any set can match).
      </p>

      {ruleGroups.map((group, i) => (
        <div key={group.id}>
          {i > 0 && (
            <div className="flex items-center justify-center my-3">
              <div className="flex-1 border-t border-gray-200" />
              <span className="mx-3 text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                OR
              </span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
          )}
          <RuleGroupEditor
            group={group}
            groupIndex={i}
            onAddCondition={() => onAddCondition(group.id)}
            onRemoveCondition={(condId) => onRemoveCondition(group.id, condId)}
            onUpdateCondition={(condId, updates) => onUpdateCondition(group.id, condId, updates)}
            onRemoveGroup={() => onRemoveGroup(group.id)}
            canRemoveGroup={ruleGroups.length > 1}
          />
        </div>
      ))}

      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={onAddGroup}>
          + Add OR group
        </Button>
      </div>
    </div>
  );
}
