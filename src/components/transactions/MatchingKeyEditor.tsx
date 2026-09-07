import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TepHeaders } from '../../api/transactions';
import {
  previewKeyEdit,
  saveKeyEdit,
  deleteKeyEdit,
  getKeyEdits,
  getSamplingVocabulary,
  type KeyEditPreview,
  type KeyOverride,
  type KeyToken,
  type SuggestedTagSpec,
  type VocabularyListInfo,
} from '../../api/sampling';
import { createLOVListItem, getLOVListItems, updateLOVListItem } from '../../api/lovManagement';
import type { LOVListItem } from '../../types/lov';
import {
  alignTokensToExample,
  locateSelectionInTokens,
  removeTokenAt,
  replaceTokenAt,
  splitLiteralToken,
  tokensEqual,
  tokensPinSomething,
} from '../../utils/keyTokens';
import { KeyTokenChips } from './KeyTokenChips';
import { Button } from '../shared/Button';

export interface TepAuth {
  token: string;
  headers: TepHeaders;
}

interface MatchingKeyEditorProps {
  suggestion: SuggestedTagSpec;
  /** Checked-out workspace — key edits are per (bank, side). Null = no
   *  checkout: chips render read-only. */
  workspace: { bank: string; side: string } | null;
  /** Gated like rule editing: the checked-out operator edits, audit and
   *  visitors see the chips read-only (hand-off §4.7). */
  canEdit: boolean;
  userId: string | null;
  getTepAuth: () => Promise<TepAuth>;
  /** SaveKeyEdit / DeleteKeyEdit succeeded — the parent flips the
   *  sampling-running state and lets the existing status poll regroup. */
  onKeyEditApplied: (runStarted: boolean, message: string) => void;
  onError: (message: string) => void;
}

/** The placeholder choices of the "This part is… / Mark as…" menus. */
const MARK_CHOICES: { text: string; label: string }[] = [
  { text: 'STRING', label: 'Any text' },
  { text: 'INT', label: 'A number' },
  { text: 'DECIMAL', label: 'An amount' },
  { text: 'AR', label: 'Arabic text' },
];

const POPOVER_WIDTH = 340;

/**
 * "Matching key" section of the suggestion drawer (matching-keys delta,
 * 2026-09-07; layout per the operator brief b078111d). Renders the key as
 * chips in a dashed container; the checked-out operator can correct it: click
 * a chip → an anchored "This part is…" popover (a list value, any text, a
 * number, an amount, Arabic text, keep the exact words, remove), or select
 * words in an example → "Mark as…" the same choices plus "Add to list…" (a
 * new bank becomes vocabulary instead of a one-off fix). Every change
 * previews its effect ("If you apply: 32 → 47 · merges 2 groups", debounced
 * ~400 ms) before Apply, which stores the edit (SaveKeyEdit) and regroups the
 * workspace through the existing sampling-run poll. An edited key shows
 * who/when and offers "Return to automatic key" (DeleteKeyEdit).
 */
