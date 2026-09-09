import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { Toggle } from '../shared/Toggle';
import { Tooltip } from '../shared/Tooltip';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import type { TepHeaders } from '../../api/transactions';
import {
  getExportProfiles,
  saveExportProfile,
  deleteExportProfile,
  type GetExportProfilesResponse,
} from '../../api/downloadCenter';
import { ApiError } from '../../api/apiError';
import type {
  ExportColumnInfo,
  ExportColumnSelection,
  ExportContext,
  ExportProfile,
} from '../../types/downloadCenter';
import {
  normalizeSelection,
  selectionsEquivalent,
  selectionExportsNothing,
  type NormalizedAttributeRule,
  type NormalizedKeyRule,
} from '../../utils/exportSelection';
import { isLedger } from '../../utils/libraryIdentity';

/**
 * The export prompt (UI_Export_Profiles.md, backend §9.1c): instead of firing
 * the export immediately, the operator sees which columns the file will have,
 * includes / excludes / reorders them, decides what happens to the dynamic
 * blocks (custom fields, attributes, intraday recommendations), and can save
 * the layout as a shared profile. Everything here is data-driven from
 * GetExportProfiles — profiles pre-ranked for the workspace, the suggested
 * one pre-selected, the column catalogue with labels and groups, and the
 * custom-field / attribute keys a Listed rule can name. No column names are
 * hard-coded.
 */

const LEDGER_GROUPS = new Set(['Ledger', 'Ledger document', 'Ledger line']);

interface ExportPromptModalProps {
  open: boolean;
  onClose: () => void;
  /** The workspace, sent to GetExportProfiles (ranking) and echoed on the
   *  export itself (usage counting). Memoized by the caller. */
  exportContext: ExportContext;
  /** Intraday workspace (MT942 / Interim): show the MT940 recommendations
   *  row; the export keeps sending the two live flags there, as today. */
  intraday: boolean;
  /** The workspace's two live recommendation toggles — the recommendations
   *  row edits the SAME state the toolbar toggle uses, so there is one
   *  source of truth and the sent flags always mirror what's on screen. */
  includeRecommendations: boolean;
  onIncludeRecommendationsChange: (v: boolean) => void;
  matchTransactionType: boolean;
  onMatchTransactionTypeChange: (v: boolean) => void;
  /** Visible row count of the current filter, shown next to Export. */
  rowCount?: number | null;
  /** Queue the export. Resolves true on success (the dialog closes), false
   *  when the caller surfaced an error and the dialog should stay open. */
  onExport: (choice: { profileId?: string; selection?: ExportColumnSelection }) => Promise<boolean>;
}

// --- Included-columns row (drag-to-reorder via dnd-kit, same pattern as
// --- TransformationList) ----------------------------------------------------

