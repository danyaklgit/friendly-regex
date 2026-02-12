import { useTransactionAnalysis } from '../../hooks/useTransactionAnalysis';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { TransactionTable } from './TransactionTable';

export function TransactionsTab() {
  const data = useTransactionAnalysis();
  const { tagDefinitions } = useTagSpecs();

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">Transactions</h2>
        <p className="text-sm text-gray-500">
          Tags and attributes are computed automatically based on your defined rules.
        </p>
      </div>
      <TransactionTable data={data} tagDefinitions={tagDefinitions} />
    </div>
  );
}
