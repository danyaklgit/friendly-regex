import bankStatsData from '../../data/bankStats.json';
import { Button } from '../shared/Button';
import type { CheckoutState } from '../../types';

interface StatsTabProps {
  checkouts: CheckoutState[];
  onCheckout: (bank: string, side: string) => void;
  onCheckin: (bank: string, side: string) => void;
  onViewTransactions: (bank: string, side: string) => void;
}

interface BankSideStats {
  bank: string;
  side: string;
  totalTransactions: number;
  untaggedCount: number;
  multiTaggedCount: number;
  missingMandatoryAttributes: number;
  missingOptionalAttributes: number;
  status: string;
  checkedOutBy: string | null;
}

const sideLabel: Record<string, string> = {
  CR: 'Credit',
  DR: 'Debit',
  RC: 'Rev. Credit',
  RD: 'Rev. Debit',
};

function StatBadge({ value, color }: { value: number; color: 'red' | 'yellow' | 'green' | 'gray' }) {
  if (value === 0) return <span className="text-faint text-xs">0</span>;
  const colors = {
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-surface-tertiary text-body-secondary',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {value.toLocaleString()}
    </span>
  );
}

export function StatsTab({ checkouts, onCheckout, onViewTransactions }: StatsTabProps) {
  const stats = bankStatsData as BankSideStats[];

  return (
    <div>
      <div className="mb-4">
        {/* <h2 className="text-base font-semibold text-heading">Bank Statistics</h2> */}
        <p className="text-sm text-muted mt-0.5 text-right text-primary-dark">
          Check out a combination to start working.
        </p>
      </div>

      <div className="overflow-hidden border border-border rounded-lg">
        <table className="min-w-full divide-y divide-divide">
          <thead className="bg-surface-secondary">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Bank</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Side</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Total</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Untagged</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Multi-tagged</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Missing Mandatory</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Missing Optional</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Operator</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Status</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Action</th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-divide">
            {stats.map((row) => {
              const isCheckedOut = checkouts.some((c) => c.bank === row.bank && c.side === row.side);
              return (
                <tr key={`${row.bank}-${row.side}`} className={`transition-colors ${isCheckedOut ? 'bg-primary/5' : 'hover:bg-surface-hover'}`}>
                  <td className="px-4 py-2.5 text-xs font-medium text-heading">{row.bank}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold
                      ${row.side === 'CR' ? 'bg-emerald-50 text-emerald-700' : row.side === 'DR' ? 'bg-red-50 text-red-700' : 'bg-surface-tertiary text-body-secondary'}`}>
                      {row.side} {sideLabel[row.side] ? `- ${sideLabel[row.side]}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-body text-right font-medium">{row.totalTransactions.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right"><StatBadge value={row.untaggedCount} color="red" /></td>
                  <td className="px-4 py-2.5 text-right"><StatBadge value={row.multiTaggedCount} color="yellow" /></td>
                  <td className="px-4 py-2.5 text-right"><StatBadge value={row.missingMandatoryAttributes} color="red" /></td>
                  <td className="px-4 py-2.5 text-right"><StatBadge value={row.missingOptionalAttributes} color="yellow" /></td>
                  <td className="px-4 py-2.5 text-xs text-body-secondary">
                    {isCheckedOut ? <span className="text-primary-dark font-medium">Current User</span> : <span className="text-faint">-</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                      ${isCheckedOut ? 'bg-primary/15 text-primary-dark' : 'bg-surface-tertiary text-muted'}`}>
                      {isCheckedOut ? 'In Progress' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-end">
                    {isCheckedOut ? (
                      <div className="flex items-center justify-end">
                        <Button variant="primary" size="sm" onClick={() => onViewTransactions(row.bank, row.side)}>
                          View Transactions
                        </Button>
                        {/* <Button variant="secondary" size="sm" onClick={() => onCheckin(row.bank, row.side)}>
                          Check In
                        </Button> */}
                      </div>
                    ) : (
                      <Button variant="primary" size="sm" onClick={() => onCheckout(row.bank, row.side)}>
                        Checkout
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
