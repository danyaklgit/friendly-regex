import type { CertaintyLevelTag } from '../../types';
import { Badge } from '../shared/Badge';

interface TagBadgeProps {
  tag: string;
  certainty?: CertaintyLevelTag;
  isUserCreated?: boolean;
  onClick?: () => void;
}

const certaintyColors: Record<CertaintyLevelTag, string> = {
  HIGH: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-surface-tertiary text-body border-border',
};

const userCreatedColors: Record<CertaintyLevelTag, string> = {
  HIGH: 'bg-orange-100 text-orange-600 border-orange-200',
  MEDIUM: 'bg-orange-50 text-orange-500 border-orange-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function TagBadge({ tag, certainty = 'HIGH', isUserCreated = false, onClick }: TagBadgeProps) {
  const colors = isUserCreated ? userCreatedColors[certainty] : certaintyColors[certainty];
  return (
    <Badge
      variant="none"
      size="sm"
      className={`border text-center px-2.5 ${colors} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow' : ''}`}
      onClick={onClick}
    >
      {tag}
    </Badge>
  );
}
