import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Toggle } from '../shared/Toggle';
import { useOptionalDownloadCenter } from '../../context/DownloadCenterContext';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import type { TepHeaders } from '../../api/transactions';
import { getLOVLists } from '../../api/lovManagement';
import type { LOVCatalogEntry } from '../../types/lov';
import { EXPORT_TOPICS, type ExportTopic } from '../../api/downloadCenter';
import { identityFromContext, isLedger } from '../../utils/libraryIdentity';
import { DATA_SET_TYPE_LABELS, type DataSetType } from '../../constants/dataSetTypes';

const TOPIC_LABELS: Record<ExportTopic, string> = {
  TagSpecLibraries: 'Tag Spec Libraries',
  LOVs: 'LOVs',
  VIPCustomers: 'VIP Customers',
  Extractions: 'Extractions',
  Attributes: 'Attributes',
  TagsHierarchy: 'Tags Hierarchy',
};

interface CentralExportModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Central export dialog (ExportConfiguration, backend 2026-09-02): pick topics
 * (all pre-checked = everything), optionally narrow Tag Spec Libraries /
 * LOVs to specific entries, choose zip-per-topic (default) or one JSON file.
 * The build lands in the Download Center exactly like a transactions export
 * (FileType CONFIGURATION_EXPORT, EXPORT_READY / EXPORT_FAILED lifecycle).
 * The per-screen export buttons are untouched — this is one more way out.
 */
