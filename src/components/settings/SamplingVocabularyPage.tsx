import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import type { TepHeaders } from '../../api/transactions';
import {
  getSamplingVocabulary,
  saveSamplingVocabulary,
  type VocabularyBehavior,
  type VocabularyListInfo,
} from '../../api/sampling';
import { Button } from '../shared/Button';
import { Toast } from '../shared/Toast';

const BEHAVIOR_OPTIONS: { value: VocabularyBehavior; label: string; hint: string }[] = [
  { value: 'Collapse', label: 'Collapse', hint: 'Any value of the list masks to one placeholder (<BANKS>) — statements that differ only in the value land in one group, and the draft extracts it back as an attribute.' },
  { value: 'KeepItem', label: 'Keep item', hint: 'Spelling variants unify but items stay apart (<CARD_TYPES:Visa> vs <CARD_TYPES:Mastercard>).' },
  { value: 'Off', label: 'Off', hint: 'The list takes no part in key masking.' },
];

/**
 * Settings → Sampling vocabulary (matching-keys delta, 2026-09-07). The LOV
 * lists are the sampling engine's masking vocabulary: this page decides which
 * lists take part in matching keys and how (Collapse / Keep item / Off),
 * their priority order, the minimum key length, and the slash-pair rule for
 * short codes. Internal lists show read-only ("Never"). Saves apply at the
 * NEXT sampling run — the banner says so and the Resample button lives in the
 * Curated View.
 */
export function SamplingVocabularyPage() {
  const { isAudit, getAuthHeaders, refreshIfNeeded, userId } = useAuth();
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

  const getToken = useCallback(async (): Promise<string> => {
    await refreshIfNeeded();
    const auth = getAuthHeaders().Authorization ?? '';
    return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  }, [getAuthHeaders, refreshIfNeeded]);

  const [rows, setRows] = useState<VocabularyListInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    if (!tepHeaders) return;
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const lists = await getSamplingVocabulary(token, tepHeaders);
      setRows(lists);
      setDirty(false);
    } catch (err) {
      setRows(null);
      setLoadError(err instanceof Error ? err.message : 'Failed to load the sampling vocabulary');
    } finally {
      setLoading(false);
    }
  }, [tepHeaders, getToken]);

  useEffect(() => { void load(); }, [load]);

  const updateRow = useCallback((tag: string, patch: Partial<VocabularyListInfo>) => {
    setRows((prev) => prev?.map((r) => (r.ListTag === tag ? { ...r, ...patch, IsDefault: false } : r)) ?? prev);
    setDirty(true);
    setSavedBanner(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!rows || !tepHeaders) return;
    setSaving(true);
    try {
      const token = await getToken();
      // The contract: send the FULL set of non-internal lists as shown.
      const payload = rows
        .filter((r) => !r.IsInternal && r.Behavior !== 'Never')
        .map((r) => ({
          ListTag: r.ListTag,
          Behavior: r.Behavior,
          Priority: r.Priority,
          MinKeyLength: r.MinKeyLength,
          ShortCodesInSlashPair: r.ShortCodesInSlashPair,
        }));
      const effective = await saveSamplingVocabulary(payload, userId ?? '', token, tepHeaders);
      if (effective.length > 0) setRows(effective);
      setDirty(false);
      setSavedBanner(true);
      setToast({ message: 'Sampling vocabulary saved', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to save the sampling vocabulary', type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [rows, tepHeaders, userId, getToken]);

  const readOnly = isAudit;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-start justify-between gap-4 mb-3 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-heading">Sampling vocabulary</h2>
          <p className="text-xs text-body-secondary mt-0.5 max-w-2xl">
            The LOV lists double as the Curated View's masking vocabulary: a bank name in a narrative
            masks to a placeholder, so statements that differ only in the bank land in one group and the
            draft rule extracts the bank back out. Changes apply at the next Resample.
          </p>
        </div>
        {!readOnly && (
          <Button variant="primary" size="sm" onClick={() => { void handleSave(); }} disabled={!dirty || saving} loading={saving}>
            Save
          </Button>
        )}
      </div>

      {savedBanner && (
        <div className="mb-2 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          Saved. Applies at the next Resample — start one from the Curated View when you want the new
          vocabulary now.
        </div>
      )}

      {loading ? (
        <p className="text-xs text-faint italic animate-pulse">Loading vocabulary…</p>
      ) : loadError || !rows ? (
        <div className="text-xs text-body-secondary">
          <p className="mb-2">{loadError ?? 'The sampling vocabulary is unavailable.'}</p>
          <Button variant="outline" size="sm" onClick={() => { void load(); }}>Retry</Button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-secondary z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
                <th className="px-3 py-2 font-semibold">List</th>
                <th className="px-3 py-2 font-semibold text-right">Active items</th>
                <th className="px-3 py-2 font-semibold text-right" title="Distinct names/aliases/codes long enough to match under the minimum key length. 0 explains why a list never masks.">Usable keys</th>
                <th className="px-3 py-2 font-semibold">Behavior</th>
                <th className="px-3 py-2 font-semibold text-right" title="Lower runs first when several lists could claim the same words.">Priority</th>
                <th className="px-3 py-2 font-semibold text-right" title="Keys with fewer letters/digits than this never match as free words.">Min key length</th>
                <th className="px-3 py-2 font-semibold" title="Short codes match only glued to a slash (VISA/MC).">Short codes in slash pairs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const internal = r.IsInternal || r.Behavior === 'Never';
                return (
                  <tr key={r.ListTag} className={`border-t border-border-subtle ${internal ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-1.5 font-medium text-heading whitespace-nowrap">
                      {r.ListTag}
                      {r.IsDefault && !internal && (
                        <span className="ml-1.5 text-[9px] font-normal text-faint uppercase tracking-wide">default</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-body-secondary">{r.ActiveItems.toLocaleString()}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.UsableKeys === 0 && !internal && r.Behavior !== 'Off' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-body-secondary'}`}>
                      {r.UsableKeys.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">
                      {internal ? (
                        <span className="text-body-secondary italic" title="Internal lists never take part in key masking.">Never</span>
                      ) : (
                        <select
                          value={r.Behavior}
                          disabled={readOnly}
                          onChange={(e) => updateRow(r.ListTag, { Behavior: e.target.value as VocabularyBehavior })}
                          className="rounded-lg border border-border bg-surface px-1.5 py-0.5 text-xs text-body outline-none focus:border-primary disabled:opacity-60"
                          title={BEHAVIOR_OPTIONS.find((o) => o.value === r.Behavior)?.hint}
                        >
                          {BEHAVIOR_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} title={o.hint}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {internal ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={r.Priority}
                          disabled={readOnly}
                          onChange={(e) => updateRow(r.ListTag, { Priority: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-16 rounded-lg border border-border bg-surface px-1.5 py-0.5 text-xs text-body text-right outline-none focus:border-primary disabled:opacity-60"
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {internal ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={r.MinKeyLength}
                          disabled={readOnly}
                          onChange={(e) => updateRow(r.ListTag, { MinKeyLength: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })}
                          className="w-14 rounded-lg border border-border bg-surface px-1.5 py-0.5 text-xs text-body text-right outline-none focus:border-primary disabled:opacity-60"
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {internal ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={r.ShortCodesInSlashPair}
                          disabled={readOnly}
                          onChange={(e) => updateRow(r.ListTag, { ShortCodesInSlashPair: e.target.checked })}
                          className="cursor-pointer disabled:cursor-not-allowed"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