interface IncludedRowProps {
  id: string;
  index: number;
  label: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function IncludedColumnRow({ id, index, label, isFirst, isLast, onMoveUp, onMoveDown, onRemove }: IncludedRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs text-body bg-surface ${isDragging ? 'opacity-60 relative z-10' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-faint hover:text-body-secondary shrink-0 px-0.5"
        title="Drag to reorder"
        aria-label={`Reorder ${label}`}
      >
        <svg width="10" height="14" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="3" r="1.3" /><circle cx="7" cy="3" r="1.3" />
          <circle cx="3" cy="8" r="1.3" /><circle cx="7" cy="8" r="1.3" />
          <circle cx="3" cy="13" r="1.3" /><circle cx="7" cy="13" r="1.3" />
        </svg>
      </button>
      <span className="w-6 text-right text-[10px] text-faint tabular-nums shrink-0">{index + 1}.</span>
      <span className="flex-1 truncate" title={id}>{label}</span>
      <button
        type="button"
        onClick={onMoveUp}
        disabled={isFirst}
        className="text-faint hover:text-body-secondary disabled:opacity-30 px-0.5"
        title="Move up"
        aria-label={`Move ${label} up`}
      >
        ▲
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={isLast}
        className="text-faint hover:text-body-secondary disabled:opacity-30 px-0.5"
        title="Move down"
        aria-label={`Move ${label} down`}
      >
        ▼
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-faint hover:text-red-500 px-0.5"
        title="Remove from the export"
        aria-label={`Remove ${label}`}
      >
        ×
      </button>
    </div>
  );
}

// --- Dynamic-block rule editor (custom fields / OPS attrs / ACTIVE attrs) ---

interface KeyRuleBlockProps {
  title: string;
  hint: string;
  /** Keys the workspace knows (GetExportProfiles), for the Choose… list. */
  availableKeys: string[];
  rule: NormalizedKeyRule;
  onChange: (next: NormalizedKeyRule) => void;
  /** Attribute blocks only: the "Also include the JSON column" checkbox. */
  json?: { checked: boolean; onChange: (v: boolean) => void };
}

function KeyRuleBlock({ title, hint, availableKeys, rule, onChange, json }: KeyRuleBlockProps) {
  // A profile may list keys this workspace doesn't know (a listed key the
  // batch lacks still gets its blank column) — keep them choosable.
  const allKeys = useMemo(() => {
    const seen = new Set(availableKeys);
    return [...availableKeys, ...rule.Keys.filter((k) => !seen.has(k))];
  }, [availableKeys, rule.Keys]);

  const setMode = (mode: NormalizedKeyRule['Mode']) => onChange({ Mode: mode, Keys: mode === 'Listed' ? rule.Keys : [] });
  const toggleKey = (key: string) =>
    onChange({
      Mode: 'Listed',
      Keys: rule.Keys.includes(key) ? rule.Keys.filter((k) => k !== key) : [...rule.Keys, key],
    });
  const moveKey = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= rule.Keys.length) return;
    const next = [...rule.Keys];
    [next[index], next[to]] = [next[to], next[index]];
    onChange({ Mode: 'Listed', Keys: next });
  };

  const modeBtn = (mode: NormalizedKeyRule['Mode'], label: string) => (
    <button
      type="button"
      onClick={() => setMode(mode)}
      aria-pressed={rule.Mode === mode}
      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
        rule.Mode === mode
          ? 'bg-primary/10 border-primary/30 text-primary-dark dark:text-primary font-medium'
          : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-40">
          <p className="text-xs font-medium text-body">{title}</p>
          <p className="text-[11px] text-muted">{hint}</p>
        </div>
        <div className="flex items-center gap-1">
          {modeBtn('All', 'All')}
          {modeBtn('None', 'None')}
          {modeBtn('Listed', 'Choose…')}
        </div>
        {json && (
          <label className="flex items-center gap-1.5 text-[11px] text-body cursor-pointer select-none ml-2">
            <input
              type="checkbox"
              checked={json.checked}
              onChange={(e) => json.onChange(e.target.checked)}
              className="rounded border-border-strong"
            />
            Also include the JSON column
          </label>
        )}
      </div>
      {rule.Mode === 'Listed' && (
        <div className="mt-2 space-y-1.5">
          {rule.Keys.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {rule.Keys.map((key, i) => (
                <span key={key} className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 border border-primary/20 pl-1.5 pr-0.5 py-0.5 text-[11px] text-primary-dark dark:text-primary">
                  <span className="text-[9px] text-faint tabular-nums">{i + 1}</span>
                  <span className="font-mono">{key}</span>
                  <button type="button" onClick={() => moveKey(i, -1)} disabled={i === 0} className="px-0.5 disabled:opacity-30 hover:text-primary" title="Move earlier" aria-label={`Move ${key} earlier`}>‹</button>
                  <button type="button" onClick={() => moveKey(i, 1)} disabled={i === rule.Keys.length - 1} className="px-0.5 disabled:opacity-30 hover:text-primary" title="Move later" aria-label={`Move ${key} later`}>›</button>
                  <button type="button" onClick={() => toggleKey(key)} className="px-0.5 hover:text-red-500" title="Remove" aria-label={`Remove ${key}`}>×</button>
                </span>
              ))}
            </div>
          )}
          {allKeys.length === 0 ? (
            <p className="text-[11px] text-faint">No keys known for this workspace — pick All to follow the batch, or leave None.</p>
          ) : (
            <div className="max-h-28 overflow-y-auto custom-scrollbar rounded-md border border-border divide-y divide-divide">
              {allKeys.map((key) => (
                <label key={key} className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-body cursor-pointer hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={rule.Keys.includes(key)}
                    onChange={() => toggleKey(key)}
                    className="rounded border-border-strong"
                  />
                  <span className="font-mono truncate">{key}</span>
                </label>
              ))}
            </div>
          )}
          {rule.Keys.length === 0 && allKeys.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">No keys picked — this block will export nothing.</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- The prompt --------------------------------------------------------------

export function ExportPromptModal({
  open,
  onClose,
  exportContext,
  intraday,
  includeRecommendations,
  onIncludeRecommendationsChange,
  matchTransactionType,
  onMatchTransactionTypeChange,
  rowCount,
  onExport,
}: ExportPromptModalProps) {
  const { getAuthHeaders, refreshIfNeeded, userId } = useAuth();
  const tepConfig = useTepConfig();

  const tepHeaders = useMemo<TepHeaders | null>(() => {
    if (!userId) return null;
    return {
      userId,
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
  }, [userId, tepConfig]);

  const getTepAuth = useCallback(async (): Promise<{ token: string; headers: TepHeaders }> => {
    await refreshIfNeeded();
    const token = (getAuthHeaders().Authorization ?? '').replace('Bearer ', '');
    if (!token || !tepHeaders) throw new Error('Not authenticated');
    return { token, headers: tepHeaders };
  }, [getAuthHeaders, refreshIfNeeded, tepHeaders]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<GetExportProfilesResponse | null>(null);
  // Mutable working copy of the ranked list — save/delete update it in place
  // so the prompt doesn't have to refetch (usage numbers only move when an
  // export is queued, which closes the prompt anyway).
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');

  // The working selection, spread over editable pieces. Recommendations are
  // NOT part of it — the recommendations row edits the workspace's live
  // toggles (props), which are sent as the top-level export flags and win
  // over any stored rule.
  const [columns, setColumns] = useState<string[]>([]);
  const [cfRule, setCfRule] = useState<NormalizedKeyRule>({ Mode: 'All', Keys: [] });
  const [opsRule, setOpsRule] = useState<NormalizedAttributeRule>({ Mode: 'All', Keys: [], Json: true });
  const [attrRule, setAttrRule] = useState<NormalizedAttributeRule>({ Mode: 'All', Keys: [], Json: true });

  const [search, setSearch] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'saveAs' | 'delete' | 'export'>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.Id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const applySelectionFrom = useCallback((profile: ExportProfile) => {
    const n = normalizeSelection(profile.Selection);
    setColumns(n.Columns);
    setCfRule(n.CustomFields);
    setOpsRule(n.OpsAttributes);
    setAttrRule(n.Attributes);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { token, headers } = await getTepAuth();
      const res = await getExportProfiles(exportContext, token, headers);
      setData(res);
      setProfiles(res.Profiles);
      const suggested =
        res.Profiles.find((p) => p.Id === res.SuggestedProfileId) ?? res.Profiles[0] ?? null;
      if (suggested) {
        setSelectedId(suggested.Id);
        const n = normalizeSelection(suggested.Selection);
        setColumns(n.Columns);
        setCfRule(n.CustomFields);
        setOpsRule(n.OpsAttributes);
        setAttrRule(n.Attributes);
      } else {
        setSelectedId('');
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load export profiles.');
    } finally {
      setLoading(false);
    }
  }, [exportContext, getTepAuth]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSaveAsOpen(false);
    setSaveAsName('');
    setConfirmDeleteOpen(false);
    setBusy(null);
    setActionError(null);
    setNotice(null);
    void load();
    // Refetch only on open — the context can't change while the prompt is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // --- Derived selection state ---

  const workingSelection = useMemo<ExportColumnSelection>(() => {
    // When the selection goes out as an ad-hoc export or a save, carry a
    // Recommendations rule too: the live toggles in intraday workspaces
    // (they're what the flags will say anyway), the profile's stored rule
    // elsewhere (the row is hidden there, so don't invent an edit).
    const storedRec = normalizeSelection(selectedProfile?.Selection).Recommendations;
    return {
      Columns: columns,
      CustomFields: { Mode: cfRule.Mode, ...(cfRule.Mode === 'Listed' ? { Keys: cfRule.Keys } : {}) },
      OpsAttributes: { Mode: opsRule.Mode, ...(opsRule.Mode === 'Listed' ? { Keys: opsRule.Keys } : {}), Json: opsRule.Json },
      Attributes: { Mode: attrRule.Mode, ...(attrRule.Mode === 'Listed' ? { Keys: attrRule.Keys } : {}), Json: attrRule.Json },
      Recommendations: intraday
        ? { Include: includeRecommendations, MatchTransactionType: matchTransactionType }
        : storedRec,
    };
  }, [columns, cfRule, opsRule, attrRule, intraday, includeRecommendations, matchTransactionType, selectedProfile]);

  const dirty = selectedProfile ? !selectionsEquivalent(workingSelection, selectedProfile.Selection) : true;
  const exportsNothing = selectionExportsNothing(workingSelection);

  // --- Column catalogue views ---

  const columnById = useMemo(() => {
    const map = new Map<string, ExportColumnInfo>();
    for (const c of data?.Columns ?? []) map.set(c.Id, c);
    return map;
  }, [data]);

  const includedSet = useMemo(() => new Set(columns), [columns]);

  const ledgerWorkspace = isLedger(exportContext.DataSetType);
  const visibleGroups = useMemo(() => {
    if (!data) return [];
    const order: string[] = [];
    const byGroup = new Map<string, ExportColumnInfo[]>();
    for (const c of data.Columns) {
      // Statement workspaces hide the three Ledger groups (their columns are
      // always blank there). What's already INCLUDED is never filtered — a
      // profile may legitimately include columns blank for this workspace.
      if (!ledgerWorkspace && LEDGER_GROUPS.has(c.Group)) continue;
      if (search) {
        const q = search.toLowerCase();
        if (!c.Label.toLowerCase().includes(q) && !c.Id.toLowerCase().includes(q)) continue;
      }
      if (!byGroup.has(c.Group)) {
        byGroup.set(c.Group, []);
        order.push(c.Group);
      }
      byGroup.get(c.Group)!.push(c);
    }
    return order.map((g) => ({ group: g, cols: byGroup.get(g)! }));
  }, [data, ledgerWorkspace, search]);

  const toggleColumn = useCallback((id: string) => {
    setColumns((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }, []);

  const moveColumn = useCallback((index: number, dir: -1 | 1) => {
    setColumns((prev) => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumns((prev) => {
      const from = prev.indexOf(String(active.id));
      const to = prev.indexOf(String(over.id));
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // --- Profile actions ---

  const mergeSavedProfile = useCallback((saved: ExportProfile) => {
    setProfiles((prev) =>
      prev.map((p) =>
        p.Id === saved.Id
          ? {
              ...saved,
              // The save response doesn't re-rank; keep the computed usage
              // numbers the prompt opened with.
              Usage: saved.Usage ?? p.Usage,
              UsageForContext: p.UsageForContext,
              TotalUsage: p.TotalUsage,
              IsSuggested: p.IsSuggested,
            }
          : p,
      ),
    );
  }, []);

  const handleProfileSwitch = useCallback(
    (id: string) => {
      setSelectedId(id);
      setActionError(null);
      setNotice(null);
      const profile = profiles.find((p) => p.Id === id);
      if (profile) applySelectionFrom(profile);
    },
    [profiles, applySelectionFrom],
  );

  const handleSave = useCallback(async () => {
    if (!selectedProfile) return;
    setBusy('save');
    setActionError(null);
    setNotice(null);
    try {
      const { token, headers } = await getTepAuth();
      const { Profile, IgnoredColumns } = await saveExportProfile(
        {
          Id: selectedProfile.Id,
          Name: selectedProfile.Name,
          Description: selectedProfile.Description ?? undefined,
          Selection: workingSelection,
        },
        token,
        headers,
      );
      mergeSavedProfile(Profile);
      applySelectionFrom(Profile);
      setNotice(
        IgnoredColumns.length > 0
          ? `Saved, but the server didn't recognise and dropped: ${IgnoredColumns.join(', ')}`
          : `Saved "${Profile.Name}".`,
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save the export profile.');
    } finally {
      setBusy(null);
    }
  }, [selectedProfile, workingSelection, getTepAuth, mergeSavedProfile, applySelectionFrom]);

  const handleSaveAs = useCallback(async () => {
    const name = saveAsName.trim();
    if (!name) return;
    setBusy('saveAs');
    setActionError(null);
    setNotice(null);
    try {
      const { token, headers } = await getTepAuth();
      const { Profile, IgnoredColumns } = await saveExportProfile(
        { Name: name, Selection: workingSelection },
        token,
        headers,
      );
      setProfiles((prev) => [...prev, Profile]);
      setSelectedId(Profile.Id);
      applySelectionFrom(Profile);
      setSaveAsOpen(false);
      setSaveAsName('');
      setNotice(
        IgnoredColumns.length > 0
          ? `Saved "${Profile.Name}", but the server didn't recognise and dropped: ${IgnoredColumns.join(', ')}`
          : `Saved "${Profile.Name}".`,
      );
    } catch (e) {
      // The only client-uncaught 400 on a create is the unique-name rule
      // (empty selections and blank names are gated before the call).
      if (e instanceof ApiError && e.status === 400) {
        setActionError('A profile with this name exists.');
      } else {
        setActionError(e instanceof Error ? e.message : 'Failed to save the export profile.');
      }
    } finally {
      setBusy(null);
    }
  }, [saveAsName, workingSelection, getTepAuth, applySelectionFrom]);

  const handleDelete = useCallback(async () => {
    if (!selectedProfile || selectedProfile.IsBuiltIn) return;
    setBusy('delete');
    setActionError(null);
    setNotice(null);
    try {
      const { token, headers } = await getTepAuth();
      await deleteExportProfile(selectedProfile.Id, token, headers);
      const remaining = profiles.filter((p) => p.Id !== selectedProfile.Id);
      setProfiles(remaining);
      const next =
        remaining.find((p) => p.Id === data?.SuggestedProfileId) ?? remaining[0] ?? null;
      if (next) {
        setSelectedId(next.Id);
        applySelectionFrom(next);
      } else {
        setSelectedId('');
      }
      setNotice(`Deleted "${selectedProfile.Name}".`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete the export profile.');
    } finally {
      setBusy(null);
    }
  }, [selectedProfile, profiles, data, getTepAuth, applySelectionFrom]);

  const handleReset = useCallback(() => {
    if (selectedProfile) applySelectionFrom(selectedProfile);
    setActionError(null);
    setNotice(null);
  }, [selectedProfile, applySelectionFrom]);

  const handleExport = useCallback(async () => {
    if (exportsNothing) return;
    setBusy('export');
    setActionError(null);
    try {
      const choice =
        !dirty && selectedProfile
          ? { profileId: selectedProfile.Id }
          : { selection: workingSelection };
      const ok = await onExport(choice);
      if (ok) onClose();
    } finally {
      setBusy(null);
    }
  }, [exportsNothing, dirty, selectedProfile, workingSelection, onExport, onClose]);

  // --- Profile bar presentation ---

  const profileOptions = useMemo(
    () =>
      profiles.map((p) => ({
        value: p.Id,
        label: `${p.Name}${p.IsSuggested ? ' — Suggested' : ''}${p.IsBuiltIn ? ' (built-in)' : ''}`,
      })),
    [profiles],
  );

  const usageBadge = useMemo(() => {
    if (!selectedProfile?.IsSuggested) return null;
    const here = selectedProfile.UsageForContext ?? 0;
    if (here > 0) return `Suggested · used ${here} time${here === 1 ? '' : 's'} here`;
    const overall = selectedProfile.TotalUsage ?? 0;
    if (overall > 0) return `Suggested · used ${overall} time${overall === 1 ? '' : 's'} overall`;
    return 'Suggested';
  }, [selectedProfile]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Export transactions"
        widthClass="max-w-5xl"
        footer={
          <>
            {exportsNothing && !loading && !loadError && (
              <span className="mr-auto self-center text-xs text-red-600 dark:text-rose-400">
                Pick at least one column.
              </span>
            )}
            {rowCount != null && rowCount >= 0 && !exportsNothing && (
              <span className="mr-auto self-center text-xs text-muted">
                {rowCount.toLocaleString()} row{rowCount === 1 ? '' : 's'} in the current filter
              </span>
            )}
            <Button variant="secondary" onClick={onClose} disabled={busy === 'export'}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleExport}
              disabled={loading || !!loadError || exportsNothing || busy !== null}
              loading={busy === 'export'}
            >
              Export
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted">
            <svg className="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading export profiles…
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-red-600 dark:text-rose-400">{loadError}</p>
            <Button variant="secondary" size="xs" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* A. Profile bar */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-56">
                <Select
                  label="Profile"
                  options={profileOptions}
                  value={selectedId}
                  onChange={(e) => handleProfileSwitch(e.target.value)}
                  disabled={profiles.length === 0}
                />
              </div>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => void handleSave()}
                disabled={!selectedProfile || !dirty || exportsNothing || busy !== null}
                loading={busy === 'save'}
                title="Save the edited selection back into this profile"
              >
                Save
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => { setSaveAsOpen((v) => !v); setActionError(null); }}
                disabled={exportsNothing || busy !== null}
                title="Save the current selection as a new profile"
              >
                Save as…
              </Button>
              {selectedProfile?.IsBuiltIn ? (
                <Tooltip content="Built-in profiles can be edited, not deleted" placement="top">
                  <span>
                    <Button variant="ghost" size="xs" disabled className="text-red-400">
                      Delete
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={!selectedProfile || busy !== null}
                  loading={busy === 'delete'}
                  className="text-red-400 hover:text-red-500"
                >
                  Delete
                </Button>
              )}
              <Button
                variant="ghost"
                size="xs"
                onClick={handleReset}
                disabled={!selectedProfile || !dirty || busy !== null}
                title="Discard edits and reload the selected profile"
              >
                Reset
              </Button>
            </div>

            {/* Badges + notices */}
            {(usageBadge || selectedProfile?.IsBuiltIn || dirty || notice || actionError) && (
              <div className="flex flex-wrap items-center gap-2 -mt-2 text-[11px]">
                {usageBadge && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary-dark dark:text-primary px-2 py-0.5 font-medium">
                    {usageBadge}
                  </span>
                )}
                {selectedProfile?.IsBuiltIn && (
                  <span className="inline-flex items-center rounded-full bg-surface-hover text-body-secondary px-2 py-0.5">
                    Built-in
                  </span>
                )}
                {dirty && selectedProfile && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5">
                    Edited — export sends these columns once, or Save to keep them
                  </span>
                )}
                {notice && <span className="text-emerald-600 dark:text-emerald-400">{notice}</span>}
                {actionError && !saveAsOpen && <span className="text-red-600 dark:text-rose-400">{actionError}</span>}
              </div>
            )}

            {/* Save as… inline form */}
            {saveAsOpen && (
              <div className="flex items-end gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2">
                <div className="flex-1 max-w-xs">
                  <Input
                    label="New profile name"
                    value={saveAsName}
                    onChange={(e) => setSaveAsName(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Recon — SABB"
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveAs(); }}
                  />
                </div>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => void handleSaveAs()}
                  disabled={!saveAsName.trim() || exportsNothing || busy !== null}
                  loading={busy === 'saveAs'}
                >
                  Create
                </Button>
                <Button variant="ghost" size="xs" onClick={() => { setSaveAsOpen(false); setSaveAsName(''); setActionError(null); }}>
                  Cancel
                </Button>
                {actionError && <span className="text-[11px] text-red-600 dark:text-rose-400 self-center">{actionError}</span>}
              </div>
            )}

            {/* B. Column picker */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-surface-secondary">
                  <p className="text-xs font-semibold uppercase tracking-wide text-body-secondary mb-1.5">Available columns</p>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search columns…"
                    aria-label="Search columns"
                  />
                </div>
                <div className="h-64 overflow-y-auto custom-scrollbar">
                  {visibleGroups.map(({ group, cols }) => (
                    <div key={group}>
                      <p className="sticky top-0 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-faint bg-surface-secondary/95 backdrop-blur-sm">
                        {group}
                      </p>
                      {cols.map((c) => {
                        const included = includedSet.has(c.Id);
                        return (
                          <label
                            key={c.Id}
                            className={`flex items-center gap-2 px-3 py-1 text-xs cursor-pointer hover:bg-surface-hover ${included ? 'text-faint' : 'text-body'}`}
                            title={c.Id}
                          >
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={() => toggleColumn(c.Id)}
                              className="rounded border-border-strong"
                            />
                            <span className="truncate">{c.Label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  {visibleGroups.length === 0 && (
                    <p className="px-3 py-4 text-xs text-faint">No columns match "{search}".</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-secondary">
                  <p className="text-xs font-semibold uppercase tracking-wide text-body-secondary">
                    Included · {columns.length}
                  </p>
                  <p className="text-[10px] text-faint">Top to bottom = column order in the file</p>
                </div>
                <div className="h-78 overflow-y-auto custom-scrollbar divide-y divide-divide">
                  {columns.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-faint">
                      No fixed columns — the file will only carry the dynamic blocks below.
                    </p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis]}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext items={columns} strategy={verticalListSortingStrategy}>
                        {columns.map((id, i) => (
                          <IncludedColumnRow
                            key={id}
                            id={id}
                            index={i}
                            label={columnById.get(id)?.Label ?? id}
                            isFirst={i === 0}
                            isLast={i === columns.length - 1}
                            onMoveUp={() => moveColumn(i, -1)}
                            onMoveDown={() => moveColumn(i, 1)}
                            onRemove={() => toggleColumn(id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>
            </div>

            {/* C. Dynamic blocks */}
            <div className="flex flex-col gap-2">
              <KeyRuleBlock
                title="Custom fields"
                hint="The feed's own named fields (CF_ columns)."
                availableKeys={data?.CustomFieldKeys ?? []}
                rule={cfRule}
                onChange={setCfRule}
              />
              <KeyRuleBlock
                title="Extracted attributes (OPS layer)"
                hint="OpsAttr_ columns from the in-progress tagging."
                availableKeys={data?.AttributeKeys ?? []}
                rule={opsRule}
                onChange={(next) => setOpsRule((prev) => ({ ...prev, ...next }))}
                json={{ checked: opsRule.Json, onChange: (v) => setOpsRule((prev) => ({ ...prev, Json: v })) }}
              />
              <KeyRuleBlock
                title="Published attributes (ACTIVE layer)"
                hint="Attr_ columns from the released libraries."
                availableKeys={data?.AttributeKeys ?? []}
                rule={attrRule}
                onChange={(next) => setAttrRule((prev) => ({ ...prev, ...next }))}
                json={{ checked: attrRule.Json, onChange: (v) => setAttrRule((prev) => ({ ...prev, Json: v })) }}
              />
              {intraday && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="flex-1 min-w-40">
                    <p className="text-xs font-medium text-body">MT940 recommendations</p>
                    <p className="text-[11px] text-muted">
                      The matching MT940 rules on untagged intraday rows — the workspace's live toggles.
                    </p>
                  </div>
                  <Toggle label="Include recommendations" checked={includeRecommendations} onChange={onIncludeRecommendationsChange} />
                  <Toggle
                    label="Match transaction type"
                    checked={matchTransactionType}
                    onChange={onMatchTransactionTypeChange}
                    disabled={!includeRecommendations}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        title="Delete export profile"
        message={`Delete "${selectedProfile?.Name ?? ''}" for every operator? Files already exported with it keep their layout.`}
        confirmLabel="Delete"
      />
    </>
  );
}
