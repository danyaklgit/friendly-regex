import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { TagSpecProvider } from './context/TagSpecContext';
import { TransactionDataProvider } from './context/TransactionDataContext';
import { LovAttributesProvider } from './context/LovAttributesContext';
import { TepConfigProvider, useTepConfig } from './context/TepConfigContext';
import { useTagSpecs } from './hooks/useTagSpecs';
import { useLocalChanges } from './hooks/useLocalChanges';
import { LoginPage } from './components/auth/LoginPage';
import { TabContainer } from './components/layout/TabContainer';
import { StatsTab } from './components/stats/StatsTab';
import { TransactionsTab } from './components/transactions/TransactionsTab';
import { SettingsTab } from './components/settings/SettingsTab';
import { SessionWarningModal } from './components/shared/SessionWarningModal';
import { UndoChangesDialog } from './components/shared/UndoChangesDialog';
import { SharedLinkBanner } from './components/shared/SharedLinkBanner';
import { OnboardingHub } from './components/onboarding/OnboardingHub';
import { Toast } from './components/shared/Toast';
import { tagSpecLibraryRelease, tagSpecLibraryCheckIn } from './api/checkout';
import { tagSpecLibrarySave } from './api/tagSpecSave';
import { parseShareParams, storeShareParams, consumeStoredShareParams, clearShareParamsFromUrl } from './utils/shareLink';
import type { ShareParams } from './utils/shareLink';
import type { CheckoutState } from './types';
import type { TepHeaders } from './api/transactions';
import { getContextValue } from './types/tagSpec';

interface AppShellProps {
  authToken: string | null;
  tepHeaders: TepHeaders | null;
  operatorName: string | undefined;
  userId: string | undefined;
}

