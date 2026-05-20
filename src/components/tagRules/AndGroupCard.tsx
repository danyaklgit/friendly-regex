import type { AndGroup } from '../../types';
import { ConditionRow } from './ConditionRow';

interface AndGroupCardProps {
  group: AndGroup;
  index: number;
  libraryId?: string;
  definitionId?: string;
}

export function AndGroupCard({ group, index, libraryId, definitionId }: AndGroupCardProps) {
  return (
    <div className="border border-border rounded-lg p-3 bg-surface">
      <div className="text-xs font-medium text-faint mb-2">Rule Set {index + 1}</div>
      <div className="space-y-0">
        {group.map((condition, i) => (
          <ConditionRow
            key={i}
            condition={condition}
            showAnd={i > 0}
            libraryId={libraryId}
            definitionId={definitionId}
            groupIndex={index}
            conditionIndex={i}
          />
        ))}
      </div>
    </div>
  );
}
