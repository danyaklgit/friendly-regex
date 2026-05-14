import { useMemo, useState } from 'react';
import type { LOVList } from '../../types/lov';
import { humanizeLovTag } from '../../utils/humanizeLovTag';

interface LovCategoryListProps {
  lists: LOVList[];
  selectedTag: string | null;
  onSelect: (tag: string) => void;
}

export function LovCategoryList({ lists, selectedTag, onSelect }: LovCategoryListProps) {
  const [filter, setFilter] = useState('');

  // Prefer the backend-supplied Name (preserves correct acronym casing like
  // "ARNBSARI IPS Rejection Codes") and fall back to humanizing the Tag for
  // legacy payloads where Name is missing or empty.
  const labelFor = (l: LOVList) => l.Name?.trim() || humanizeLovTag(l.Tag);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return lists;
    return lists.filter((l) => {
      const label = labelFor(l).toLowerCase();
      return l.Tag.toLowerCase().includes(term) || label.includes(term);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, filter]);

  return (
    <div className="w-56 shrink-0 border-r border-border bg-surface-secondary/30 py-2 px-1.5 flex flex-col gap-2">
      <div className="px-1">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter categories..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {visible.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-muted">No categories match.</p>
        ) : (
          visible.map((list) => {
            const isActive = list.Tag === selectedTag;
            return (
              <button
                key={list.Tag}
                type="button"
                onClick={() => onSelect(list.Tag)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer
                  ${isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-body-secondary hover:bg-surface-hover'
                  }`}
              >
                <span className="text-left break-words">{labelFor(list)}</span>
                <span
                  className={`shrink-0 text-[10px] font-medium rounded-full px-2 py-0.5 border
                    ${isActive
                      ? 'bg-primary/15 border-primary/30 text-primary'
                      : 'bg-surface-secondary border-border text-body-secondary'
                    }`}
                >
                  {list.Items.length}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
