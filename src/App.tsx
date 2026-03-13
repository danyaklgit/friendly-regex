import { useState, useCallback, useMemo } from 'react';
import { useAuth } from './context/AuthContext';
import { TagSpecProvider } from './context/TagSpecContext';
import { TransactionDataProvider } from './context/TransactionDataContext';
import { TepConfigProvider, useTepConfig } from './context/TepConfigContext';
import { useTagSpecs } from './hooks/useTagSpecs';
import { useLocalChanges } from './hooks/useLocalChanges';
import { LoginPage } from './components/auth/LoginPage';
import { TabContainer } from './components/layout/TabContainer';
import { StatsTab } from './components/stats/StatsTab';
import { TransactionsTab } from './components/transactions/TransactionsTab';
import { TagRulesTab } from './components/tagRules/TagRulesTab';
import { TagsHierarchyTab } from './components/tagsHierarchy/TagsHierarchyTab';
import { SessionWarningModal } from './components/shared/SessionWarningModal';
import { UndoChangesDialog } from './components/shared/UndoChangesDialog';
import { Toast } from './components/shared/Toast';
import { tagSpecLibraryRelease, tagSpecLibraryCheckIn } from './api/checkout';
import { tagSpecLibrarySave } from './api/tagSpecSave';
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
  const { clearChanges, getLocalLib, getChangeSummary } = useLocalChanges(activeCheckout?.bank, activeCheckout?.side);

  const findInProgressLib = useCallback((bank: string, side: string) => {
    return libraries.find(
      (l) =>
        l.StatusTag === 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === bank &&
        getContextValue(l.Context, 'Side') === side
    );
  }, [libraries]);

  const handleViewTransactions = useCallback((bank: string, side: string) => {
    setActiveCheckout({ bank, side });
    setActiveTab(1);
  }, []);

  const handleCheckoutComplete = useCallback((bank: string, side: string) => {
    setActiveCheckout({ bank, side, operatorName });
    setActiveTab(1);
  }, [operatorName]);

  const handleRelease = useCallback(async (bank: string, side: string) => {
    if (!authToken || !tepHeaders) return;
    const inProgressLib = findInProgressLib(bank, side);
    if (!inProgressLib?.Id) return;
    try {
      // Save first if there are local changes
      const localLib = getLocalLib(bank, side);
      if (localLib) {
        const libToSave = { ...inProgressLib, TagSpecDefinitions: localLib.TagSpecDefinitions };
        await tagSpecLibrarySave(libToSave, authToken, tepHeaders);
      }
      await tagSpecLibraryRelease(inProgressLib.Id, authToken, tepHeaders);
      clearChanges(bank, side);
      await refetchTagSpecs();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side ? null : prev
      );
      setToast({ message: `${localLib ? 'Saved and released' : 'Released'} ${bank} / ${side}`, type: 'success' });
      setActiveTab(0);
    } catch {
      setToast({ message: 'Release failed', type: 'error' });
    }
  }, [authToken, tepHeaders, findInProgressLib, refetchTagSpecs, getLocalLib, clearChanges]);

  const handleCheckinWithSave = useCallback(async (bank: string, side: string) => {
    if (!authToken || !tepHeaders) return;
    const inProgressLib = findInProgressLib(bank, side);
    if (!inProgressLib?.Id) return;
    try {
      // Save first if there are local changes
      const localLib = getLocalLib(bank, side);
      if (localLib) {
        const libToSave = { ...inProgressLib, TagSpecDefinitions: localLib.TagSpecDefinitions };
        await tagSpecLibrarySave(libToSave, authToken, tepHeaders);
      }
      await tagSpecLibraryCheckIn(inProgressLib.Id, authToken, tepHeaders);
      clearChanges(bank, side);
      await refetchTagSpecs();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side ? null : prev
      );
      setToast({ message: `${localLib ? 'Saved and checked in' : 'Checked in'} ${bank} / ${side}`, type: 'success' });
      setActiveTab(0);
    } catch {
      setToast({ message: 'Check in failed', type: 'error' });
    }
  }, [authToken, tepHeaders, findInProgressLib, refetchTagSpecs, getLocalLib, clearChanges]);

  const handleRequestUndo = useCallback((bank: string, side: string) => {
    setUndoTarget({ bank, side });
  }, []);

  const handleUndoConfirm = useCallback(async () => {
    if (!undoTarget) return;
    clearChanges(undoTarget.bank, undoTarget.side);
    await refetchTagSpecs();
    setUndoTarget(null);
  }, [undoTarget, clearChanges, refetchTagSpecs]);

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
            { label: 'Transactions', content: <TransactionsTab activeCheckout={activeCheckout} onCheckin={handleCheckinWithSave} onRelease={handleRelease} onRequestUndo={handleRequestUndo} editFromRules={editFromRules} onClearEditFromRules={() => setEditFromRules(null)} /> },
            { label: 'Tag Rules', content: <TagRulesTab onEditInTransactions={handleEditInTransactions} /> },
            { label: 'Tags Hierarchy', content: <TagsHierarchyTab /> },
          ]}
        />
      </div>
      <UndoChangesDialog
        open={!!undoTarget}
        bank={undoTarget?.bank ?? ''}
        side={undoTarget?.side ?? ''}
        changeSummary={undoTarget ? getChangeSummary(undoTarget.bank, undoTarget.side) : null}
        onClose={() => setUndoTarget(null)}
        onConfirm={handleUndoConfirm}
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
