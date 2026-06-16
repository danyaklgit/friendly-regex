import { useMemo, useRef } from 'react';
import type { AndGroupFormValue, ConditionFormValue } from '../../types';
import { RuleGroupEditor } from './RuleGroupEditor';
import { Button } from '../shared/Button';
import { computeDuplicateGroupIndexes } from '../../utils/ruleFingerprint';
import { useScrollNewItemIntoView } from '../../hooks/useScrollNewItemIntoView';

interface StepRuleExpressionsProps {
  ruleGroups: AndGroupFormValue[];
  onAddGroup: () => void;
  onRemoveGroup: (groupId: string) => void;
  onCloneGroup: (groupId: string) => void;
  onAddCondition: (groupId: string) => void;
  onRemoveCondition: (groupId: string, conditionId: string) => void;
  onUpdateCondition: (groupId: string, conditionId: string, updates: Partial<ConditionFormValue>) => void;
  onConditionSave?: () => void;
  startCollapsed?: boolean;
  readOnly?: boolean;
  /** Forwarded to nested ConditionEditors so they can render comment icons. */
  libraryId?: string;
  definitionId?: string;
  /** Forwarded from TransactionsTab so the Create Rule button can disable
   *  while any condition is still mid-edit. */
  onConditionEditingChange?: (conditionId: string, editing: boolean) => void;
}

export function StepRuleExpressions({
  ruleGroups,
  onAddGroup,
  onRemoveGroup,
  onCloneGroup,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
  onConditionSave,
  startCollapsed,
  readOnly,
  libraryId,
  definitionId,
  onConditionEditingChange,
}: StepRuleExpressionsProps) {
  // For each rule set, which OTHER rule set has the same canonical conditions
  // (or null when unique). Computed once for all groups so every duplicate
  // member of a pair shows the same warning simultaneously — not just the one
  // the user happens to be editing.
  const duplicateOfIndex = useMemo(() => computeDuplicateGroupIndexes(ruleGroups), [ruleGroups]);

  // Scroll a freshly added rule set into view (Add Rule Set).
  const groupsRef = useRef<HTMLDivElement>(null);
  useScrollNewItemIntoView(ruleGroups.length, groupsRef);

  return (
    <div className="space-y-0 flex flex-col">
      <p data-tour="ruleset-logic-info" className="text-xs text-muted mb-2">
        Each rule set uses AND logic (all conditions must match).
        Multiple rule sets use OR logic (any set can match).
      </p>

      {ruleGroups.length > 0 ? (
        <div ref={groupsRef} className="flex flex-col">
        {ruleGroups.map((group, i) => (
          <div key={group.id}>
            {i > 0 && (
              <div className="flex items-center justify-center my-1">
                <div className="flex-1 border-t border-border" />
                <span className="mx-3 text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                  OR
                </span>
                <div className="flex-1 border-t border-border" />
              </div>
            )}
            <RuleGroupEditor
              group={group}
              groupIndex={i}
              onAddCondition={() => onAddCondition(group.id)}
              onRemoveCondition={(condId) => onRemoveCondition(group.id, condId)}
              onUpdateCondition={(condId, updates) => onUpdateCondition(group.id, condId, updates)}
              onRemoveGroup={() => onRemoveGroup(group.id)}
              onCloneGroup={() => onCloneGroup(group.id)}
              onConditionSave={onConditionSave}
              canRemoveGroup
              startCollapsed={startCollapsed}
              readOnly={readOnly}
              duplicateOfGroupIndex={duplicateOfIndex[i]}
              libraryId={libraryId}
              definitionId={definitionId}
              onConditionEditingChange={onConditionEditingChange}
            />
          </div>
        ))}
        </div>
      ) : (
        <div className="text-center py-4 bg-surface-secondary rounded-lg border border-dashed border-border-strong">
          <p className="text-sm text-muted my-2">No rule sets defined yet</p>
        </div>
      )}

      {!readOnly && (
        <div className="mt-4 ">
          <Button data-tour="add-rule-group" variant="secondary" size="xs" onClick={onAddGroup}>
            Add Rule Set
          </Button>
        </div>
      )}
    </div>
  );
}
