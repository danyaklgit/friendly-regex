import type { TagRuleExpressions } from '../../types';
import { AndGroupCard } from './AndGroupCard';

interface RuleExpressionViewProps {
  expressions: TagRuleExpressions;
}

export function RuleExpressionView({ expressions }: RuleExpressionViewProps) {
  return (
    <div className="space-y-0">
      {expressions.map((group, i) => (
        <div key={i}>
          {i > 0 && (
            <div className="flex items-center justify-center my-2">
              <div className="flex-1 border-t border-gray-200" />
              <span className="mx-3 text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                OR
              </span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
          )}
          <AndGroupCard group={group} index={i} />
        </div>
      ))}
    </div>
  );
}
