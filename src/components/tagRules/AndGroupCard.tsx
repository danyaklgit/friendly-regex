import type { AndGroup } from '../../types';
import { ConditionRow } from './ConditionRow';

interface AndGroupCardProps {
  group: AndGroup;
  index: number;
}

export function AndGroupCard({ group, index }: AndGroupCardProps) {
  return (
    <div className="border border-border rounded-lg p-3 bg-surface">
      <div className="text-xs font-medium text-faint mb-2">Rule Set {index + 1}</div>
      <div className="space-y-0">
        {group.map((condition, i) => (
          <ConditionRow key={i} condition={condition} showAnd={i > 0} />
        ))}
      </div>
    </div>
  );
}
