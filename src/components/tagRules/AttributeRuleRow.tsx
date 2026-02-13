import type { TagAttribute } from '../../types';
import { engregxify } from '../../utils';

interface AttributeRuleRowProps {
  attribute: TagAttribute;
}

export function AttributeRuleRow({ attribute }: AttributeRuleRowProps) {
  const humanText =
    attribute.AttributeRuleExpression.ExpressionPrompt ||
    engregxify(attribute.AttributeRuleExpression.Regex);

  return (
    <div className="flex items-start gap-3 py-2 px-3 bg-gray-50 rounded-md">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-normal text-blue-500">{attribute.AttributeTag}</span>
        {attribute.IsMandatory && (
          <span className="text-xs text-red-500 font-medium">Required</span>
        )}
      </div>
      <div className="text-sm text-orange-500 flex-1">
        <span className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded mr-1.5">
          {attribute.AttributeRuleExpression.SourceField}
        </span>
        {humanText}
      </div>
    </div>
  );
}
