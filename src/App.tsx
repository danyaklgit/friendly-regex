import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { TagSpecProvider } from './context/TagSpecContext';
import { TransactionDataProvider } from './context/TransactionDataContext';
import { LovAttributesProvider } from './context/LovAttributesContext';
import { TepConfigProvider, useTepConfig } from './context/TepConfigContext';
import { useTagSpecs } from './hooks/useTagSpecs';
import { useLocalChanges } from './hooks/useLocalChanges';
import { useHasUnsyncedTags } from './hooks/useHasUnsyncedTags';
import { useSyncTags } from './hooks/useSyncTags';
import { LoginPage } from './components/auth/LoginPage';
import { TabContainer } from './components/layout/TabContainer';
import { StatsTab } from './components/stats/StatsTab';
import { TransactionsTab } from './components/transactions/TransactionsTab';
import { SettingsTab } from './components/settings/SettingsTab';
import { IntegrationLogsTab } from './components/integrationLogs/IntegrationLogsTab';
import { useTransactionData } from './hooks/useTransactionData';
import { SessionWarningModal } from './components/shared/SessionWarningModal';
import { ConfirmDialog } from './components/shared/ConfirmDialog';
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
import type { TagSpecCommentTarget } from './types/comments';
import { getContextValue } from './types/tagSpec';

export interface BacklogNavigation {
  libraryId: string;
  definitionId?: string | null;
  /** Bumped on each emit so StatsTab re-runs its scroll effect even when the
   *  target is unchanged. */
  nonce: number;
}

interface AppShellProps {
  authToken: string | null;
  tepHeaders: TepHeaders | null;
  operatorName: string | undefined;
  userId: string | undefined;
}

