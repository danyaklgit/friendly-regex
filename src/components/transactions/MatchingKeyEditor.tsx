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
  humanizeKeyTokens,
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

/**
 * "Matching key" section of the suggestion drawer (matching-keys delta,
 * 2026-09-07). Renders the key as chips; the checked-out operator can correct
 * it: click a chip → "This part is…" (a list value, any text, a number, an
 * amount, Arabic text, keep the exact words, remove), or select words in an
 * example → "Mark as…" the same choices plus "Add to list…" (a new bank
 * becomes vocabulary instead of a one-off fix). Every change previews its
 * effect ("32 → 47 · merges 2 groups", debounced ~400 ms) before Apply, which
 * stores the edit (SaveKeyEdit) and regroups the workspace through the
 * existing sampling-run poll. An edited key shows who/when and offers
 * "Return to automatic key" (DeleteKeyEdit).
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
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [note, setNote] = useState('');

  // Reset the working copy whenever the drawer shows a different suggestion.
  useEffect(() => {
    setEditing(false);
    setWorkTokens(baseTokens);
    setMenuIndex(null);
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

  // --- Chip menu actions ----------------------------------------------------
  const [listPickerFor, setListPickerFor] = useState<number | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [keepWordsFor, setKeepWordsFor] = useState<number | null>(null);
  const [keepWordsText, setKeepWordsText] = useState('');

  const closeMenus = useCallback(() => {
    setMenuIndex(null);
    setListPickerFor(null);
    setKeepWordsFor(null);
    setListSearch('');
    setKeepWordsText('');
  }, []);

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
  const exampleBoxRef = useRef<HTMLDivElement>(null);
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

  const menuToken = menuIndex != null ? workTokens[menuIndex] : null;
  const sourceCount = preview?.Groups.find((g) => g.IsSource)?.Count ?? suggestion.CoverageCount;
  const merges = preview ? Math.max(preview.Groups.length - 1, 0) : 0;

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Matching key</p>
        {!editing && canEdit && workspace && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
          >
            Edit key
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

      <div className="rounded-lg border border-border bg-surface px-3 py-2">
        <KeyTokenChips
          tokens={editing ? workTokens : baseTokens}
          onChipClick={editing ? (i) => { setMenuIndex(i === menuIndex ? null : i); setListPickerFor(null); setKeepWordsFor(null); } : undefined}
          selectedIndex={editing ? menuIndex : null}
        />
        {!editing && (
          <p className="mt-1.5 text-[10px] text-faint">{humanizeKeyTokens(baseTokens)}</p>
        )}
      </div>

      {editing && (
        <>
          {/* Chip menu: "This part is…" */}
          {menuToken && (
            <div className="mt-2 rounded-lg border border-border-strong bg-surface-elevated shadow-sm px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1.5">
                This part is…
              </p>
              {listPickerFor === menuIndex ? (
                <div>
                  <input
                    type="text"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search lists…"
                    className="w-full mb-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-body outline-none focus:border-primary"
                  />
                  <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-0.5">
                    {vocab === null && <p className="text-[11px] text-faint italic px-1 py-0.5">Loading lists…</p>}
                    {pickableLists
                      .filter((l) => l.ListTag.toLowerCase().includes(listSearch.trim().toLowerCase()))
                      .map((l) => (
                        <button
                          key={l.ListTag}
                          type="button"
                          onClick={() => assignList(menuIndex!, l)}
                          className="w-full text-left px-2 py-1 rounded text-xs text-body hover:bg-surface-hover cursor-pointer flex items-center justify-between gap-2"
                        >
                          <span className="font-medium truncate">{l.ListTag}</span>
                          <span className="text-[10px] text-faint whitespace-nowrap">
                            {l.Behavior === 'KeepItem' ? 'keeps items apart' : l.Behavior === 'Collapse' ? `${l.UsableKeys} keys` : 'off — enable in Settings'}
                          </span>
                        </button>
                      ))}
                    {vocab !== null && pickableLists.length === 0 && (
                      <p className="text-[11px] text-faint italic px-1 py-0.5">No lists available.</p>
                    )}
                  </div>
                </div>
              ) : keepWordsFor === menuIndex ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    dir="auto"
                    value={keepWordsText}
                    onChange={(e) => setKeepWordsText(e.target.value)}
                    placeholder="The exact words from the example"
                    className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-body outline-none focus:border-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => keepExactWords(menuIndex!, keepWordsText)}
                    disabled={!keepWordsText.trim() || keepWordsText.includes('<')}
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setListPickerFor(menuIndex)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-teal-300 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800 hover:opacity-80 cursor-pointer"
                  >
                    A value from a list…
                  </button>
                  {MARK_CHOICES.map((c) => (
                    <button
                      key={c.text}
                      type="button"
                      onClick={() => assignPlaceholder(menuIndex!, c.text)}
                      className="text-[11px] px-2 py-1 rounded-lg border border-border-strong bg-surface text-body hover:bg-surface-hover cursor-pointer"
                    >
                      {c.label}
                    </button>
                  ))}
                  {menuToken.Kind !== 'Literal' && (
                    <button
                      type="button"
                      onClick={() => { setKeepWordsFor(menuIndex); setKeepWordsText(''); }}
                      className="text-[11px] px-2 py-1 rounded-lg border border-border-strong bg-surface text-body hover:bg-surface-hover cursor-pointer"
                    >
                      Keep the exact words…
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeChip(menuIndex!)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800 hover:opacity-80 cursor-pointer"
                  >
                    Remove from key
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Selection marking on an example. */}
          {(suggestion.ExampleTexts?.length ?? 0) > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1">
                Or select words in an example…
              </p>
              <div
                ref={exampleBoxRef}
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

          {/* Effect preview + field modes. */}
          <div className="mt-2 rounded-lg border border-border bg-surface-secondary/50 px-3 py-2 min-h-[2.25rem]">
            {!changed ? (
              <p className="text-[11px] text-faint italic">Click a chip or select words in the example to correct the key.</p>
            ) : previewInvalid ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Keep at least a few exact words or a list value in the key.
              </p>
            ) : previewLoading || !preview ? (
              <p className="text-[11px] text-faint italic animate-pulse">Previewing the effect…</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-heading font-medium">
                  Represents {sourceCount.toLocaleString()} → {preview.MatchCount.toLocaleString()} transactions
                  {merges > 0 && <span className="text-body-secondary font-normal"> · merges {merges} group{merges === 1 ? '' : 's'}</span>}
                </p>
                {preview.Groups.length > 0 && (
                  <ul className="space-y-0.5">
                    {preview.Groups.slice(0, 6).map((g) => (
                      <li key={g.SimilarSetId} dir="auto" className="text-[10px] text-body-secondary font-mono truncate">
                        {g.IsSource ? '● ' : '○ '}{g.Anchor} · {g.Count.toLocaleString()}
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

          {/* Note + Cancel / Apply. */}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional) — why this key was corrected"
              className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-body outline-none focus:border-primary"
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
