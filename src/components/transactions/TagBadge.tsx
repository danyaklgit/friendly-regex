import type { CertaintyLevelTag } from '../../types';

interface TagBadgeProps {
  tag: string;
  certainty?: CertaintyLevelTag;
  isUserCreated?: boolean;
  onClick?: () => void;
}

const certaintyColors: Record<CertaintyLevelTag, string> = {
  HIGH: 'bg-blue-100 text-blue-800 border-blue-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-gray-100 text-gray-700 border-gray-200',
};

const userCreatedColors: Record<CertaintyLevelTag, string> = {
  HIGH: 'bg-orange-100 text-orange-600 border-orange-200',
  MEDIUM: 'bg-orange-50 text-orange-500 border-orange-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function TagBadge({ tag, certainty = 'HIGH', isUserCreated = false, onClick }: TagBadgeProps) {
  const colors = isUserCreated ? userCreatedColors[certainty] : certaintyColors[certainty];
  return (
    <span
      className={`inline-flex items-center text-center px-2.5 py-0.5 rounded-full text-xs font-semibold border
        ${colors} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-300 transition-shadow' : ''}`}
      onClick={onClick}
    >
      {tag}
    </span>
  );
}
