import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';

export interface ColumnManagerItem {
  key: string;
  label: string;
}

interface ColumnManagerModalProps {
  open: boolean;
  onClose: () => void;
  /** All offerable columns in their CURRENT effective order (custom drag
   *  order, or the per-type spec default). */
  items: ColumnManagerItem[];
  /** The DataSetType's canonical defaultOrder — orders the hidden pane and
   *  drives Reset to defaults. Keys not listed here sort after listed ones. */
  canonicalOrder: readonly string[];
  /** Currently hidden column keys (offerable ones only). */
  hiddenKeys: ReadonlySet<string>;
  /** The per-type default hidden set — the Reset target. */
  defaultHiddenKeys?: ReadonlySet<string>;
  /** Keys that must stay visible (rendered locked; not hideable, still movable). */
  lockedKeys?: ReadonlySet<string>;
  /** Batched commit: called once with the full hidden set and the full order
   *  (visible AND hidden keys, hidden ones keeping their interleaved spots so
   *  a later re-show lands at a sensible position). */
  onApply: (hidden: Set<string>, order: string[]) => void;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

/**
 * Full-size column manager for long column lists (Ledger offers 100+
 * columns — reordering inside the 288px dropdown means dragging across ~15
 * scroll-heights). Two panes: the visible columns in order (short, so
 * drag / move buttons are practical again) and the hidden columns in
 * canonical spec order. Every edit lands in a local draft; nothing reaches
 * the table or localStorage until Apply commits the batch in one shot.
 *
 * Ordering model: the draft keeps ONE full order (visible + hidden
 * interleaved, same shape the parent persists). Hiding never moves a key,
 * so re-showing an untouched column restores it to its canonical spot;
 * visible-pane moves reposition relative to visible neighbors only.
 */
export function ColumnManagerModal({
  open,
  onClose,
  items,
  canonicalOrder,
  hiddenKeys,
  defaultHiddenKeys,
  lockedKeys,
  onApply,
}: ColumnManagerModalProps) {
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draftHidden, setDraftHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const labelMap = useMemo(() => new Map(items.map((it) => [it.key, it.label])), [items]);
  const canonicalIdx = useMemo(
    () => new Map(canonicalOrder.map((key, idx) => [key, idx])),
    [canonicalOrder],
  );

  // (Re)seed the draft from live props on every open.
  useEffect(() => {
    if (!open) return;
    setDraftOrder(items.map((it) => it.key));
    setDraftHidden(new Set([...hiddenKeys].filter((k) => labelMap.has(k) && !lockedKeys?.has(k))));
    setSearch('');
    setDragKey(null);
    setOverKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibleKeys = useMemo(
    () => draftOrder.filter((k) => !draftHidden.has(k)),
    [draftOrder, draftHidden],
  );
  const hiddenList = useMemo(
    () =>
      [...draftHidden].sort((a, b) => {
        const ai = canonicalIdx.get(a) ?? Infinity;
        const bi = canonicalIdx.get(b) ?? Infinity;
        if (ai !== bi) return ai - bi;
        return (labelMap.get(a) ?? a).localeCompare(labelMap.get(b) ?? b);
      }),
    [draftHidden, canonicalIdx, labelMap],
  );

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;
  const matches = useCallback(
    (key: string) => !searching || (labelMap.get(key) ?? key).toLowerCase().includes(query),
    [searching, query, labelMap],
  );

  const dirty = useMemo(() => {
    if (!setsEqual(draftHidden, new Set([...hiddenKeys].filter((k) => labelMap.has(k) && !lockedKeys?.has(k))))) return true;
    const initial = items.map((it) => it.key);
    return draftOrder.length !== initial.length || draftOrder.some((k, i) => k !== initial[i]);
  }, [draftHidden, draftOrder, hiddenKeys, items, labelMap, lockedKeys]);

  const hide = useCallback((key: string) => {
    if (lockedKeys?.has(key)) return;
    setDraftHidden((prev) => new Set(prev).add(key));
  }, [lockedKeys]);

  const show = useCallback((key: string) => {
    setDraftHidden((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  /** Move `key` within the FULL order so that, in the visible sequence, it
   *  lands before/after its visible neighbors. Hidden keys never move. */
  const moveVisible = useCallback((key: string, action: 'up' | 'down' | 'top' | 'bottom') => {
    setDraftOrder((prev) => {
      const visible = prev.filter((k) => !draftHidden.has(k));
      const vIdx = visible.indexOf(key);
      if (vIdx === -1) return prev;
      let targetVisibleIdx: number;
      if (action === 'up') targetVisibleIdx = vIdx - 1;
      else if (action === 'down') targetVisibleIdx = vIdx + 1;
      else if (action === 'top') targetVisibleIdx = 0;
      else targetVisibleIdx = visible.length - 1;
      if (targetVisibleIdx < 0 || targetVisibleIdx >= visible.length || targetVisibleIdx === vIdx) return prev;

      const without = prev.filter((k) => k !== key);
      const neighbor = visible[targetVisibleIdx];
      const neighborIdx = without.indexOf(neighbor);
      const insertAt = targetVisibleIdx > vIdx ? neighborIdx + 1 : neighborIdx;
      const next = [...without];
      next.splice(insertAt, 0, key);
      return next;
    });
  }, [draftHidden]);

  /** Drag-drop within the visible pane: drop `key` at `targetKey`'s slot. */
  const dropOnVisible = useCallback((key: string, targetKey: string) => {
    if (key === targetKey) return;
    setDraftOrder((prev) => {
      const visible = prev.filter((k) => !draftHidden.has(k));
      const fromIdx = visible.indexOf(key);
      const toIdx = visible.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const without = prev.filter((k) => k !== key);
      const neighborIdx = without.indexOf(targetKey);
      const insertAt = toIdx > fromIdx ? neighborIdx + 1 : neighborIdx;
      const next = [...without];
      next.splice(insertAt, 0, key);
      return next;
    });
  }, [draftHidden]);

  const resetToDefaults = useCallback(() => {
    const itemKeys = new Set(items.map((it) => it.key));
    const canonical = [
      ...canonicalOrder.filter((k) => itemKeys.has(k)),
      ...items.map((it) => it.key).filter((k) => !canonicalIdx.has(k)),
    ];
    setDraftOrder(canonical);
    setDraftHidden(
      new Set([...(defaultHiddenKeys ?? new Set<string>())].filter((k) => itemKeys.has(k) && !lockedKeys?.has(k))),
    );
  }, [items, canonicalOrder, canonicalIdx, defaultHiddenKeys, lockedKeys]);

  const handleApply = useCallback(() => {
    onApply(new Set(draftHidden), [...draftOrder]);
    onClose();
  }, [onApply, onClose, draftHidden, draftOrder]);

  const moveBtn = (key: string, action: 'up' | 'down' | 'top' | 'bottom', disabled: boolean, title: string, path: string) => (
    <button
      onClick={() => moveVisible(key, action)}
      disabled={disabled || searching}
      title={searching ? 'Clear the search to reorder' : title}
      aria-label={title}
      className="p-1 rounded text-faint hover:text-body hover:bg-surface-hover disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-faint"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </button>
  );

  const visibleFiltered = visibleKeys.filter(matches);
  const hiddenFiltered = hiddenList.filter(matches);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Columns"
      widthClass="max-w-4xl"
      zClass="z-[70]"
      footer={
        <>
          <button
            onClick={resetToDefaults}
            className="mr-auto text-xs text-primary hover:text-primary-dark hover:underline px-1"
          >
            Reset to defaults
          </button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleApply} disabled={!dirty}>Apply changes</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Search columns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="w-full text-sm px-3 py-1.5 rounded-lg border border-border-strong bg-input-bg text-heading placeholder:text-faint outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <div className="grid grid-cols-2 gap-4">
          {/* Visible pane */}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-body-secondary uppercase tracking-wide pb-1.5 border-b border-border-subtle mb-1.5">
              Visible columns ({visibleKeys.length})
            </div>
            <div className="max-h-[52vh] overflow-y-auto custom-scrollbar pr-1">
              {visibleFiltered.length === 0 && (
                <div className="text-xs text-faint px-2 py-3">{searching ? 'No visible columns match.' : 'No visible columns.'}</div>
              )}
              {visibleFiltered.map((key) => {
                const locked = !!lockedKeys?.has(key);
                const vIdx = visibleKeys.indexOf(key);
                const isDragOver = overKey === key && dragKey !== null && dragKey !== key;
                return (
                  <div
                    key={key}
                    draggable={!searching}
                    onDragStart={(e) => { setDragKey(key); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverKey((p) => (p === key ? p : key)); }}
                    onDragLeave={() => { if (overKey === key) setOverKey(null); }}
                    onDrop={(e) => { e.preventDefault(); if (dragKey) dropOnVisible(dragKey, key); setDragKey(null); setOverKey(null); }}
                    onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                    className={`group flex items-center gap-1.5 px-1.5 py-1 rounded text-sm text-body ${isDragOver ? 'bg-primary/10 outline-1 outline-primary/40' : 'hover:bg-surface-hover'}`}
                  >
                    <span className={`text-faint ${searching ? 'opacity-30' : 'cursor-grab'}`} aria-hidden>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16"><circle cx="5" cy="4" r="1.2" /><circle cx="11" cy="4" r="1.2" /><circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" /><circle cx="5" cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" /></svg>
                    </span>
                    <span className="flex-1 truncate">{labelMap.get(key) ?? key}</span>
                    {locked && (
                      <svg className="w-3.5 h-3.5 text-faint" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-label="Always visible">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    )}
                    <span className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {moveBtn(key, 'top', vIdx === 0, 'Move to top', 'M5 11l7-7 7 7M5 19l7-7 7 7')}
                      {moveBtn(key, 'up', vIdx === 0, 'Move up', 'M5 15l7-7 7 7')}
                      {moveBtn(key, 'down', vIdx === visibleKeys.length - 1, 'Move down', 'M19 9l-7 7-7-7')}
                      {moveBtn(key, 'bottom', vIdx === visibleKeys.length - 1, 'Move to bottom', 'M19 13l-7 7-7-7M19 5l-7 7-7-7')}
                    </span>
                    {!locked && (
                      <button
                        onClick={() => hide(key)}
                        title="Hide column"
                        aria-label={`Hide ${labelMap.get(key) ?? key}`}
                        className="p-1 rounded text-faint hover:text-rose-500 hover:bg-surface-hover"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Hidden pane */}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-body-secondary uppercase tracking-wide pb-1.5 border-b border-border-subtle mb-1.5">
              Hidden columns ({hiddenList.length})
            </div>
            <div className="max-h-[52vh] overflow-y-auto custom-scrollbar pr-1">
              {hiddenFiltered.length === 0 && (
                <div className="text-xs text-faint px-2 py-3">{searching ? 'No hidden columns match.' : 'Every column is visible.'}</div>
              )}
              {hiddenFiltered.map((key) => (
                <div key={key} className="group flex items-center gap-1.5 px-1.5 py-1 rounded text-sm text-body-secondary hover:bg-surface-hover">
                  <span className="flex-1 truncate">{labelMap.get(key) ?? key}</span>
                  <button
                    onClick={() => show(key)}
                    title="Show column"
                    aria-label={`Show ${labelMap.get(key) ?? key}`}
                    className="p-1 rounded text-faint hover:text-primary hover:bg-surface-hover"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-faint">
          Changes apply only when you click Apply. Re-showing a column you never moved returns it to its default spot.
        </p>
      </div>
    </Modal>
  );
}
