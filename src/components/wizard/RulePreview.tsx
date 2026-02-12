import type { AndGroupFormValue, AttributeFormValue } from '../../types';
import { generateExpressionPrompt, generateExtractionPrompt } from '../../utils/regexify';

interface RulePreviewProps {
  ruleGroups: AndGroupFormValue[];
  attributes: AttributeFormValue[];
}

export function RulePreview({ ruleGroups, attributes }: RulePreviewProps) {
  const hasRules = ruleGroups.some((g) => g.conditions.some((c) => c.value));
  const hasAttrs = attributes.some((a) => a.attributeTag);

  if (!hasRules && !hasAttrs) {
    return <p className="text-sm text-gray-400 italic">Preview will appear as you build rules.</p>;
  }

  return (
    <div className="space-y-4">
      {hasRules && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Matching Rules
          </h4>
          <div className="space-y-0">
            {ruleGroups.map((group, gi) => {
              const validConditions = group.conditions.filter((c) => c.value);
              if (validConditions.length === 0) return null;
              return (
                <div key={group.id}>
                  {gi > 0 && (
                    <div className="flex items-center justify-center my-1.5">
                      <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                        OR
                      </span>
                    </div>
                  )}
                  <div className="border border-gray-200 rounded p-2 bg-gray-50">
                    {validConditions.map((c, ci) => (
                      <div key={c.id}>
                        {ci > 0 && (
                          <div className="text-center my-0.5">
                            <span className="text-xs font-semibold text-amber-600">AND</span>
                          </div>
                        )}
                        <p className="text-sm text-gray-700">
                          <span className="font-mono text-xs text-blue-700">{c.sourceField}</span>{' '}
                          {generateExpressionPrompt(c.operation, c.value, c.values)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasAttrs && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Attributes
          </h4>
          <div className="space-y-1">
            {attributes
              .filter((a) => a.attributeTag)
              .map((a) => (
                <p key={a.id} className="text-sm text-gray-700">
                  <span className="font-medium">{a.attributeTag}</span>{' '}
                  <span className="text-gray-500">from</span>{' '}
                  <span className="font-mono text-xs text-blue-700">{a.sourceField}</span>{' '}
                  <span className="text-gray-500">
                    {generateExtractionPrompt(a.extractionOperation, {
                      prefix: a.prefix,
                      suffix: a.suffix,
                      pattern: a.pattern,
                    })}
                  </span>
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
