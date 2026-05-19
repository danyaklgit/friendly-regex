export interface Mention {
  userId: string;
  displayName: string;
}

export interface MentionTextSegment {
  type: 'text';
  text: string;
}

export interface MentionPillSegment {
  type: 'mention';
  userId: string;
  displayName: string;
}

export type MentionSegment = MentionTextSegment | MentionPillSegment;

/**
 * Render a stored comment string into segments by walking the text once and
 * matching `@<displayName>` substrings against the supplied id → displayName
 * map (built from `ReportedToUserIds`). Unknown mentions render as text.
 */
export function renderCommentSegments(
  text: string,
  mentionIds: string[],
  resolveDisplayName: (userId: string) => string | undefined,
): MentionSegment[] {
  if (!text) return [];
  if (mentionIds.length === 0) return [{ type: 'text', text }];

  // Build a list of { name, userId } sorted by length desc so longer names win
  const candidates = mentionIds
    .map((id) => ({ id, name: resolveDisplayName(id) }))
    .filter((c): c is { id: string; name: string } => Boolean(c.name))
    .sort((a, b) => b.name.length - a.name.length);

  const segments: MentionSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const atIndex = text.indexOf('@', cursor);
    if (atIndex === -1) {
      segments.push({ type: 'text', text: text.slice(cursor) });
      break;
    }
    if (atIndex > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, atIndex) });
    }
    const remaining = text.slice(atIndex + 1);
    const matched = candidates.find((c) => remaining.startsWith(c.name));
    if (matched) {
      segments.push({ type: 'mention', userId: matched.id, displayName: matched.name });
      cursor = atIndex + 1 + matched.name.length;
    } else {
      segments.push({ type: 'text', text: '@' });
      cursor = atIndex + 1;
    }
  }
  return segments;
}

/** Extract unique mention user ids from the stored mention list (preserves order). */
export function dedupeMentionIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Initials helper for the small author indicator next to comments/replies. */
export function getInitials(displayName: string): string {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic colour for an avatar circle based on the user id.
 * Returns a Tailwind background class.
 */
const AVATAR_COLOURS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
];

export function getAvatarColour(userId: string): string {
  if (!userId) return AVATAR_COLOURS[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
}
