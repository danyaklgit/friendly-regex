import { useState, useRef } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import type { TagSpecDefinition, TagSpecLibrary } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { getContextValue } from '../../types/tagSpec';
import { exportTagLibraries, exportSingleDefinition, importTagLibraries } from '../../utils/persistence';
import { TagRuleCard } from './TagRuleCard';
import { TagWizardModal } from '../wizard/TagWizardModal';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Button } from '../shared/Button';
import { EmptyState } from '../shared/EmptyState';
import { Toast } from '../shared/Toast';

export function TagRulesTab() {
  const { libraries, tagDefinitions, dispatch } = useTagSpecs();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<TagSpecDefinition | undefined>(undefined);
  const [editingParentLib, setEditingParentLib] = useState<TagSpecLibrary | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tag: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleCreate = () => {
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    setWizardOpen(true);
  };

  const handleEdit = (def: TagSpecDefinition, parentLib?: TagSpecLibrary) => {
    setEditingDef(def);
    setEditingParentLib(parentLib);
    setWizardOpen(true);
  };

  const handleWizardSave = (result: WizardFormResult) => {
    if (editingDef) {
      dispatch({ type: 'UPDATE', payload: result });
      setToast({ message: `Tag '${result.definition.Tag}' updated`, type: 'success' });
    } else {
      dispatch({ type: 'ADD', payload: result });
      setToast({ message: `Tag '${result.definition.Tag}' created`, type: 'success' });
    }
    setWizardOpen(false);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
  };

  const handleDelete = (id: string) => {
    const def = tagDefinitions.find((d) => d.Id === id);
    if (def) setDeleteTarget({ id, tag: def.Tag });
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      dispatch({ type: 'DELETE', payload: { definitionId: deleteTarget.id } });
      setDeleteTarget(null);
    }
  };

  const handleExportAll = () => {
    exportTagLibraries(libraries);
  };

  const handleExportSingle = (def: TagSpecDefinition, parentLib?: TagSpecLibrary) => {
    if (parentLib) {
      exportSingleDefinition(def, parentLib);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importTagLibraries(file);
      dispatch({ type: 'IMPORT', payload: imported });
      const count = imported.reduce((sum, lib) => sum + lib.TagSpecDefinitions.length, 0);
      setToast({ message: `Imported ${count} tag definition(s)`, type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to import: ' + (err instanceof Error ? err.message : 'Invalid file'), type: 'error' });
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

      {libraries.length === 0 ? (
        <EmptyState
          title="No tag rules defined"
          description="Create your first tag rule to start automatically tagging transactions."
          action={<Button variant="primary" onClick={handleCreate}>Create Tag Rule</Button>}
        />
      ) : (
        <div className="space-y-6">
          {libraries.map((lib) => {
            const side = getContextValue(lib.Context, 'Side') ?? '?';
            const bank = getContextValue(lib.Context, 'BankSwiftCode') ?? '?';
            return (
              <div key={lib.Id}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {side} / {bank}
                  <span className="ml-2 text-gray-400 normal-case font-normal">
                    ({lib.TagSpecDefinitions.length} rule{lib.TagSpecDefinitions.length !== 1 ? 's' : ''})
                  </span>
                </h3>
                <div className="space-y-3">
                  {lib.TagSpecDefinitions.map((def) => (
                    <TagRuleCard
                      key={def.Id}
                      definition={def}
                      parentLib={lib}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onExport={handleExportSingle}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {wizardOpen && (
        <TagWizardModal
          existingDef={editingDef}
          parentLib={editingParentLib}
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

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
