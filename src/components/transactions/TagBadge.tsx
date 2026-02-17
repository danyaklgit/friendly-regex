import type { CertaintyLevelTag } from '../../types';

interface TagBadgeProps {
  tag: string;
  certainty?: CertaintyLevelTag;
  onClick?: () => void;
}

const certaintyColors: Record<CertaintyLevelTag, string> = {
  HIGH: 'bg-green-100 text-green-800 border-green-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function TagBadge({ tag, certainty = 'HIGH', onClick }: TagBadgeProps) {
  return (
    <span
      className={`inline-flex items-center text-center px-2.5 py-0.5 rounded-full text-xs font-semibold border
        ${certaintyColors[certainty]} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-300 transition-shadow' : ''}`}
      onClick={onClick}
    >
      {tag}
    </span>
  );
}
