import { useState, useMemo, useCallback } from 'react';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { Input } from '../shared/Input';
import { Toast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { AttributeFormModal } from './AttributeFormModal';
import type { BackendAttribute } from '../../types/lov';

export function AttributesPage() {
  const {
    backendAttributes,
    attributesLoading,
    createNewAttribute,
    updateExistingAttribute,
    toggleAttributeStatus,
    deleteExistingAttribute,
  } = useLovAttributes();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BackendAttribute | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<BackendAttribute | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return backendAttributes;
    const term = search.toLowerCase();
    return backendAttributes.filter((a) => {
      const enName = a.Details.find((d) => d.LanguageCode === 'en')?.Name ?? '';
      return (
        enName.toLowerCase().includes(term) ||
        a.Value.toLowerCase().includes(term)
      );
    });
  }, [backendAttributes, search]);

  const handleCreate = useCallback(() => {
    setEditTarget(undefined);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((attr: BackendAttribute) => {
    setEditTarget(attr);
    setFormOpen(true);
  }, []);

  const handleSave = useCallback(async (payload: { Id?: number; Value: string; PossibleLOVTag?: string | null; Details: { LanguageCode: string; Name: string; ShortDescription: string }[] }) => {
    try {
      if (payload.Id) {
        await updateExistingAttribute({ Id: payload.Id, Value: payload.Value, PossibleLOVTag: payload.PossibleLOVTag, Details: payload.Details });
        setToast({ message: 'Attribute updated', type: 'success' });
      } else {
        await createNewAttribute({ Value: payload.Value, PossibleLOVTag: payload.PossibleLOVTag, Details: payload.Details });
        setToast({ message: 'Attribute created', type: 'success' });
      }
    } catch {
      setToast({ message: 'Operation failed', type: 'error' });
      throw new Error('save failed');
    }
  }, [createNewAttribute, updateExistingAttribute]);

  const handleToggle = useCallback(async (attr: BackendAttribute) => {
    const isActive = attr.StatusTag === 'ACTIVE' || attr.StatusTag === null;
    try {
      await toggleAttributeStatus(attr.Id, !isActive);
      setToast({ message: isActive ? 'Attribute disabled' : 'Attribute enabled', type: 'success' });
    } catch {
      setToast({ message: 'Toggle failed', type: 'error' });
    }
  }, [toggleAttributeStatus]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteExistingAttribute(deleteTarget.Id);
      setToast({ message: 'Attribute deleted', type: 'success' });
    } catch {
      setToast({ message: 'Delete failed', type: 'error' });
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteExistingAttribute]);

  const getEnDetail = (attr: BackendAttribute) => attr.Details.find((d) => d.LanguageCode === 'en');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-heading">Attributes</h2>
          <Badge variant="default" size="xs">{backendAttributes.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search attributes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!py-1 !text-xs w-56"
          />
          <Button variant="primary" size="xs" onClick={handleCreate}>
            Create Attribute
          </Button>
        </div>
      </div>

      {attributesLoading && backendAttributes.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">Loading attributes…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">
          {search ? 'No attributes match your search.' : 'No attributes found.'}
        </div>
      ) : (
        <div className="overflow-clip border border-border rounded-lg">
          <table className="min-w-full divide-y divide-divide">
            <thead className="bg-surface-secondary">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Value</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Description</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Suggested LOV</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Status</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {filtered.map((attr) => {
                const en = getEnDetail(attr);
                const isActive = attr.StatusTag === 'ACTIVE' || attr.StatusTag === null;
                return (
                  <tr key={attr.Id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-2.5 text-xs font-medium text-heading">{en?.Name ?? attr.Value}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary font-mono">{attr.Value}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary">{en?.ShortDescription ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary">{attr.PossibleLOVTag ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant={isActive ? 'success' : 'warning'} size="xs">
                        {isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="xs" onClick={() => handleEdit(attr)}>Edit</Button>
                        <Button
                          variant={isActive ? 'danger_ghost' : 'ghost'}
                          size="xs"
                          onClick={() => handleToggle(attr)}
                        >
                          {isActive ? 'Disable' : 'Enable'}
                        </Button>
                        <Button variant="danger_ghost" size="xs" onClick={() => setDeleteTarget(attr)}>
                          Delete
                        </Button>
                      </div>
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
          onClose={() => { setFormOpen(false); setEditTarget(undefined); }}
          onSave={handleSave}
          existing={editTarget}
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
