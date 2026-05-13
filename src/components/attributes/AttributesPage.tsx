import { useState, useMemo, useCallback } from 'react';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../shared/Button';
import { Toast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { AttributeFormModal } from './AttributeFormModal';
import type { BackendAttribute } from '../../types/lov';

export function AttributesPage() {
  const {
    backendAttributes,
    attributesLoading,
    createNewAttribute,
    deleteExistingAttribute,
  } = useLovAttributes();
  const { isAudit } = useAuth();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BackendAttribute | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const filtered = useMemo(() => {
    const active = backendAttributes.filter((a) => a.StatusTag === 'ACTIVE' || a.StatusTag === null);
    if (!search.trim()) return active;
    const term = search.toLowerCase();
    return active.filter((a) => {
      const enName = a.Details.find((d) => d.LanguageCode === 'en')?.Name ?? '';
      return (
        enName.toLowerCase().includes(term) ||
        a.Value.toLowerCase().includes(term)
      );
    });
  }, [backendAttributes, search]);

  const handleCreate = useCallback(() => {
    setFormOpen(true);
  }, []);

  const handleSave = useCallback(async (payload: { Id?: number; Value: string; PossibleLOVTag?: string | null; Details: { LanguageCode: string; Name: string; ShortDescription: string }[] }) => {
    try {
      const sfm = await createNewAttribute({ Value: payload.Value, PossibleLOVTag: payload.PossibleLOVTag, Details: payload.Details });
      setToast({ message: sfm ?? 'Attribute created', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Operation failed', type: 'error' });
      throw err;
    }
  }, [createNewAttribute]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const sfm = await deleteExistingAttribute(deleteTarget.Id);
      setToast({ message: sfm ?? 'Attribute deleted', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Delete failed', type: 'error' });
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteExistingAttribute]);

  const getEnDetail = (attr: BackendAttribute) => attr.Details.find((d) => d.LanguageCode === 'en');

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search attributes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {!isAudit && (
            <Button variant="primary" size="sm" onClick={handleCreate}>
              + Create Attribute
            </Button>
          )}
        </div>
      </div>

      {attributesLoading && backendAttributes.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">Loading attributes…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">
          {search ? 'No attributes match your search.' : 'No attributes found.'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="min-w-full divide-y divide-divide">
            <thead className="bg-surface-secondary">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Value</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Description</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Suggested LOV</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary sticky right-0 z-10 bg-surface-secondary shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.08)]">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {filtered.map((attr) => {
                const en = getEnDetail(attr);
                return (
                  <tr key={attr.Id} className="group hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-2.5 text-xs font-medium text-heading">{en?.Name ?? attr.Value}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary font-mono">{attr.Value}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary">{en?.ShortDescription ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary">{attr.PossibleLOVTag ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right sticky right-0 z-10 bg-surface group-hover:bg-surface-hover shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      {!isAudit && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(attr)}
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
        <AttributeFormModal
          open
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Attribute"
        message={`Are you sure you want to delete "${deleteTarget?.Details.find((d) => d.LanguageCode === 'en')?.Name ?? deleteTarget?.Value}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger_ghost"
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
