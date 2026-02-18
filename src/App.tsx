import { useState, useCallback } from 'react';
import { TagSpecProvider } from './context/TagSpecContext';
import { TransactionDataProvider } from './context/TransactionDataContext';
import { TabContainer } from './components/layout/TabContainer';
import { StatsTab } from './components/stats/StatsTab';
import { TransactionsTab } from './components/transactions/TransactionsTab';
import { TagRulesTab } from './components/tagRules/TagRulesTab';
import type { CheckoutState, TagSpecDefinition, TagSpecLibrary } from './types';
import { getContextValue } from './types/tagSpec';

function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [checkouts, setCheckouts] = useState<CheckoutState[]>([]);
  const [activeCheckout, setActiveCheckout] = useState<CheckoutState | null>(null);
  const [editFromRules, setEditFromRules] = useState<{ definition: TagSpecDefinition; parentLib: TagSpecLibrary } | null>(null);

  const handleCheckout = useCallback((bank: string, side: string) => {
    setCheckouts((prev) => {
      if (prev.some((c) => c.bank === bank && c.side === side)) return prev;
      return [...prev, { bank, side }];
    });
    setActiveCheckout({ bank, side });
    setActiveTab(1);
  }, []);

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

  const handleEditInTransactions = useCallback((def: TagSpecDefinition, parentLib: TagSpecLibrary) => {
    const bank = getContextValue(parentLib.Context, 'BankSwiftCode') ?? '';
    const side = getContextValue(parentLib.Context, 'Side') ?? '';
    setActiveCheckout({ bank, side });
    setCheckouts((prev) => {
      if (prev.some((c) => c.bank === bank && c.side === side)) return prev;
      return [...prev, { bank, side }];
    });
    setEditFromRules({ definition: def, parentLib });
    setActiveTab(1);
  }, []);

  return (
    <TagSpecProvider>
      <TransactionDataProvider>
      <div className="min-h-screen bg-gray-50">
        <TabContainer
          activeIndex={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { label: 'Stats', content: <StatsTab checkouts={checkouts} onCheckout={handleCheckout} onCheckin={handleCheckin} onViewTransactions={handleViewTransactions} /> },
            { label: 'Transactions', content: <TransactionsTab activeCheckout={activeCheckout} onCheckin={handleCheckin} onRelease={handleRelease} editFromRules={editFromRules} onClearEditFromRules={() => setEditFromRules(null)} /> },
            { label: 'Tag Rules', content: <TagRulesTab checkouts={checkouts} onEditInTransactions={handleEditInTransactions} /> },
          ]}
        />
      </div>
      </TransactionDataProvider>
    </TagSpecProvider>
  );
}

export default App;
