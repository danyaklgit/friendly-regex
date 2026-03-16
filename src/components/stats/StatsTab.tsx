import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useAuth } from '../../context/AuthContext';
import { getContextValue } from '../../types/tagSpec';
import { tagSpecLibraryCheckOut, tagSpecLibraryCheckIn, tagSpecLibraryRollback } from '../../api/checkout';
import { exportTagLibraries, exportSingleDefinition, importTagLibraries } from '../../utils/persistence';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Toast } from '../shared/Toast';
import { ComparisonModal } from './ComparisonModal';
import { TagRuleCard } from '../tagRules/TagRuleCard';
import { TagWizardModal } from '../wizard/TagWizardModal';
import type { TepHeaders } from '../../api/transactions';
import type { TagSpecLibrary, TagSpecDefinition } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { useLocalChanges } from '../../hooks/useLocalChanges';

interface StatsTabProps {
  onViewTransactions: (bank: string, side: string) => void;
  onCheckoutComplete: (bank: string, side: string) => void;
  authToken: string | null;
  tepHeaders: TepHeaders | null;
}

const sideLabel: Record<string, string> = {
  CR: 'Credit',
  DR: 'Debit',
  RC: 'Rev. Credit',
  RD: 'Rev. Debit',
};

interface DisplayRow {
  library: TagSpecLibrary;
  bank: string;
  side: string;
  operatorName: string | null;
  isInProgress: boolean;
  isOwnedByMe: boolean;
  hasOperator: boolean;
  inProgressLib: TagSpecLibrary | undefined;
}