export function CentralExportModal({ open, onClose }: CentralExportModalProps) {
  const downloadCenter = useOptionalDownloadCenter();
  const { libraries } = useTagSpecs();
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

  const [topics, setTopics] = useState<Set<ExportTopic>>(new Set(EXPORT_TOPICS));
  const [libraryIds, setLibraryIds] = useState<Set<string>>(new Set());
  const [lovTags, setLovTags] = useState<Set<string>>(new Set());
  const [asZip, setAsZip] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  // LOV catalog for the narrowing pick — fetched on open; unavailable
  // (pre-deploy) just disables narrowing, exporting all LOVs still works.
  const [lovCatalog, setLovCatalog] = useState<LOVCatalogEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setTopics(new Set(EXPORT_TOPICS));
    setLibraryIds(new Set());
    setLovTags(new Set());
    setAsZip(true);
    setSubmitting(false);
    setError(null);
    setQueued(false);
    if (!tepHeaders) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshIfNeeded();
        const token = (getAuthHeaders().Authorization ?? '').replace('Bearer ', '');
        const lists = await getLOVLists(token, tepHeaders);
        if (!cancelled) setLovCatalog(lists);
      } catch {
        if (!cancelled) setLovCatalog(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // One row per library, newest identity ordering as the Backlog shows them.
  const libraryOptions = useMemo(() => {
    return libraries
      .filter((lib) => !!lib.Id)
      .map((lib) => {
        const idn = identityFromContext(lib);
        const scope = isLedger(lib.DataSetType) ? `${idn.clientCode}/${idn.erpCode}` : `${idn.bank}/${idn.side}`;
        const typeLabel = DATA_SET_TYPE_LABELS[lib.DataSetType as DataSetType] ?? lib.DataSetType;
        return { id: lib.Id!, label: `${scope} · ${typeLabel} · ${lib.StatusTag}` };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [libraries]);

  const toggleTopic = useCallback((topic: ExportTopic) => {
    setTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  }, []);

  const toggleIn = (set: Set<string>, value: string): Set<string> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const canExport = topics.size > 0 && !submitting && !!downloadCenter;

  const handleExport = async () => {
    if (!canExport || !downloadCenter) return;
    setSubmitting(true);
    setError(null);
    try {
      await downloadCenter.triggerConfigurationExport({
        Topics: [...EXPORT_TOPICS].filter((t) => topics.has(t)),
        ...(topics.has('TagSpecLibraries') && libraryIds.size > 0 ? { TagSpecLibraryIds: [...libraryIds] } : {}),
        ...(topics.has('LOVs') && lovTags.size > 0 ? { LOVTags: [...lovTags] } : {}),
        AsZip: asZip,
      });
      setQueued(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed to queue');
    } finally {
      setSubmitting(false);
    }
  };

  const pickerBox = 'max-h-40 overflow-y-auto custom-scrollbar rounded-lg border border-border bg-surface divide-y divide-divide';
  const pickerRow = 'flex items-center gap-2 px-3 py-1.5 text-xs text-body cursor-pointer hover:bg-surface-hover';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Central Export"
      widthClass="max-w-2xl"
      zClass="z-[70]"
      footer={
        queued ? (
          <>
            <Button
              variant="secondary"
              onClick={() => { onClose(); downloadCenter?.openModal(); }}
            >
              Open Download Center
            </Button>
            <Button variant="primary" onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleExport} disabled={!canExport} loading={submitting}>
              Export
            </Button>
          </>
        )
      }
    >
      {queued ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-sm font-medium text-heading">Export queued</p>
          <p className="text-xs text-body-secondary">
            The file is being built — it will appear in the Download Center with its status, same as a transactions export.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-body-secondary">
            Everything is selected by default. Narrow the topics — and, for Tag Spec Libraries and LOVs, the specific entries — then Export. The build lands in the Download Center.
          </p>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-body-secondary mb-1.5">Topics</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {EXPORT_TOPICS.map((topic) => (
                <label key={topic} className="flex items-center gap-2 text-xs text-body cursor-pointer select-none rounded-lg border border-border px-2.5 py-1.5 hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={topics.has(topic)}
                    onChange={() => toggleTopic(topic)}
                    className="rounded border-border-strong"
                  />
                  {TOPIC_LABELS[topic]}
                </label>
              ))}
            </div>
            {topics.size === 0 && (
              <p className="text-xs text-red-600 dark:text-rose-400 mt-1.5">Select at least one topic to export.</p>
            )}
          </div>

          {topics.has('TagSpecLibraries') && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-body-secondary">Tag Spec Libraries</p>
                <p className="text-[11px] text-muted">
                  {libraryIds.size === 0 ? 'All libraries' : `${libraryIds.size} of ${libraryOptions.length} selected`}
                  {libraryIds.size > 0 && (
                    <button type="button" className="ml-2 text-primary hover:underline" onClick={() => setLibraryIds(new Set())}>All</button>
                  )}
                </p>
              </div>
              <div className={pickerBox}>
                {libraryOptions.map((opt) => (
                  <label key={opt.id} className={pickerRow}>
                    <input
                      type="checkbox"
                      checked={libraryIds.has(opt.id)}
                      onChange={() => setLibraryIds((prev) => toggleIn(prev, opt.id))}
                      className="rounded border-border-strong"
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                ))}
                {libraryOptions.length === 0 && <p className="px-3 py-2 text-xs text-faint">No libraries loaded.</p>}
              </div>
              <p className="text-[11px] text-muted mt-1">No selection = every library. A checked-out draft exports as the current state.</p>
            </div>
          )}

          {topics.has('LOVs') && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-body-secondary">LOV lists</p>
                <p className="text-[11px] text-muted">
                  {lovTags.size === 0 ? 'All lists' : `${lovTags.size} of ${lovCatalog?.length ?? 0} selected`}
                  {lovTags.size > 0 && (
                    <button type="button" className="ml-2 text-primary hover:underline" onClick={() => setLovTags(new Set())}>All</button>
                  )}
                </p>
              </div>
              {lovCatalog === null ? (
                <p className="text-xs text-faint">List narrowing unavailable — every LOV list will be exported.</p>
              ) : (
                <div className={pickerBox}>
                  {lovCatalog.map((entry) => (
                    <label key={entry.Tag} className={pickerRow}>
                      <input
                        type="checkbox"
                        checked={lovTags.has(entry.Tag)}
                        onChange={() => setLovTags((prev) => toggleIn(prev, entry.Tag))}
                        className="rounded border-border-strong"
                      />
                      <span className="truncate">{entry.Name || entry.Tag}</span>
                      <span className="ml-auto text-[10px] text-faint shrink-0">{entry.ItemsCount}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-xs font-medium text-body">Zip per topic</p>
              <p className="text-[11px] text-muted">
                {asZip
                  ? 'One zip with a JSON file per topic plus a manifest.'
                  : 'A single JSON file with every selected topic inside.'}
              </p>
            </div>
            <Toggle label="" checked={asZip} onChange={setAsZip} />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
