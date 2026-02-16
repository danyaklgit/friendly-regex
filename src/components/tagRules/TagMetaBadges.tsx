import type { TagSpecDefinition, ContextEntry } from '../../types';
import { Badge } from '../shared/Badge';

interface TagMetaBadgesProps {
  definition: TagSpecDefinition;
  parentContext?: ContextEntry[];
}

const statusVariant: Record<string, 'success' | 'warning' | 'default'> = {
  ACTIVE: 'success',
  INACTIVE: 'default',
  DRAFT: 'warning',
};

const certaintyVariant: Record<string, 'success' | 'warning' | 'default'> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'default',
};

export function TagMetaBadges({ definition, parentContext }: TagMetaBadgesProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={statusVariant[definition.StatusTag]}>{definition.StatusTag}</Badge>
      <Badge variant={certaintyVariant[definition.CertaintyLevelTag]}>
        {definition.CertaintyLevelTag}
      </Badge>
      {parentContext?.map((entry) => (
        <Badge key={entry.Key} variant="info">{entry.Value}</Badge>
      ))}
      {definition.Context.map((entry) => (
        <Badge key={entry.Key} variant="info">{entry.Value}</Badge>
      ))}
    </div>
  );
}
