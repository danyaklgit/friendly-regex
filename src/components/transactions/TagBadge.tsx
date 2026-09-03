import type { MouseEvent as ReactMouseEvent } from 'react';
import type { CertaintyLevelTag } from '../../types';
import { Badge } from '../shared/Badge';

interface TagBadgeProps {
  tag: string;
  certainty?: CertaintyLevelTag;
  isUserCreated?: boolean;
  version?: number;
  onClick?: () => void;
  /** Secondary action rendered INSIDE the badge as a small "×" button on
   *  the right side. Used by the Rule Builder's matching-tags panel to
   *  expose the "Exclude this tag from the current rule" affordance
   *  without breaking the visual flow of a row of pills — having the
   *  button live inside the badge keeps the row scannable when many
   *  tags match the same draft. The handler is invoked with a
   *  stopPropagation'd event so the badge's primary `onClick` (open
   *  the preview drawer) does NOT fire when the operator clicks
   *  the × icon. */
  onExclude?: () => void;
  /** Title (native tooltip) on the exclude × button. */
  excludeTitle?: string;
  /** Operator-chosen nickname of the definition — rendered as an inner pill
   *  after the tag so same-tag variants read apart at a glance. */
  nickname?: string;
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

export function TagBadge({ tag, certainty = 'HIGH', isUserCreated = false, version, onClick, onExclude, excludeTitle, nickname }: TagBadgeProps) {
  const colors = isUserCreated ? userCreatedColors[certainty] : certaintyColors[certainty];
  const showVersion = version != null;
  const handleExcludeClick = (e: ReactMouseEvent) => {
    // Stop the badge's primary onClick (preview drawer) from firing
    // when the operator targets the × icon specifically.
    e.stopPropagation();
    onExclude?.();
  };
  return (
    <Badge
      variant="none"
      size="sm"
      // `pr-1` (tighter right padding) when the exclude button is
      // present so the icon sits flush with the badge edge instead
      // of floating in extra whitespace.
      className={`relative border text-center inline-flex items-center gap-1 ${onExclude ? 'pl-2.5 pr-1' : 'px-2.5'} ${colors} ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow' : ''}`}
      onClick={onClick}
    >
      <span>{tag}</span>
      {nickname && (
        <span
          className="max-w-[120px] truncate rounded-full bg-white/60 dark:bg-black/25 px-1.5 py-px text-[9px] font-medium leading-tight"
          title={nickname}
        >
          {nickname}
        </span>
      )}
      {onExclude && (
        // Inline × button. Visually nested inside the badge so a row
        // of matching tags reads as a tight chip cluster rather than
        // alternating pill-then-button pairs. The icon stays red at
        // rest so the destructive intent reads at a glance; hover
        // saturates the background tint so the click target is
        // obvious.
        <button
          type="button"
          onClick={handleExcludeClick}
          title={excludeTitle ?? 'Exclude'}
          aria-label={excludeTitle ?? `Exclude ${tag}`}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-red-600 dark:text-rose-300 hover:bg-red-500/20 hover:text-red-700 dark:hover:text-rose-200 transition-colors leading-none cursor-pointer"
        >
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" aria-hidden="true">
            <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
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
