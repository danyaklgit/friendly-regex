import { getAvatarColour, getInitials } from '../../utils/mentions';

interface AvatarProps {
  userId: string;
  displayName: string;
  size?: 'sm' | 'md';
  title?: string;
}

export function Avatar({ userId, displayName, size = 'sm', title }: AvatarProps) {
  const dim = size === 'md' ? 'h-8 w-8 text-xs' : 'h-6 w-6 text-[10px]';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dim} ${getAvatarColour(userId)}`}
      aria-label={displayName}
      title={title ?? displayName}
    >
      {getInitials(displayName)}
    </span>
  );
}
