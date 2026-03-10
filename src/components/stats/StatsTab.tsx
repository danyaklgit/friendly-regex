import { useState, useMemo, useCallback } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useAuth } from '../../context/AuthContext';
import { getContextValue } from '../../types/tagSpec';
import { tagSpecLibraryCheckOut, tagSpecLibraryCheckIn, tagSpecLibraryRollback } from '../../api/checkout';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Toast } from '../shared/Toast';
import { ComparisonModal } from './ComparisonModal';
import type { TepHeaders } from '../../api/transactions';
import type { TagSpecLibrary } from '../../types';

interface StatsTabProps {
  onViewTransactions: (bank: string, side: string) => void;
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
  isCheckedOut: boolean;
  inProgressLib: TagSpecLibrary | undefined;
}

export function StatsTab({ onViewTransactions, authToken, tepHeaders }: StatsTabProps) {
  const { libraries, loading, refetchTagSpecs } = useTagSpecs();
  const { usersMap, useDummyData } = useAuth();

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<DisplayRow | null>(null);
  const [compareTarget, setCompareTarget] = useState<DisplayRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const rows = useMemo<DisplayRow[]>(() => {
    const referencedIds = new Set(
      libraries.filter(l => l.ActiveTagSpecLibId && l.StatusTag === 'ACTIVE').map(l => l.ActiveTagSpecLibId!)
    );

    const activeLibs = libraries.filter(
      l => l.StatusTag === 'ACTIVE' && l.Id && !referencedIds.has(l.Id)
    );

    return activeLibs.map(lib => {
      const inProgressLib = libraries.find(
        l => l.ActiveTagSpecLibId === lib.Id && l.StatusTag === 'INPROGRESS'
      );
      return {
        library: lib,
        bank: getContextValue(lib.Context, 'BankSwiftCode') ?? '',
        side: getContextValue(lib.Context, 'Side') ?? '',
        operatorName: inProgressLib
          ? usersMap.get(inProgressLib.OperatorId) ?? inProgressLib.OperatorId
          : null,
        isInProgress: !!inProgressLib,
        isCheckedOut: !!inProgressLib && !!inProgressLib.OperatorId,
        inProgressLib,
      };
    });
  }, [libraries, usersMap]);

  const handleCheckout = useCallback(async (row: DisplayRow) => {
    if (!authToken || !tepHeaders || !row.library.Id) return;
    setActionLoading(row.library.Id);
    try {
      await tagSpecLibraryCheckOut(row.library.Id, authToken, tepHeaders);
      refetchTagSpecs();
      setToast({ message: `Checked out ${row.bank} / ${row.side}`, type: 'success' });
    } catch {
      setToast({ message: 'Checkout failed', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }, [authToken, tepHeaders, refetchTagSpecs]);

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
      refetchTagSpecs();
      setToast({ message: `Rolled back ${rollbackTarget.bank} / ${rollbackTarget.side}`, type: 'success' });
    } catch {
      setToast({ message: 'Rollback failed', type: 'error' });
    } finally {
      setActionLoading(null);
      setRollbackTarget(null);
    }
  }, [authToken, tepHeaders, rollbackTarget, refetchTagSpecs]);

  const canAct = !useDummyData && !!authToken && !!tepHeaders;

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm mt-0.5 text-right text-primary-dark">
          Check out a Tag Spec Library to start.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-body-secondary text-sm">Loading libraries...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">No active libraries found.</div>
      ) : (
        <div className="overflow-hidden border border-border rounded-lg">
          <table className="min-w-full divide-y divide-divide">
            <thead className="bg-surface-secondary">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Bank</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Side</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Total</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Untagged</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Multi-tagged</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Missing Mandatory</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Missing Optional</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Operator</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Status</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Action</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {rows.map((row) => {
                const isLoading = actionLoading === row.library.Id;
                return (
                  <tr key={row.library.Id} className={`transition-colors ${row.isInProgress ? 'bg-primary/5' : 'hover:bg-surface-hover'}`}>
                    <td className="px-4 py-2.5 text-xs font-medium text-heading">{row.bank}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold
                        ${row.side === 'CR' ? 'bg-emerald-50 text-emerald-700' : row.side === 'DR' ? 'bg-red-50 text-red-700' : 'bg-surface-tertiary text-body-secondary'}`}>
                        {row.side} {sideLabel[row.side] ? `- ${sideLabel[row.side]}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-faint text-right">-</td>
                    <td className="px-4 py-2.5 text-xs text-faint text-right">-</td>
                    <td className="px-4 py-2.5 text-xs text-faint text-right">-</td>
                    <td className="px-4 py-2.5 text-xs text-faint text-right">-</td>
                    <td className="px-4 py-2.5 text-xs text-faint text-right">-</td>
                    <td className="px-4 py-2.5 text-xs text-body-secondary">
                      {row.operatorName
                        ? <span className="text-primary-dark font-medium">{row.operatorName}</span>
                        : <span className="text-faint">-</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                        ${row.isInProgress ? 'bg-primary/15 text-primary-dark' : 'bg-surface-tertiary text-muted'}`}>
                        {row.isInProgress ? 'In Progress' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      {row.isInProgress ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="xs" onClick={() => setCompareTarget(row)} disabled={isLoading}>
                            Compare
                          </Button>
                          {row.isCheckedOut && (
                            <Button variant="danger_ghost" size="xs" onClick={() => setRollbackTarget(row)} disabled={isLoading}>
                              Rollback
                            </Button>
                          )}
                          <Button variant="primary" size="xs" onClick={() => handleCheckin(row)} disabled={isLoading}>
                            Checkin
                          </Button>
                          <Button variant="primary" size="xs" onClick={() => onViewTransactions(row.bank, row.side)} disabled={isLoading}>
                            View Transactions
                          </Button>
                        </div>
                      ) : (
                        <Button variant="primary" size="xs" onClick={() => handleCheckout(row)} disabled={!canAct || isLoading}>
                          Checkout
                        </Button>
                      )}
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
        message={`Are you sure you want to rollback all changes for ${rollbackTarget?.bank ?? ''} / ${rollbackTarget?.side ?? ''}? This cannot be undone.`}
        confirmLabel="Rollback"
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

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