export function StatsTab({ onViewTransactions, onCheckoutComplete, authToken, tepHeaders }: StatsTabProps) {
  const { libraries, tagDefinitions, loading, refetchTagSpecs, dispatch } = useTagSpecs();
  const { usersMap, useDummyData, userId } = useAuth();
  const { clearChanges } = useLocalChanges(undefined, undefined);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<DisplayRow | null>(null);
  const [compareTarget, setCompareTarget] = useState<DisplayRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Tag rule management state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<TagSpecDefinition | undefined>(undefined);
  const [editingParentLib, setEditingParentLib] = useState<TagSpecLibrary | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tag: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Background refetch on mount (fires each time user navigates to Overview tab)
  useEffect(() => {
    if (useDummyData) return;
    refetchTagSpecs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo<DisplayRow[]>(() => {
    const referencedIds = new Set(
      libraries.filter(l => l.ActiveTagSpecLibId && l.StatusTag === 'ACTIVE').map(l => l.ActiveTagSpecLibId!)
    );

    const activeLibs = libraries.filter(
      l => l.StatusTag === 'ACTIVE' && l.Id && !referencedIds.has(l.Id)
    );

    const unsorted = activeLibs.map(lib => {
      const inProgressLib = libraries.find(
        l => l.ActiveTagSpecLibId === lib.Id && l.StatusTag === 'INPROGRESS'
      );
      const hasOperator = !!inProgressLib?.OperatorId;
      return {
        library: lib,
        bank: getContextValue(lib.Context, 'BankSwiftCode') ?? '',
        side: getContextValue(lib.Context, 'Side') ?? '',
        operatorName: hasOperator
          ? usersMap.get(inProgressLib!.OperatorId) ?? inProgressLib!.OperatorId
          : null,
        isInProgress: !!inProgressLib,
        hasOperator,
        isOwnedByMe: hasOperator && inProgressLib!.OperatorId === userId,
        inProgressLib,
      };
    });

    // Sort: my checkouts first, then other users' checkouts, then the rest.
    // Within each bucket, sort alphabetically by bank name.
    const bucketOrder = (r: DisplayRow) =>
      r.isOwnedByMe ? 0 : (r.isInProgress && r.hasOperator) ? 1 : 2;

    return unsorted.sort((a, b) => {
      const bucket = bucketOrder(a) - bucketOrder(b);
      if (bucket !== 0) return bucket;
      return a.bank.localeCompare(b.bank);
    });
  }, [libraries, usersMap, userId]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCheckout = useCallback(async (row: DisplayRow) => {
    const checkoutId = row.inProgressLib?.Id ?? row.library.Id;
    if (!authToken || !tepHeaders || !checkoutId) return;
    setActionLoading(row.library.Id!);
    try {
      await tagSpecLibraryCheckOut(checkoutId, authToken, tepHeaders);
      await refetchTagSpecs();
      setToast({ message: `Checked out ${row.bank} / ${row.side}`, type: 'success' });
      onCheckoutComplete(row.bank, row.side);
    } catch {
      setToast({ message: 'Checkout failed', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }, [authToken, tepHeaders, refetchTagSpecs, onCheckoutComplete]);

  const handleCheckin = useCallback(async (row: DisplayRow) => {
    if (!authToken || !tepHeaders || !row.inProgressLib?.Id) return;
    setActionLoading(row.library.Id!);
    try {
      await tagSpecLibraryCheckIn(row.inProgressLib.Id, authToken, tepHeaders);
      refetchTagSpecs();
      setToast({ message: `Checked in ${row.bank} / ${row.side}`, type: 'success' });
    } catch {
      setToast({ message: 'Checkin failed', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }, [authToken, tepHeaders, refetchTagSpecs]);

  const handleRollbackConfirm = useCallback(async () => {
    if (!authToken || !tepHeaders || !rollbackTarget?.inProgressLib?.Id) return;
    setActionLoading(rollbackTarget.library.Id!);
    try {
      await tagSpecLibraryRollback(rollbackTarget.inProgressLib.Id, authToken, tepHeaders);
      clearChanges(rollbackTarget.bank, rollbackTarget.side);
      refetchTagSpecs();
      setToast({ message: `Rolled back ${rollbackTarget.bank} / ${rollbackTarget.side}`, type: 'success' });
    } catch {
      setToast({ message: 'Rollback failed', type: 'error' });
    } finally {
      setActionLoading(null);
      setRollbackTarget(null);
    }
  }, [authToken, tepHeaders, rollbackTarget, refetchTagSpecs, clearChanges]);

  // --- Tag rule CRUD ---

  const handleCreateTag = useCallback(() => {
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    setWizardOpen(true);
  }, []);

  const handleEditTag = useCallback((def: TagSpecDefinition, parentLib?: TagSpecLibrary) => {
    setEditingDef(def);
    setEditingParentLib(parentLib);
    setWizardOpen(true);
  }, []);

  const handleWizardSave = useCallback((result: WizardFormResult) => {
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
  }, [editingDef, dispatch]);

  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
  }, []);

  const handleDeleteTag = useCallback((id: string) => {
    const def = tagDefinitions.find((d) => d.Id === id);
    if (def) setDeleteTarget({ id, tag: def.Tag });
  }, [tagDefinitions]);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      dispatch({ type: 'DELETE', payload: { definitionId: deleteTarget.id } });
      setDeleteTarget(null);
    }
  }, [deleteTarget, dispatch]);

  const handleExportAll = useCallback(() => {
    exportTagLibraries(libraries);
  }, [libraries]);

  const handleExportSingle = useCallback((def: TagSpecDefinition, parentLib?: TagSpecLibrary) => {
    if (parentLib) {
      exportSingleDefinition(def, parentLib);
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [dispatch]);

  // Get the display library for a row (prefer INPROGRESS for showing definitions)
  const getDisplayLib = useCallback((row: DisplayRow): TagSpecLibrary => {
    return row.inProgressLib ?? row.library;
  }, []);

  // Compute set of definition IDs that are new or modified vs the ACTIVE baseline
  const getChangedDefIds = useCallback((row: DisplayRow): Set<string> => {
    if (!row.inProgressLib) return new Set();
    const baseById = new Map(row.library.TagSpecDefinitions.map(d => [d.Id, d]));
    const changed = new Set<string>();
    for (const def of row.inProgressLib.TagSpecDefinitions) {
      const baseDef = baseById.get(def.Id);
      if (!baseDef || JSON.stringify(baseDef) !== JSON.stringify(def)) {
        changed.add(def.Id);
      }
    }
    return changed;
  }, []);

  const canAct = !useDummyData && !!authToken && !!tepHeaders;

  // Show loading skeleton only on initial load (no data yet)
  const showSkeleton = loading && libraries.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm mt-0.5 text-primary-dark">
          Check out a Tag Spec Library to start.
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="ghost" size="xs" onClick={() => fileInputRef.current?.click()}>
            Import
          </Button>
          <Button
            variant="secondary"
            size="xs"
            onClick={handleExportAll}
            disabled={tagDefinitions.length === 0}
          >
            Export All
          </Button>
          <Button variant="primary" size="xs" onClick={handleCreateTag}>
            + New Tag
          </Button>
        </div>
      </div>

      {showSkeleton ? (
        <div className="text-center py-12 text-body-secondary text-sm">Loading libraries...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">No active libraries found.</div>
      ) : (
        <div className="overflow-clip border border-border rounded-lg">
          <table className="min-w-full divide-y divide-divide">
            <thead className="bg-surface-secondary">
              <tr className="flex items-center">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-10 shrink-0"></th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-44 shrink-0">Bank</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-32 shrink-0">Side</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-16 shrink-0">Rules</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-36 shrink-0">Operator</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-24 shrink-0">Status</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary flex-1">Action</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {rows.map((row) => {
                const isLoading = actionLoading === row.library.Id;
                const rowKey = `${row.bank}:${row.side}`;
                const isExpanded = expandedRows.has(rowKey);
                const displayLib = getDisplayLib(row);
                const definitions = displayLib.TagSpecDefinitions;
                return (
                  <tr key={row.library.Id} className="group">
                    <td colSpan={7} className="p-0">
                      {/* Main row — sticky when expanded */}
                      <div className={`flex items-center transition-colors ${isExpanded ? 'sticky top-0 z-10 shadow-sm border-b border-border bg-white! dark:bg-black/80! ' : ''} ${row.isInProgress ? 'bg-primary/5' : isExpanded ? 'bg-surface' : 'hover:bg-surface-hover'}`}>
                        {/* Expand toggle */}
                        <div className="px-4 py-2.5 w-10 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleExpand(rowKey)}
                            className="text-faint hover:text-body-secondary cursor-pointer"
                          >
                            <svg
                              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                        {/* Bank */}
                        <div className="px-4 py-2.5 text-xs font-medium text-heading w-44 shrink-0 cursor-pointer select-none" onClick={() => toggleExpand(rowKey)}>{row.bank}</div>
                        {/* Side */}
                        <div className="px-4 py-2.5 w-32 shrink-0">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold
                            ${row.side === 'CR' ? 'bg-emerald-50 text-emerald-700' : row.side === 'DR' ? 'bg-red-50 text-red-700' : 'bg-surface-tertiary text-body-secondary'}`}>
                            {row.side} {sideLabel[row.side] ? `- ${sideLabel[row.side]}` : ''}
                          </span>
                        </div>
                        {/* Rules count */}
                        <div className="px-4 py-2.5 text-xs text-body-secondary text-right w-16 shrink-0">
                          {definitions.length}
                        </div>
                        {/* Operator */}
                        <div className="px-4 py-2.5 text-xs text-body-secondary w-36 shrink-0 truncate">
                          {row.operatorName
                            ? <span className="text-primary-dark font-medium">{row.operatorName}</span>
                            : <span className="text-faint">-</span>}
                        </div>
                        {/* Status */}
                        <div className="px-4 py-2.5 text-center w-24 shrink-0">
                          <span className={`inline-flex items-center px-2 py-0.5 whitespace-nowrap rounded-full text-[10px] font-medium
                            ${row.isInProgress ? 'bg-primary/15 text-primary-dark' : 'bg-surface-tertiary text-muted'}`}>
                            {row.isInProgress ? 'In Progress' : 'Active'}
                          </span>
                        </div>
                        {/* Actions */}
                        <div className="px-4 py-2.5 text-end flex-1">
                          <div className="flex items-center justify-end gap-2">
                            {row.isInProgress && (
                              <Button variant="ghost" size="xs" onClick={() => setCompareTarget(row)} disabled={isLoading}>
                                Compare
                              </Button>
                            )}
                            {row.isOwnedByMe && (
                              <Button variant="danger_ghost" size="xs" onClick={() => setRollbackTarget(row)} disabled={isLoading}>
                                Rollback
                              </Button>
                            )}
                            {row.isOwnedByMe && (
                              <Button variant="primary" size="xs" onClick={() => handleCheckin(row)} disabled={isLoading}>
                                Checkin
                              </Button>
                            )}
                            {(!row.isInProgress || (row.isInProgress && !row.hasOperator)) && (
                              <Button variant="primary" size="xs" onClick={() => handleCheckout(row)} disabled={!canAct || isLoading}>
                                Checkout
                              </Button>
                            )}
                            <Button variant="ghost" size="xs" onClick={() => onViewTransactions(row.bank, row.side)} disabled={isLoading}>
                              View Transactions
                            </Button>
                          </div>
                        </div>
                      </div>
                      {/* Expanded definitions */}
                      {isExpanded && (() => {
                        const changedIds = getChangedDefIds(row);
                        const sorted = [...definitions].sort((a, b) => {
                          const aChanged = changedIds.has(a.Id) ? 0 : 1;
                          const bChanged = changedIds.has(b.Id) ? 0 : 1;
                          return aChanged - bChanged;
                        });
                        return (
                          <div className="border-t border-border-subtle bg-surface-secondary/50 px-6 py-4">
                            {sorted.length === 0 ? (
                              <p className="text-sm text-faint text-center py-4">No tag definitions in this library.</p>
                            ) : (
                              <div className="space-y-3">
                                {sorted.map((def) => (
                                  <div key={def.Id} className={changedIds.has(def.Id) ? 'rounded-lg ring-1 ring-amber-300 bg-amber-50/40 dark:bg-amber-900/10 dark:ring-amber-700' : ''}>
                                    <TagRuleCard
                                      definition={def}
                                      parentLib={displayLib}
                                      onEdit={handleEditTag}
                                      onDelete={handleDeleteTag}
                                      onExport={handleExportSingle}
                                      readOnly={!row.isOwnedByMe}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!rollbackTarget}
        onClose={() => setRollbackTarget(null)}
        onConfirm={handleRollbackConfirm}
        title="Rollback Changes"
        message={`Are you want to roll back to the production version of ${rollbackTarget?.bank ?? ''} / ${rollbackTarget?.side ?? ''} ? This cannot be undone.`}
        confirmLabel="Rollback"
        variant="danger_ghost"
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Tag Rule"
        message={`Are you sure you want to delete the tag "${deleteTarget?.tag}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger_ghost"
      />

      {compareTarget && compareTarget.inProgressLib && (
        <ComparisonModal
          open
          onClose={() => setCompareTarget(null)}
          activeLib={compareTarget.library}
          inProgressLib={compareTarget.inProgressLib}
        />
      )}

      {wizardOpen && (
        <TagWizardModal
          existingDef={editingDef}
          parentLib={editingParentLib}
          onSave={handleWizardSave}
          onClose={handleWizardClose}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
