import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AnalyzedTransaction, TagSpecDefinition } from '../../types';
import type { FieldMeta } from '../../utils/deriveFieldMeta';
import type { FilterDefinition } from '../../api/transactions';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { DropdownBackdrop } from '../shared/DropdownBackdrop';
import { toDateInputValue } from '../shared/DateField';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

type FilterState = Record<string, Set<string>>;

/** Stable no-op for optional operator-only callbacks (see DynamicFilters props). */
const noop = () => {};

/** Max option rows rendered at once in a LIST dropdown. User-mode attribute
 *  filters can carry tens of thousands of distinct values; rendering them all
 *  would hang the page, so we cap the "Available" group and lean on the
 *  in-dropdown search to narrow. Selected values are always shown in full. */
const LIST_RENDER_CAP = 200;

/** Stable empty set for reads when an attribute has no selection yet. */
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

const FILTER_EXCLUSIONS = new Set([
  'AdditionalInformation',
  'TransactionDetails',
  'Description1',
  'Description2',
]);

/** API filter tags that should not render as filter dropdowns in live mode */
const HIDDEN_API_FILTER_TAGS = new Set([
  'IsDeadEnd',
  'IsUntagged',
  'IsMultiTagged',
  'OpsAttributes',
]);

interface DynamicFiltersProps {
  /** Loaded rows — only used in sample mode (and for live DECIMAL running-max).
   *  Optional so the live-mode user portal can mount the bar without analyzed
   *  transactions. Defaults to []. */
  data?: AnalyzedTransaction[];
  fieldMeta: FieldMeta;
  /** Operator sample-mode tag list. Optional; unused in live mode. Defaults to []. */
  tagDefinitions?: TagSpecDefinition[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  /** Operator-only "Show only" toggles (sample mode). Optional so other
   *  surfaces (user portal) can reuse the bar without them. */
  showOnlyUntagged?: boolean;
  onShowOnlyUntaggedChange?: (value: boolean) => void;
  showOnlyMultiTagged?: boolean;
  onShowOnlyMultiTaggedChange?: (value: boolean) => void;
  showOnlyDeadEnd?: boolean;
  onShowOnlyDeadEndChange?: (value: boolean) => void;
  baseFilters?: FilterState;
  leadingActionSlot?: ReactNode;
  /** Number of "external" filters (rendered via `leadingActionSlot`, e.g.
   *  Detected Tag Specs) that the parent owns. Folds into the visible
   *  Clear-filters badge and gates the button's enablement. */
  extraActiveFilterCount?: number;
  /** Invoked by Clear-filters alongside the internal clears so external
   *  filter state (e.g. Detected Tag Specs selection) is reset too. */
  onClearExtraFilters?: () => void;
  endSlot?: ReactNode;
  isLiveMode?: boolean;
  filterDefinitions?: FilterDefinition[];
  filterDefinitionsLoading?: boolean;
  decimalMaxValues?: Map<string, number>;
  disabledFilterTags?: Set<string>;
  /** Optional renderer for displayed filter VALUES (option labels, selected
   *  chips). Used by the user portal to redact sensitive values. The value
   *  sent to the backend is unaffected. Identity when omitted. */
  renderValue?: (text: string) => ReactNode;
}

// ─── Shared dropdown hook ─────────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return { open, setOpen, ref };
}

// ─── Dual-thumb range slider ──────────────────────────────────────────────────