function AppShell({ authToken, tepHeaders, operatorName, userId }: AppShellProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeCheckout, setActiveCheckout] = useState<CheckoutState | null>(null);
  const [undoTarget, setUndoTarget] = useState<{ bank: string; side: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [shareData, setShareData] = useState<ShareParams | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // On mount, consume share params stored before login
  useEffect(() => {
    const stored = consumeStoredShareParams();
    if (stored) {
      setActiveCheckout({ bank: stored.bank, side: stored.side });
      setActiveTab(1);
      setShareData(stored);
      clearShareParamsFromUrl();
    }
  }, []);

  const { libraries, refetchTagSpecs } = useTagSpecs();
  const { clearChanges, getChangeSummary, hasChanges } = useLocalChanges(activeCheckout?.bank, activeCheckout?.side);

  const isCheckoutReadOnly = useMemo(() => {
    if (!activeCheckout || !userId) return true;
    const inProgressLib = libraries.find(
      (l) =>
        l.StatusTag === 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === activeCheckout.bank &&
        getContextValue(l.Context, 'Side') === activeCheckout.side
    );
    if (!inProgressLib?.OperatorId) return true;
    return inProgressLib.OperatorId !== userId;
  }, [activeCheckout, libraries, userId]);

  const findInProgressLib = useCallback((bank: string, side: string) => {
    return libraries.find(
      (l) =>
        l.StatusTag === 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === bank &&
        getContextValue(l.Context, 'Side') === side
    );
  }, [libraries]);

  const handleViewTransactions = useCallback((bank: string, side: string, definitionId?: string) => {
    setActiveCheckout({ bank, side, pendingDefinitionId: definitionId });
    setActiveTab(1);
  }, []);

  const handleViewAllTransactions = useCallback(() => {
    setActiveCheckout(null);
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
      // Always save the current in-memory state (reflects adds, edits, and deletes)
      await tagSpecLibrarySave(inProgressLib, authToken, tepHeaders);
      await tagSpecLibraryRelease(inProgressLib.Id, authToken, tepHeaders);
      clearChanges(bank, side);
      await refetchTagSpecs();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side ? null : prev
      );
      setToast({ message: `Saved and released ${bank} / ${side}`, type: 'success' });
      setActiveTab(0);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Release failed', type: 'error' });
    }
  }, [authToken, tepHeaders, findInProgressLib, refetchTagSpecs, clearChanges]);

  const handleCheckinWithSave = useCallback(async (bank: string, side: string) => {
    if (!authToken || !tepHeaders) return;
    const inProgressLib = findInProgressLib(bank, side);
    if (!inProgressLib?.Id) return;
    try {
      // Always save the current in-memory state (reflects adds, edits, and deletes)
      await tagSpecLibrarySave(inProgressLib, authToken, tepHeaders);
      await tagSpecLibraryCheckIn(inProgressLib.Id, authToken, tepHeaders);
      clearChanges(bank, side);
      await refetchTagSpecs();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side ? null : prev
      );
      setToast({ message: `Saved and checked in ${bank} / ${side}`, type: 'success' });
      setActiveTab(0);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Check-in failed', type: 'error' });
    }
  }, [authToken, tepHeaders, findInProgressLib, refetchTagSpecs, clearChanges]);

  const handleRequestUndo = useCallback((bank: string, side: string) => {
    setUndoTarget({ bank, side });
  }, []);

  const handleUndoConfirm = useCallback(async () => {
    if (!undoTarget) return;
    clearChanges(undoTarget.bank, undoTarget.side);
    await refetchTagSpecs();
    setUndoTarget(null);
  }, [undoTarget, clearChanges, refetchTagSpecs]);

  return (
    <>
      <SessionWarningModal />
      <div className="min-h-screen bg-surface-secondary">
        <TabContainer
          activeIndex={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { label: 'Backlog', content: <StatsTab onViewTransactions={handleViewTransactions} onViewAllTransactions={handleViewAllTransactions} onCheckoutComplete={handleCheckoutComplete} authToken={authToken} tepHeaders={tepHeaders} /> },
            { label: 'Transactions', content: <TransactionsTab activeCheckout={activeCheckout} onClearPendingDefinition={() => setActiveCheckout(prev => prev ? { ...prev, pendingDefinitionId: undefined } : prev)} initialShareFilters={shareData?.filters} initialShareToggles={shareData?.toggles} operatorName={operatorName} shareDialogOpen={shareDialogOpen} onShareDialogClose={() => setShareDialogOpen(false)} /> },
            { label: 'Settings', content: <SettingsTab /> },
          ]}
          checkout={activeCheckout ? {
            bank: activeCheckout.bank,
            side: activeCheckout.side,
            hasChanges: hasChanges ?? false,
            isReadOnly: isCheckoutReadOnly,
            onRelease: handleRelease,
            onCheckin: handleCheckinWithSave,
            onRequestUndo: handleRequestUndo,
          } : undefined}
          onOpenOnboarding={() => setOnboardingOpen(true)}
          onShare={activeCheckout ? () => setShareDialogOpen(true) : undefined}
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
      <OnboardingHub
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onTabChange={setActiveTab}
      />
      {shareData && <SharedLinkBanner share={shareData} onDismiss={() => setShareData(null)} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

function AppContent() {
  const { isAuthenticated, displayName, username, userId, useDummyData, getAuthHeaders } = useAuth();
  const tepConfig = useTepConfig();

  const headers = getAuthHeaders();
  const authRaw = headers['Authorization'];
  const authToken = authRaw?.startsWith('Bearer ') ? authRaw.slice(7) : null;

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

  // Capture share params from URL before auth gate — store so AppShell can consume after login
  useEffect(() => {
    const share = parseShareParams();
    if (share) {
      storeShareParams(share);
      clearShareParamsFromUrl();
    }
  }, []);

  if (!isAuthenticated) return <LoginPage />;

  return (
    <TagSpecProvider useDummyData={useDummyData} authToken={authToken} tepHeaders={tepHeaders}>
      <LovAttributesProvider authToken={authToken} tepHeaders={tepHeaders}>
        <TransactionDataProvider>
          <AppShell authToken={authToken} tepHeaders={tepHeaders} operatorName={operatorName} userId={userId ?? undefined} />
        </TransactionDataProvider>
      </LovAttributesProvider>
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
