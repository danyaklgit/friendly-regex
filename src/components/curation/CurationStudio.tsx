import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  startCuration,
  previewCuration,
  saveCuration,
  suggestCurationPill,
  type CurationDraft,
  type CurationPill,
  type CurationPreview,
  type KeyFieldMode,
  type KeyToken,
  type KeyTokenField,
} from '../../api/sampling';
import { getDefaultSorting, getTransactions, type FilterProperty, type TepHeaders } from '../../api/transactions';
import type { TransactionRow } from '../../types/transaction';
import {
  KEY_FIELDS,
  KEY_FIELD_LABELS,
  tokenChipClass,
  tokenCode,
  tokenPhrase,
  tokensEqual,
  tokensPinSomething,
} from '../../utils/keyTokens';
import {
  normalizeSelection,
  removePillAt,
  replacePillAt,
  replaceRangeWithPill,
  segmentsFromSpans,
  segmentsFromText,
  segmentsToTokens,
  type CurationSegment,
  type SegmentPill,
} from '../../utils/curationSegments';
import { KeyTokenChips } from '../transactions/KeyTokenChips';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';

export interface TepAuth {
  token: string;
  headers: TepHeaders;
}

/** Exactly one id — what StartCuration receives (KeyOverrideId wins over
 *  SuggestionId over TransactionId server-side). */
export interface CurationStudioSource {
  transactionId?: string;
  keyOverrideId?: string;
  suggestionId?: string;
}

interface CurationStudioProps {
  source: CurationStudioSource;
  /** Gated like rule editing: the checked-out operator saves, everyone else
   *  gets a read-only studio. */
  canEdit: boolean;
  userId: string | null;
  getTepAuth: () => Promise<TepAuth>;
  onClose: () => void;
  /** SaveCuration succeeded — the parent toasts, flips the sampling-running
   *  state and lets the existing status poll regroup the curated view. */
  onSaved: (runStarted: boolean, message: string) => void;
  onError: (message: string) => void;
}

const POPOVER_WIDTH = 340;
const MATCHES_PAGE_SIZE = 10;

type PillMenuState =
  | { kind: 'selection'; field: KeyTokenField; segIndex: number; start: number; end: number; text: string; left: number; top: number }
  | { kind: 'pill'; field: KeyTokenField; segIndex: number; text: string; left: number; top: number };

function modesOf(
  selected: Set<KeyTokenField>,
  segments: Map<KeyTokenField, CurationSegment[]>,
  fieldModes: Partial<Record<KeyTokenField, KeyFieldMode>>,
  draft: CurationDraft,
): Partial<Record<KeyTokenField, KeyFieldMode>> {
  // Modes travel only for TOKEN-LESS fields (the key itself speaks for the
  // others): Any = not part of the key, Blank = the field must be empty.
  const out: Partial<Record<KeyTokenField, KeyFieldMode>> = {};
  for (const f of KEY_FIELDS) {
    if (!draft.Fields.some((fl) => fl.Field === f)) continue;
    const hasTokens = selected.has(f) && segmentsToTokens(f, segments.get(f) ?? []).length > 0;
    if (!hasTokens) out[f] = fieldModes[f] ?? 'Any';
  }
  return out;
}

/**
 * Curation Studio (2026-09-08, UI_Curation_Studio.md): a full-screen
 * workbench opened from a transaction (right-click → Create curation), a
 * curated group, or a saved curation. Left pane: the transaction's fields in
 * large mono type — the operator picks the fields to curate against, selects
 * the changing parts and replaces them with typed pills. Right pane: the live
 * effect — how many open rows the key matches, the groups it absorbs,
 * overlaps, warnings, and the matching transactions themselves. Name it,
 * save: a saved curation IS a KeyOverride, heads its Curated-View group by
 * name, and comes back whenever new matching transactions arrive.
 */
