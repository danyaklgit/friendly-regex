import type { TagAttribute } from '../../types';
import { getRegexDescription } from '../../types/tagSpec';
import { engregxify } from '../../utils';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { CommentIconButton } from '../comments/CommentIconButton';

interface AttributeRuleRowProps {
  attribute: TagAttribute;
  libraryId?: string;
  definitionId?: string;
}

export function AttributeRuleRow({ attribute, libraryId, definitionId }: AttributeRuleRowProps) {
  // Constant-mode attribute: no source field, no regex, no transformations.
  // Render `= "<value>" (constant)` in place of the source-pill + extraction
  // prompt block to mirror the wizard's RulePreview surface.
  if (attribute.Constant != null) {
    return (
      <div className="flex items-start gap-3 py-2 px-3 bg-surface-secondary rounded-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-normal text-primary">{attribute.AttributeTag}</span>
          {attribute.IsMandatory && (
            <span className="text-xs text-red-500 font-medium">Required</span>
          )}
        </div>
        <div className="text-sm text-body flex-1">
          <span className="text-muted">=</span>{' '}
          <span className="font-mono text-xs text-primary-dark">"{attribute.Constant}"</span>{' '}
          <span className="text-faint text-xs">(constant)</span>
        </div>
        {libraryId && definitionId && (
          <CommentIconButton
            target={{
              TagSpecLibraryId: libraryId,
              TagSpecDefinitionId: definitionId,
              AttributeTag: attribute.AttributeTag,
            }}
            targetLabel={attribute.AttributeTag}
            size="xs"
          />
        )}
      </div>
    );
  }

  const expr = attribute.AttributeRuleExpression;
  // Defensive: a non-constant attribute should always carry an expression.
  // If a backend bug ships one without, omit the row rather than crashing.
  if (!expr) return null;

  const humanText =
    getRegexDescription(expr.RegexDetails) ||
    expr.ExpressionPrompt ||
    engregxify(expr.Regex);

  return (
    <div className="flex items-start gap-3 py-2 px-3 bg-surface-secondary rounded-md">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-normal text-primary">{attribute.AttributeTag}</span>
        {attribute.IsMandatory && (
          <span className="text-xs text-red-500 font-medium">Required</span>
        )}
      </div>
      <div className="text-sm text-orange-500 dark:text-orange-300 flex-1">
        <span className="font-mono text-xs text-primary-dark bg-primary/10 px-1.5 py-0.5 rounded mr-1.5">
          {humanizeFieldName(expr.SourceField)}
        </span>
        {humanText}
      </div>
      {libraryId && definitionId && (
        <CommentIconButton
          target={{
            TagSpecLibraryId: libraryId,
            TagSpecDefinitionId: definitionId,
            AttributeTag: attribute.AttributeTag,
          }}
          targetLabel={attribute.AttributeTag}
          size="xs"
        />
      )}
    </div>
  );
}
