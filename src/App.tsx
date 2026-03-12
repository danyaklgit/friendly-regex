import { useState, useCallback, useMemo } from 'react';
import { useAuth } from './context/AuthContext';
import { TagSpecProvider } from './context/TagSpecContext';
import { TransactionDataProvider } from './context/TransactionDataContext';
import { TepConfigProvider, useTepConfig } from './context/TepConfigContext';
import { useTagSpecs } from './hooks/useTagSpecs';
import { LoginPage } from './components/auth/LoginPage';
import { TabContainer } from './components/layout/TabContainer';
import { StatsTab } from './components/stats/StatsTab';
import { TransactionsTab } from './components/transactions/TransactionsTab';
import { TagRulesTab } from './components/tagRules/TagRulesTab';
import { TagsHierarchyTab } from './components/tagsHierarchy/TagsHierarchyTab';
import { SessionWarningModal } from './components/shared/SessionWarningModal';
import { ConfirmDialog } from './components/shared/ConfirmDialog';
import { Toast } from './components/shared/Toast';
import { tagSpecLibraryRelease } from './api/checkout';
import type { CheckoutState, TagSpecDefinition, TagSpecLibrary } from './types';
import type { TepHeaders } from './api/transactions';
import { getContextValue } from './types/tagSpec';

interface AppShellProps {
  authToken: string | null;
  tepHeaders: TepHeaders | null;
  operatorName: string | undefined;
}

function AppShell({ authToken, tepHeaders, operatorName }: AppShellProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [activeCheckout, setActiveCheckout] = useState<CheckoutState | null>(null);
  const [editFromRules, setEditFromRules] = useState<{ definition: TagSpecDefinition; parentLib: TagSpecLibrary } | null>(null);
  const [undoTarget, setUndoTarget] = useState<{ bank: string; side: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { libraries, refetchTagSpecs } = useTagSpecs();

  const handleViewTransactions = useCallback((bank: string, side: string) => {
    setActiveCheckout({ bank, side });
    setActiveTab(1);
  }, []);

  const handleCheckoutComplete = useCallback((bank: string, side: string) => {
    setActiveCheckout({ bank, side, operatorName });
    setActiveTab(1);
  }, [operatorName]);

  const handleCheckin = useCallback((bank: string, side: string) => {
    setActiveCheckout((prev) =>
      prev && prev.bank === bank && prev.side === side ? null : prev
    );
    setActiveTab(0);
  }, []);

  const handleRelease = useCallback(async (bank: string, side: string) => {
    if (!authToken || !tepHeaders) return;
    const inProgressLib = libraries.find(
      (l) =>
        l.StatusTag === 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === bank &&
        getContextValue(l.Context, 'Side') === side
    );
    if (!inProgressLib?.Id) return;
    try {
      await tagSpecLibraryRelease(inProgressLib.Id, authToken, tepHeaders);
      await refetchTagSpecs();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side ? null : prev
      );
      setToast({ message: `Released ${bank} / ${side}`, type: 'success' });
      setActiveTab(0);
    } catch {
      setToast({ message: 'Release failed', type: 'error' });
    }
  }, [authToken, tepHeaders, libraries, refetchTagSpecs]);

  const handleRequestUndo = useCallback((bank: string, side: string) => {
    setUndoTarget({ bank, side });
  }, []);

  const handleUndoConfirm = useCallback(() => {
    if (!undoTarget) return;
    // TODO: call undoChangesApi when endpoint is available
    console.log('Undo changes for', undoTarget.bank, undoTarget.side);
    handleCheckin(undoTarget.bank, undoTarget.side);
    setUndoTarget(null);
  }, [undoTarget, handleCheckin]);

  const handleEditInTransactions = useCallback((def: TagSpecDefinition, parentLib: TagSpecLibrary) => {
    const bank = getContextValue(parentLib.Context, 'BankSwiftCode') ?? '';
    const side = getContextValue(parentLib.Context, 'Side') ?? '';
    setActiveCheckout({ bank, side, operatorName });
    setEditFromRules({ definition: def, parentLib });
    setActiveTab(1);
  }, [operatorName]);

  return (
    <>
      <SessionWarningModal />
      <div className="min-h-screen bg-surface-secondary">
        <TabContainer
          activeIndex={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { label: 'Overview', content: <StatsTab onViewTransactions={handleViewTransactions} onCheckoutComplete={handleCheckoutComplete} authToken={authToken} tepHeaders={tepHeaders} /> },
            { label: 'Transactions', content: <TransactionsTab activeCheckout={activeCheckout} onCheckin={handleCheckin} onRelease={handleRelease} onRequestUndo={handleRequestUndo} editFromRules={editFromRules} onClearEditFromRules={() => setEditFromRules(null)} /> },
            { label: 'Tag Rules', content: <TagRulesTab onEditInTransactions={handleEditInTransactions} /> },
            { label: 'Tags Hierarchy', content: <TagsHierarchyTab /> },
          ]}
        />
      </div>
      <ConfirmDialog
        open={!!undoTarget}
        onClose={() => setUndoTarget(null)}
        onConfirm={handleUndoConfirm}
        title="Undo Changes"
        message={`Are you sure you want to undo all changes made since your last checkout for Bank ${undoTarget?.bank ?? ''}, Side ${undoTarget?.side ?? ''}?`}
        confirmLabel="Undo Changes"
        variant="danger_ghost"
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

function AppContent() {
  const { isAuthenticated, displayName, username, userId, useDummyData, getAuthHeaders } = useAuth();
  const tepConfig = useTepConfig();

  const authToken = useMemo(() => {
    const headers = getAuthHeaders();
    const auth = headers['Authorization'];
    return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  }, [getAuthHeaders]);

  const tepHeaders = useMemo((): TepHeaders | null => {
    if (!userId) return null;
    return {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId,
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
  }, [userId, tepConfig]);

  const operatorName = displayName ?? username ?? undefined;

  if (!isAuthenticated) return <LoginPage />;

  return (
    <TagSpecProvider useDummyData={useDummyData} authToken={authToken} tepHeaders={tepHeaders}>
      <TransactionDataProvider>
        <AppShell authToken={authToken} tepHeaders={tepHeaders} operatorName={operatorName} />
      </TransactionDataProvider>
    </TagSpecProvider>
  );
}

function App() {
  return (
    <TepConfigProvider>
      <AppContent />
    </TepConfigProvider>
  );
}

export default App;
