import type { TagSpecDefinition, ContextEntry } from '../../types';
import { Badge } from '../shared/Badge';

interface TagMetaBadgesProps {
  definition: TagSpecDefinition;
  parentContext?: ContextEntry[];
  size?: 'xs' | 'sm';
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

export function TagMetaBadges({ definition, parentContext, size = 'sm' }: TagMetaBadgesProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge variant={statusVariant[definition.StatusTag]} size={size}>{definition.StatusTag}</Badge>
      <Badge variant={certaintyVariant[definition.CertaintyLevelTag]} size={size}>
        {definition.CertaintyLevelTag}
      </Badge>
      {parentContext?.map((entry) => (
        <Badge key={entry.Key} variant="info" size={size}>{entry.Value}</Badge>
      ))}
      {definition.Context.map((entry) => (
        <Badge key={entry.Key} variant="info" size={size}>{entry.Value}</Badge>
      ))}
    </div>
  );
}
