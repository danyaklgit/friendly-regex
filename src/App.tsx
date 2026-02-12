import { TagSpecProvider } from './context/TagSpecContext';
import { PageHeader } from './components/layout/PageHeader';
import { TabContainer } from './components/layout/TabContainer';
import { TransactionsTab } from './components/transactions/TransactionsTab';
import { TagRulesTab } from './components/tagRules/TagRulesTab';

function App() {
  return (
    <TagSpecProvider>
      <div className="min-h-screen bg-gray-50">
        <PageHeader />
        <TabContainer
          tabs={[
            { label: 'Transactions', content: <TransactionsTab /> },
            { label: 'Tag Rules', content: <TagRulesTab /> },
          ]}
        />
      </div>
    </TagSpecProvider>
  );
}

export default App;
