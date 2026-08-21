import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import { Button } from '../shared/Button';
import { Toast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { VIPCustomerFormModal } from './VIPCustomerFormModal';
import { downloadCsv } from '../../utils/exportCsv';
import {
  groupByOrg,
  vipExportRows,
  VIP_EXPORT_HEADERS,
  sameOrgIban,
  accountNameFor,
} from '../../utils/vipCustomers';
import { getVIPCustomers, saveVIPCustomer, deleteVIPCustomer, type VIPCustomer } from '../../api/vipCustomers';
import type { TepHeaders } from '../../api/transactions';

export function VIPCustomersPage() {
  const { getAuthHeaders, userId, isAudit } = useAuth();
  const tepConfig = useTepConfig();

  const tepHeaders: TepHeaders = useMemo(() => ({
    userId: userId ?? '',
    tenantCode: tepConfig.ttpTenantCode,
    languageCode: tepConfig.languageCode,
    timeZone: tepConfig.timeZone,
    requestId: tepConfig.ttpRequestId,
  }), [userId, tepConfig]);

  const [customers, setCustomers] = useState<VIPCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VIPCustomer | null>(null);
  const [prefillOrg, setPrefillOrg] = useState<{ OrgId: string; OrgNames: VIPCustomer['OrgNames']; TenantCode?: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VIPCustomer | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const token = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!token) { setLoading(false); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const list = await getVIPCustomers(token, tepHeaders, controller.signal);
      if (!controller.signal.aborted) setCustomers(list);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Failed to load VIP customers.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [getAuthHeaders, tepHeaders]);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const term = search.toLowerCase();
    return customers.filter((c) => {
      const org = c.OrgNames.map((n) => n.OrgName).join(' ').toLowerCase();
      const acct = (c.AccountNames ?? []).map((n) => n.AccountName).join(' ').toLowerCase();
      return (
        org.includes(term) ||
        acct.includes(term) ||
        c.OrgId.toLowerCase().includes(term) ||
        c.IBAN.toLowerCase().includes(term) ||
        (c.BankCode ?? '').toLowerCase().includes(term)
      );
    });
  }, [customers, search]);

  const groups = useMemo(() => groupByOrg(filtered), [filtered]);

  const handleCreate = useCallback(() => {
    setEditTarget(null);
    setPrefillOrg(null);
    setFormOpen(true);
  }, []);

  const handleAddToOrg = useCallback((orgId: string) => {
    const first = customers.find((c) => c.OrgId === orgId);
    setEditTarget(null);
    setPrefillOrg({ OrgId: orgId, OrgNames: first?.OrgNames ?? [], TenantCode: first?.TenantCode });
    setFormOpen(true);
  }, [customers]);

  const handleEdit = useCallback((c: VIPCustomer) => {
    setEditTarget(c);
    setPrefillOrg(null);
    setFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditTarget(null);
    setPrefillOrg(null);
  }, []);

  const handleSave = useCallback(async (customer: VIPCustomer) => {
    // Mirror the server's unique (OrgId, IBAN) rule before the round trip.
    const clash = customers.some((c) => c.Id !== customer.Id && sameOrgIban(c, customer));
    if (clash) {
      setToast({ message: 'A VIP account with this Organization ID and IBAN already exists.', type: 'error' });
      throw new Error('duplicate');
    }
    const token = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    try {
      await saveVIPCustomer(customer, token, tepHeaders);
      setToast({ message: customer.Id ? 'VIP account updated' : 'VIP account added', type: 'success' });
      await refresh();
    } catch (err) {
      // A 400 usually means the row was deleted/changed meanwhile — refresh so
      // the operator sees the current state.
      setToast({ message: err instanceof Error ? err.message : 'Save failed', type: 'error' });
      await refresh();
      throw err;
    }
  }, [customers, getAuthHeaders, tepHeaders, refresh]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget?.Id) { setDeleteTarget(null); return; }
    const token = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    try {
      await deleteVIPCustomer(deleteTarget.Id, token, tepHeaders);
      setToast({ message: 'VIP account deleted', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Delete failed', type: 'error' });
    }
    setDeleteTarget(null);
    await refresh();
  }, [deleteTarget, getAuthHeaders, tepHeaders, refresh]);

  const handleExport = useCallback(() => {
    downloadCsv(
      `vip_customers_${new Date().toISOString().slice(0, 10)}.csv`,
      VIP_EXPORT_HEADERS,
      vipExportRows(filtered),
    );
  }, [filtered]);

  // Is this the org's only account? (delete-confirm note)
  const deleteIsLastAccount = useMemo(() => {
    if (!deleteTarget) return false;
    return customers.filter((c) => c.OrgId === deleteTarget.OrgId).length <= 1;
  }, [deleteTarget, customers]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search customers, IBAN, bank…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0} title="Export VIP customers to CSV">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export
          </Button>
          {!isAudit && (
            <Button variant="primary" size="sm" onClick={handleCreate}>+ Add VIP Customer</Button>
          )}
        </div>
      </div>

      {loading && customers.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">Loading VIP customers…</div>
      ) : error ? (
        <div className="text-center py-12 text-sm">
          <p className="text-red-600 dark:text-rose-300">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()} className="mt-3">Retry</Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">
          {search ? 'No VIP customers match your search.' : 'No VIP customers yet.'}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar border border-border rounded-lg">
          <table className="min-w-full divide-y divide-divide">
            <thead className="bg-surface-secondary sticky top-0 z-20">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">IBAN</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Bank Code</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Account Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Account No.</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Currency</th>
                <th className="w-px px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {groups.map((g) => (
                <FragmentGroup
                  key={g.orgId}
                  group={g}
                  isAudit={isAudit}
                  onAddToOrg={handleAddToOrg}
                  onEdit={handleEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <VIPCustomerFormModal
          key={editTarget?.Id ?? (prefillOrg ? `add-${prefillOrg.OrgId}` : 'new')}
          open
          onClose={handleCloseForm}
          onSave={handleSave}
          onValidationError={(message) => setToast({ message, type: 'error' })}
          existing={editTarget ?? undefined}
          prefillOrg={prefillOrg ?? undefined}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete VIP Account"
        message={
          `Delete VIP account ${deleteTarget?.IBAN ?? ''}?` +
          (deleteIsLastAccount
            ? ' This is the customer’s last account — removing it also removes them from the console’s VIP filter.'
            : '') +
          ' This cannot be undone.'
        }
        confirmLabel="Delete"
        variant="danger_ghost"
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/** One org's header row + its account rows. */
function FragmentGroup({
  group,
  isAudit,
  onAddToOrg,
  onEdit,
  onDelete,
}: {
  group: ReturnType<typeof groupByOrg>[number];
  isAudit: boolean;
  onAddToOrg: (orgId: string) => void;
  onEdit: (c: VIPCustomer) => void;
  onDelete: (c: VIPCustomer) => void;
}) {
  return (
    <>
      <tr className="bg-surface-secondary/60">
        <td colSpan={6} className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-heading">{group.orgNameEn || group.orgId}</span>
            <span className="text-[10px] font-mono text-muted">#{group.orgId}</span>
            <span className="text-[10px] text-faint">· {group.accounts.length} account{group.accounts.length === 1 ? '' : 's'}</span>
            {!isAudit && (
              <button
                type="button"
                onClick={() => onAddToOrg(group.orgId)}
                className="ml-auto text-[11px] text-primary hover:text-primary-dark hover:underline"
              >
                + Add account
              </button>
            )}
          </div>
        </td>
      </tr>
      {group.accounts.map((a) => (
        <tr key={a.Id ?? a.IBAN} className="group hover:bg-surface-hover transition-colors">
          <td className="px-4 py-2.5 text-xs font-mono text-heading break-all">{a.IBAN}</td>
          <td className="px-4 py-2.5 text-xs text-body-secondary">{a.BankCode || '—'}</td>
          <td className="px-4 py-2.5 text-xs text-body-secondary">{accountNameFor(a.AccountNames, 'en') || '—'}</td>
          <td className="px-4 py-2.5 text-xs text-body-secondary">{a.AccountNumber || '—'}</td>
          <td className="px-4 py-2.5 text-xs text-body-secondary">{a.CurrencyCode || '—'}</td>
          <td className="w-px px-3 py-2.5 text-right whitespace-nowrap">
            {!isAudit && (
              <div className="inline-flex items-center gap-1">
                <button type="button" onClick={() => onEdit(a)} className="p-1.5 rounded hover:bg-primary/10 text-muted hover:text-primary transition-colors cursor-pointer" title="Edit">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button type="button" onClick={() => onDelete(a)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-muted hover:text-red-600 transition-colors cursor-pointer" title="Delete">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
