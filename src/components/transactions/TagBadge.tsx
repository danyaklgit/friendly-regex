import type { CertaintyLevelTag } from '../../types';
import { Badge } from '../shared/Badge';

interface TagBadgeProps {
  tag: string;
  certainty?: CertaintyLevelTag;
  isUserCreated?: boolean;
  version?: number;
  onClick?: () => void;
}

// Certainty palette:
//   HIGH    cyan  ("trust this tag" — primary brand tone)
//   MEDIUM  amber ("review it")
//   LOW     red   ("low confidence, definitely check" — Tailwind's red
//                  palette leans more orange than rose, so the badge reads
//                  as a stronger, brick/tomato red that stays distinct
//                  from cyan and amber for users with red/green CVD)
const certaintyColors: Record<CertaintyLevelTag, string> = {
  HIGH: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-200 dark:border-cyan-700/60',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700/60',
  LOW: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700/60',
};

// User-created variants — the orange family signals "you authored this"
// while the certainty step still maps to the same MEDIUM/LOW tones.
const userCreatedColors: Record<CertaintyLevelTag, string> = {
  HIGH: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700/60',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700/60',
  LOW: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700/60',
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
