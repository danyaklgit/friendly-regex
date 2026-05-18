import { useState, useMemo, useCallback } from 'react';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../shared/Button';
import { Toast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ExtractionFormModal } from './ExtractionFormModal';
import type { BackendExtraction } from '../../types/lov';

export function ExtractionsPage() {
  const {
    backendExtractions,
    extractionsLoading,
    extractionMethods,
    createNewExtraction,
    deleteExistingExtraction,
  } = useLovAttributes();
  const { isAudit } = useAuth();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BackendExtraction | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Look up the regex for a given extraction Value. The CRUD API doesn't
  // return Tags, but the EXTRACTIONS LOV does — match by Name (the LOV item's
  // Name equals the EN detail Name on each extraction).
  const regexByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of extractionMethods) {
      map.set(m.label, m.regex);
    }
    return map;
  }, [extractionMethods]);

  const filtered = useMemo(() => {
    const active = backendExtractions.filter((e) => e.StatusTag === 'ACTIVE' || e.StatusTag === null);
    if (!search.trim()) return active;
    const term = search.toLowerCase();
    return active.filter((e) => {
      const enName = e.Details.find((d) => d.LanguageCode === 'en')?.Name ?? '';
      const enDesc = e.Details.find((d) => d.LanguageCode === 'en')?.ShortDescription ?? '';
      return (
        enName.toLowerCase().includes(term) ||
        e.Value.toLowerCase().includes(term) ||
        enDesc.toLowerCase().includes(term)
      );
    });
  }, [backendExtractions, search]);

  const handleCreate = useCallback(() => {
    setFormOpen(true);
  }, []);

  const handleSave = useCallback(async (payload: { Id?: number; Value: string; Regex: string; Details: { LanguageCode: string; Name: string; ShortDescription: string }[] }) => {
    try {
      const sfm = await createNewExtraction({ Value: payload.Value, Regex: payload.Regex, Details: payload.Details });
      setToast({ message: sfm ?? 'Extraction created', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Operation failed', type: 'error' });
      throw err;
    }
  }, [createNewExtraction]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const sfm = await deleteExistingExtraction(deleteTarget.Id);
      setToast({ message: sfm ?? 'Extraction deleted', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Delete failed', type: 'error' });
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteExistingExtraction]);

  const getEnDetail = (ext: BackendExtraction) => ext.Details.find((d) => d.LanguageCode === 'en');

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search extractions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {!isAudit && (
            <Button variant="primary" size="sm" onClick={handleCreate}>
              + Create Extraction
            </Button>
          )}
        </div>
      </div>

      {extractionsLoading && backendExtractions.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">Loading extractions…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">
          {search ? 'No extractions match your search.' : 'No extractions found.'}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar border border-border rounded-lg">
          <table className="min-w-full divide-y divide-divide">
            <thead className="bg-surface-secondary sticky top-0 z-20">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Value</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Regex</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Description</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary sticky right-0 z-30 bg-surface-secondary border-l border-border-strong shadow-[-16px_0_24px_-8px_rgba(15,23,42,0.55)] dark:shadow-[-16px_0_24px_-8px_rgba(8,145,178,0.35)]">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {filtered.map((ext) => {
                const en = getEnDetail(ext);
                const regex = en?.Name ? regexByValue.get(en.Name) : undefined;
                return (
                  <tr key={ext.Id} className="group hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-2.5 text-xs font-medium text-heading">{en?.Name ?? ext.Value}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary font-mono">{ext.Value}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary font-mono break-all max-w-md">{regex ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary">{en?.ShortDescription ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right sticky right-0 z-10 bg-surface-secondary group-hover:bg-surface-hover border-l border-border-strong shadow-[-16px_0_24px_-8px_rgba(15,23,42,0.55)] dark:shadow-[-16px_0_24px_-8px_rgba(8,145,178,0.35)]">
                      {!isAudit && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(ext)}
                          className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-muted hover:text-red-600 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <ExtractionFormModal
          open
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Extraction"
        message={`Are you sure you want to delete "${deleteTarget?.Details.find((d) => d.LanguageCode === 'en')?.Name ?? deleteTarget?.Value}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger_ghost"
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
