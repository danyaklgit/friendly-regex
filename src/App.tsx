import { useState, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { TagSpecProvider } from './context/TagSpecContext';
import { TransactionDataProvider } from './context/TransactionDataContext';
import { TepConfigProvider } from './context/TepConfigContext';
import { LoginPage } from './components/auth/LoginPage';
import { TabContainer } from './components/layout/TabContainer';
import { StatsTab } from './components/stats/StatsTab';
import { TransactionsTab } from './components/transactions/TransactionsTab';
import { TagRulesTab } from './components/tagRules/TagRulesTab';
import { SessionWarningModal } from './components/shared/SessionWarningModal';
import { ConfirmDialog } from './components/shared/ConfirmDialog';
import type { CheckoutState, TagSpecDefinition, TagSpecLibrary } from './types';
import { getContextValue } from './types/tagSpec';

function App() {
  const { isAuthenticated, displayName, username } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [checkouts, setCheckouts] = useState<CheckoutState[]>([]);
  const [activeCheckout, setActiveCheckout] = useState<CheckoutState | null>(null);
  const [editFromRules, setEditFromRules] = useState<{ definition: TagSpecDefinition; parentLib: TagSpecLibrary } | null>(null);
  const [undoTarget, setUndoTarget] = useState<{ bank: string; side: string } | null>(null);

  const operatorName = displayName ?? username ?? undefined;

  const handleCheckout = useCallback((bank: string, side: string) => {
    setCheckouts((prev) => {
      if (prev.some((c) => c.bank === bank && c.side === side)) return prev;
      return [...prev, { bank, side, operatorName }];
    });
    setActiveCheckout({ bank, side, operatorName });
    setActiveTab(1);
  }, [operatorName]);

  const handleViewTransactions = useCallback((bank: string, side: string) => {
    setActiveCheckout({ bank, side });
    setActiveTab(1);
  }, []);

  const handleCheckin = useCallback((bank: string, side: string) => {
    setCheckouts((prev) => prev.filter((c) => !(c.bank === bank && c.side === side)));
    setActiveCheckout((prev) =>
      prev && prev.bank === bank && prev.side === side ? null : prev
    );
    setActiveTab(0);
  }, []);

  const handleRelease = useCallback(
    // (bank: string, side: string)
    () => {
    // setCheckouts((prev) => prev.filter((c) => !(c.bank === bank && c.side === side)));
    // setActiveCheckout((prev) =>
    //   prev && prev.bank === bank && prev.side === side ? null : prev
    // );
  }, []);

  const handleRequestUndo = useCallback((bank: string, side: string) => {
    setUndoTarget({ bank, side });
  }, []);

  const handleUndoConfirm = useCallback(() => {
    if (!undoTarget) return;
    // TODO: call undoChangesApi when endpoint is available
    console.log('Undo changes for', undoTarget.bank, undoTarget.side);
    // After undo succeeds, automatically check in
    handleCheckin(undoTarget.bank, undoTarget.side);
    setUndoTarget(null);
  }, [undoTarget, handleCheckin]);

  const handleEditInTransactions = useCallback((def: TagSpecDefinition, parentLib: TagSpecLibrary) => {
    const bank = getContextValue(parentLib.Context, 'BankSwiftCode') ?? '';
    const side = getContextValue(parentLib.Context, 'Side') ?? '';
    setActiveCheckout({ bank, side, operatorName });
    setCheckouts((prev) => {
      if (prev.some((c) => c.bank === bank && c.side === side)) return prev;
      return [...prev, { bank, side, operatorName }];
    });
    setEditFromRules({ definition: def, parentLib });
    setActiveTab(1);
  }, [operatorName]);

  if (!isAuthenticated) return <LoginPage />;

  return (
    <TepConfigProvider>
    <TagSpecProvider>
      <TransactionDataProvider>
      <SessionWarningModal />
      <div className="min-h-screen bg-surface-secondary">
        <TabContainer
          activeIndex={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { label: 'Overview', content: <StatsTab checkouts={checkouts} onCheckout={handleCheckout} onCheckin={handleCheckin} onViewTransactions={handleViewTransactions} onRequestUndo={handleRequestUndo} /> },
            { label: 'Transactions', content: <TransactionsTab activeCheckout={activeCheckout} onCheckin={handleCheckin} onRelease={handleRelease} onRequestUndo={handleRequestUndo} editFromRules={editFromRules} onClearEditFromRules={() => setEditFromRules(null)} /> },
            { label: 'Tag Rules', content: <TagRulesTab checkouts={checkouts} onEditInTransactions={handleEditInTransactions} /> },
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
      </TransactionDataProvider>
    </TagSpecProvider>
    </TepConfigProvider>
  );
}

export default App;