function RangeSlider({
  min,
  max,
  low,
  high,
  step,
  onLowChange,
  onHighChange,
  hideLabels,
}: {
  min: number;
  max: number;
  low: number;
  high: number;
  step?: number;
  onLowChange: (v: number) => void;
  onHighChange: (v: number) => void;
  hideLabels?: boolean;
}) {
  const range = max - min || 1;
  const lowPct = ((low - min) / range) * 100;
  const highPct = ((high - min) / range) * 100;
  const stepVal = step ?? 'any';

  return (
    <div className="px-2 pt-1 pb-2">
      {!hideLabels && (
        <div className="flex items-center justify-between text-[10px] text-muted mb-1">
          <span>{low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span>{high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}
      <div className="relative h-4">
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-surface-tertiary rounded" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-primary rounded"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={stepVal}
          value={low}
          onChange={(e) => {
            const v = Number(e.target.value);
            onLowChange(Math.min(v, high));
          }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={stepVal}
          value={high}
          onChange={(e) => {
            const v = Number(e.target.value);
            onHighChange(Math.max(v, low));
          }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
}

// ─── LIST + EQ filter (Show Only) ─────────────────────────────────────────────

function ListEqDropdown({
  definition,
  filters,
  onFiltersChange,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // The panel is portaled into <body> with position:fixed, so we have to
  // re-anchor it to the trigger button whenever the layout under the trigger
  // changes — page scroll, window resize, OR an ancestor like the rule
  // builder opening/closing and pushing the trigger up/down. Without this,
  // the panel stays nailed to its initial viewport position while the
  // trigger drifts away, breaking the visual connection.
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 4, left: rect.left });
    };
    updatePosition();
    // capture:true catches scroll on inner scrollable ancestors too, not
    // just window scroll.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updatePosition);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      ro?.disconnect();
    };
  }, [open]);

  const key = definition.Tag;
  const selected = filters[key] ?? new Set<string>();
  const activeLabels = definition.Values.filter((v) => selected.has(v.Column)).map((v) => v.Label);
  const hasActive = activeLabels.length > 0;

  // Same visual-feedback delay as StringFromListDropdown: flip the checkbox
  // tick immediately on click, but wait 500ms before the row reorders into
  // the Selected section. A single shared timer batches clicks within the
  // window so adjacent rows don't reflow under the cursor mid-selection.
  const SELECT_COMMIT_DELAY_MS = 500;
  const [pendingSelect, setPendingSelect] = useState<Set<string>>(new Set());
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const cancelPendingTimer = () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  };

  useEffect(() => () => cancelPendingTimer(), []);

  const schedulePendingCommit = () => {
    if (commitTimerRef.current) return;
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      setPendingSelect((current) => {
        if (current.size === 0) return current;
        const currentFilters = filtersRef.current;
        const currentSelected = currentFilters[key] ?? new Set<string>();
        const nextSelected = new Set(currentSelected);
        for (const v of current) nextSelected.add(v);
        const updated = { ...currentFilters };
        if (nextSelected.size === 0) delete updated[key];
        else updated[key] = nextSelected;
        onFiltersChange(updated);
        return new Set();
      });
    }, SELECT_COMMIT_DELAY_MS);
  };

  // Reverse index: for each target column T, the columns whose DisabledBy
  // points at T. Used to make the mutual-exclusion symmetric — if value A
  // declares DisabledBy: Column:B, then selecting A must also disable B (not
  // just the other way around).
  const reverseDisablers = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const v of definition.Values) {
      if (!v.DisabledBy) continue;
      const match = v.DisabledBy.match(/^Column:(.+)$/);
      if (!match) continue;
      const target = match[1];
      if (!map.has(target)) map.set(target, new Set());
      map.get(target)!.add(v.Column);
    }
    return map;
  }, [definition.Values]);

  // DisabledBy logic from API: format "Column:<columnName>". Applied
  // symmetrically — a value is disabled when either (a) its DisabledBy points
  // at a selected column, or (b) any selected column declares it as its
  // DisabledBy target. Pending-but-not-yet-committed selections count too,
  // so a value the user just clicked also disables its conflict targets
  // immediately (matches the visible tick).
  const effectivelySelected = (col: string) => selected.has(col) || pendingSelect.has(col);
  const isDisabled = (v: typeof definition.Values[number]) => {
    if (v.DisabledBy) {
      const match = v.DisabledBy.match(/^Column:(.+)$/);
      if (match && effectivelySelected(match[1])) return true;
    }
    const disablers = reverseDisablers.get(v.Column);
    if (disablers) {
      for (const d of disablers) {
        if (effectivelySelected(d)) return true;
      }
    }
    return false;
  };

  const handleToggle = (column: string) => {
    // Already in Selected → deselect immediately (no delay on the way out).
    if (selected.has(column)) {
      const next = new Set(selected);
      next.delete(column);
      const updated = { ...filters };
      if (next.size === 0) delete updated[key];
      else updated[key] = next;
      onFiltersChange(updated);
      return;
    }
    // Already pending → user changed their mind, cancel the queued commit.
    if (pendingSelect.has(column)) {
      setPendingSelect((prev) => {
        if (!prev.has(column)) return prev;
        const next = new Set(prev);
        next.delete(column);
        if (next.size === 0) cancelPendingTimer();
        return next;
      });
      return;
    }
    // Fresh select. Collect conflict columns (DisabledBy targets, both
    // directions), drop them from both selected and pending immediately so
    // the disabled state visibly kicks in, then queue the new value behind
    // the 500ms commit timer.
    const conflictsToRemove = new Set<string>();
    const clicked = definition.Values.find((vv) => vv.Column === column);
    if (clicked?.DisabledBy) {
      const match = clicked.DisabledBy.match(/^Column:(.+)$/);
      if (match) conflictsToRemove.add(match[1]);
    }
    for (const v of definition.Values) {
      if (v.Column === column) continue;
      if (!v.DisabledBy) continue;
      const match = v.DisabledBy.match(/^Column:(.+)$/);
      if (match && match[1] === column) conflictsToRemove.add(v.Column);
    }

    if (conflictsToRemove.size > 0) {
      const next = new Set(selected);
      let changed = false;
      for (const c of conflictsToRemove) {
        if (next.has(c)) { next.delete(c); changed = true; }
      }
      if (changed) {
        const updated = { ...filters };
        if (next.size === 0) delete updated[key];
        else updated[key] = next;
        onFiltersChange(updated);
      }
    }

    setPendingSelect((prev) => {
      const next = new Set(prev);
      for (const c of conflictsToRemove) next.delete(c);
      next.add(column);
      return next;
    });
    schedulePendingCommit();
  };

  // Split the list into a "Selected" group at the top and an "Available"
  // group below, preserving the definition's original order within each
  // group. Items move between groups only on user toggle, so the list never
  // shifts under the cursor unexpectedly.
  const { selectedValues, availableValues } = useMemo(() => {
    const sel: typeof definition.Values = [];
    const avail: typeof definition.Values = [];
    for (const v of definition.Values) {
      (selected.has(v.Column) ? sel : avail).push(v);
    }
    return { selectedValues: sel, availableValues: avail };
  }, [definition.Values, selected]);

  const handleSelectAll = () => {
    cancelPendingTimer();
    setPendingSelect(new Set());
    const next = new Set<string>();
    for (const v of definition.Values) {
      if (!isDisabled(v)) next.add(v.Column);
    }
    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
  };
  const handleDeselectAll = () => {
    cancelPendingTimer();
    setPendingSelect(new Set());
    const updated = { ...filters };
    delete updated[key];
    onFiltersChange(updated);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        data-filter-tag={definition.Tag}
        data-filter-label={definition.Label}
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {hasActive ? `Show: ${activeLabels.join(' & ')}` : definition.Label}
      </button>
      {open && panelPos && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          {createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64"
              style={{ top: panelPos.top, left: panelPos.left }}
            >
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="cursor-pointer text-[10px] font-medium text-primary-dark hover:underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="cursor-pointer text-[10px] font-medium text-muted hover:text-body hover:underline"
                >
                  Deselect all
                </button>
              </div>
              <div className="p-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                {selectedValues.length > 0 && (
                  <>
                    <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                      Selected ({selectedValues.length})
                    </div>
                    {selectedValues.map((v) => (
                      <label
                        key={v.Column}
                        className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded text-black dark:text-white ${
                          isDisabled(v)
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-surface-hover cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isDisabled(v)}
                          checked
                          onChange={() => handleToggle(v.Column)}
                          className="rounded border-border-strong"
                        />
                        <span>{v.Label}</span>
                      </label>
                    ))}
                    {availableValues.length > 0 && (
                      <div className="my-1 border-t border-border-subtle" />
                    )}
                  </>
                )}
                {availableValues.length > 0 && (
                  <>
                    {selectedValues.length > 0 && (
                      <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                        Available
                      </div>
                    )}
                    {availableValues.map((v) => (
                      <label
                        key={v.Column}
                        className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded text-black dark:text-white ${
                          isDisabled(v)
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-surface-hover cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isDisabled(v)}
                          checked={pendingSelect.has(v.Column)}
                          onChange={() => handleToggle(v.Column)}
                          className="rounded border-border-strong"
                        />
                        <span>{v.Label}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}

// ─── STRING-FROM-LIST filter ──────────────────────────────────────────────────

function StringFromListDropdown({
  definition,
  filters,
  onFiltersChange,
  locked,
  disabled,
  renderValue,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  locked?: boolean;
  disabled?: boolean;
  /** Optional renderer for displayed option values (e.g. redaction in user
   *  mode). Identity when omitted. The underlying filter value is unchanged. */
  renderValue?: (text: string) => ReactNode;
}) {
  const rv = renderValue ?? ((t: string) => t);
  const { open, setOpen, ref } = useDropdown();
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const key = definition.Tag;
  const selected = filters[key] ?? new Set<string>();
  const hasActive = selected.size > 0;
  const isSearchable = definition.IsFilterSearchable === true;

  // Visual-feedback delay before a freshly-checked value jumps from the
  // Available section up to the Selected section. The checkbox flips
  // immediately so the user can see the tick; the section move (and any
  // upstream onFiltersChange side effects) waits SELECT_COMMIT_DELAY_MS.
  // A single shared timer batches any clicks that arrive during the window.
  const SELECT_COMMIT_DELAY_MS = 500;
  const [pendingSelect, setPendingSelect] = useState<Set<string>>(new Set());
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const cancelPendingTimer = () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  };

  useEffect(() => () => cancelPendingTimer(), []);

  const schedulePendingCommit = () => {
    if (commitTimerRef.current) return;
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      setPendingSelect((current) => {
        if (current.size === 0) return current;
        const currentFilters = filtersRef.current;
        const currentSelected = currentFilters[key] ?? new Set<string>();
        const nextSelected = new Set(currentSelected);
        for (const v of current) nextSelected.add(v);
        const updated = { ...currentFilters };
        if (nextSelected.size === 0) delete updated[key];
        else updated[key] = nextSelected;
        onFiltersChange(updated);
        return new Set();
      });
    }, SELECT_COMMIT_DELAY_MS);
  };

  useEffect(() => {
    if (open && isSearchable) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
    if (!open) setSearch('');
  }, [open, isSearchable]);

  // Render filter values in the exact order the backend returns them — no
  // front-end sorting.
  const filteredValues = useMemo(() => {
    if (!search.trim()) return definition.Values;
    const term = search.toLowerCase();
    return definition.Values.filter(
      (v) => (v.Label ?? v.Value ?? '').toLowerCase().includes(term) ||
             (v.Value ?? '').toLowerCase().includes(term) ||
             (v.SubLabel ?? '').toLowerCase().includes(term)
    );
  }, [definition.Values, search]);

  // Split the filtered list into a "Selected" group at the top and an
  // "Available" group below. Items move between groups only when the user
  // toggles their checkbox, so the list never shifts under the cursor in the
  // middle of selecting adjacent rows. Keyboard navigation walks Selected
  // first, then Available — matching the visual order.
  const { selectedFiltered, availableFiltered, navigableValues, hiddenCount } = useMemo(() => {
    const sel: typeof filteredValues = [];
    const availAll: typeof filteredValues = [];
    for (const v of filteredValues) {
      (selected.has(v.Value ?? '') ? sel : availAll).push(v);
    }
    // Cap the rendered "Available" rows so huge attribute lists stay
    // responsive; keyboard nav walks only the rendered set.
    const avail = availAll.length > LIST_RENDER_CAP ? availAll.slice(0, LIST_RENDER_CAP) : availAll;
    return {
      selectedFiltered: sel,
      availableFiltered: avail,
      navigableValues: [...sel, ...avail],
      hiddenCount: availAll.length - avail.length,
    };
  }, [filteredValues, selected]);

  const handleToggle = (value: string) => {
    // Already committed to Selected → deselect immediately (no delay on the
    // way out, only on the way in).
    if (selected.has(value)) {
      const next = new Set(selected);
      next.delete(value);
      const updated = { ...filters };
      if (next.size === 0) delete updated[key];
      else updated[key] = next;
      onFiltersChange(updated);
      return;
    }
    // Already pending a delayed commit → user changed their mind, cancel it.
    if (pendingSelect.has(value)) {
      setPendingSelect((prev) => {
        if (!prev.has(value)) return prev;
        const next = new Set(prev);
        next.delete(value);
        if (next.size === 0) cancelPendingTimer();
        return next;
      });
      return;
    }
    // Fresh select → show the tick now, schedule the move for 500ms later.
    setPendingSelect((prev) => new Set(prev).add(value));
    schedulePendingCommit();
  };

  // Select/Deselect all act on the CURRENT filtered view — so when the user
  // has typed a search term, Select all only adds the matching values rather
  // than wiping in 10 000 unrelated entries. With no search, it picks every
  // value in the definition.
  const handleSelectAll = () => {
    cancelPendingTimer();
    setPendingSelect(new Set());
    const next = new Set(selected);
    for (const v of filteredValues) {
      if (v.Value != null) next.add(v.Value);
    }
    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
  };
  const handleDeselectAll = () => {
    cancelPendingTimer();
    setPendingSelect(new Set());
    if (!search.trim()) {
      // No search → clear the filter entirely.
      const updated = { ...filters };
      delete updated[key];
      onFiltersChange(updated);
      return;
    }
    // Searching → only remove the currently-visible matches; leave other
    // selections untouched.
    const next = new Set(selected);
    for (const v of filteredValues) {
      if (v.Value != null) next.delete(v.Value);
    }
    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
  };

  // Reset the cursor whenever the list changes (search input or open state).
  useEffect(() => { setHighlightIndex(0); }, [search, open]);

  // Keep the highlighted row scrolled into view as the user arrows through.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-opt-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (navigableValues.length === 0 ? 0 : Math.min(i + 1, navigableValues.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const v = navigableValues[highlightIndex];
      if (v) handleToggle(v.Value ?? '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  // When the column is locked by an active checkout (e.g. BankSwiftCode /
  // Side coming from baseFilters) the value is non-editable AND already
  // surfaced in the page header ("You're working on SABBSARI - DR").
  // Hide the pill entirely so the filter row stays uncluttered; the filter
  // value remains in `filters` state and is sent on every request.
  if (locked && hasActive) return null;

  return (
    <div ref={ref} className="relative">
      <button
        data-filter-tag={definition.Tag}
        data-filter-label={definition.Label}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          disabled
            ? 'bg-primary/10 border-primary/30 text-primary-dark opacity-60 cursor-not-allowed'
            : hasActive
              ? 'bg-primary/10 border-primary/30 text-primary-dark'
              : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {definition.Label}
      </button>
      {open && !disabled && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64">
            {isSearchable && (
              <div className="p-2 border-b border-border-subtle">
                <div className="relative">
                  <svg
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={`Search ${definition.Label.toLowerCase()}...`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full pl-7 pr-7 py-1.5 text-xs rounded border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  />
                  {/* Clear-search × button. Shown only when there's
                      a query so the search icon stays the only chrome
                      at rest; clicking empties the query and
                      re-focuses the input. */}
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        searchInputRef.current?.focus();
                      }}
                      title="Clear search"
                      aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-4 h-4 rounded-full text-muted hover:text-heading hover:bg-surface-active transition-colors cursor-pointer"
                    >
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" aria-hidden="true">
                        <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={filteredValues.length === 0}
                className="cursor-pointer text-[10px] font-medium text-primary-dark hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
              >
                Select all{search.trim() ? ' (matches)' : ''}
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={selected.size === 0}
                className="cursor-pointer text-[10px] font-medium text-muted hover:text-body hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
              >
                Deselect all{search.trim() ? ' (matches)' : ''}
              </button>
            </div>
            <div ref={listRef} className="max-h-60 overflow-y-auto custom-scrollbar p-1.5">
              {filteredValues.length === 0 ? (
                <div className="px-2 py-3 text-xs text-faint text-center">No matches</div>
              ) : (() => {
                const renderRow = (v: typeof filteredValues[number], idx: number) => {
                  const valueKey = v.Value ?? '';
                  const isSelected = selected.has(valueKey);
                  // Show the tick immediately for values whose move to the
                  // Selected section is queued behind the 500ms commit timer.
                  const isVisuallyChecked = isSelected || pendingSelect.has(valueKey);
                  const isHighlighted = idx === highlightIndex;
                  const baseBg = isVisuallyChecked ? 'bg-primary/5' : '';
                  const hoverBg = isHighlighted
                    ? (isVisuallyChecked ? 'bg-primary/15' : 'bg-primary/10')
                    : 'hover:bg-surface-hover';
                  return (
                    <label
                      key={v.Value}
                      data-opt-index={idx}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      className={`flex items-start gap-2 px-2 py-1.5 text-xs rounded cursor-pointer ${baseBg} ${hoverBg}`}
                    >
                      <input
                        type="checkbox"
                        checked={isVisuallyChecked}
                        onChange={() => handleToggle(valueKey)}
                        className="rounded border-border-strong shrink-0 mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-black dark:text-white font-medium truncate">{rv(v.Label || v.Value || '')}</span>
                        {v.SubLabel && <span className="block text-[10px] text-muted truncate">{rv(v.SubLabel)}</span>}
                      </span>
                    </label>
                  );
                };
                return (
                  <>
                    {selectedFiltered.length > 0 && (
                      <>
                        <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                          Selected ({selectedFiltered.length})
                        </div>
                        {selectedFiltered.map((v, i) => renderRow(v, i))}
                        {availableFiltered.length > 0 && (
                          <div className="my-1 border-t border-border-subtle" />
                        )}
                      </>
                    )}
                    {availableFiltered.length > 0 && (
                      <>
                        {selectedFiltered.length > 0 && (
                          <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                            Available
                          </div>
                        )}
                        {availableFiltered.map((v, i) => renderRow(v, selectedFiltered.length + i))}
                      </>
                    )}
                    {hiddenCount > 0 && (
                      <div className="px-2 pt-1.5 pb-1 text-[10px] text-muted text-center">
                        Showing {availableFiltered.length.toLocaleString()} of {(availableFiltered.length + hiddenCount).toLocaleString()} — refine your search to narrow.
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── SEARCH filter ────────────────────────────────────────────────────────────

function SearchFilter({
  definition,
  filters,
  onFiltersChange,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const key = definition.Tag;
  const currentValue = [...(filters[key] ?? [])][0] ?? '';
  const [inputValue, setInputValue] = useState(currentValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setInputValue(currentValue);
  }, [currentValue]);

  const handleChange = (text: string) => {
    setInputValue(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = { ...filters };
      if (text.trim()) {
        next[key] = new Set([text.trim()]);
      } else {
        delete next[key];
      }
      onFiltersChange(next);
    }, 400);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={definition.Label}
        className={`text-xs pl-3 ${currentValue ? 'pr-7' : 'pr-3'} py-1.5 rounded-lg border transition-colors w-40 outline-none ${
          currentValue
            ? 'bg-primary/10 border-primary/30 text-primary-dark placeholder:text-primary-dark/50'
            : 'bg-surface border-border-strong text-body placeholder:text-muted hover:bg-surface-hover'
        }`}
      />
      {currentValue && (
        <button
          onClick={() => handleChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-body text-xs"
        >
          &times;
        </button>
      )}
    </div>
  );
}

// Round n up to the nearest "nice" number (2 significant digits of rounding unit).
// e.g. 214,630,287 → 215,000,000 | 30,082 → 30,100 | 351,739 → 352,000
function ceilToNice(n: number): number {
  if (n <= 0) return 0;
  const magnitude = Math.floor(Math.log10(n));
  const step = Math.pow(10, Math.max(0, magnitude - 2));
  return Math.ceil(n / step) * step;
}

// Format a numeric string with thousand separators, preserving trailing decimal point/digits.
function formatThousands(raw: string): string {
  if (!raw) return raw;
  const [intPart, ...decParts] = raw.split('.');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decParts.length > 0 ? `${formatted}.${decParts.join('.')}` : formatted;
}

// ─── DECIMAL filter (range slider) ───────────────────────────────────────────

// Static default ceiling for decimal range sliders. We no longer probe the API
// for a true global max (see TransactionsTab) — instead the slider opens at
// this value and edit mode lets the user type a higher number if their data
// exceeds it.
const DEFAULT_DECIMAL_MAX = 200_000_000;

function DecimalFilter({
  definition,
  filters,
  onFiltersChange,
  dataMax,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  dataMax?: number;
}) {
  const { open, setOpen, ref } = useDropdown();
  const gteKey = `${definition.Tag}_GTE`;
  const lteKey = `${definition.Tag}_LTE`;
  const currentMin = [...(filters[gteKey] ?? [])][0] ?? '';
  const currentMax = [...(filters[lteKey] ?? [])][0] ?? '';
  const hasActive = !!currentMin || !!currentMax;

  // Base ceiling: the static default is the floor, growing if the loaded data
  // actually exceeds it. The slider is always usable — no "No data available"
  // state — so hasSlider is always true once we render this component.
  const dataDerivedMax = dataMax !== undefined && dataMax > 0 ? ceilToNice(dataMax) : 0;
  const baseMax = Math.max(DEFAULT_DECIMAL_MAX, dataDerivedMax);

  // Applied filter values (what's actually filtering the table)
  const appliedLow = currentMin !== '' ? Number(currentMin) : 0;
  const appliedHigh = currentMax !== '' ? Number(currentMax) : baseMax;

  // Pending (draft) slider state — not applied until user clicks Filter
  const [pendingLow, setPendingLow] = useState(appliedLow);
  const [pendingHigh, setPendingHigh] = useState(appliedHigh);

  // Grow sliderMax so the thumb stays in range if the user (or a saved filter)
  // exceeds the default. Lets edit-mode entries beyond DEFAULT_DECIMAL_MAX work
  // without truncating the slider visually.
  const sliderMax = Math.max(baseMax, appliedHigh, pendingHigh);
  const hasSlider = sliderMax > 0;
  // Step proportional to max, capped at 500,000
  const step = Math.min(500_000, Math.max(1, Math.pow(10, Math.max(0, Math.floor(Math.log10(sliderMax)) - 2))));

  // Edit-mode state for manual min/max inputs
  const [editMode, setEditMode] = useState(false);
  const [lowStr, setLowStr] = useState('');
  const [highStr, setHighStr] = useState('');

  // Sync pending state when the panel opens or applied values change externally
  useEffect(() => {
    setPendingLow(appliedLow);
    setPendingHigh(appliedHigh);
    setEditMode(false);
  }, [open, appliedLow, appliedHigh]);

  const isDirty = pendingLow !== appliedLow || pendingHigh !== appliedHigh;

  const applyFilter = () => {
    const next = { ...filters };
    if (pendingLow <= 0) delete next[gteKey];
    else next[gteKey] = new Set([String(pendingLow)]);
    // Always honor pendingHigh as the upper bound — the user reached this
    // value deliberately (Apply only fires when isDirty, and the Apply button
    // only renders then). Even if they typed a value above the static 200M
    // default, that ceiling is just a starting point, not a cap. Reset
    // clears the filter via clearFilter().
    if (pendingHigh > 0 && pendingHigh >= pendingLow) next[lteKey] = new Set([String(pendingHigh)]);
    else delete next[lteKey];
    onFiltersChange(next);
    setOpen(false);
  };

  const clearFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingLow(0);
    setPendingHigh(baseMax);
    const next = { ...filters };
    delete next[gteKey];
    delete next[lteKey];
    onFiltersChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {definition.Label}
        {hasActive && (
          <>
            <span className="opacity-70">({Number(currentMin || 0).toLocaleString()} – {Number(currentMax || sliderMax).toLocaleString()})</span>
            <span onClick={clearFilter} className="ml-0.5 opacity-60 hover:opacity-100">&times;</span>
          </>
        )}
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-80 overflow-hidden">
            <div className="px-3 pt-2 pb-1 border-b border-border-subtle flex items-center justify-between">
              <span className="text-[10px] text-muted font-medium uppercase tracking-wide">{definition.Label}</span>
              <div className="flex items-center gap-2">
                {hasSlider && (
                  <button
                    onClick={() => {
                      if (editMode) {
                        setEditMode(false);
                      } else {
                        setLowStr(formatThousands(String(pendingLow)));
                        setHighStr(formatThousands(String(pendingHigh)));
                        setEditMode(true);
                      }
                    }}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-body transition-colors cursor-pointer"
                  >
                    {editMode ? (
                      'Done'
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                        </svg>
                        <span>Edit</span>
                      </>
                    )}
                  </button>
                )}
                {hasActive && (
                  <>
                    <span className="text-border-strong">|</span>
                    <button onClick={clearFilter} className="text-[10px] text-muted hover:text-body transition-colors cursor-pointer">
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>
            {hasSlider ? (
              <>
                {editMode && (
                  <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                    <input
                      type="text"
                      value={lowStr}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        setLowStr(formatThousands(raw));
                        const v = parseFloat(raw);
                        if (!isNaN(v) && v >= 0 && v <= pendingHigh) {
                          setPendingLow(v);
                        }
                      }}
                      className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body focus:outline-none focus:border-primary"
                      placeholder="Min"
                    />
                    <span className="text-xs text-muted shrink-0">–</span>
                    <input
                      type="text"
                      value={highStr}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        setHighStr(formatThousands(raw));
                        const v = parseFloat(raw);
                        // No upper clamp here — sliderMax grows from pendingHigh,
                        // so a user-typed value above the default 200M ceiling is
                        // honored and the slider extends to match.
                        if (!isNaN(v) && v >= pendingLow) {
                          setPendingHigh(v);
                        }
                      }}
                      className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body focus:outline-none focus:border-primary"
                      placeholder="Max"
                    />
                  </div>
                )}
                <RangeSlider
                  min={0}
                  max={sliderMax}
                  low={pendingLow}
                  high={pendingHigh}
                  step={step}
                  onLowChange={(v) => {
                    setPendingLow(v);
                    if (editMode) setLowStr(formatThousands(String(v)));
                  }}
                  onHighChange={(v) => {
                    setPendingHigh(v);
                    if (editMode) setHighStr(formatThousands(String(v)));
                  }}
                  hideLabels={editMode}
                />
                {isDirty && (
                  <div className="px-2 pb-2">
                    <button
                      onClick={applyFilter}
                      className="w-full text-xs py-1 rounded-md bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                    >
                      Apply filter
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-3 text-xs text-muted text-center">No data available</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── DATE filter (range inputs) ──────────────────────────────────────────────

function DateFilter({
  definition,
  filters,
  onFiltersChange,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const { open, setOpen, ref } = useDropdown();
  const gteKey = `${definition.Tag}_GTE`;
  const lteKey = `${definition.Tag}_LTE`;
  // Filter values can arrive carrying an ISO datetime tail
  // (e.g. `2023-06-01T00:00:00Z`) when the rule-builder's Validity
  // section mirrors itself into this filter, or when the backend
  // ships a stored date as a full timestamp. Strip the time portion
  // before display so:
  //   1. The chip label reads "2023-06-01 - 2023-06-30" instead of
  //      "2023-06-01T00:00:00Z - 2023-06-30T00:00:00Z".
  //   2. The `<input type="date">` accepts the value and renders it
  //      in the calendar popup. HTML date inputs silently reject any
  //      string that isn't bare `YYYY-MM-DD`, so without this strip
  //      the inputs show the placeholder even when the filter is
  //      active.
  const currentFromRaw = [...(filters[gteKey] ?? [])][0] ?? '';
  const currentToRaw = [...(filters[lteKey] ?? [])][0] ?? '';
  const currentFrom = toDateInputValue(currentFromRaw);
  const currentTo = toDateInputValue(currentToRaw);
  const hasActive = !!currentFrom || !!currentTo;

  const handleChange = (from: string, to: string) => {
    // Reject ranges where From is after To. Native min/max attrs already block
    // the date picker, but typed/pasted entry can bypass that, so we also guard
    // here as a defensive measure.
    if (from && to && from > to) return;
    const next = { ...filters };
    if (from) next[gteKey] = new Set([from]);
    else delete next[gteKey];
    if (to) next[lteKey] = new Set([to]);
    else delete next[lteKey];
    onFiltersChange(next);
  };

  // Inline × clear on the chip. Mirrors the affordance on the numeric
  // range filter (and on the value-list filter chips above) so the
  // operator can drop the entire date range without opening the
  // popover. stopPropagation prevents the click from also toggling
  // the popover open.
  const clearFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...filters };
    delete next[gteKey];
    delete next[lteKey];
    onFiltersChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1 ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {definition.Label}
        {hasActive && (
          <>
            <span className="opacity-70">
              ({currentFrom && currentTo
                ? `${currentFrom} - ${currentTo}`
                : currentFrom
                  ? `From - ${currentFrom}`
                  : `Until - ${currentTo}`})
            </span>
            <span
              role="button"
              aria-label={`Clear ${definition.Label} filter`}
              onClick={clearFilter}
              className="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer"
            >
              &times;
            </span>
          </>
        )}
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg p-3 min-w-52">
            {hasActive && (
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={clearFilter}
                  className="text-[10px] text-muted hover:text-body transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-muted block mb-0.5">From</label>
                <input
                  type="date"
                  value={currentFrom}
                  max={currentTo || undefined}
                  onChange={(e) => handleChange(e.target.value, currentTo)}
                  className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body outline-none"
                />
              </div>
              <span className="text-muted text-xs mt-3">&ndash;</span>
              <div className="flex-1">
                <label className="text-[10px] text-muted block mb-0.5">To</label>
                <input
                  type="date"
                  value={currentTo}
                  min={currentFrom || undefined}
                  onChange={(e) => handleChange(currentFrom, e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body outline-none"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Legacy: Show Only dropdown (sample mode) ────────────────────────────────

const SHOW_ONLY_OPTIONS = ['Untagged', 'Multi Tags', 'Dead End'] as const;

function ShowOnlyDropdown({
  showOnlyUntagged,
  onShowOnlyUntaggedChange,
  showOnlyMultiTagged,
  onShowOnlyMultiTaggedChange,
  showOnlyDeadEnd,
  onShowOnlyDeadEndChange,
}: {
  showOnlyUntagged: boolean;
  onShowOnlyUntaggedChange: (value: boolean) => void;
  showOnlyMultiTagged: boolean;
  onShowOnlyMultiTaggedChange: (value: boolean) => void;
  showOnlyDeadEnd: boolean;
  onShowOnlyDeadEndChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // The panel is portaled into <body> with position:fixed, so we have to
  // re-anchor it to the trigger button whenever the layout under the trigger
  // changes — page scroll, window resize, OR an ancestor like the rule
  // builder opening/closing and pushing the trigger up/down. Without this,
  // the panel stays nailed to its initial viewport position while the
  // trigger drifts away, breaking the visual connection.
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 4, left: rect.left });
    };
    updatePosition();
    // capture:true catches scroll on inner scrollable ancestors too, not
    // just window scroll.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updatePosition);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      ro?.disconnect();
    };
  }, [open]);

  const activeLabels = [
    showOnlyUntagged && 'Untagged',
    showOnlyMultiTagged && 'Multi Tags',
    showOnlyDeadEnd && 'Dead End',
  ].filter(Boolean) as string[];
  const hasActive = activeLabels.length > 0;

  const handleToggle = (option: typeof SHOW_ONLY_OPTIONS[number]) => {
    switch (option) {
      case 'Untagged':
        onShowOnlyUntaggedChange(!showOnlyUntagged);
        if (!showOnlyUntagged) onShowOnlyMultiTaggedChange(false);
        break;
      case 'Multi Tags':
        onShowOnlyMultiTaggedChange(!showOnlyMultiTagged);
        if (!showOnlyMultiTagged) onShowOnlyUntaggedChange(false);
        break;
      case 'Dead End':
        onShowOnlyDeadEndChange(!showOnlyDeadEnd);
        break;
    }
  };

  const isChecked = (option: typeof SHOW_ONLY_OPTIONS[number]) => {
    switch (option) {
      case 'Untagged': return showOnlyUntagged;
      case 'Multi Tags': return showOnlyMultiTagged;
      case 'Dead End': return showOnlyDeadEnd;
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {hasActive ? `Show: ${activeLabels.join(' & ')}` : 'Show Only'}
      </button>
      {open && panelPos && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          {createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64"
              style={{ top: panelPos.top, left: panelPos.left }}
            >
              <div className="p-1.5">
                {SHOW_ONLY_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked(option)}
                      onChange={() => handleToggle(option)}
                      className="rounded border-border-strong"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}

// ─── Legacy: FilterDropdown (sample mode) ────────────────────────────────────

function FilterDropdown({
  label,
  values,
  selected,
  onChange,
  isNumeric,
}: {
  label: string;
  values: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  isNumeric?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const numericInfo = useMemo(() => {
    if (!isNumeric) return null;
    const nums = values.map(Number).sort((a, b) => a - b);
    return { min: nums[0], max: nums[nums.length - 1], sorted: nums };
  }, [isNumeric, values]);

  const [rangelow, setRangeLow] = useState(numericInfo?.min ?? 0);
  const [rangeHigh, setRangeHigh] = useState(numericInfo?.max ?? 0);

  useEffect(() => {
    if (numericInfo) {
      setRangeLow(numericInfo.min);
      setRangeHigh(numericInfo.max);
    }
  }, [numericInfo]);

  const applyRange = useCallback((low: number, high: number) => {
    const inRange = new Set(
      values.filter((v) => {
        const n = Number(v);
        return n >= low && n <= high;
      })
    );
    onChange(inRange);
  }, [values, onChange]);

  const handleLowChange = useCallback((v: number) => {
    setRangeLow(v);
    applyRange(v, rangeHigh);
  }, [applyRange, rangeHigh]);

  const handleHighChange = useCallback((v: number) => {
    setRangeHigh(v);
    applyRange(rangelow, v);
  }, [applyRange, rangelow]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeCount = selected.size;
  const isRangeActive = numericInfo && (rangelow > numericInfo.min || rangeHigh < numericInfo.max);

  // Split into "Selected" / "Available" groups so the eye can find existing
  // picks without breaking the cursor target when the user toggles. Items
  // only move between groups in direct response to a user click.
  // (Computed inline in the render where `values` is in scope.)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          activeCount > 0 || isRangeActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {label}
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64">
            {numericInfo && (
              <div className={values.length <= 50 ? 'border-b border-border-subtle' : ''}>
                <RangeSlider
                  min={numericInfo.min}
                  max={numericInfo.max}
                  low={rangelow}
                  high={rangeHigh}
                  onLowChange={handleLowChange}
                  onHighChange={handleHighChange}
                />
              </div>
            )}
            {values.length <= 50 && (() => {
              const selectedValues = values.filter((v) => selected.has(v));
              const availableValues = values.filter((v) => !selected.has(v));
              const renderRow = (val: string) => (
                <label
                  key={val}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(val)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(val)) next.delete(val);
                      else next.add(val);
                      onChange(next);
                      if (numericInfo) {
                        const selectedNums = Array.from(next).map(Number);
                        if (selectedNums.length > 0) {
                          setRangeLow(Math.min(...selectedNums));
                          setRangeHigh(Math.max(...selectedNums));
                        } else {
                          setRangeLow(numericInfo.min);
                          setRangeHigh(numericInfo.max);
                        }
                      }
                    }}
                    className="rounded border-border-strong"
                  />
                  <span className="truncate">{isNumeric ? Number(val).toLocaleString() : val}</span>
                </label>
              );
              return (
                <>
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle">
                    <button
                      type="button"
                      onClick={() => onChange(new Set(values))}
                      className="cursor-pointer text-[10px] font-medium text-primary-dark hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(new Set())}
                      disabled={selected.size === 0}
                      className="cursor-pointer text-[10px] font-medium text-muted hover:text-body hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      Deselect all
                    </button>
                  </div>
                  <div className="p-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                    {selectedValues.length > 0 && (
                      <>
                        <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                          Selected ({selectedValues.length})
                        </div>
                        {selectedValues.map(renderRow)}
                        {availableValues.length > 0 && (
                          <div className="my-1 border-t border-border-subtle" />
                        )}
                      </>
                    )}
                    {availableValues.length > 0 && (
                      <>
                        {selectedValues.length > 0 && (
                          <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                            Available
                          </div>
                        )}
                        {availableValues.map(renderRow)}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}

// ─── API filter renderer (dispatches to type-specific components) ─────────────

function ApiFilterRenderer({
  definition,
  filters,
  onFiltersChange,
  lockedColumns,
  disabled,
  numericBounds,
  renderValue,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  lockedColumns?: Set<string>;
  disabled?: boolean;
  numericBounds?: Map<string, number>;
  renderValue?: (text: string) => ReactNode;
}) {
  switch (definition.Type) {
    case 'LIST':
      if (definition.Operand === 'EQ') {
        return <ListEqDropdown definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
      }
      return <StringFromListDropdown definition={definition} filters={filters} onFiltersChange={onFiltersChange} locked={lockedColumns?.has(definition.Tag)} disabled={disabled} renderValue={renderValue} />;
    case 'SEARCH':
      return <SearchFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
    case 'DECIMAL':
      return <DecimalFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} dataMax={numericBounds?.get(definition.Tag)} />;
    case 'DATE':
      return <DateFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
    default:
      return null;
  }
}

// ─── Attribute filters popup ──────────────────────────────────────────────────

/**
 * Attribute filters (`ATTR:*`) collapse into a single popup so the bar stays
 * compact even when a bank exposes many attributes. The trigger carries a count
 * badge, and active selections surface as chips on the row OUTSIDE the popup
 * (with a per-attribute clear), so the user sees what's filtered at a glance
 * without opening the dialog.
 */
function AttributesFilterPopup({
  defs,
  filters,
  onFiltersChange,
  renderValue,
}: {
  defs: FilterDefinition[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  renderValue?: (text: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [attrSearch, setAttrSearch] = useState('');

  const humanLabel = (def: FilterDefinition) => humanizeFieldName(def.Label || def.Tag.replace(/^ATTR:/, ''));

  const active = defs
    .map((def) => ({ def, count: filters[def.Tag]?.size ?? 0 }))
    .filter((a) => a.count > 0);

  // Humanized-label copies so the in-popup dropdown buttons read nicely
  // ("BeneficiaryName" → "Beneficiary Name"). Filter state stays keyed by the
  // unchanged `Tag`.
  const displayDefs = useMemo(
    () => defs.map((def) => ({ ...def, Label: humanizeFieldName(def.Label || def.Tag.replace(/^ATTR:/, '')) })),
    [defs],
  );

  // Search across the attribute NAMES (which filter to show), not their values,
  // then float attributes that already have an active selection to the front
  // (stable within each group) so the user's in-play filters stay visible.
  const visibleDefs = useMemo(() => {
    const q = attrSearch.trim().toLowerCase();
    const matched = q
      ? displayDefs.filter((d) => d.Label.toLowerCase().includes(q) || d.Tag.toLowerCase().includes(q))
      : displayDefs;
    const selected = matched.filter((d) => (filters[d.Tag]?.size ?? 0) > 0);
    const rest = matched.filter((d) => (filters[d.Tag]?.size ?? 0) === 0);
    return [...selected, ...rest];
  }, [displayDefs, attrSearch, filters]);

  const close = () => {
    setOpen(false);
    setAttrSearch('');
  };

  const clearOne = (tag: string) => {
    const next = { ...filters };
    delete next[tag];
    onFiltersChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          active.length > 0
            ? 'border-primary/40 bg-primary/10 text-primary-dark dark:text-primary-light'
            : 'border-border bg-surface text-body hover:bg-surface-hover'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
        </svg>
        Attributes
        {active.length > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold">
            {active.length}
          </span>
        )}
      </button>

      {/* Active-selection feedback, visible outside the popup. */}
      {active.map(({ def, count }) => (
        <span
          key={def.Tag}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary-dark dark:text-primary-light px-2 py-0.5 text-[11px] font-medium"
        >
          {humanLabel(def)}: {count.toLocaleString()}
          <button
            type="button"
            onClick={() => clearOne(def.Tag)}
            className="hover:text-primary"
            aria-label={`Clear ${humanLabel(def)} filter`}
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}

      <Modal open={open} onClose={close} title="Attribute filters" widthClass="max-w-full" fullHeight>
        {displayDefs.length === 0 ? (
          <p className="text-sm text-muted">No attribute filters available for the selected bank(s).</p>
        ) : (
          <div className="space-y-3">
            {/* Search the attribute NAMES (which filters are shown), distinct
                from each dropdown's own value search. */}
            <div className="relative max-w-sm">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search attributes..."
                value={attrSearch}
                onChange={(e) => setAttrSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>
            {visibleDefs.length === 0 ? (
              <p className="text-sm text-muted">No attributes match "{attrSearch}".</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleDefs.map((def) => (
                  <AttributeFilterCard
                    key={def.Tag}
                    def={def}
                    filters={filters}
                    onFiltersChange={onFiltersChange}
                    renderValue={renderValue}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * One always-open attribute filter, rendered as a self-contained card in the
 * Attributes popup grid (3 per row). Shows the attribute title + selected
 * count, a per-card value search, bulk actions (select all / select &
 * deselect the search-filtered subset / clear), the currently-selected values
 * as removable chips, and a height-capped, inner-scrolling value list. Large
 * value sets are search-capped (see LIST_RENDER_CAP) so the card stays
 * responsive.
 */
function AttributeFilterCard({
  def,
  filters,
  onFiltersChange,
  renderValue,
}: {
  def: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  renderValue?: (text: string) => ReactNode;
}) {
  const rv = renderValue ?? ((t: string) => t);
  const [search, setSearch] = useState('');
  const selected = filters[def.Tag] ?? EMPTY_SET;

  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of def.Values) if (v.Value != null) m.set(v.Value, v.Label || v.Value);
    return m;
  }, [def.Values]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return def.Values;
    return def.Values.filter(
      (v) =>
        (v.Label ?? v.Value ?? '').toLowerCase().includes(q) ||
        (v.Value ?? '').toLowerCase().includes(q) ||
        (v.SubLabel ?? '').toLowerCase().includes(q),
    );
  }, [def.Values, search]);

  const commit = (next: Set<string>) => {
    const f = { ...filters };
    if (next.size === 0) delete f[def.Tag];
    else f[def.Tag] = next;
    onFiltersChange(f);
  };
  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    commit(next);
  };
  const clearAll = () => commit(new Set());
  const selectFiltered = () => {
    const next = new Set(selected);
    for (const v of filtered) if (v.Value) next.add(v.Value);
    commit(next);
  };
  const deselectFiltered = () => {
    const next = new Set(selected);
    for (const v of filtered) if (v.Value) next.delete(v.Value);
    commit(next);
  };

  const searching = search.trim().length > 0;
  const capped = filtered.length > LIST_RENDER_CAP ? filtered.slice(0, LIST_RENDER_CAP) : filtered;
  const hidden = filtered.length - capped.length;
  const selectedList = Array.from(selected);

  const actionBtn = 'text-[11px] text-primary hover:underline disabled:text-faint disabled:no-underline disabled:cursor-default';

  return (
    <div className="flex flex-col h-60 rounded-lg border border-border bg-surface overflow-hidden">
      {/* Title + selected count */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-secondary">
        <span className="text-xs font-semibold text-heading truncate" title={def.Label}>{def.Label}</span>
        {selected.size > 0 && (
          <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold shrink-0">
            {selected.size.toLocaleString()}
          </span>
        )}
      </div>

      {/* Per-card value search */}
      <div className="relative px-2 pt-2">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search values..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
        />
      </div>

      {/* Bulk actions. Select/Deselect filtered only show while a value search
          narrows the list; Clear only shows when something is selected. The row
          is omitted entirely when there's nothing to act on. */}
      {(searching || selected.size > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
          {searching && <button type="button" className={actionBtn} onClick={selectFiltered}>Select filtered</button>}
          {searching && <button type="button" className={actionBtn} onClick={deselectFiltered}>Deselect filtered</button>}
          {selected.size > 0 && <button type="button" className={actionBtn} onClick={clearAll}>Clear</button>}
        </div>
      )}

      {/* Selected values, always visible */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2 max-h-20 overflow-y-auto custom-scrollbar border-b border-border-subtle">
          {selectedList.map((val) => (
            <span key={val} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary-dark dark:text-primary-light px-2 py-0.5 text-[10px] max-w-full">
              <span className="truncate">{rv(labelOf.get(val) ?? val)}</span>
              <button type="button" onClick={() => toggle(val)} className="hover:text-primary shrink-0" aria-label={`Remove ${labelOf.get(val) ?? val}`}>
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Value list — fills the remaining card height with inner scroll, so
          every card is the same height regardless of how many values it has. */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1.5">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-xs text-faint text-center">No values match</div>
        ) : (
          <>
            {capped.map((v) => {
              const val = v.Value ?? '';
              const isChecked = selected.has(val);
              return (
                <label key={val} className="flex items-start gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(val)}
                    className="rounded border-border-strong shrink-0 mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-black dark:text-white truncate">{rv(v.Label || v.Value || '')}</span>
                    {v.SubLabel && <span className="block text-[10px] text-muted truncate">{rv(v.SubLabel)}</span>}
                  </span>
                </label>
              );
            })}
            {hidden > 0 && (
              <div className="px-2 pt-1.5 pb-1 text-[10px] text-muted text-center">
                Showing {capped.length.toLocaleString()} of {filtered.length.toLocaleString()} — refine your search to narrow.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main DynamicFilters component ───────────────────────────────────────────

export function DynamicFilters({
  data = [],
  fieldMeta,
  tagDefinitions = [],
  filters,
  onFiltersChange,
  showOnlyUntagged = false,
  onShowOnlyUntaggedChange,
  showOnlyMultiTagged = false,
  onShowOnlyMultiTaggedChange,
  showOnlyDeadEnd = false,
  onShowOnlyDeadEndChange,
  baseFilters,
  leadingActionSlot,
  extraActiveFilterCount = 0,
  onClearExtraFilters,
  endSlot,
  isLiveMode,
  filterDefinitions,
  filterDefinitionsLoading,
  decimalMaxValues,
  disabledFilterTags,
  renderValue,
}: DynamicFiltersProps) {
  const [expanded] = useState(true);

  // Columns locked by checkout (baseFilters keys)
  const lockedColumns = useMemo(() => {
    if (!baseFilters) return undefined;
    const keys = Object.keys(baseFilters).filter((k) => baseFilters[k].size > 0);
    return keys.length > 0 ? new Set(keys) : undefined;
  }, [baseFilters]);

  // Sample mode: derive filterable columns from data
  const filterableColumns = useMemo(() => {
    if (isLiveMode) return []; // live mode uses filterDefinitions instead
    const result: { field: string; values: string[]; isNumeric: boolean }[] = [];
    const excluded = new Set([...FILTER_EXCLUSIONS, fieldMeta.identifierField]);

    for (const field of fieldMeta.dataFields) {
      if (excluded.has(field) || /date/i.test(field)) continue;
      const distinctValues = new Set<string>();
      let allNumeric = true;
      for (const item of data) {
        const val = item.row[field];
        if (val !== null && val !== undefined && val !== '') {
          const str = String(val);
          distinctValues.add(str);
          if (allNumeric && isNaN(Number(str))) allNumeric = false;
        }
      }
      const isNumeric = allNumeric && distinctValues.size > 0;
      if (distinctValues.size >= 2 && (isNumeric || distinctValues.size <= 50)) {
        const values = Array.from(distinctValues).sort(
          isNumeric ? (a, b) => Number(a) - Number(b) : undefined
        );
        result.push({ field, values, isNumeric });
      }
    }

    const priority = ['BankSwiftCode', 'Side'];
    result.sort((a, b) => {
      const ai = priority.indexOf(a.field);
      const bi = priority.indexOf(b.field);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    });

    return result;
  }, [data, fieldMeta, isLiveMode]);

  // Running max per field — never decreases, so the slider max reflects the
  // highest value ever seen across all fetched pages regardless of active filters.
  const runningFieldMaxRef = useRef(new Map<string, number>());

  const numericBounds = useMemo(() => {
    const bounds = new Map<string, number>();
    if (!filterDefinitions) return bounds;

    // Update the running max from the current batch of data
    for (const item of data) {
      for (const [field, v] of Object.entries(item.row)) {
        const n = Number(v);
        if (!isNaN(n) && n > 0) {
          const prev = runningFieldMaxRef.current.get(field) ?? 0;
          if (n > prev) runningFieldMaxRef.current.set(field, n);
        }
      }
    }

    // Map each DECIMAL filter tag to its max value
    for (const def of filterDefinitions) {
      if (def.Type !== 'DECIMAL') continue;
      // Prefer the API-probed max (true max across all rows)
      const probed = decimalMaxValues?.get(def.Tag);
      if (probed !== undefined && probed > 0) {
        bounds.set(def.Tag, probed);
        continue;
      }
      // Fall back to running max from loaded rows
      const candidates = [def.Tag, ...def.Values.map((v) => v.Column).filter(Boolean)];
      let max: number | undefined;
      for (const c of candidates) {
        if (runningFieldMaxRef.current.has(c)) { max = runningFieldMaxRef.current.get(c); break; }
      }
      // Case-insensitive substring fallback
      if (max === undefined) {
        const tagLower = def.Tag.toLowerCase();
        for (const [field, m] of runningFieldMaxRef.current) {
          const fl = field.toLowerCase();
          if (fl === tagLower || fl.includes(tagLower) || tagLower.includes(fl)) {
            max = m; break;
          }
        }
      }
      if (max !== undefined && max > 0) bounds.set(def.Tag, max);
    }
    return bounds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filterDefinitions, decimalMaxValues]);

  const tagFilterValues = useMemo(() => {
    if (isLiveMode) return null; // handled by API filter definition
    if (tagDefinitions.length === 0) return null;
    const tags = new Set<string>();
    for (const item of data) {
      for (const tag of item.analysis.tags) {
        tags.add(tag);
      }
    }
    if (tags.size === 0) return null;
    return Array.from(tags).sort();
  }, [data, tagDefinitions, isLiveMode]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    const baseKeys = baseFilters ? new Set(Object.keys(baseFilters)) : new Set<string>();
    for (const [key, selected] of Object.entries(filters)) {
      if (selected.size > 0 && !baseKeys.has(key)) count++;
    }
    if (!isLiveMode) {
      if (showOnlyUntagged) count++;
      if (showOnlyMultiTagged) count++;
      if (showOnlyDeadEnd) count++;
    }
    return count + extraActiveFilterCount;
  }, [filters, showOnlyUntagged, showOnlyMultiTagged, showOnlyDeadEnd, baseFilters, isLiveMode, extraActiveFilterCount]);

  const clearAll = () => {
    onFiltersChange(baseFilters ?? {});
    onShowOnlyUntaggedChange?.(false);
    onShowOnlyMultiTaggedChange?.(false);
    onShowOnlyDeadEndChange?.(false);
    onClearExtraFilters?.();
  };

  const handleFilterChange = (field: string, selected: Set<string>) => {
    const next = { ...filters };
    if (selected.size === 0) {
      delete next[field];
    } else {
      next[field] = selected;
    }
    onFiltersChange(next);
  };

  return (
    <div className="mb-3">
      {expanded && (
        <div data-tour="filters-bar" className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-surface-secondary rounded-lg border border-border">
          {leadingActionSlot}
          {/* Live mode: locked BankSwiftCode pill (not in API filter definitions) */}
          {/* {isLiveMode && lockedColumns?.has('BankSwiftCode') && filters['BankSwiftCode'] && (
            <div className="text-xs px-3 py-1.5 rounded-lg border border-border bg-surface-tertiary text-muted cursor-not-allowed flex items-center gap-1.5">
              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Bank: {[...filters['BankSwiftCode']][0]}
            </div>
          )} */}

          {/* Live mode: skeleton while loading, then render from API filter definitions */}
          {isLiveMode && filterDefinitionsLoading && (
            <>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-8 w-28 rounded-lg bg-surface-tertiary animate-pulse" />
              ))}
            </>
          )}
          {isLiveMode && !filterDefinitionsLoading && filterDefinitions && (() => {
            const visible = filterDefinitions.filter((def) => !HIDDEN_API_FILTER_TAGS.has(def.Tag));
            // Attribute filters (Tag prefixed `ATTR:`, e.g. ATTR:BeneficiaryName)
            // render after the standard filters, behind an inline "Attributes"
            // divider so the group reads as a distinct section of the bar.
            const standard = visible.filter((def) => !def.Tag.startsWith('ATTR:'));
            const attrs = visible.filter((def) => def.Tag.startsWith('ATTR:'));
            const renderDef = (def: FilterDefinition) => (
              <ApiFilterRenderer
                key={def.Tag}
                definition={def}
                filters={filters}
                onFiltersChange={onFiltersChange}
                lockedColumns={lockedColumns}
                disabled={disabledFilterTags?.has(def.Tag)}
                numericBounds={numericBounds}
                renderValue={renderValue}
              />
            );
            return (
              <>
                {standard.map(renderDef)}
                {attrs.length > 0 && (
                  <>
                    {/* basis-full forces a line break in the wrapping flex bar
                        so the Attributes row starts on its own line. */}
                    <div className="basis-full h-0" aria-hidden="true" />
                    <AttributesFilterPopup defs={attrs} filters={filters} onFiltersChange={onFiltersChange} renderValue={renderValue} />
                  </>
                )}
              </>
            );
          })()}

          {/* Sample mode: legacy filters. The ShowOnly handlers are operator-only;
              the operator callsite always supplies them, and this branch never
              renders in live mode, so no-op fallbacks are purely to satisfy the
              now-optional prop types. */}
          {!isLiveMode && (
            <ShowOnlyDropdown
              showOnlyUntagged={showOnlyUntagged}
              onShowOnlyUntaggedChange={onShowOnlyUntaggedChange ?? noop}
              showOnlyMultiTagged={showOnlyMultiTagged}
              onShowOnlyMultiTaggedChange={onShowOnlyMultiTaggedChange ?? noop}
              showOnlyDeadEnd={showOnlyDeadEnd}
              onShowOnlyDeadEndChange={onShowOnlyDeadEndChange ?? noop}
            />
          )}

          {!isLiveMode && tagFilterValues && (
            <FilterDropdown
              label="Tags"
              values={tagFilterValues}
              selected={filters['__tags'] ?? new Set()}
              onChange={(selected) => handleFilterChange('__tags', selected)}
            />
          )}

          {!isLiveMode && filterableColumns.map(({ field, values, isNumeric }) => (
            <FilterDropdown
              key={field}
              label={humanizeFieldName(field)}
              values={values}
              selected={filters[field] ?? new Set()}
              onChange={(selected) => handleFilterChange(field, selected)}
              isNumeric={isNumeric}
            />
          ))}

          <Button
            data-tour="clear-filters"
            variant="danger_ghost"
            size="xs"
            onClick={clearAll}
            className={activeFilterCount === 0 ? 'invisible pointer-events-none' : ''}
          >
            Clear filters
          </Button>

          {endSlot && (
            <div className="ml-auto">
              {endSlot}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
