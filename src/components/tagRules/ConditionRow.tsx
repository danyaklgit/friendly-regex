import type { RuleExpression } from '../../types';
import { engregxify } from '../../utils';

interface ConditionRowProps {
  condition: RuleExpression;
  showAnd?: boolean;
}

export function ConditionRow({ condition, showAnd }: ConditionRowProps) {
  const humanText = condition.ExpressionPrompt || engregxify(condition.Regex);

  return (
    <div>
      {showAnd && (
        <div className="flex items-center justify-center my-1">
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            AND
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 py-1.5 px-3 bg-gray-50 rounded-md">
        <span className="text-xs font-mono font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
          {condition.SourceField}
        </span>
        <span className="text-sm text-orange-500">{humanText}</span>
      </div>
    </div>
  );
}
