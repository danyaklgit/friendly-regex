import { TagSpecProvider } from './context/TagSpecContext';
import { TransactionDataProvider } from './context/TransactionDataContext';
import { TabContainer } from './components/layout/TabContainer';
import { TransactionsTab } from './components/transactions/TransactionsTab';
import { TagRulesTab } from './components/tagRules/TagRulesTab';

function App() {
  return (
    <TagSpecProvider>
      <TransactionDataProvider>
      <div className="min-h-screen bg-gray-50">
        <TabContainer
          tabs={[
            { label: 'Transactions', content: <TransactionsTab /> },
            { label: 'Tag Rules', content: <TagRulesTab /> },
          ]}
        />
      </div>
      </TransactionDataProvider>
    </TagSpecProvider>
  );
}

export default App;
