import type { TagSpecDefinition } from '../../types';
import { Badge } from '../shared/Badge';

interface TagMetaBadgesProps {
  definition: TagSpecDefinition;
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

export function TagMetaBadges({ definition }: TagMetaBadgesProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={statusVariant[definition.StatusTag]}>{definition.StatusTag}</Badge>
      <Badge variant={certaintyVariant[definition.CertaintyLevelTag]}>
        {definition.CertaintyLevelTag}
      </Badge>
      <Badge variant="info">{definition.Context.Side}</Badge>
      <Badge variant="info">{definition.Context.TxnType}</Badge>
    </div>
  );
}
