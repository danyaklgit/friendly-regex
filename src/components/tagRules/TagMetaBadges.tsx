import type { TagSpecDefinition, ContextEntry } from '../../types';
import { Badge } from '../shared/Badge';
import { Tooltip } from '../shared/Tooltip';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

interface TagMetaBadgesProps {
  definition: TagSpecDefinition;
  parentContext?: ContextEntry[];
  size?: 'xs' | 'sm';
}

const certaintyVariant: Record<string, 'success' | 'warning' | 'default'> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'default',
};

export function TagMetaBadges({ definition, parentContext, size = 'sm' }: TagMetaBadgesProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Tooltip content="Certainty Level" placement="top">
        <span>
          <Badge variant={certaintyVariant[definition.CertaintyLevelTag]} size={size}>
            {definition.CertaintyLevelTag}
          </Badge>
        </span>
      </Tooltip>
      {parentContext?.map((entry) => (
        <Tooltip key={entry.Key} content={humanizeFieldName(entry.Key)} placement="top">
          <span>
            <Badge variant="info" size={size}>{entry.Value}</Badge>
          </span>
        </Tooltip>
      ))}
      {definition.Context.map((entry) => (
        <Tooltip key={entry.Key} content={humanizeFieldName(entry.Key)} placement="top">
          <span>
            <Badge variant="info" size={size}>{entry.Value}</Badge>
          </span>
        </Tooltip>
      ))}
    </div>
  );
}
