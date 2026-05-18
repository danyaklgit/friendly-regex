import type { CertaintyLevelTag } from '../../types';
import { Badge } from '../shared/Badge';

interface TagBadgeProps {
  tag: string;
  certainty?: CertaintyLevelTag;
  isUserCreated?: boolean;
  version?: number;
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

export function TagBadge({ tag, certainty = 'HIGH', isUserCreated = false, version, onClick }: TagBadgeProps) {
  const colors = isUserCreated ? userCreatedColors[certainty] : certaintyColors[certainty];
  const showVersion = version != null;
  return (
    <Badge
      variant="none"
      size="sm"
      className={`relative border text-center px-2.5 ${colors} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow' : ''}`}
      onClick={onClick}
    >
      {tag}
      {showVersion && (
        <span
          aria-label={`Definition version ${version}`}
          className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-violet-600 text-white text-[9px] font-bold leading-[14px] text-center ring-1 ring-white dark:ring-surface pointer-events-none select-none"
        >
          {version}
        </span>
      )}
    </Badge>
  );
}
