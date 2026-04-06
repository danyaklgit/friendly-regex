import type { TagAttribute } from '../../types';
import { getRegexDescription } from '../../types/tagSpec';
import { engregxify } from '../../utils';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

interface AttributeRuleRowProps {
  attribute: TagAttribute;
}

function stripTrailingFieldRef(text: string, sourceField: string): string {
  const suffix = ` from ${sourceField}`;
  if (text.endsWith(suffix)) return text.slice(0, -suffix.length);
  const humanSuffix = ` from ${humanizeFieldName(sourceField)}`;
  if (text.endsWith(humanSuffix)) return text.slice(0, -humanSuffix.length);
  return text;
}

export function AttributeRuleRow({ attribute }: AttributeRuleRowProps) {
  const rawText =
    getRegexDescription(attribute.AttributeRuleExpression.RegexDetails) ||
    attribute.AttributeRuleExpression.ExpressionPrompt ||
    engregxify(attribute.AttributeRuleExpression.Regex);
  const humanText = stripTrailingFieldRef(rawText, attribute.AttributeRuleExpression.SourceField);

  return (
    <div className="flex items-start gap-3 py-2 px-3 bg-surface-secondary rounded-md">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-normal text-primary">{attribute.AttributeTag}</span>
        {attribute.IsMandatory && (
          <span className="text-xs text-red-500 font-medium">Required</span>
        )}
      </div>
      <div className="text-sm text-orange-500 flex-1">
        <span className="font-mono text-xs text-primary-dark bg-primary/10 px-1.5 py-0.5 rounded mr-1.5">
          {humanizeFieldName(attribute.AttributeRuleExpression.SourceField)}
        </span>
        {humanText}
      </div>
    </div>
  );
}
