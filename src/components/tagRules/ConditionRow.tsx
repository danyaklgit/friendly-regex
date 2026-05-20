import type { RuleExpression } from '../../types';
import { getRegexDescription } from '../../types/tagSpec';
import { engregxify } from '../../utils';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { CommentIconButton } from '../comments/CommentIconButton';

interface ConditionRowProps {
  condition: RuleExpression;
  showAnd?: boolean;
  libraryId?: string;
  definitionId?: string;
  /** Position-based fallback inputs so comments can pin to rules that haven't
   *  been assigned a backend ExpressionId yet (existing libraries persist it
   *  as null). Matches the synthetic id format used by useWizardForm. */
  groupIndex?: number;
  conditionIndex?: number;
}

export function ConditionRow({
  condition,
  showAnd,
  libraryId,
  definitionId,
  groupIndex,
  conditionIndex,
}: ConditionRowProps) {
  const humanText = getRegexDescription(condition.RegexDetails) || condition.ExpressionPrompt || engregxify(condition.Regex);

  const expressionTargetId =
    condition.ExpressionId
    || (definitionId != null && groupIndex != null && conditionIndex != null
      ? `${definitionId}-rule-${groupIndex}-${conditionIndex}`
      : null);

  return (
    <div>
      {showAnd && (
        <div className="flex items-center justify-center my-1">
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">
            AND
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 py-1.5 px-3 bg-surface-secondary rounded-md">
        <span className="text-xs font-mono font-medium text-primary-dark bg-primary/10 px-1.5 py-0.5 rounded">
          {humanizeFieldName(condition.SourceField)}
        </span>
        <span className="text-sm text-orange-500 dark:text-orange-300">{humanText}</span>
        {libraryId && definitionId && expressionTargetId && (
          <span className="ml-auto">
            <CommentIconButton
              target={{
                TagSpecLibraryId: libraryId,
                TagSpecDefinitionId: definitionId,
                TagRuleExpressionId: expressionTargetId,
              }}
              targetLabel={humanizeFieldName(condition.SourceField)}
              size="xs"
            />
          </span>
        )}
      </div>
    </div>
  );
}