export function MatchingKeyEditor({
  suggestion,
  workspace,
  canEdit,
  userId,
  getTepAuth,
  onKeyEditApplied,
  onError,
}: MatchingKeyEditorProps) {
  const baseTokens = useMemo<KeyToken[]>(() => suggestion.KeyTokens ?? [], [suggestion.KeyTokens]);

  const [editing, setEditing] = useState(false);
  const [workTokens, setWorkTokens] = useState<KeyToken[]>(baseTokens);
  const [applyBusy, setApplyBusy] = useState(false);
  const [note, setNote] = useState('');

  // Popover anchoring: index of the open chip + its offset inside the
  // relative wrapper (computed from bounding rects on click).
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ index: number; left: number; top: number } | null>(null);

  // Reset the working copy whenever the drawer shows a different suggestion.
  useEffect(() => {
    setEditing(false);
    setWorkTokens(baseTokens);
    setMenu(null);
    setNote('');
  }, [suggestion.Id, baseTokens]);

  // --- Vocabulary (for the list picker + Add to list), lazy on first edit ---
  const [vocab, setVocab] = useState<VocabularyListInfo[] | null>(null);
  useEffect(() => {
    if (!editing || vocab !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const { token, headers } = await getTepAuth();
        if (!token || cancelled) return;
        const lists = await getSamplingVocabulary(token, headers);
        if (!cancelled) setVocab(lists);
      } catch {
        if (!cancelled) setVocab([]);
      }
    })();
    return () => { cancelled = true; };
  }, [editing, vocab, getTepAuth]);

  // Collapse/Keep-item lists first (they already take part in masking), then
  // the rest; internal lists never appear.
  const pickableLists = useMemo(() => {
    if (!vocab) return [];
    const rank = (l: VocabularyListInfo) => (l.Behavior === 'Collapse' || l.Behavior === 'KeepItem' ? 0 : 1);
    return vocab
      .filter((l) => !l.IsInternal && l.Behavior !== 'Never')
      .sort((a, b) => rank(a) - rank(b) || a.ListTag.localeCompare(b.ListTag));
  }, [vocab]);

  // The words each placeholder chip stands for in the first example — feeds
  // "Keep the exact words" so the operator sees what they would keep.
  const alignedWords = useMemo(() => {
    const example = suggestion.ExampleTexts?.[0];
    if (!example) return null;
    return (
      alignTokensToExample(workTokens, 'AI', example) ??
      alignTokensToExample(workTokens, 'D2', example)
    );
  }, [workTokens, suggestion.ExampleTexts]);

  // --- Live preview (debounced ~400 ms per the operator brief) --------------
  const changed = !tokensEqual(workTokens, baseTokens);
  const pins = tokensPinSomething(workTokens);
  const [preview, setPreview] = useState<KeyEditPreview | null>(null);
  const [previewInvalid, setPreviewInvalid] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewSeq = useRef(0);

  useEffect(() => {
    if (!editing || !workspace || !changed) {
      setPreview(null);
      setPreviewInvalid(false);
      setPreviewLoading(false);
      return;
    }
    if (!pins) {
      // The backend would answer SFM_INVALID_INPUT_PARAMETERS — skip the call.
      setPreview(null);
      setPreviewInvalid(true);
      setPreviewLoading(false);
      return;
    }
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { token, headers } = await getTepAuth();
        if (!token || seq !== previewSeq.current) return;
        const res = await previewKeyEdit(
          {
            BankSwiftCode: workspace.bank,
            Side: workspace.side,
            SourceSimilarSetId: suggestion.SimilarSetId,
            Tokens: workTokens,
          },
          token,
          headers,
        );
        if (seq !== previewSeq.current) return;
        setPreview(res.preview);
        setPreviewInvalid(res.invalidKey);
      } catch (err) {
        if (seq !== previewSeq.current) return;
        setPreview(null);
        setPreviewInvalid(false);
        onError(err instanceof Error ? err.message : 'Failed to preview the key edit');
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [editing, workspace, changed, pins, workTokens, suggestion.SimilarSetId, getTepAuth, onError]);

  // --- Chip popover actions ---------------------------------------------------
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [keepWordsOpen, setKeepWordsOpen] = useState(false);
  const [keepWordsText, setKeepWordsText] = useState('');

  const closeMenus = useCallback(() => {
    setMenu(null);
    setListPickerOpen(false);
    setKeepWordsOpen(false);
    setListSearch('');
    setKeepWordsText('');
  }, []);

  const openChipMenu = useCallback((index: number, el: HTMLElement) => {
    const wrapper = anchorRef.current;
    if (!wrapper) return;
    setListPickerOpen(false);
    setKeepWordsOpen(false);
    setListSearch('');
    setMenu((prev) => {
      if (prev?.index === index) return null; // toggle
      const wRect = wrapper.getBoundingClientRect();
      const cRect = el.getBoundingClientRect();
      const left = Math.max(0, Math.min(cRect.left - wRect.left, wRect.width - POPOVER_WIDTH));
      return { index, left, top: cRect.bottom - wRect.top + 8 };
    });
  }, []);

  // Escape closes the popover before it closes the drawer.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menu, closeMenus]);

  const assignPlaceholder = useCallback((index: number, text: string) => {
    setWorkTokens((prev) => replaceTokenAt(prev, index, { Kind: 'Placeholder', Text: text }));
    closeMenus();
  }, [closeMenus]);

  const assignList = useCallback((index: number, list: VocabularyListInfo) => {
    setWorkTokens((prev) => {
      const tok = prev[index];
      // Keep-item lists keep items apart: carry the chip's own words as the
      // item (spaces → underscores per the grammar); the backend validates.
      const item =
        list.Behavior === 'KeepItem' && tok?.Kind === 'Literal'
          ? tok.Text.trim().replace(/\s+/g, '_')
          : null;
      return replaceTokenAt(prev, index, { Kind: 'List', Text: list.ListTag, Item: item });
    });
    closeMenus();
  }, [closeMenus]);

  const keepExactWords = useCallback((index: number, words: string) => {
    const clean = words.trim();
    if (!clean || clean.includes('<')) return; // a Literal never contains '<'
    setWorkTokens((prev) => replaceTokenAt(prev, index, { Kind: 'Literal', Text: clean }));
    closeMenus();
  }, [closeMenus]);

  const removeChip = useCallback((index: number) => {
    setWorkTokens((prev) => removeTokenAt(prev, index));
    closeMenus();
  }, [closeMenus]);

  // --- Example selection ("Mark as…") ----------------------------------------
  const [selText, setSelText] = useState('');
  const [selUnmatched, setSelUnmatched] = useState(false);

  const handleExampleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    setSelUnmatched(false);
    setSelText(text.length >= 2 ? text : '');
  }, []);

  const markSelection = useCallback((replacement: { Kind: 'Placeholder' | 'List'; Text: string; Item?: string | null }) => {
    const hit = locateSelectionInTokens(workTokens, selText);
    const next = hit ? splitLiteralToken(workTokens, hit.index, hit.start, hit.end, replacement) : null;
    if (!next) {
      setSelUnmatched(true);
      return;
    }
    setWorkTokens(next);
    setSelText('');
  }, [workTokens, selText]);

  // --- Add to list… -----------------------------------------------------------
  const [addToListValue, setAddToListValue] = useState<string | null>(null);
  const [addListTag, setAddListTag] = useState('');
  const [addMode, setAddMode] = useState<'item' | 'alias'>('item');
  const [aliasItems, setAliasItems] = useState<LOVListItem[] | null>(null);
  const [aliasItemId, setAliasItemId] = useState<number | null>(null);
  const [aliasSearch, setAliasSearch] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addDone, setAddDone] = useState(false);

  useEffect(() => {
    // Load the target list's items when the alias path needs them.
    if (addToListValue == null || addMode !== 'alias' || !addListTag) {
      setAliasItems(null);
      setAliasItemId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { token, headers } = await getTepAuth();
        if (!token || cancelled) return;
        const items = await getLOVListItems(addListTag, token, headers);
        if (!cancelled) setAliasItems(items.filter((it) => it.StatusTag === 'ACTIVE' || it.StatusTag === '0510'));
      } catch {
        if (!cancelled) setAliasItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [addToListValue, addMode, addListTag, getTepAuth]);

  const submitAddToList = useCallback(async () => {
    if (!addToListValue || !addListTag) return;
    setAddBusy(true);
    try {
      const { token, headers } = await getTepAuth();
      if (!token) throw new Error('Not authenticated');
      if (addMode === 'item') {
        await createLOVListItem({ ListTag: addListTag, Value: addToListValue }, token, headers);
      } else {
        const item = aliasItems?.find((it) => it.Id === aliasItemId);
        if (!item || item.Id == null) throw new Error('Pick the item the alias belongs to');
        // Wholesale-replace rule: send tags and details back as read, plus
        // the new alias tag.
        await updateLOVListItem(
          {
            ListTag: addListTag,
            Id: item.Id,
            Value: item.Value,
            Tags: [...(item.Tags ?? []), addToListValue],
            Details: item.Details,
          },
          token,
          headers,
        );
      }
      setAddDone(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update the list');
    } finally {
      setAddBusy(false);
    }
  }, [addToListValue, addListTag, addMode, aliasItems, aliasItemId, getTepAuth, onError]);

  // --- Apply / Return to automatic key ---------------------------------------
  const canApply = changed && pins && !previewInvalid && !previewLoading && !!preview && !applyBusy && !!workspace;

  const handleApply = useCallback(async () => {
    if (!workspace) return;
    setApplyBusy(true);
    try {
      const { token, headers } = await getTepAuth();
      if (!token) throw new Error('Not authenticated');
      const res = await saveKeyEdit(
        {
          BankSwiftCode: workspace.bank,
          Side: workspace.side,
          SourceSimilarSetId: suggestion.SimilarSetId,
          SourceAnchor: suggestion.StructuralAnchor ?? '',
          Tokens: workTokens,
          Note: note.trim() || undefined,
          UserId: userId ?? '',
        },
        token,
        headers,
      );
      onKeyEditApplied(res.runStarted, 'Key applied — regrouping…');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to apply the key edit');
    } finally {
      setApplyBusy(false);
    }
  }, [workspace, suggestion.SimilarSetId, suggestion.StructuralAnchor, workTokens, note, userId, getTepAuth, onKeyEditApplied, onError]);

  // The override behind an edited key: author / date / note + delete.
  const [override, setOverride] = useState<KeyOverride | null>(null);
  useEffect(() => {
    if (!suggestion.KeyOverrideId || !workspace) {
      setOverride(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { token, headers } = await getTepAuth();
        if (!token || cancelled) return;
        const edits = await getKeyEdits({ BankSwiftCode: workspace.bank, Side: workspace.side }, token, headers);
        if (!cancelled) setOverride(edits.find((o) => o.Id === suggestion.KeyOverrideId) ?? null);
      } catch { /* advisory — the marker renders without author details */ }
    })();
    return () => { cancelled = true; };
  }, [suggestion.KeyOverrideId, workspace, getTepAuth]);

  const [deleteBusy, setDeleteBusy] = useState(false);
  const handleReturnToAutomatic = useCallback(async () => {
    if (!suggestion.KeyOverrideId) return;
    setDeleteBusy(true);
    try {
      const { token, headers } = await getTepAuth();
      if (!token) throw new Error('Not authenticated');
      const res = await deleteKeyEdit(suggestion.KeyOverrideId, token, headers);
      onKeyEditApplied(res.runStarted, 'Key edit removed — regrouping with the automatic key…');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to remove the key edit');
    } finally {
      setDeleteBusy(false);
    }
  }, [suggestion.KeyOverrideId, getTepAuth, onKeyEditApplied, onError]);

  // ---------------------------------------------------------------------------

  if (baseTokens.length === 0) {
    // Pre-delta suggestion with no tokens: keep the old read-only anchor.
    return suggestion.StructuralAnchor ? (
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1">Matching key</p>
        <code dir="auto" className="text-[11px] text-body-secondary whitespace-pre-wrap break-all font-mono">
          {suggestion.StructuralAnchor}
        </code>
      </section>
    ) : null;
  }

  const menuToken = menu != null ? workTokens[menu.index] : null;
  const menuWords = menu != null ? alignedWords?.get(menu.index) : undefined;
  const sourceCount = preview?.Groups.find((g) => g.IsSource)?.Count ?? suggestion.CoverageCount;
  const merges = preview ? Math.max(preview.Groups.length - 1, 0) : 0;

  const menuRow =
    'w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-body hover:bg-surface-hover cursor-pointer text-left';
  const menuCode = 'text-[10px] font-mono text-faint whitespace-nowrap shrink-0';

  return (
    <section>
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Matching key</p>
        {!editing && canEdit && workspace && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
          >
            Edit
          </button>
        )}
      </div>

      {suggestion.KeyOverrideId && (
        <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-body-secondary flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-px font-semibold text-primary-dark dark:text-primary">
            edited key
          </span>
          <span className="min-w-0">
            {override
              ? `by ${override.CreatedByUserId} · ${new Date(override.CreatedAtUtc).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${override.Note ? ` · ${override.Note}` : ''}`
              : 'This key was edited by an operator.'}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => { void handleReturnToAutomatic(); }}
              disabled={deleteBusy}
              className="text-primary font-medium hover:underline cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {deleteBusy ? 'Removing…' : 'Return to automatic key'}
            </button>
          )}
        </div>
      )}

      {/* Relative wrapper: the chip popover anchors inside it. */}
      <div ref={anchorRef} className="relative">
        <div className={`rounded-xl border px-4 py-3 bg-surface ${editing ? 'border-dashed border-border-strong' : 'border-border'}`}>
          <KeyTokenChips
            tokens={editing ? workTokens : baseTokens}
            onChipClick={editing ? openChipMenu : undefined}
            selectedIndex={editing ? (menu?.index ?? null) : null}
          />
        </div>
        {editing && (
          <p className="mt-1.5 text-[11px] text-faint">
            Click a part to change what it stands for. Select text in an example below to mask it.
          </p>
        )}

        {/* "This part is…" popover, anchored under the clicked chip. */}
        {editing && menu && menuToken && (
          <>
            <div className="fixed inset-0 z-10" onClick={closeMenus} aria-hidden />
            <div
              role="menu"
              className="absolute z-20 rounded-xl border border-border-strong bg-surface-elevated shadow-xl overflow-hidden"
              style={{ left: menu.left, top: menu.top, width: POPOVER_WIDTH }}
            >
              <div
                className="absolute -top-1 w-2 h-2 rotate-45 bg-surface-elevated border-l border-t border-border-strong"
                style={{ left: 18 }}
                aria-hidden
              />
              <p className="px-3 pt-2.5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">
                This part is…
              </p>

              <button type="button" onClick={() => setListPickerOpen((v) => !v)} className={`${menuRow} ${listPickerOpen ? 'bg-surface-hover' : ''}`}>
                <span className="font-medium">A value from a list</span>
                <span className={`${menuCode} flex items-center gap-1`}>
                  &lt;LIST&gt;
                  <svg className={`w-2.5 h-2.5 transition-transform ${listPickerOpen ? 'rotate-90' : ''}`} viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
              {listPickerOpen && (
                <div className="px-3 pb-2">
                  <input
                    type="text"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search lists…"
                    autoFocus
                    className="w-full mb-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-body outline-none focus:border-primary"
                  />
                  <div className="max-h-36 overflow-y-auto custom-scrollbar">
                    {vocab === null && <p className="text-[11px] text-faint italic px-1 py-1">Loading lists…</p>}
                    {pickableLists
                      .filter((l) => l.ListTag.toLowerCase().includes(listSearch.trim().toLowerCase()))
                      .map((l, i) => (
                        <button
                          key={l.ListTag}
                          type="button"
                          onClick={() => assignList(menu.index, l)}
                          className="w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded text-xs hover:bg-surface-hover cursor-pointer text-left"
                        >
                          <span className={`truncate ${i === 0 ? 'font-semibold text-heading' : 'text-body'}`}>{l.ListTag}</span>
                          <span className="text-[10px] text-faint whitespace-nowrap tabular-nums">
                            {l.Behavior === 'Off' ? 'off' : `${l.ActiveItems.toLocaleString()} item${l.ActiveItems === 1 ? '' : 's'}`}
                          </span>
                        </button>
                      ))}
                    {vocab !== null && pickableLists.length === 0 && (
                      <p className="text-[11px] text-faint italic px-1 py-1">No lists available.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-border-subtle" />
              {MARK_CHOICES.map((c) => (
                <button key={c.text} type="button" onClick={() => assignPlaceholder(menu.index, c.text)} className={menuRow}>
                  <span>{c.label}</span>
                  <span className={menuCode}>&lt;{c.text}&gt;</span>
                </button>
              ))}

              {menuToken.Kind !== 'Literal' && (
                <>
                  <div className="border-t border-border-subtle" />
                  {menuWords && !keepWordsOpen ? (
                    <button type="button" onClick={() => keepExactWords(menu.index, menuWords)} className={menuRow}>
                      <span>Keep the exact words</span>
                      <span dir="auto" className="text-[10px] font-mono text-body-secondary truncate max-w-[45%]" title={menuWords}>
                        {menuWords}
                      </span>
                    </button>
                  ) : keepWordsOpen ? (
                    <div className="px-3 py-2 flex items-center gap-1.5">
                      <input
                        type="text"
                        dir="auto"
                        value={keepWordsText}
                        onChange={(e) => setKeepWordsText(e.target.value)}
                        placeholder="The exact words from the example"
                        autoFocus
                        className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-body outline-none focus:border-primary font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => keepExactWords(menu.index, keepWordsText)}
                        disabled={!keepWordsText.trim() || keepWordsText.includes('<')}
                        className="text-[11px] font-medium text-primary hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setKeepWordsOpen(true); setKeepWordsText(''); }} className={menuRow}>
                      <span>Keep the exact words…</span>
                    </button>
                  )}
                </>
              )}

              <div className="border-t border-border-subtle" />
              <button
                type="button"
                onClick={() => removeChip(menu.index)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer text-left"
              >
                <span className="font-medium">Remove from key</span>
                <span className="text-[10px]" aria-hidden>✕</span>
              </button>
            </div>
          </>
        )}
      </div>

      {editing && (
        <>
          {/* Selection marking on an example. */}
          {(suggestion.ExampleTexts?.length ?? 0) > 0 && (
            <div className="mt-3">
              <div
                onMouseUp={handleExampleMouseUp}
                dir="auto"
                className="rounded-lg border border-border-subtle bg-surface-secondary/60 px-3 py-2 text-xs text-body whitespace-pre-wrap break-all font-mono select-text"
              >
                {suggestion.ExampleTexts![0]}
              </div>
              {selText && (
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-faint">Mark as…</span>
                  {MARK_CHOICES.map((c) => (
                    <button
                      key={c.text}
                      type="button"
                      onClick={() => markSelection({ Kind: 'Placeholder', Text: c.text })}
                      className="text-[11px] px-2 py-0.5 rounded-lg border border-border-strong bg-surface text-body hover:bg-surface-hover cursor-pointer"
                    >
                      {c.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setAddToListValue(selText); setAddDone(false); setAddListTag(''); setAddMode('item'); }}
                    className="text-[11px] px-2 py-0.5 rounded-lg border border-teal-300 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800 hover:opacity-80 cursor-pointer"
                  >
                    Add to list…
                  </button>
                </div>
              )}
              {selUnmatched && (
                <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">
                  Those words are not part of the key's exact words — click the chip that stands for them instead.
                </p>
              )}
            </div>
          )}

          {/* Add to list… (new item, or alias of an existing item). */}
          {addToListValue != null && (
            <div className="mt-2 rounded-lg border border-teal-300/60 bg-teal-50/50 dark:bg-teal-950/20 dark:border-teal-800 px-3 py-2">
              {addDone ? (
                <p className="text-[11px] text-teal-800 dark:text-teal-300">
                  Added <span className="font-mono font-medium">{addToListValue}</span> to {addListTag}. Applies at the next Resample.{' '}
                  <button type="button" onClick={() => setAddToListValue(null)} className="font-medium hover:underline cursor-pointer">Close</button>
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-body mb-1.5">
                    Add <span className="font-mono font-medium" dir="auto">{addToListValue}</span> to a list — it becomes vocabulary for every workspace at the next Resample.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <select
                      value={addListTag}
                      onChange={(e) => setAddListTag(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-body outline-none focus:border-primary"
                    >
                      <option value="">Pick a list…</option>
                      {pickableLists.map((l) => (
                        <option key={l.ListTag} value={l.ListTag}>{l.ListTag}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-body cursor-pointer">
                      <input type="radio" checked={addMode === 'item'} onChange={() => setAddMode('item')} /> New item
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-body cursor-pointer">
                      <input type="radio" checked={addMode === 'alias'} onChange={() => setAddMode('alias')} /> Alias of an existing item
                    </label>
                  </div>
                  {addMode === 'alias' && addListTag && (
                    <div className="mb-1.5">
                      <input
                        type="text"
                        value={aliasSearch}
                        onChange={(e) => setAliasSearch(e.target.value)}
                        placeholder="Search items…"
                        className="w-full mb-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-body outline-none focus:border-primary"
                      />
                      <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-0.5">
                        {aliasItems === null && <p className="text-[11px] text-faint italic">Loading items…</p>}
                        {(aliasItems ?? [])
                          .filter((it) => (it.Name || it.Value).toLowerCase().includes(aliasSearch.trim().toLowerCase()))
                          .slice(0, 50)
                          .map((it) => (
                            <button
                              key={it.Id ?? it.Value}
                              type="button"
                              onClick={() => setAliasItemId(it.Id ?? null)}
                              className={`w-full text-left px-2 py-0.5 rounded text-xs cursor-pointer ${
                                aliasItemId === it.Id ? 'bg-primary/10 text-primary font-medium' : 'text-body hover:bg-surface-hover'
                              }`}
                            >
                              {it.Name || it.Value}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void submitAddToList(); }}
                      disabled={addBusy || !addListTag || (addMode === 'alias' && aliasItemId == null)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-teal-600 bg-teal-600 text-white hover:bg-teal-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addBusy ? 'Adding…' : addMode === 'item' ? 'Add item' : 'Add alias'}
                    </button>
                    <button type="button" onClick={() => setAddToListValue(null)} className="text-[11px] text-body-secondary hover:underline cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Effect preview — "If you apply: …" per the operator brief. */}
          {changed && (
            <div className={`mt-3 rounded-xl border px-4 py-3 ${
              previewInvalid
                ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800'
                : 'border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900'
            }`}>
              {previewInvalid ? (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Keep at least a few exact words or a list value in the key.
                </p>
              ) : previewLoading || !preview ? (
                <p className="text-xs text-faint italic animate-pulse">Previewing the effect…</p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-heading">
                    <span className="font-semibold">If you apply:</span>{' '}
                    the key represents{' '}
                    <span className="font-semibold text-primary-dark dark:text-primary">
                      {sourceCount.toLocaleString()} → {preview.MatchCount.toLocaleString()}
                    </span>{' '}
                    transactions
                    {merges > 0 && <> and merges <span className="font-semibold">{merges}</span> group{merges === 1 ? '' : 's'}</>}
                    {preview.Anchored != null && (
                      <span className="ml-1.5 text-[10px] text-faint">({preview.Anchored ? 'starts with' : 'contains'})</span>
                    )}
                  </p>
                  {preview.Groups.length > 0 && (
                    <ul className="space-y-0.5">
                      {preview.Groups.slice(0, 6).map((g) => (
                        <li key={g.SimilarSetId} dir="auto" className="text-[11px] text-body-secondary font-mono truncate">
                          · {g.Anchor} — {g.Count.toLocaleString()}
                        </li>
                      ))}
                      {preview.Groups.length > 6 && (
                        <li className="text-[10px] text-faint">…and {preview.Groups.length - 6} more</li>
                      )}
                    </ul>
                  )}
                  {(preview.AiMode === 'Blank' || preview.D2Mode === 'Blank') && (
                    <p className="text-[10px] text-faint">
                      {[
                        preview.AiMode === 'Blank' ? 'Additional Information: must be empty' : null,
                        preview.D2Mode === 'Blank' ? 'Description 2: must be empty' : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {preview.ExampleTexts.length > 0 && (
                    <div className="pt-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Rows that would join</p>
                      {preview.ExampleTexts.slice(0, 2).map((t, i) => (
                        <p key={i} dir="auto" className="text-[10px] text-body-secondary font-mono whitespace-pre-wrap break-all">{t}</p>
                      ))}
                    </div>
                  )}
                  {preview.Warnings.map((w, i) => (
                    <p key={i} className="text-[10px] text-amber-700 dark:text-amber-400">{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Note + Cancel / Apply key. */}
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional) — why this key was corrected"
              className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-body outline-none focus:border-primary"
            />
            <Button variant="outline" size="sm" onClick={() => { setEditing(false); setWorkTokens(baseTokens); closeMenus(); }}>
              Cancel
            </Button>
            <span title={!canApply ? (previewInvalid || !pins ? 'Keep at least a few exact words or a list value in the key.' : !changed ? 'No change yet.' : undefined) : undefined}>
              <Button variant="primary" size="sm" onClick={() => { void handleApply(); }} disabled={!canApply}>
                {applyBusy ? 'Applying…' : 'Apply key'}
              </Button>
            </span>
          </div>
        </>
      )}
    </section>
  );
}
