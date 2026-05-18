import { useEffect, useMemo, useState, useRef } from 'react';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { LovCategoryList } from './LovCategoryList';
import { LovItemsPane } from './LovItemsPane';

// Internal LOV tags that aren't operator-facing — same exclusion list as
// LovsPage. EXTRACTIONS joins the hidden set because its items are surfaced
// via the AttributeEditor extraction dropdown, not as a reference list.
const HIDDEN_LOV_TAGS = new Set(['ATTRIBUTES', 'ATTRIBUTE_TRANSFORMATON', 'EXTRACTIONS']);

interface LovBrowserDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Right-side slide-in drawer for browsing LOV contents while editing a tag.
 * Mounts on top of the rule builder with a backdrop, mirrors LovsPage's
 * category-list + items-pane layout, and reads from the existing LOV context
 * (no extra API calls).
 */
export function LovBrowserDrawer({ open, onClose }: LovBrowserDrawerProps) {
  const { lovLists, lovLoading, refetchAll } = useLovAttributes();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const visibleLists = useMemo(
    () => lovLists.filter((l) => !HIDDEN_LOV_TAGS.has(l.Tag)),
    [lovLists],
  );

  // Auto-pick the first list when the drawer opens; recover if the previously
  // selected one disappears after a refresh.
  useEffect(() => {
    if (!open) return;
    if (visibleLists.length === 0) {
      if (selectedTag !== null) setSelectedTag(null);
      return;
    }
    if (!selectedTag || !visibleLists.some((l) => l.Tag === selectedTag)) {
      setSelectedTag(visibleLists[0].Tag);
    }
  }, [open, visibleLists, selectedTag]);

  // Esc closes, like TagDetailPanel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const selectedList = useMemo(
    () => visibleLists.find((l) => l.Tag === selectedTag) ?? null,
    [visibleLists, selectedTag],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        role="dialog"
        aria-label="Browse LOVs"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-40 w-full md:w-[60%] lg:w-[55%] max-w-[1000px] bg-surface-elevated border-l border-border shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.45)] flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="sticky top-0 z-10 bg-surface-elevated border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">Reference</div>
            <h2 className="text-sm font-semibold text-heading">Browse LOVs</h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-body transition-colors cursor-pointer"
            title="Close (Esc)"
            aria-label="Close LOV browser"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 min-h-0 flex">
          {lovLoading && lovLists.length === 0 ? (
            <div className="flex items-center justify-center w-full text-sm text-body-secondary">
              Loading lists…
            </div>
          ) : visibleLists.length === 0 ? (
            <div className="flex items-center justify-center w-full text-sm text-body-secondary">
              No LOV categories available.
            </div>
          ) : (
            <>
              <LovCategoryList
                lists={visibleLists}
                selectedTag={selectedTag}
                onSelect={setSelectedTag}
              />
              <LovItemsPane
                list={selectedList}
                onRefresh={handleRefresh}
                refreshing={refreshing}
              />
            </>
          )}
        </div>
      </aside>
    </>
  );
}
