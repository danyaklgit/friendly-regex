import { useState } from 'react';
import type { AndGroupFormValue, ConditionFormValue } from '../../types';
import { ConditionEditor } from './ConditionEditor';
import { Button } from '../shared/Button';
import { generateExpressionPrompt } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { isSameCondition } from '../../utils/ruleFingerprint';

interface RuleGroupEditorProps {
  group: AndGroupFormValue;
  groupIndex: number;
  onAddCondition: () => void;
  onRemoveCondition: (conditionId: string) => void;
  onUpdateCondition: (conditionId: string, updates: Partial<ConditionFormValue>) => void;
  onRemoveGroup: () => void;
  onConditionSave?: () => void;
  canRemoveGroup: boolean;
  startCollapsed?: boolean;
  readOnly?: boolean;
  /** Index of another rule set that has the same canonical conditions as
   *  this one, or null when this rule set is unique. When non-null the editor
   *  renders a persistent banner so duplicates are visible without first
   *  re-opening one of the conditions, and the Save button on every condition
   *  is disabled while the duplicate remains. */
  duplicateOfGroupIndex?: number | null;
}

export function RuleGroupEditor({
  group,
  groupIndex,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
  onRemoveGroup,
  onConditionSave,
  canRemoveGroup,
  startCollapsed,
  readOnly,
  duplicateOfGroupIndex,
}: RuleGroupEditorProps) {
  const [isExpanded, setIsExpanded] = useState(!startCollapsed);

  return (
    <div data-tour="rule-group-editor" className="border border-border rounded-lg p-3 bg-surface flex flex-col items-start">
      <div className="flex items-center justify-between w-full">
        <div
          className="flex items-center gap-1.5 cursor-pointer select-none flex-1"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <svg
            className={`w-3.5 h-3.5 text-faint transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium text-muted uppercase tracking-wide">
            Rule Set {groupIndex + 1}
          </span>
          {!isExpanded && (() => {
            const filled = group.conditions.filter((c) => c.value.trim().length > 0);
            if (filled.length === 0) return (
              <span className="text-xs text-faint ml-1">(empty)</span>
            );
            const first = filled[0];
            const preview = generateExpressionPrompt(first.operation, first.value, first.values);
            const rest = filled.length - 1;
            return (
              <span className="text-xs text-faint ml-1">
                ( <span className="text-primary italic">{humanizeFieldName(first.sourceField)}</span> → <span className="text-orange-500 dark:text-orange-300 italic">{preview}</span>
                {rest > 0 && <span className="ml-2 text-purple-600 dark:text-purple-300"> &amp; {rest} more</span>}
                {' '})
              </span>
            );
          })()}
        </div>
        {canRemoveGroup && !readOnly && (
          <Button variant="ghost" size="xs" onClick={onRemoveGroup} className="text-red-400 hover:text-red-600 shrink-0">
            Remove Group
          </Button>
        )}
      </div>

      {duplicateOfGroupIndex != null && (
        <div
          role="alert"
          className="mt-2 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-red-400 dark:border-rose-400 bg-red-50 dark:bg-rose-900/20 text-xs text-red-600 dark:text-rose-300"
        >
          <span aria-hidden="true" className="font-bold leading-none">!</span>
          <span>
            This rule set is identical to <span className="font-semibold">Rule Set {duplicateOfGroupIndex + 1}</span>. Remove one or change its conditions.
          </span>
        </div>
      )}

      {isExpanded && (
        <>
          <div className='flex items-center justify-between mt-3 w-full'>
            <div className="space-y-0">
              {group.conditions.map((condition, i) => {
                // Within-group duplicate flags ONLY the later copy of an
                // identical condition — the first occurrence is the original
                // and stays clean.
                const isWithinGroupDuplicate = group.conditions
                  .slice(0, i)
                  .some((earlier) => isSameCondition(earlier, condition));
                return (
                  <ConditionEditor
                    key={condition.id}
                    condition={condition}
                    onUpdate={(updates) => onUpdateCondition(condition.id, updates)}
                    onRemove={() => onRemoveCondition(condition.id)}
                    onSave={onConditionSave}
                    canRemove={group.conditions.length > 1}
                    showAnd={i > 0}
                    startCollapsed={startCollapsed && condition.value.trim().length > 0}
                    readOnly={readOnly}
                    isWithinGroupDuplicate={isWithinGroupDuplicate}
                    isGroupDuplicate={duplicateOfGroupIndex != null}
                  />
                );
              })}
            </div>
          </div>
          {!readOnly && (
            <Button data-tour="add-condition" variant="ghost" size="xs" onClick={onAddCondition} className="mt-1">
              + Add condition
            </Button>
          )}
        </>
      )}
    </div>
  );
}
