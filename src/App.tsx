import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { TagSpecProvider } from './context/TagSpecContext';
import { TransactionDataProvider } from './context/TransactionDataContext';
import { LovAttributesProvider } from './context/LovAttributesContext';
import { TepConfigProvider, useTepConfig } from './context/TepConfigContext';
import { DownloadCenterProvider } from './context/DownloadCenterContext';
import { DownloadCenterModal } from './components/downloadCenter/DownloadCenterModal';
import { UserModeProvider } from './context/UserModeContext';
import { RerunJobProvider } from './context/RerunJobContext';
import { UserPortal } from './components/userMode/UserPortal';
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
import { parseShareParams, storeShareParams, consumeStoredShareParams, clearShareParamsFromUrl, pruneRetiredLedgerFilters } from './utils/shareLink';
import { useUserProfileSync } from './hooks/useUserProfileSync';
import type { ShareParams } from './utils/shareLink';
import type { CheckoutState } from './types';
import type { TepHeaders, FilterProperty } from './api/transactions';
import type { TagSpecCommentTarget } from './types/comments';
import { isLedger, libraryMatchesCheckout, identityFromContext, identityKeySuffix, libraryContextSummary, type IdentityInput } from './utils/libraryIdentity';

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

/**
 * Top-level role fork. role=user gets a completely different surface — no tabs,
 * no checkout, no rule-building, no backlog fetch. By picking the shell here we
 * keep the operator-mode hooks (which fire backend requests on mount) from
 * running for demo-user sessions that have no permission to call them.
 */
function AppShell(props: AppShellProps) {
  const { isUser } = useAuth();
  const { setBrand } = useTheme();

  // Backend user-profile sync — above the operator/user fork so BOTH portals'
  // preferences hydrate and save (column layouts, toggles, pro-mode,
  // contributions...). No-ops in sample-data mode or when the profile
  // endpoints are unavailable (localStorage keeps working as before).
  useUserProfileSync(props.authToken, props.tepHeaders, props.userId);

  // role=user always implies bwatech. Force-apply on every render where isUser
  // is true so a stale `brand_preference` in localStorage can't leak Swittle
  // branding into the user portal.
  useEffect(() => {
    if (isUser) setBrand('bwatech');
  }, [isUser, setBrand]);

  if (isUser) {
    return (
      <>
        <SessionWarningModal />
        <UserModeProvider>
          <UserPortal />
        </UserModeProvider>
      </>
    );
  }
  return <OperatorAppShell {...props} />;
}

