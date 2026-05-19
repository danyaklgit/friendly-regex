import { useEffect, useMemo, useRef } from 'react';
import type { UserInfo } from '../../api/identity';
import { getAvatarColour, getInitials } from '../../utils/mentions';

interface MentionAutocompleteProps {
  users: UserInfo[];
  query: string;
  activeIndex: number;
  onSelect: (user: UserInfo) => void;
  onActiveIndexChange: (index: number) => void;
}

function userDisplayName(u: UserInfo): string {
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id;
}

/**
 * Floating list anchored beneath the textarea by the parent composer.
 * Filters the user list against the typed substring (post-@) and routes
 * keyboard nav from the composer via the activeIndex / onSelect props.
 */
export function MentionAutocomplete({
  users,
  query,
  activeIndex,
  onSelect,
  onActiveIndexChange,
}: MentionAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users.slice(0, 8);
    return users
      .filter((u) => {
        const name = userDisplayName(u).toLowerCase();
        return name.includes(q) || (u.email ?? '').toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [users, query]);

  useEffect(() => {
    if (activeIndex >= filtered.length && filtered.length > 0) {
      onActiveIndexChange(0);
    }
  }, [filtered.length, activeIndex, onActiveIndexChange]);

  if (filtered.length === 0) {
    return (
      <div
        ref={containerRef}
        className="absolute z-50 mt-1 w-72 rounded-md border border-border bg-surface-elevated shadow-lg p-2 text-xs text-muted"
      >
        No matching users
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      className="absolute z-50 mt-1 w-72 rounded-md border border-border bg-surface-elevated shadow-lg overflow-hidden"
    >
      <ul className="max-h-60 overflow-y-auto">
        {filtered.map((u, idx) => {
          const name = userDisplayName(u);
          const active = idx === activeIndex;
          return (
            <li key={u.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(u);
                }}
                onMouseEnter={() => onActiveIndexChange(idx)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                  active ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${getAvatarColour(u.id)}`}
                >
                  {getInitials(name)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium text-body">{name}</span>
                  {u.email && (
                    <span className="block truncate text-[11px] text-muted">{u.email}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { userDisplayName };