function AppShell({ authToken, tepHeaders, operatorName, userId }: AppShellProps) {
  const { isAudit, isDevops } = useAuth();
  const { isLiveMode } = useTransactionData();
  const [activeTab, setActiveTab] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeCheckout, setActiveCheckout] = useState<CheckoutState | null>(null);
  const [undoTarget, setUndoTarget] = useState<{ bank: string; side: string } | null>(null);
  const [headerActionLoading, setHeaderActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; duration?: number } | null>(null);
  // shareData drives the banner popup; shareFilters/shareToggles are passed to
  // TransactionsTab and must persist after the banner is dismissed.
  const [shareData, setShareData] = useState<ShareParams | null>(null);
  const [shareFilters, setShareFilters] = useState<Record<string, Set<string>> | undefined>();
  const [shareToggles, setShareToggles] = useState<ShareParams['toggles'] | undefined>();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [backlogNavigation, setBacklogNavigation] = useState<BacklogNavigation | null>(null);

  const handleNavigateToBacklog = useCallback((target: TagSpecCommentTarget) => {
    setBacklogNavigation({
      libraryId: target.TagSpecLibraryId,
      definitionId: target.TagSpecDefinitionId ?? null,
      nonce: Date.now(),
    });
    setActiveTab(0);
  }, []);
  const handleBacklogNavigationConsumed = useCallback(() => setBacklogNavigation(null), []);

  // On mount, consume share params stored before login
  useEffect(() => {
    const stored = consumeStoredShareParams();
    if (stored) {
      setActiveCheckout({ bank: stored.bank, side: stored.side });
      setActiveTab(1);
      setShareData(stored);           // drives banner
      setShareFilters(stored.filters); // persists for TransactionsTab
      setShareToggles(stored.toggles); // persists for TransactionsTab
      clearShareParamsFromUrl();
    }
  }, []);

  const { libraries, refetchLibraries, isPairBeingTagged } = useTagSpecs();
  const { clearChanges, getChangeSummary, hasChanges } = useLocalChanges(activeCheckout?.bank, activeCheckout?.side);
  const hasUnsyncedTags = useHasUnsyncedTags();
  const syncTags = useSyncTags();
  const [pendingTabChange, setPendingTabChange] = useState<number | null>(null);

  const tabLabels = useMemo(
    () => ['Backlog', 'Transactions', ...(isLiveMode && isDevops ? ['Integration Logs'] : []), 'Settings'],
    [isLiveMode, isDevops],
  );
  const settingsTabIndex = tabLabels.indexOf('Settings');

  const handleTabChange = useCallback((nextIndex: number) => {
    if (activeTab === settingsTabIndex && nextIndex !== settingsTabIndex && hasUnsyncedTags) {
      setPendingTabChange(nextIndex);
      return;
    }
    setActiveTab(nextIndex);
  }, [activeTab, settingsTabIndex, hasUnsyncedTags]);

  useEffect(() => {
    if (!hasUnsyncedTags) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsyncedTags]);

  const isCheckoutReadOnly = useMemo(() => {
    if (!activeCheckout || !userId) return true;
    const inProgressLib = libraries.find(
      (l) =>
        l.StatusTag === 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === activeCheckout.bank &&
        getContextValue(l.Context, 'Side') === activeCheckout.side
    );
    if (!inProgressLib?.OperatorId) return true;
    // Lock the UI while a background tagging job is running on this library.
    if (isPairBeingTagged(inProgressLib)) return true;
    return inProgressLib.OperatorId !== userId;
  }, [activeCheckout, libraries, userId, isPairBeingTagged]);

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
    // Record the checkout so the Transactions tab is pre-filtered when the
    // operator navigates there, but stay on Backlog so they can see the
    // "In Progress" state and decide their next action.
    setActiveCheckout({ bank, side, operatorName });
  }, [operatorName]);

  const handleRelease = useCallback(async (bank: string, side: string) => {
    if (isAudit) return;
    if (!authToken || !tepHeaders) return;
    const inProgressLib = findInProgressLib(bank, side);
    if (!inProgressLib?.Id) return;
    setHeaderActionLoading(true);
    setToast({ message: `Releasing ${bank} / ${side}…`, type: 'info', duration: 60_000 });
    try {
      // Always save the current in-memory state (reflects adds, edits, and deletes)
      await tagSpecLibrarySave(inProgressLib, authToken, tepHeaders);
      await tagSpecLibraryRelease(inProgressLib.Id, authToken, tepHeaders);
      clearChanges(bank, side);
      await refetchLibraries();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side ? null : prev
      );
      setToast({ message: `Saved and released ${bank} / ${side}`, type: 'success' });
      setActiveTab(0);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Release failed', type: 'error' });
    } finally {
      setHeaderActionLoading(false);
    }
  }, [isAudit, authToken, tepHeaders, findInProgressLib, refetchLibraries, clearChanges]);

  const handleCheckinWithSave = useCallback(async (bank: string, side: string) => {
    if (isAudit) return;
    if (!authToken || !tepHeaders) return;
    const inProgressLib = findInProgressLib(bank, side);
    if (!inProgressLib?.Id) return;
    setHeaderActionLoading(true);
    setToast({ message: `Checking in ${bank} / ${side}…`, type: 'info', duration: 60_000 });
    try {
      // Always save the current in-memory state (reflects adds, edits, and deletes)
      await tagSpecLibrarySave(inProgressLib, authToken, tepHeaders);
      await tagSpecLibraryCheckIn(inProgressLib.Id, authToken, tepHeaders);
      clearChanges(bank, side);
      await refetchLibraries();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side ? null : prev
      );
      setToast({ message: `Saved and checked in ${bank} / ${side}`, type: 'success' });
      setActiveTab(0);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Check-in failed', type: 'error' });
    } finally {
      setHeaderActionLoading(false);
    }
  }, [isAudit, authToken, tepHeaders, findInProgressLib, refetchLibraries, clearChanges]);

  const handleRequestUndo = useCallback((bank: string, side: string) => {
    if (isAudit) return;
    setUndoTarget({ bank, side });
  }, [isAudit]);

  const handleUndoConfirm = useCallback(async () => {
    if (isAudit) return;
    if (!undoTarget) return;
    clearChanges(undoTarget.bank, undoTarget.side);
    await refetchLibraries();
    setUndoTarget(null);
  }, [isAudit, undoTarget, clearChanges, refetchLibraries]);

  return (
    <>
      <SessionWarningModal />
      <div className="min-h-screen bg-surface-secondary">
        <TabContainer
          activeIndex={activeTab}
          onTabChange={handleTabChange}
          tabs={[
            { label: 'Backlog', content: <StatsTab onViewTransactions={handleViewTransactions} onViewAllTransactions={handleViewAllTransactions} onCheckoutComplete={handleCheckoutComplete} authToken={authToken} tepHeaders={tepHeaders} navigation={backlogNavigation} onNavigationConsumed={handleBacklogNavigationConsumed} /> },
            { label: 'Transactions', content: <TransactionsTab activeCheckout={activeCheckout} onClearPendingDefinition={() => setActiveCheckout(prev => (prev && prev.pendingDefinitionId != null) ? { ...prev, pendingDefinitionId: undefined } : prev)} initialShareFilters={shareFilters} initialShareToggles={shareToggles} operatorName={operatorName} shareDialogOpen={shareDialogOpen} onShareDialogClose={() => setShareDialogOpen(false)} /> },
            ...(isLiveMode && isDevops ? [{ label: 'Integration Logs', content: <IntegrationLogsTab /> }] : []),
            { label: 'Settings', content: <SettingsTab /> },
          ]}
          // The "You're working on" indicator + Release/Check-in actions only
          // apply to the Transactions tab (the only place the operator is
          // actively mutating checkout-owned data). Everywhere else they're
          // either redundant (Backlog: the pick-what-to-work-on screen) or
          // irrelevant (Integration Logs, Settings).
          checkout={activeCheckout && activeTab === 1 ? {
            bank: activeCheckout.bank,
            side: activeCheckout.side,
            hasChanges: hasChanges ?? false,
            isReadOnly: isCheckoutReadOnly,
            actionLoading: headerActionLoading,
            onRelease: handleRelease,
            onCheckin: handleCheckinWithSave,
            onRequestUndo: handleRequestUndo,
          } : undefined}
          onOpenOnboarding={() => setOnboardingOpen(true)}
          onShare={activeCheckout ? () => setShareDialogOpen(true) : undefined}
          onNavigateToBacklog={handleNavigateToBacklog}
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
      <ConfirmDialog
        open={pendingTabChange !== null}
        onClose={() => setPendingTabChange(null)}
        onConfirm={async () => {
          const targetTab = pendingTabChange;
          if (targetTab === null) return;
          setToast({ message: 'Syncing tags…', type: 'info' });
          try {
            await syncTags();
            setToast({ message: 'Tags synced successfully', type: 'success' });
            setActiveTab(targetTab);
          } catch (err) {
            setToast({ message: err instanceof Error ? err.message : 'Failed to sync tags', type: 'error' });
          }
        }}
        title="Unsynced tag changes"
        message="You have tag hierarchy changes that haven't been synced. Sync now and leave?"
        confirmLabel="Sync and leave"
        variant="primary"
      />
      {shareData && <SharedLinkBanner share={shareData} onDismiss={() => setShareData(null)} />}
      {toast && <Toast message={toast.message} type={toast.type} duration={toast.duration} onClose={() => setToast(null)} />}
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

  // Parse share params SYNCHRONOUSLY during render (not in useEffect) so they're
  // in sessionStorage before AppShell's effects run (React runs child effects first).
  const [shareParamsCaptured] = useState(() => {
    const share = parseShareParams();
    if (share) {
      storeShareParams(share);
      clearShareParamsFromUrl();
      return true;
    }
    return false;
  });
  void shareParamsCaptured;

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
