import { useMemo, useState } from 'react';

export interface GroupPillOption {
  /** Stable identifier used as the toggle key. */
  tag: string;
  /** Display label (falls back to tag if equal). */
  name: string;
}

interface GroupPillSelectorProps {
  groups: GroupPillOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Optional label rendered above the pill cluster. */
  label?: string;
  /** Show the integrated search bar when group count exceeds this. Default: 5. */
  searchThreshold?: number;
  /** Copy shown when there are zero groups at all. */
  emptyLabel?: string;
  /** Optional tour anchor mirroring the legacy TagEditModal data-attribute. */
  listDataTour?: string;
}

/**
 * Multi-select group selector rendered as a wrapping pill grid. Extracted
 * from `TagEditModal` so the user-mode portal's "Create new tag" form and
 * the Settings → Tags Hierarchy edit modal stay visually + behaviourally
 * in sync. Search bar appears automatically once the option count exceeds
 * `searchThreshold` (default 5).
 *
 * Selected pills always remain visible across a search filter so the user
 * can deselect a previously chosen group without clearing the query first.
 */
export function GroupPillSelector({
  groups,
  selected,
  onChange,
  label,
  searchThreshold = 5,
  emptyLabel = 'No groups available',
  listDataTour,
}: GroupPillSelectorProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter((g) => {
      // Keep already-selected groups visible regardless of the query so the
      // user can toggle them off without clearing the search first.
      if (selected.has(g.tag)) return true;
      return g.tag.toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
    });
  }, [groups, search, selected]);

  const toggle = (tag: string) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange(next);
  };

  const showSearch = groups.length > searchThreshold;

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-body pl-1">{label}</label>}
      <div className="rounded-lg border border-input-border bg-input-bg overflow-hidden">
        {showSearch && (
          <div className="relative border-b border-input-border">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search groups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-transparent text-heading placeholder:text-placeholder focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-hover text-muted hover:text-heading"
                aria-label="Clear search"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div
          data-tour={listDataTour}
          className="max-h-60 overflow-y-auto custom-scrollbar p-2 flex flex-wrap gap-1.5"
        >
          {groups.length === 0 && (
            <span className="text-xs text-muted">{emptyLabel}</span>
          )}
          {groups.length > 0 && filtered.length === 0 && (
            <span className="text-xs text-muted">No groups matching "{search}"</span>
          )}
          {filtered.map((g) => {
            const checked = selected.has(g.tag);
            return (
              <button
                key={g.tag}
                type="button"
                onClick={() => toggle(g.tag)}
                title={g.name !== g.tag ? g.tag : undefined}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer
                  ${checked
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-surface-tertiary text-body border border-transparent hover:bg-surface-hover'
                  }`}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
