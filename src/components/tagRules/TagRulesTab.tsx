import { useState, useRef } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import type { TagSpecDefinition } from '../../types';
import { exportTagDefinitions, exportSingleTag, importTagDefinitions } from '../../utils';
import { TagRuleCard } from './TagRuleCard';
import { TagWizardModal } from '../wizard/TagWizardModal';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Button } from '../shared/Button';
import { EmptyState } from '../shared/EmptyState';

export function TagRulesTab() {
  const { tagDefinitions, dispatch } = useTagSpecs();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<TagSpecDefinition | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; tag: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    setEditingDef(undefined);
    setWizardOpen(true);
  };

  const handleEdit = (def: TagSpecDefinition) => {
    setEditingDef(def);
    setWizardOpen(true);
  };

  const handleWizardSave = (def: TagSpecDefinition) => {
    if (editingDef) {
      dispatch({ type: 'UPDATE', payload: def });
    } else {
      dispatch({ type: 'ADD', payload: def });
    }
    setWizardOpen(false);
    setEditingDef(undefined);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setEditingDef(undefined);
  };

  const handleDelete = (id: number) => {
    const def = tagDefinitions.find((d) => d.Id === id);
    if (def) setDeleteTarget({ id, tag: def.Tag });
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      dispatch({ type: 'DELETE', payload: { id: deleteTarget.id } });
      setDeleteTarget(null);
    }
  };

  const handleExportAll = () => {
    exportTagDefinitions(tagDefinitions);
  };

  const handleExportSingle = (def: TagSpecDefinition) => {
    exportSingleTag(def);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const defs = await importTagDefinitions(file);
      dispatch({ type: 'IMPORT', payload: defs });
    } catch (err) {
      alert('Failed to import: ' + (err instanceof Error ? err.message : 'Invalid file'));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Tag Rules</h2>
          <p className="text-sm text-gray-500">
            Manage your tag definitions and matching rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            Import
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportAll}
            disabled={tagDefinitions.length === 0}
          >
            Export All
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreate}>
            + New Tag
          </Button>
        </div>
      </div>

      {tagDefinitions.length === 0 ? (
        <EmptyState
          title="No tag rules defined"
          description="Create your first tag rule to start automatically tagging transactions."
          action={<Button variant="primary" onClick={handleCreate}>Create Tag Rule</Button>}
        />
      ) : (
        <div className="space-y-3">
          {tagDefinitions.map((def) => (
            <TagRuleCard
              key={def.Id}
              definition={def}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onExport={handleExportSingle}
            />
          ))}
        </div>
      )}

      {wizardOpen && (
        <TagWizardModal
          existingDef={editingDef}
          onSave={handleWizardSave}
          onClose={handleWizardClose}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Tag Rule"
        message={`Are you sure you want to delete the tag "${deleteTarget?.tag}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