export function CurationStudio({ source, canEdit, userId, getTepAuth, onClose, onSaved, onError }: CurationStudioProps) {
  const [draft, setDraft] = useState<CurationDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Working state -------------------------------------------------------
  const [selected, setSelected] = useState<Set<KeyTokenField>>(new Set());
  const [segmentsByField, setSegmentsByField] = useState<Map<KeyTokenField, CurationSegment[]>>(new Map());
  const [fieldModes, setFieldModes] = useState<Partial<Record<KeyTokenField, KeyFieldMode>>>({});
  const [anchorChoice, setAnchorChoice] = useState<'auto' | 'starts' | 'anywhere'>('auto');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const initFromDraft = useCallback((d: CurationDraft) => {
    const sel = new Set<KeyTokenField>();
    const segs = new Map<KeyTokenField, CurationSegment[]>();
    for (const f of d.Fields) {
      if (f.Selected) sel.add(f.Field);
      segs.set(f.Field, f.Spans.length > 0 ? segmentsFromSpans(f.Spans) : segmentsFromText(f.Text ?? ''));
    }
    setSelected(sel);
    setSegmentsByField(segs);
    setFieldModes({ ...d.FieldModes });
    setAnchorChoice('auto');
    setName(d.Name ?? '');
    setNote(d.Note ?? '');
  }, []);

  // Load the draft once per source.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDraft(null);
    (async () => {
      try {
        const { token, headers } = await getTepAuth();
        if (!token) throw new Error('Not authenticated');
        const d = await startCuration(
          {
            ...(source.keyOverrideId ? { KeyOverrideId: source.keyOverrideId } : {}),
            ...(source.suggestionId && !source.keyOverrideId ? { SuggestionId: source.suggestionId } : {}),
            ...(source.transactionId && !source.keyOverrideId && !source.suggestionId
              ? { TransactionId: source.transactionId }
              : {}),
          },
          token,
          headers,
        );
        if (cancelled) return;
        setDraft(d);
        initFromDraft(d);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to open the curation');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source.transactionId, source.keyOverrideId, source.suggestionId, getTepAuth, initFromDraft]);

  // --- Derived key ---------------------------------------------------------
  const tokens = useMemo<KeyToken[]>(
    () => KEY_FIELDS.flatMap((f) => (selected.has(f) ? segmentsToTokens(f, segmentsByField.get(f) ?? []) : [])),
    [selected, segmentsByField],
  );
  const pins = tokensPinSomething(tokens);

  const sentModes = useMemo(
    () => (draft ? modesOf(selected, segmentsByField, fieldModes, draft) : {}),
    [draft, selected, segmentsByField, fieldModes],
  );
  const sentAnchored = anchorChoice === 'auto' ? null : anchorChoice === 'starts';

  // --- Live preview (debounced ~400 ms; the very first preview of a
  // workspace can take ~10 s server-side, so a loading state always shows) ---
  const [preview, setPreview] = useState<CurationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewSeq = useRef(0);

  const modesKey = JSON.stringify(sentModes);
  useEffect(() => {
    if (!draft) return;
    // Untouched since load: the draft came with its own preview.
    if (
      tokensEqual(tokens, draft.Tokens) &&
      sentAnchored === null &&
      modesKey === JSON.stringify(modesOf(new Set(draft.Fields.filter((f) => f.Selected).map((f) => f.Field)), new Map(draft.Fields.map((f) => [f.Field, f.Spans.length > 0 ? segmentsFromSpans(f.Spans) : segmentsFromText(f.Text ?? '')])), draft.FieldModes, draft))
    ) {
      setPreview(draft.Preview);
      setPreviewLoading(false);
      return;
    }
    if (!pins) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { token, headers } = await getTepAuth();
        if (!token || seq !== previewSeq.current) return;
        const res = await previewCuration(
          {
            BankSwiftCode: draft.BankSwiftCode,
            Side: draft.Side,
            Tokens: tokens,
            FieldModes: sentModes,
            Anchored: sentAnchored,
            SourceTransactionId: draft.TransactionId,
            ExcludeKeyOverrideId: draft.KeyOverrideId ?? null,
          },
          token,
          headers,
        );
        if (seq !== previewSeq.current) return;
        setPreview(res);
      } catch (err) {
        if (seq !== previewSeq.current) return;
        setPreview(null);
        onError(err instanceof Error ? err.message : 'Failed to preview the curation');
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // modesKey stands in for sentModes (stable string), tokens is memoized.
  }, [draft, tokens, pins, sentAnchored, modesKey, sentModes, getTepAuth, onError]);

  // --- Pill menu (selection → "This part is…" / pill → change or restore) ---
  const [menu, setMenu] = useState<PillMenuState | null>(null);
  const [pillSearch, setPillSearch] = useState('');
  const [detected, setDetected] = useState<CurationPill[] | null>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
    setPillSearch('');
    setDetected(null);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menu, closeMenu]);

  // Ranked "Detected" pills for the selected text (advisory — the catalogue
  // from the draft renders regardless; a pre-deploy 404 costs nothing).
  useEffect(() => {
    if (!menu || menu.kind !== 'selection' || !draft) return;
    let cancelled = false;
    (async () => {
      try {
        const { token, headers } = await getTepAuth();
        if (!token || cancelled) return;
        const pills = await suggestCurationPill(
          {
            Text: menu.text,
            Field: menu.field,
            BankSwiftCode: draft.BankSwiftCode,
            Side: draft.Side,
            TransactionId: draft.TransactionId,
          },
          token,
          headers,
        );
        if (!cancelled) setDetected(pills.filter((p) => p.Group === 'Detected'));
      } catch {
        if (!cancelled) setDetected([]);
      }
    })();
    return () => { cancelled = true; };
  }, [menu, draft, getTepAuth]);

  const anchorMenuAt = useCallback((rect: DOMRect): { left: number; top: number } | null => {
    const wrapper = leftPaneRef.current;
    if (!wrapper) return null;
    const wRect = wrapper.getBoundingClientRect();
    return {
      left: Math.max(0, Math.min(rect.left - wRect.left, wRect.width - POPOVER_WIDTH)),
      top: rect.bottom - wRect.top + 6 + wrapper.scrollTop,
    };
  }, []);

  const handleFieldMouseUp = useCallback((field: KeyTokenField) => {
    if (!canEdit) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const segEl = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('[data-seg]') ?? null;
    const a = segEl(sel.anchorNode);
    const b = segEl(sel.focusNode);
    if (!a || !b || a !== b || a.dataset.field !== field) return;
    const segIndex = Number(a.dataset.seg);
    const segs = segmentsByField.get(field) ?? [];
    const norm = normalizeSelection(segs, segIndex, sel.anchorOffset, segIndex, sel.focusOffset);
    if (!norm) return;
    const pos = anchorMenuAt(sel.getRangeAt(0).getBoundingClientRect());
    if (!pos) return;
    setDetected(null);
    setPillSearch('');
    setMenu({ kind: 'selection', field, segIndex: norm.index, start: norm.start, end: norm.end, text: norm.text, ...pos });
  }, [canEdit, segmentsByField, anchorMenuAt]);

  const handlePillClick = useCallback((field: KeyTokenField, segIndex: number, el: HTMLElement) => {
    if (!canEdit) return;
    const seg = (segmentsByField.get(field) ?? [])[segIndex];
    if (!seg?.token) return;
    const pos = anchorMenuAt(el.getBoundingClientRect());
    if (!pos) return;
    setDetected(null);
    setPillSearch('');
    setMenu((prev) =>
      prev?.kind === 'pill' && prev.field === field && prev.segIndex === segIndex
        ? null // toggle
        : { kind: 'pill', field, segIndex, text: seg.text, ...pos },
    );
  }, [canEdit, segmentsByField, anchorMenuAt]);

  const applyPill = useCallback((pill: CurationPill) => {
    if (!menu) return;
    const sp: SegmentPill = { Kind: pill.Kind, Text: pill.Text, Item: pill.Item ?? null, Length: pill.Length ?? null };
    setSegmentsByField((prev) => {
      const segs = prev.get(menu.field) ?? [];
      const next =
        menu.kind === 'selection'
          ? replaceRangeWithPill(segs, menu.segIndex, menu.start, menu.end, sp)
          : replacePillAt(segs, menu.segIndex, sp);
      if (!next) return prev;
      const out = new Map(prev);
      out.set(menu.field, next);
      return out;
    });
    // Marking part of a field implicitly selects it into the key.
    setSelected((prev) => (prev.has(menu.field) ? prev : new Set(prev).add(menu.field)));
    closeMenu();
    window.getSelection()?.removeAllRanges();
  }, [menu, closeMenu]);

  const restorePillText = useCallback(() => {
    if (!menu || menu.kind !== 'pill') return;
    setSegmentsByField((prev) => {
      const next = removePillAt(prev.get(menu.field) ?? [], menu.segIndex);
      if (!next) return prev;
      const out = new Map(prev);
      out.set(menu.field, next);
      return out;
    });
    closeMenu();
  }, [menu, closeMenu]);

  // --- Field toggles -------------------------------------------------------
  const toggleField = useCallback((field: KeyTokenField) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }, []);

  const resetFieldText = useCallback((field: KeyTokenField) => {
    const text = draft?.Fields.find((f) => f.Field === field)?.Text ?? '';
    setSegmentsByField((prev) => new Map(prev).set(field, segmentsFromText(text)));
  }, [draft]);

  // "Start from the engine's key": re-open the SAME transaction without the
  // override/suggestion, so the spans come back as the engine tokenizes it.
  const [engineBusy, setEngineBusy] = useState(false);
  const handleUseEngineKey = useCallback(async () => {
    if (!draft) return;
    setEngineBusy(true);
    try {
      const { token, headers } = await getTepAuth();
      if (!token) throw new Error('Not authenticated');
      const fresh = await startCuration({ TransactionId: draft.TransactionId }, token, headers);
      // Keep the identity being edited — only the key restarts.
      setDraft((prev) => (prev ? { ...fresh, KeyOverrideId: prev.KeyOverrideId, Name: prev.Name, Note: prev.Note } : fresh));
      const sel = new Set<KeyTokenField>();
      const segs = new Map<KeyTokenField, CurationSegment[]>();
      for (const f of fresh.Fields) {
        if (f.Selected) sel.add(f.Field);
        segs.set(f.Field, f.Spans.length > 0 ? segmentsFromSpans(f.Spans) : segmentsFromText(f.Text ?? ''));
      }
      setSelected(sel);
      setSegmentsByField(segs);
      setFieldModes({ ...fresh.FieldModes });
      setAnchorChoice('auto');
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load the engine's key");
    } finally {
      setEngineBusy(false);
    }
  }, [draft, getTepAuth, onError]);

  // --- Matching transactions grid -----------------------------------------
  const [matchTab, setMatchTab] = useState<'open' | 'tagged'>('open');
  const [matchPage, setMatchPage] = useState(0);
  const [matchRows, setMatchRows] = useState<TransactionRow[] | null>(null);
  const [matchTotal, setMatchTotal] = useState(0);
  const matchSeq = useRef(0);

  const filtersKey = preview ? JSON.stringify(preview.Filters) : null;
  useEffect(() => {
    setMatchPage(0);
  }, [filtersKey, matchTab]);

  useEffect(() => {
    if (!draft || !preview || !preview.IsValid || !filtersKey) {
      setMatchRows(null);
      setMatchTotal(0);
      return;
    }
    const seq = ++matchSeq.current;
    setMatchRows(null);
    (async () => {
      try {
        const { token, headers } = await getTepAuth();
        if (!token || seq !== matchSeq.current) return;
        // Preview.Filters is a ready-made GetTEPTransactions filter set for
        // the key; the untagged clause splits the two tabs.
        const filters = (JSON.parse(filtersKey) as FilterProperty[]).concat(
          matchTab === 'open'
            ? [{ ColumnName: 'OpsIsUntagged', Value: 'true', Operand: 'EQ' }]
            : [{ ColumnName: 'OpsIsUntagged', Value: 'false', Operand: 'EQ' }],
        );
        const res = await getTransactions(
          {
            FilteringProperties: filters,
            SortingProperties: getDefaultSorting(draft.DataSetType),
            Pagination: { PageIndex: matchPage, PageSize: MATCHES_PAGE_SIZE },
          },
          token,
          headers,
        );
        if (seq !== matchSeq.current) return;
        setMatchRows(res.Transactions ?? []);
        setMatchTotal(res.TransactionsCount ?? (res.Transactions ?? []).length);
      } catch {
        if (seq === matchSeq.current) setMatchRows([]);
      }
    })();
  }, [draft, preview, filtersKey, matchTab, matchPage, getTepAuth]);

  // --- Save ----------------------------------------------------------------
  const [saveBusy, setSaveBusy] = useState(false);
  const isUpdate = !!draft?.KeyOverrideId;
  const canSave =
    canEdit &&
    !!draft &&
    !!preview &&
    preview.IsValid &&
    pins &&
    preview.SourceMatches !== false &&
    !previewLoading &&
    !saveBusy &&
    name.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaveBusy(true);
    try {
      const { token, headers } = await getTepAuth();
      if (!token) throw new Error('Not authenticated');
      const res = await saveCuration(
        {
          Id: draft.KeyOverrideId ?? null,
          BankSwiftCode: draft.BankSwiftCode,
          Side: draft.Side,
          Name: name.trim(),
          Tokens: tokens,
          FieldModes: sentModes,
          Anchored: sentAnchored,
          SourceTransactionId: draft.TransactionId,
          SourceSuggestionId: draft.SuggestionId ?? null,
          Note: note.trim() || null,
          UserId: userId ?? '',
        },
        token,
        headers,
      );
      onSaved(res.runStarted, isUpdate ? 'Curation updated — regrouping…' : 'Curation saved — regrouping…');
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save the curation');
    } finally {
      setSaveBusy(false);
    }
  }, [draft, name, tokens, sentModes, sentAnchored, note, userId, isUpdate, getTepAuth, onSaved, onClose, onError]);

  // --- Close (confirm when the operator has unsaved work) -------------------
  const dirty =
    !!draft &&
    (!tokensEqual(tokens, draft.Tokens) || name.trim() !== (draft.Name ?? '').trim() || note.trim() !== (draft.Note ?? '').trim() || anchorChoice !== 'auto');
  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = useCallback(() => {
    if (dirty && canEdit) setConfirmClose(true);
    else onClose();
  }, [dirty, canEdit, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !menu) requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, requestClose]);

  // ---------------------------------------------------------------------------

  const pillGroups = useMemo(() => {
    if (!draft) return [];
    const q = pillSearch.trim().toLowerCase();
    const match = (p: CurationPill) =>
      !q || p.Label.toLowerCase().includes(q) || p.Text.toLowerCase().includes(q) || (p.Item ?? '').toLowerCase().includes(q);
    const groups: { title: string; pills: CurationPill[] }[] = [];
    if (detected && detected.length > 0) groups.push({ title: 'Detected', pills: detected.filter(match) });
    for (const title of ['Shapes', 'Lists']) {
      const pills = draft.Pills.filter((p) => p.Group === title && p.Behavior !== 'Never').filter(match);
      if (pills.length > 0) groups.push({ title, pills });
    }
    return groups;
  }, [draft, detected, pillSearch]);

  const selectedFields = useMemo(
    () => (draft ? draft.Fields.filter((f) => selected.has(f.Field)) : []),
    [draft, selected],
  );

  const menuRow =
    'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs text-body hover:bg-surface-hover cursor-pointer text-left';

  const body = (
    <div className="fixed inset-0 z-[80] bg-surface-secondary flex flex-col" role="dialog" aria-label="Curation Studio">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-surface-elevated px-5 py-3 flex items-center gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">Curated view</div>
          <div className="text-sm font-semibold text-heading flex items-center gap-2 flex-wrap">
            Curation Studio
            {draft && (
              <span className="text-[11px] font-normal text-body-secondary">
                {draft.BankSwiftCode} · {draft.Side}
                {draft.TransactionTypeCode ? ` · ${draft.TransactionTypeCode}` : ''}
              </span>
            )}
            {isUpdate && (
              <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-px text-[10px] font-semibold text-primary-dark dark:text-primary">
                editing a saved curation
              </span>
            )}
            {!canEdit && (
              <span className="inline-flex items-center rounded-full border border-border-strong bg-surface px-2 py-px text-[10px] font-semibold text-body-secondary">
                read-only
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && draft && (
            <Button variant="outline" size="sm" onClick={() => { void handleUseEngineKey(); }} disabled={engineBusy}>
              {engineBusy ? 'Loading…' : "Start from the engine's key"}
            </Button>
          )}
          <button
            type="button"
            onClick={requestClose}
            className="text-faint hover:text-body-secondary transition-colors p-1"
            aria-label="Close Curation Studio"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-faint italic animate-pulse">Opening the curation…</p>
        </div>
      ) : loadError || !draft ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-sm text-body-secondary">{loadError ?? 'The curation could not be opened.'}</p>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* --- Left: fields workbench ------------------------------------ */}
          <div ref={leftPaneRef} className="relative flex-1 min-w-0 overflow-y-auto custom-scrollbar px-5 py-4 space-y-3">
            <p className="text-[11px] text-faint">
              Pick the fields this curation keys on. Select the changing parts of the text and replace them with pills;
              the exact words that remain are what groups the transactions.
            </p>

            {draft.Fields.map((f) => {
              const isSel = selected.has(f.Field);
              const segs = segmentsByField.get(f.Field) ?? [];
              const empty = !f.Text;
              return (
                <div
                  key={f.Field}
                  className={`rounded-xl border px-4 py-3 bg-surface transition-colors ${isSel ? 'border-primary/50' : 'border-border'}`}
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <label className={`flex items-center gap-1.5 text-xs font-semibold ${empty && !isSel ? 'text-faint' : 'text-heading'} ${canEdit ? 'cursor-pointer' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={!canEdit}
                        onChange={() => toggleField(f.Field)}
                      />
                      {KEY_FIELD_LABELS[f.Field]}
                      <span className="font-mono font-normal text-[10px] text-faint">{f.Field}</span>
                    </label>
                    {isSel && !empty && canEdit && segs.some((s) => s.token) && (
                      <button
                        type="button"
                        onClick={() => resetFieldText(f.Field)}
                        className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
                      >
                        Reset to the transaction's text
                      </button>
                    )}
                    {!isSel && (
                      <select
                        value={fieldModes[f.Field] === 'Blank' ? 'Blank' : 'Any'}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setFieldModes((prev) => ({ ...prev, [f.Field]: e.target.value as KeyFieldMode }))
                        }
                        className="ml-auto rounded-lg border border-border bg-surface px-2 py-0.5 text-[11px] text-body-secondary outline-none focus:border-primary"
                        title="What the key requires of a field it doesn't include"
                      >
                        <option value="Any">Doesn't matter</option>
                        <option value="Blank">Must be empty</option>
                      </select>
                    )}
                  </div>

                  {isSel ? (
                    empty ? (
                      <p className="text-[11px] text-faint italic">Empty on this transaction — the key requires it empty.</p>
                    ) : (
                      // Canvas typography: the transaction's text at reading
                      // size, pills inline. Narrative spacing stays verbatim
                      // (gotcha #29) and Arabic renders per-value (dir=auto).
                      <div
                        dir="auto"
                        onMouseUp={() => handleFieldMouseUp(f.Field)}
                        className="font-mono text-sm leading-7 text-heading whitespace-pre-wrap break-all select-text"
                      >
                        {segs.map((seg, i) =>
                          seg.token ? (
                            <button
                              key={i}
                              type="button"
                              data-field={f.Field}
                              data-pill={i}
                              onClick={(e) => handlePillClick(f.Field, i, e.currentTarget)}
                              title={`${tokenPhrase({ Field: f.Field, Kind: seg.token.Kind, Text: seg.token.Text, Item: seg.token.Item, Length: seg.token.Length })} — was "${seg.text}"${canEdit ? '. Click to change or restore.' : ''}`}
                              className={`inline-flex items-center rounded-md border px-1.5 mx-px text-[12px] font-semibold align-baseline ${canEdit ? 'cursor-pointer' : 'cursor-default'} ${tokenChipClass({ Field: f.Field, Kind: seg.token.Kind, Text: seg.token.Text, Item: seg.token.Item, Length: seg.token.Length })}`}
                            >
                              {tokenCode({ Field: f.Field, Kind: seg.token.Kind, Text: seg.token.Text, Item: seg.token.Item, Length: seg.token.Length })}
                            </button>
                          ) : (
                            <span key={i} data-field={f.Field} data-seg={i}>{seg.text}</span>
                          ),
                        )}
                      </div>
                    )
                  ) : (
                    !empty && (
                      <p dir="auto" className="text-[11px] text-faint font-mono truncate" title={f.Text ?? undefined}>
                        {f.Text}
                      </p>
                    )
                  )}
                </div>
              );
            })}

            {canEdit && selectedFields.length > 0 && (
              <p className="text-[10px] text-faint">
                Tip: a pill inside a word splits it — INV<span className="font-mono">&lt;INT&gt;</span> matches INV2024
                and INV2025. Literal words match case-insensitively and tolerate extra spaces.
              </p>
            )}

            {/* "This part is…" popover */}
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={closeMenu} aria-hidden />
                <div
                  role="menu"
                  className="absolute z-20 rounded-xl border border-border-strong bg-surface-elevated shadow-xl overflow-hidden"
                  style={{ left: menu.left, top: menu.top, width: POPOVER_WIDTH }}
                >
                  <p className="px-3 pt-2.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">
                    This part is…
                  </p>
                  <p dir="auto" className="px-3 pb-1.5 text-[11px] font-mono text-body-secondary truncate" title={menu.text}>
                    {menu.text}
                  </p>
                  <div className="px-3 pb-1.5">
                    <input
                      type="text"
                      value={pillSearch}
                      onChange={(e) => setPillSearch(e.target.value)}
                      placeholder="Search pills…"
                      autoFocus
                      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-body outline-none focus:border-primary"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar pb-1">
                    {menu.kind === 'selection' && detected === null && (
                      <p className="px-3 py-1 text-[10px] text-faint italic animate-pulse">Detecting…</p>
                    )}
                    {pillGroups.map((g) => (
                      <div key={g.title}>
                        <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">{g.title}</p>
                        {g.pills.slice(0, 30).map((p) => (
                          <button
                            key={`${p.Kind}:${p.Text}:${p.Item ?? ''}:${p.Length ?? ''}`}
                            type="button"
                            onClick={() => applyPill(p)}
                            className={menuRow}
                            title={p.Description ?? undefined}
                          >
                            <span className="min-w-0 truncate">{p.Label}</span>
                            <span className="text-[10px] font-mono text-faint whitespace-nowrap shrink-0">
                              {tokenCode({ Field: menu.field, Kind: p.Kind, Text: p.Text, Item: p.Item, Length: p.Length })}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                    {pillGroups.every((g) => g.pills.length === 0) && (
                      <p className="px-3 py-1.5 text-[11px] text-faint italic">No pills match the search.</p>
                    )}
                  </div>
                  {menu.kind === 'pill' && (
                    <>
                      <div className="border-t border-border-subtle" />
                      <button type="button" onClick={restorePillText} className={`${menuRow} py-2`}>
                        <span className="font-medium">Keep the exact words</span>
                        <span dir="auto" className="text-[10px] font-mono text-body-secondary truncate max-w-[45%]" title={menu.text}>
                          {menu.text}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* --- Right: live effect ---------------------------------------- */}
          <div className="lg:w-[440px] xl:w-[500px] shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-surface-secondary/40 overflow-y-auto custom-scrollbar px-5 py-4 space-y-3">
            {/* The key as the engine sees it */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1">The key</p>
              {tokens.length > 0 ? (
                <div className="rounded-xl border border-dashed border-border-strong bg-surface px-3 py-2.5">
                  <KeyTokenChips tokens={tokens} size="xs" />
                </div>
              ) : (
                <p className="text-[11px] text-faint italic">Pick a field and keep some of its words to build the key.</p>
              )}
              {!pins && tokens.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  Keep at least a few exact words or a list value — a key of pure placeholders matches everything.
                </p>
              )}
            </div>

            {/* Anchoring */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Position</p>
              {([
                ['auto', `Auto${preview ? ` (${preview.Anchored ? 'starts with' : 'anywhere'})` : ''}`],
                ['starts', 'Starts with'],
                ['anywhere', 'Anywhere'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setAnchorChoice(value)}
                  className={`text-[11px] px-2 py-0.5 rounded-lg border transition-colors ${
                    anchorChoice === value
                      ? 'border-primary bg-primary/10 text-primary-dark dark:text-primary font-semibold'
                      : 'border-border-strong bg-surface text-body hover:bg-surface-hover'
                  } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Live counts */}
            <div className={`rounded-xl border px-4 py-3 ${
              preview && !preview.IsValid
                ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800'
                : 'border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900'
            }`}>
              {previewLoading || (!preview && pins) ? (
                <p className="text-xs text-faint italic animate-pulse">
                  Matching against the workspace… (the first preview can take a few seconds)
                </p>
              ) : !preview ? (
                <p className="text-xs text-faint italic">The live effect appears once the key pins something.</p>
              ) : !preview.IsValid ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">This key can't be saved yet.</p>
                  {preview.Warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400">{w}</p>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-heading">
                    Matches{' '}
                    <span className="text-lg font-bold text-primary-dark dark:text-primary tabular-nums">
                      {preview.MatchCount.toLocaleString()}
                    </span>{' '}
                    of {preview.WorkRows.toLocaleString()} open transactions
                  </p>
                  {preview.SourceMatches === false && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      No longer matches the transaction you started from
                      {preview.SourceFailingFields.length > 0 ? ` (failing: ${preview.SourceFailingFields.join(', ')})` : ''}.
                    </p>
                  )}
                  {preview.TransactionTypeCodes.length > 0 && (
                    <p className="text-[11px] text-body-secondary flex items-center gap-1 flex-wrap">
                      {preview.TransactionTypeCodes.map((t) => (
                        <span key={t.Key} className="inline-flex items-center rounded border border-border-strong bg-surface px-1.5 py-px text-[9px] font-mono font-semibold whitespace-nowrap">
                          {t.Key} · {t.Count.toLocaleString()}
                        </span>
                      ))}
                    </p>
                  )}
                  {preview.Groups.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                        Absorbs {preview.Groups.length} group{preview.Groups.length === 1 ? '' : 's'}
                      </p>
                      <ul className="space-y-0.5">
                        {preview.Groups.slice(0, 5).map((g) => (
                          <li key={g.SimilarSetId} dir="auto" className="text-[11px] text-body-secondary font-mono truncate">
                            · {g.Anchor} — {g.Count.toLocaleString()}{g.IsSource ? ' (source)' : ''}
                          </li>
                        ))}
                        {preview.Groups.length > 5 && (
                          <li className="text-[10px] text-faint">…and {preview.Groups.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {preview.OverlappingCurations.length > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Overlaps {preview.OverlappingCurations.map((o) => o.Name || o.Key).join(', ')} — a row joins one
                      group only.
                    </p>
                  )}
                  {preview.TaggedMatchCount > 0 && (
                    <p className="text-[11px] text-body-secondary">
                      Also matches {preview.TaggedMatchCount.toLocaleString()} already-tagged row
                      {preview.TaggedMatchCount === 1 ? '' : 's'}
                      {preview.TaggedTags.length > 0
                        ? ` (${preview.TaggedTags.slice(0, 3).map((t) => t.Key).join(', ')})`
                        : ''}{' '}
                      — an existing rule may already cover this shape.
                    </p>
                  )}
                  {preview.Warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400">{w}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Matching transactions */}
            {preview?.IsValid && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  {([
                    ['open', `Open matches${preview ? ` (${preview.MatchCount.toLocaleString()})` : ''}`],
                    ['tagged', `Already tagged${preview && preview.TaggedMatchCount > 0 ? ` (${preview.TaggedMatchCount.toLocaleString()})` : ''}`],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMatchTab(value)}
                      className={`text-[11px] px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        matchTab === value
                          ? 'border-primary bg-primary/10 text-primary-dark dark:text-primary font-semibold'
                          : 'border-border-strong bg-surface text-body hover:bg-surface-hover'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {matchRows === null ? (
                  <p className="text-[11px] text-faint italic animate-pulse">Loading matches…</p>
                ) : matchRows.length === 0 ? (
                  <p className="text-[11px] text-faint italic">
                    {matchTab === 'open' ? 'No open transactions match this key.' : 'No tagged transactions match this key.'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {matchRows.map((row, i) => {
                      const id = String(row.Id ?? row.TransactionId ?? i);
                      const isSource = draft.TransactionId && String(row.Id ?? row.TransactionId ?? '') === draft.TransactionId;
                      return (
                        <div
                          key={id}
                          className={`rounded-lg border px-2.5 py-1.5 bg-surface ${isSource ? 'border-primary/50' : 'border-border'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {row.TransactionTypeCode != null && (
                              <span className="inline-flex items-center rounded border border-border-strong bg-surface-secondary px-1 py-px text-[9px] font-mono font-semibold text-body-secondary">
                                {String(row.TransactionTypeCode)}
                              </span>
                            )}
                            {isSource && (
                              <span className="text-[9px] font-semibold text-primary-dark dark:text-primary uppercase tracking-wide">source</span>
                            )}
                          </div>
                          {selectedFields.map((f) => {
                            const v = row[f.Property];
                            if (v == null || v === '') return null;
                            return (
                              <p key={f.Field} dir="auto" className="text-[11px] font-mono text-body whitespace-pre-wrap break-all">
                                {selectedFields.length > 1 && <span className="text-faint">{f.Field}» </span>}
                                {String(v)}
                              </p>
                            );
                          })}
                        </div>
                      );
                    })}
                    {matchTotal > MATCHES_PAGE_SIZE && (
                      <div className="flex items-center justify-between pt-0.5">
                        <button
                          type="button"
                          disabled={matchPage === 0}
                          onClick={() => setMatchPage((p) => Math.max(0, p - 1))}
                          className="text-[11px] text-primary font-medium hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          ← Previous
                        </button>
                        <span className="text-[10px] text-faint tabular-nums">
                          {matchPage * MATCHES_PAGE_SIZE + 1}–{Math.min((matchPage + 1) * MATCHES_PAGE_SIZE, matchTotal)} of {matchTotal.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          disabled={(matchPage + 1) * MATCHES_PAGE_SIZE >= matchTotal}
                          onClick={() => setMatchPage((p) => p + 1)}
                          className="text-[11px] text-primary font-medium hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer: name + save */}
      {!loading && draft && (
        <footer className="shrink-0 border-t border-border bg-surface-elevated px-5 py-3 flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            placeholder="Curation name — heads its group in the Curated View"
            className="flex-1 min-w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-body outline-none focus:border-primary"
          />
          <input
            type="text"
            value={note}
            disabled={!canEdit}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 min-w-40 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-body outline-none focus:border-primary"
          />
          <Button variant="outline" size="sm" onClick={requestClose}>Cancel</Button>
          {canEdit && (
            <span
              title={
                !canSave
                  ? !name.trim()
                    ? 'Name the curation first.'
                    : !pins
                      ? 'Keep at least a few exact words or a list value in the key.'
                      : preview?.SourceMatches === false
                        ? 'The key no longer matches the transaction you started from.'
                        : preview && !preview.IsValid
                          ? 'The key is not valid yet — see the warnings.'
                          : previewLoading
                            ? 'Waiting for the preview…'
                            : undefined
                  : undefined
              }
            >
              <Button variant="primary" size="sm" onClick={() => { void handleSave(); }} disabled={!canSave}>
                {saveBusy ? 'Saving…' : isUpdate ? 'Update curation' : 'Save curation'}
              </Button>
            </span>
          )}
        </footer>
      )}

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => { setConfirmClose(false); onClose(); }}
        title="Discard changes?"
        message="The curation has unsaved changes. Close the studio and discard them?"
        confirmLabel="Discard"
        variant="danger_ghost"
      />
    </div>
  );

  return createPortal(body, document.body);
}