function OperatorAppShell({ authToken, tepHeaders, operatorName, userId }: AppShellProps) {
  const { isAudit, isDevops } = useAuth();
  const { isLiveMode } = useTransactionData();
  const [activeTab, setActiveTab] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeCheckout, setActiveCheckout] = useState<CheckoutState | null>(null);
  // DataSetType of the most recent checkout, surviving the checkout itself.
  // Release/check-in clear activeCheckout and land on the Backlog, whose
  // StatsTab remounts on every tab switch — without this the Backlog would
  // fall back to the MT940 sub-tab instead of the workspace just worked on.
  const [lastCheckoutDataSetType, setLastCheckoutDataSetType] = useState<string | null>(null);
  // Library whose backlog statistics are known-stale because a check-in /
  // release just triggered a backend retag. Passed to StatsTab (which
  // remounts on tab switches, so this must live here) so the row shows a
  // loading skeleton instead of the pre-action numbers. The timestamp lets
  // StatsTab ignore stale markers on later visits.
  const [pendingStatsAction, setPendingStatsAction] = useState<{ key: string; at: number } | null>(null);
  // Transient extra filters propagated from a Backlog pill click (Clean,
  // Untagged, etc). Lives at the app level so the navigation outlives the
  // tab switch; TransactionsTab consumes it on mount and clears via
  // `setPendingPillFilters(null)` once it's been applied to the page state.
  const [pendingPillFilters, setPendingPillFilters] = useState<FilterProperty[] | null>(null);
  const [undoTarget, setUndoTarget] = useState<IdentityInput | null>(null);
  const [headerActionLoading, setHeaderActionLoading] = useState(false);
  // Tracks whether the Transactions tab's rule builder is open so the
  // checkout header can disable Release / Check-in while the operator is
  // mid-authoring. Bubbled up via TransactionsTab's onBuilderOpenChange.
  const [isRuleBuilderOpen, setIsRuleBuilderOpen] = useState(false);
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
      // Restore the shared workspace's identity. Pre-intraday links carry no
      // DataSetType and default to MT940 (bank/side); Ledger links carry
      // client/erp.
      setActiveCheckout({
        bank: stored.bank,
        side: stored.side,
        dataSetType: stored.dataSetType,
        clientCode: stored.clientCode,
        erpCode: stored.erpCode,
      });
      setActiveTab(1);
      setShareData(stored);           // drives banner
      // Ledger V2.1 retired several filter tags — drop stale selections a
      // persisted link may carry before they reach the Transactions tab.
      setShareFilters(pruneRetiredLedgerFilters(stored.filters, stored.dataSetType));
      setShareToggles(stored.toggles); // persists for TransactionsTab
      clearShareParamsFromUrl();
    }
  }, []);

  const { libraries, refetchLibraries, isPairBeingTagged } = useTagSpecs();
  const { clearChanges, getChangeSummary, hasChanges } = useLocalChanges(activeCheckout);

  // Resolve the identity fragment for a checkout. For Ledger, bank/side are
  // empty and the ClientCode/ErpCode are read from the (single) Ledger library
  // so storage keys and scope filters carry the real identity.
  const resolveCheckoutIdentity = useCallback(
    (bank: string, side: string, dataSetType: string): Pick<CheckoutState, 'bank' | 'side' | 'clientCode' | 'erpCode'> => {
      if (isLedger(dataSetType)) {
        const lib = libraries.find((l) => l.DataSetType === dataSetType);
        const id = lib ? identityFromContext(lib) : { clientCode: '', erpCode: '' };
        return { bank: '', side: '', clientCode: id.clientCode, erpCode: id.erpCode };
      }
      return { bank, side };
    },
    [libraries],
  );
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
      (l) => l.StatusTag === 'INPROGRESS' && libraryMatchesCheckout(l, activeCheckout)
    );
    if (!inProgressLib?.OperatorId) return true;
    // Lock the UI while a background tagging job is running on this library.
    if (isPairBeingTagged(inProgressLib)) return true;
    return inProgressLib.OperatorId !== userId;
  }, [activeCheckout, libraries, userId, isPairBeingTagged]);

  // Match on DataSetType too — the same bank/side can have INPROGRESS libraries
  // in more than one workspace (e.g. MT940 and MT942), and release/check-in
  // must act on the right one.
  const findInProgressLib = useCallback((bank: string, side: string, dataSetType: string) => {
    return libraries.find(
      (l) => l.StatusTag === 'INPROGRESS' && libraryMatchesCheckout(l, { bank, side, dataSetType })
    );
  }, [libraries]);

  const handleViewTransactions = useCallback((
    bank: string,
    side: string,
    dataSetType: string,
    definitionId?: string,
    pillFilters?: FilterProperty[],
  ) => {
    setActiveCheckout({ ...resolveCheckoutIdentity(bank, side, dataSetType), dataSetType, pendingDefinitionId: definitionId });
    setPendingPillFilters(pillFilters ?? null);
    setActiveTab(1);
  }, [resolveCheckoutIdentity]);

  const handleViewAllTransactions = useCallback(() => {
    setActiveCheckout(null);
    setActiveTab(1);
  }, []);

  const handleCheckoutComplete = useCallback((bank: string, side: string, dataSetType: string) => {
    // Record the checkout so the Transactions tab is pre-filtered when the
    // operator navigates there, but stay on Backlog so they can see the
    // "In Progress" state and decide their next action.
    setActiveCheckout({ ...resolveCheckoutIdentity(bank, side, dataSetType), dataSetType, operatorName });
  }, [operatorName, resolveCheckoutIdentity]);

  // Track the workspace across the checkout lifecycle (covers every path
  // that establishes a checkout: Backlog view, checkout complete, share-link
  // restore).
  useEffect(() => {
    if (activeCheckout?.dataSetType) setLastCheckoutDataSetType(activeCheckout.dataSetType);
  }, [activeCheckout?.dataSetType]);

  const handleRelease = useCallback(async (bank: string, side: string, dataSetType: string) => {
    if (isAudit) return;
    if (!authToken || !tepHeaders) return;
    const inProgressLib = findInProgressLib(bank, side, dataSetType);
    if (!inProgressLib?.Id) return;
    const sum = libraryContextSummary({ dataSetType, ...identityFromContext(inProgressLib) });
    const label = `${sum.primaryValue} / ${sum.secondaryValue}`;
    setHeaderActionLoading(true);
    setToast({ message: `Releasing ${label}…`, type: 'info', duration: 60_000 });
    try {
      // Always save the current in-memory state (reflects adds, edits, and deletes)
      await tagSpecLibrarySave(inProgressLib, authToken, tepHeaders);
      await tagSpecLibraryRelease(inProgressLib.Id, authToken, tepHeaders);
      clearChanges({ dataSetType, ...identityFromContext(inProgressLib) });
      await refetchLibraries();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side && prev.dataSetType === dataSetType ? null : prev
      );
      setToast({ message: `Saved and released ${label}`, type: 'success' });
      setLastCheckoutDataSetType(dataSetType);
      setPendingStatsAction({ key: identityKeySuffix({ dataSetType, ...identityFromContext(inProgressLib) }), at: Date.now() });
      setActiveTab(0);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Release failed', type: 'error' });
    } finally {
      setHeaderActionLoading(false);
    }
  }, [isAudit, authToken, tepHeaders, findInProgressLib, refetchLibraries, clearChanges]);

  const handleCheckinWithSave = useCallback(async (bank: string, side: string, dataSetType: string) => {
    if (isAudit) return;
    if (!authToken || !tepHeaders) return;
    const inProgressLib = findInProgressLib(bank, side, dataSetType);
    if (!inProgressLib?.Id) return;
    const sum = libraryContextSummary({ dataSetType, ...identityFromContext(inProgressLib) });
    const label = `${sum.primaryValue} / ${sum.secondaryValue}`;
    setHeaderActionLoading(true);
    setToast({ message: `Checking in ${label}…`, type: 'info', duration: 60_000 });
    try {
      // Always save the current in-memory state (reflects adds, edits, and deletes)
      await tagSpecLibrarySave(inProgressLib, authToken, tepHeaders);
      await tagSpecLibraryCheckIn(inProgressLib.Id, authToken, tepHeaders);
      clearChanges({ dataSetType, ...identityFromContext(inProgressLib) });
      await refetchLibraries();
      setActiveCheckout((prev) =>
        prev && prev.bank === bank && prev.side === side && prev.dataSetType === dataSetType ? null : prev
      );
      setToast({ message: `Saved and checked in ${label}`, type: 'success' });
      setLastCheckoutDataSetType(dataSetType);
      setPendingStatsAction({ key: identityKeySuffix({ dataSetType, ...identityFromContext(inProgressLib) }), at: Date.now() });
      setActiveTab(0);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Check-in failed', type: 'error' });
    } finally {
      setHeaderActionLoading(false);
    }
  }, [isAudit, authToken, tepHeaders, findInProgressLib, refetchLibraries, clearChanges]);

  const handleRequestUndo = useCallback((bank: string, side: string, dataSetType: string) => {
    if (isAudit) return;
    setUndoTarget({ ...resolveCheckoutIdentity(bank, side, dataSetType), dataSetType });
  }, [isAudit, resolveCheckoutIdentity]);

  const handleUndoConfirm = useCallback(async () => {
    if (isAudit) return;
    if (!undoTarget) return;
    clearChanges(undoTarget);
    await refetchLibraries();
    setUndoTarget(null);
  }, [isAudit, undoTarget, clearChanges, refetchLibraries]);

  return (
    <RerunJobProvider>
      <SessionWarningModal />
      <div className="min-h-screen bg-surface-secondary">
        <TabContainer
          activeIndex={activeTab}
          onTabChange={handleTabChange}
          tabs={[
            { label: 'Backlog', content: <StatsTab onViewTransactions={handleViewTransactions} onViewAllTransactions={handleViewAllTransactions} onCheckoutComplete={handleCheckoutComplete} onRelease={handleRelease} authToken={authToken} tepHeaders={tepHeaders} navigation={backlogNavigation} onNavigationConsumed={handleBacklogNavigationConsumed} onNavigateToBacklog={handleNavigateToBacklog} preferredDataSetType={activeCheckout?.dataSetType ?? lastCheckoutDataSetType} pendingStatsAction={pendingStatsAction} /> },
            { label: 'Transactions', content: <TransactionsTab activeCheckout={activeCheckout} onClearPendingDefinition={() => setActiveCheckout(prev => (prev && prev.pendingDefinitionId != null) ? { ...prev, pendingDefinitionId: undefined } : prev)} initialShareFilters={shareFilters} initialShareToggles={shareToggles} operatorName={operatorName} shareDialogOpen={shareDialogOpen} onShareDialogClose={() => setShareDialogOpen(false)} pendingPillFilters={pendingPillFilters} onPendingPillFiltersConsumed={() => setPendingPillFilters(null)} onBuilderOpenChange={setIsRuleBuilderOpen} /> },
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
            dataSetType: activeCheckout.dataSetType,
            clientCode: activeCheckout.clientCode,
            erpCode: activeCheckout.erpCode,
            hasChanges: hasChanges ?? false,
            isReadOnly: isCheckoutReadOnly,
            // OR the rule-builder state into the disable signal — committing
            // Release / Check-in while a rule is being authored would drop
            // the in-progress definition without any save path, so we hide
            // the option until the operator either saves or cancels the rule.
            actionLoading: headerActionLoading || isRuleBuilderOpen,
            disabledReason: isRuleBuilderOpen ? 'Finish or cancel the rule first' : undefined,
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
        changeSummary={undoTarget ? getChangeSummary(undoTarget) : null}
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
    </RerunJobProvider>
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
    <TagSpecProvider useDummyData={useDummyData} tepHeaders={tepHeaders}>
      <LovAttributesProvider tepHeaders={tepHeaders}>
        <TransactionDataProvider>
          <DownloadCenterProvider>
            <AppShell authToken={authToken} tepHeaders={tepHeaders} operatorName={operatorName} userId={userId ?? undefined} />
            <DownloadCenterModal />
          </DownloadCenterProvider>
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
